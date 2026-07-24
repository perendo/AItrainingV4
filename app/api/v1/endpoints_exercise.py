# app/api/v1/endpoints_exercise.py
from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.models.exercise import TrainingTask, ExerciseCategory, WeeklyPlan
from app.models.puzzle import ChessPuzzle
from app.models.user import User
from app.schemas.exercise import (
    PuzzleResponse,
    PuzzleSolutionRequest,
    WeeklyPlanResponse
)
from app.api.v1.dependencies import get_current_user_id

router = APIRouter()

# --- Helper Functions ---

def get_next_puzzle_for_user(db: Session, user: User) -> Optional[ChessPuzzle]:
    """
    Finds the next recommended puzzle for a user based on their ELO and active training tasks.
    """
    user_elo = user.current_elo
    min_elo = user_elo - 150
    max_elo = user_elo + 150

    # Find active, uncompleted tasks
    active_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user.id,
        WeeklyPlan.is_active == True
    ).first()

    if not active_plan:
        return None # Or generate a random puzzle if no plan exists

    tasks_query = db.query(TrainingTask).filter(
        TrainingTask.weekly_plan_id == active_plan.id,
        TrainingTask.is_completed == False
    )
    
    active_tasks = tasks_query.all()
    if not active_tasks:
        return None # All tasks for the week are completed

    # Collect themes from active tasks
    all_themes = []
    for task in active_tasks:
        if task.category in THEME_MAP:
            all_themes.extend(THEME_MAP[task.category])
    
    if not all_themes:
        return db.query(ChessPuzzle).filter(
            ChessPuzzle.rating.between(min_elo, max_elo)
        ).order_by(func.random()).first()

    theme_filters = [ChessPuzzle.themes.like(f"%{theme}%") for theme in all_themes]

    # TODO: Add logic to avoid showing puzzles the user has already solved
    return db.query(ChessPuzzle).filter(
        ChessPuzzle.rating.between(min_elo, max_elo),
        or_(*theme_filters)
    ).order_by(func.random()).first()


# --- Endpoints ---

@router.get("/next", response_model=Optional[PuzzleResponse])
def get_next_exercise(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Gets the next recommended tactical exercise for the authenticated user.
    The puzzle is selected based on the user's current ELO and their active training plan.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    next_puzzle = get_next_puzzle_for_user(db, user)

    if not next_puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No more recommended puzzles found for you at the moment. Check your weekly plan.")

    return next_puzzle


@router.post("/{exercise_id}/solve")
def solve_exercise(
    exercise_id: int,
    passed: bool = Query(..., description="Whether the user solved the puzzle or not"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Registers the result of a puzzle attempt. If the user passed, it increments
    the progress of the relevant training task.
    """
    puzzle = db.query(ChessPuzzle).filter(ChessPuzzle.id == exercise_id).first()
    if not puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise (puzzle) not found.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not passed:
        # Optionally, you could penalize ELO or store failed attempts here
        return {"message": "Attempt registered as failed. Keep practicing!"}

    # Find the corresponding active task to update
    puzzle_themes = set(puzzle.themes.split())
    
    active_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user_id,
        WeeklyPlan.is_active == True
    ).first()
    
    if not active_plan:
         raise HTTPException(status_code=400, detail="No active weekly plan found to update progress.")

    tasks = db.query(TrainingTask).filter(
        TrainingTask.weekly_plan_id == active_plan.id,
        TrainingTask.is_completed == False
    ).all()

    updated_task = None
    for task in tasks:
        task_themes = set(THEME_MAP.get(task.category, []))
        if puzzle_themes.intersection(task_themes):
            task.current_count += 1
            if task.current_count >= task.target_count:
                task.is_completed = True
            db.commit()
            db.refresh(task)
            updated_task = task
            break # Stop after updating the first matching task

    if updated_task:
        return {
            "message": "Correct solution! Your training progress has been updated.",
            "task_id": updated_task.id,
            "current_count": updated_task.current_count,
            "is_completed": updated_task.is_completed
        }
    
    return {"message": "Correct solution! No specific task was updated."}

# --- Weekly Plan Management ---

# Mapeador de categorías a tags de Lichess
THEME_MAP = {
    ExerciseCategory.TACTICS: ["capture", "fork", "pin", "doubleCheck", "mate"],
    ExerciseCategory.ENDGAME: ["endgame", "pawnEndgame", "rookEndgame", "kingSafety"],
    ExerciseCategory.STRATEGY: ["advantage", "middlegame", "quietMove"]
}

@router.get("/weekly/active", response_model=Optional[WeeklyPlanResponse])
def get_active_weekly_plan(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Gets the user's active weekly plan, including its tasks and progress.
    """
    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user_id,
        WeeklyPlan.is_active == True
    ).first()
    
    return plan


@router.post("/weekly/generate", response_model=WeeklyPlanResponse)
def generate_weekly_plan(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Generates a new training plan for the current week, deactivating previous ones.
    """
    # Deactivate any existing active plans for the user
    db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user_id,
        WeeklyPlan.is_active == True
    ).update({"is_active": False})

    today = date.today()
    start_dt = today - timedelta(days=today.weekday())
    end_dt = start_dt + timedelta(days=6)

    new_plan = WeeklyPlan(
        user_id=user_id,
        start_date=start_dt,
        end_date=end_dt,
        is_active=True
    )
    db.add(new_plan)
    db.flush()

    # Create a balanced set of tasks for the week
    suggested_tasks = [
        TrainingTask(user_id=user_id, weekly_plan_id=new_plan.id, category=ExerciseCategory.TACTICS, description="Solve essential tactical patterns (pins, forks, skewers)", target_count=10),
        TrainingTask(user_id=user_id, weekly_plan_id=new_plan.id, category=ExerciseCategory.ENDGAME, description="Practice basic endgames and king safety", target_count=5),
        TrainingTask(user_id=user_id, weekly_plan_id=new_plan.id, category=ExerciseCategory.STRATEGY, description="Analyze middlegame positions and prophylactic moves", target_count=5),
    ]
    
    db.add_all(suggested_tasks)
    db.commit()
    db.refresh(new_plan)

    return new_plan