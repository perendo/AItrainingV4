# app/schemas/exercise.py
from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Optional
from app.models.exercise import ExerciseCategory

# Simplified schema for a puzzle returned by the API
class PuzzleResponse(BaseModel):
    id: str # This was puzzle_id, but the model has id
    fen: str
    moves: str
    rating: int
    themes: str

    class Config:
        from_attributes = True

# Schema for submitting a puzzle solution
class PuzzleSolutionRequest(BaseModel):
    user_moves: str  # e.g., "e2e4 e7e5"

# Schema for the response when a solution is submitted
class ExerciseSolutionResponse(BaseModel):
    correct: bool
    message: str
    next_puzzle: Optional[PuzzleResponse] = None

# Schema for a training task
class TrainingTaskResponse(BaseModel):
    id: int
    category: ExerciseCategory
    description: str
    target_count: int
    current_count: int
    is_completed: bool
    created_at: datetime
    puzzles: Optional[List[PuzzleResponse]] = []

    class Config:
        from_attributes = True

# Schema for updating task progress
class UpdateTaskProgress(BaseModel):
    increment: int = 1

from app.schemas.gm_game import GMGameResponse
# Simplified schema for tasks within a weekly plan
class TrainingTask(BaseModel):
    id: int
    category: ExerciseCategory
    description: str
    current_count: int
    target_count: int
    is_completed: bool
    gm_game: Optional[GMGameResponse] = None

    class Config:
        from_attributes = True

# Schema for the complete weekly plan response
class WeeklyPlanResponse(BaseModel):
    id: int
    start_date: date
    end_date: date
    is_active: bool
    compliance_rate: float
    tasks: List[TrainingTask]

    class Config:
        from_attributes = True