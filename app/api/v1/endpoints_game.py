from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.core.database import get_db
from app.schemas.game import GameResponse, TaskResponse
from app.repositories.game_repo import game_repo
from app.services.chess_analyzer import chess_analyzer_service
from app.api.v1.dependencies import get_current_user_id
from app.models.user import User
from app.models.task import ProcessingTask

router = APIRouter()


@router.post("/upload-pgn", response_model=TaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_and_analyze_pgn(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Sube un archivo PGN con N partidas. El análisis se ejecuta en background.
    Devuelve un task_id para consultar el progreso del procesamiento.
    """
    # 1. Validar que el usuario tenga perfil
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe dar de alta su perfil de usuario antes de subir y analizar partidas."
        )

    # 2. Validar formato del archivo
    if not file.filename.endswith('.pgn') and not file.filename.endswith('.txt'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de archivo no válido. Debe ser un fichero .pgn o .txt en formato estructurado PGN."
        )

    try:
        # Leer el contenido del archivo
        contents = await file.read()
        try:
            pgn_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            pgn_text = contents.decode("latin-1", errors="replace")

        # 3. Crear registro de tarea
        task = ProcessingTask(user_id=user_id, filename=file.filename, status="pending")
        db.add(task)
        db.commit()
        db.refresh(task)

        # 4. Lanzar análisis en background
        background_tasks.add_task(
            chess_analyzer_service.process_pgn_background,
            task_id=task.id,
            pgn_text=pgn_text,
            user_id=user_id
        )

        return task

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error crítico procesando el archivo PGN: {str(e)}"
        )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_status(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """Consulta el estado de una tarea de análisis PGN."""
    task = db.query(ProcessingTask).filter(
        ProcessingTask.id == task_id,
        ProcessingTask.user_id == user_id
    ).first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarea no encontrada."
        )

    return task


@router.get("/", response_model=List[GameResponse])
def list_my_analyzed_games(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """Lista el historial completo de partidas del usuario junto con todos sus errores."""
    return game_repo.get_user_games_with_errors(db, user_id=user_id)
