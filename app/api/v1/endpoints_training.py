# app/api/v1/endpoints_training.py
from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.models.exercise import TrainingTask, ExerciseCategory, WeeklyPlan
from app.models.puzzle import Puzzle
from app.models.user import User
from app.schemas.exercise import (
    WeeklyPlanResponse,
    TrainingTask as TrainingTaskSchema,
    PuzzleResponse,
)
from app.api.v1.dependencies import get_current_user_id
from app.models.gm_game import GMGame
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame

router = APIRouter()

# Mapeador de categorías a tags de Lichess
THEME_MAP = {
    ExerciseCategory.TACTICS: ["capture", "fork", "pin", "doubleCheck", "mate"],
    ExerciseCategory.ENDGAME: ["endgame", "pawnEndgame", "rookEndgame", "kingSafety"],
    ExerciseCategory.STRATEGY: ["advantage", "middlegame", "quietMove"]
}

@router.get("/tasks/{task_id}/next-puzzle", response_model=PuzzleResponse)
def get_next_puzzle_for_task(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Gets a random, relevant puzzle for a given training task.
    """
    task = db.query(TrainingTask).filter(
        TrainingTask.id == task_id,
        TrainingTask.user_id == user_id
    ).first()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    themes = THEME_MAP.get(task.category)
    if not themes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task category does not support puzzles")

    # Build a query to find a puzzle that has at least one of the required themes
    theme_filters = [Puzzle.themes.like(f"%{theme}%") for theme in themes]
    
    puzzle = db.query(Puzzle).filter(or_(*theme_filters)).order_by(func.random()).first()

    if not puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No suitable puzzle found for this task's themes")

    return puzzle


@router.get("/pending-tasks", response_model=List[TrainingTaskSchema])
def get_pending_tasks(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Gets the user's pending tasks, including regular tasks from the active 
    weekly plan and a recommended GM game analysis task if available.
    """
    # 1. Get regular pending tasks from the active plan
    active_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user_id,
        WeeklyPlan.is_active == True
    ).first()

    pending_tasks = []
    if active_plan:
        pending_tasks.extend(
            [task for task in active_plan.tasks if not task.is_completed]
        )

    # 2. Check for an available GM game to analyze from the recommended list
    analyzed_game_ids = db.query(UserAnalyzedGMGame.gm_game_id).filter(
        UserAnalyzedGMGame.user_id == user_id
    ).all()
    analyzed_game_ids = [id[0] for id in analyzed_game_ids]

    recommended_gms_map = {
        "Morphy": "Táctica y Cálculo",
        "Alekhine": "Táctica y Cálculo",
        "Capablanca": "Juego Posicional y Finales",
        "Karpov": "Juego Posicional y Finales",
        "Tigran Petrosian": "Defensa y Seguridad del Rey",
    }
    
    # Build a case-insensitive filter for GM names
    gm_search_terms = list(recommended_gms_map.keys())
    gm_filters = [GMGame.gm_name.ilike(f"%{term}%") for term in gm_search_terms]

    # Check if user already has an assigned GM game that hasn't been analyzed yet
    user_record = db.query(User).filter(User.id == user_id).first()
    gm_game_to_analyze = None

    if user_record and user_record.current_assigned_gm_game_id:
        # Verify the assigned game still exists and hasn't been analyzed
        already_analyzed = user_record.current_assigned_gm_game_id in analyzed_game_ids
        if not already_analyzed:
            gm_game_to_analyze = db.query(GMGame).filter(
                GMGame.id == user_record.current_assigned_gm_game_id
            ).first()

    # If no valid assignment exists, pick a new random game and persist it
    if not gm_game_to_analyze:
        gm_game_to_analyze = db.query(GMGame).filter(
            or_(*gm_filters),
            ~GMGame.id.in_(analyzed_game_ids)
        ).order_by(func.random()).first()

        # Persist the assignment so it stays the same across refreshes
        if gm_game_to_analyze and user_record:
            user_record.current_assigned_gm_game_id = gm_game_to_analyze.id
            db.commit()

    # 3. If a GM game is found, create a virtual task
    if gm_game_to_analyze:
        print(f"DEBUG: Found GM game to analyze: {gm_game_to_analyze.gm_name}")
        
        # Find which recommended GM was matched to get the reason
        reason = "Análisis General"
        # Iterate through the map to find the best match for the reason
        for gm_key, gm_reason in recommended_gms_map.items():
            if gm_key.lower() in gm_game_to_analyze.gm_name.lower():
                reason = gm_reason
                break
        
        description = (
            f"Analiza la partida de {gm_game_to_analyze.gm_name} "
            f"({gm_game_to_analyze.white} vs {gm_game_to_analyze.black}, {gm_game_to_analyze.year}). "
            f"Asignado para reforzar: {reason}."
        )

        gm_task = TrainingTaskSchema(
            id=0, # Virtual task, no real ID
            category=ExerciseCategory.GM_GAME_ANALYSIS,
            description=description,
            current_count=0,
            target_count=1,
            is_completed=False,
            gm_game=gm_game_to_analyze,
        )
        pending_tasks.append(gm_task)
    else:
        print("DEBUG: No new GM game found to recommend for this user.")
    
    return pending_tasks

@router.get("/all-tasks", response_model=List[TrainingTaskSchema])
def get_all_tasks(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Gets all of the user's tasks from the active weekly plan.
    """
    active_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.user_id == user_id,
        WeeklyPlan.is_active == True
    ).first()
    
    if not active_plan:
        return []

    return active_plan.tasks


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

@router.post("/tasks/{task_id}/complete", response_model=TrainingTaskSchema)
def complete_training_task(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Marks one unit of a training task as complete and checks if the entire task is finished.
    """
    task = db.query(TrainingTask).filter(
        TrainingTask.id == task_id,
        TrainingTask.user_id == user_id
    ).first()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not task.is_completed:
        task.current_count += 1
        if task.current_count >= task.target_count:
            task.is_completed = True
        
        db.commit()
        db.refresh(task)

    return task