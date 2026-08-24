# app/api/v1/endpoints_user.py
import json
import logging
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.models.game import Game, MoveError, CoachReport
from app.models.gm_consultation import GMConsultation
from app.models.user_game_analysis import UserGameAnalysis
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame
from app.models.task import ProcessingTask
from app.models.exercise import TrainingTask, WeeklyPlan
from app.models.endgame import UserEndgameProgress
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    Token,
    LegalAcceptRequest,
)
from app.core.security import hash_password, verify_password, create_access_token
# Importamos la dependencia que creamos en el paso anterior para leer el JWT
from app.api.v1.dependencies import get_current_user_id

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    """
    Registra un nuevo jugador en el sistema.
    La contraseña se encripta de forma segura mediante hashing bcrypt antes de guardarse.
    """
    # 1. Verificar si el nombre de usuario ya existe
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El nombre de usuario '{payload.username}' ya está registrado."
        )

    # 2. Crear la instancia del modelo encriptando la contraseña y registrando el
    # consentimiento legal (prueba RGPD: fecha + versión de los textos aceptados)
    new_user = User(
        username=payload.username,
        full_name=payload.full_name,
        chess_online_nick=payload.chess_online_nick,
        current_elo=payload.current_elo,
        target_elo=payload.target_elo,
        hashed_password=hash_password(payload.password),  # Encriptación segura
        legal_accepted_at=datetime.utcnow(),
        legal_accepted_version=settings.LEGAL_VERSION,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """
    Endpoint de inicio de sesión estándar de FastAPI.
    Verifica las credenciales del usuario y devuelve un Token JWT de acceso si son válidas.
    """
    t0 = time.perf_counter()

    # 1. Buscar al usuario por su username (índice único en User.username)
    user = db.query(User).filter(User.username == form_data.username).first()
    t_query = time.perf_counter()
    logger.info(
        "[LOGIN] Consulta de usuario '%s': %.3f ms",
        form_data.username,
        (t_query - t0) * 1000,
    )

    if not user:
        logger.info(
            "[LOGIN] Usuario no encontrado. Total: %.3f ms",
            (time.perf_counter() - t0) * 1000,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Verificar la contraseña (bcrypt: coste intencionado ~100-300 ms por seguridad)
    if not verify_password(form_data.password, user.hashed_password):
        t_verify = time.perf_counter()
        logger.info(
            "[LOGIN] Verificación de contraseña FALLIDA: verify=%.3f ms, total=%.3f ms",
            (t_verify - t_query) * 1000,
            (t_verify - t0) * 1000,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    t_verify_ok = time.perf_counter()

    # 3. Generamos el token JWT vinculando el ID único del usuario
    access_token = create_access_token(data={"sub": str(user.id)})
    t_token = time.perf_counter()

    logger.info(
        "[LOGIN] OK usuario '%s': verify=%.3f ms, token=%.3f ms, total=%.3f ms",
        user.username,
        (t_verify_ok - t_query) * 1000,
        (t_token - t_verify_ok) * 1000,
        (t_token - t0) * 1000,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user(
    current_user_id: int = Depends(get_current_user_id), 
    db: Session = Depends(get_db)
):
    """
    Obtiene el perfil del jugador activo extrayendo su identidad directamente desde el JWT.
    """
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado."
        )
    return user


@router.put("/me", response_model=UserResponse)
def update_user_profile(
    user_in: UserUpdate, 
    current_user_id: int = Depends(get_current_user_id), 
    db: Session = Depends(get_db)
):
    """
    Permite modificar los datos del perfil o actualizar el ELO del jugador autenticado.
    """
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado para actualizar."
        )
    
    # Actualización dinámica basándonos en los campos que envía el cliente
    update_data = user_in.model_dump(exclude_unset=True)

    # La contraseña se trata aparte: se hashea antes de guardarse en hashed_password
    new_password = update_data.pop("password", None)
    if new_password:
        user.hashed_password = hash_password(new_password)

    for key, value in update_data.items():
        setattr(user, key, value)
        
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/legal-accept", response_model=UserResponse)
def accept_legal_terms(
    payload: LegalAcceptRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Registra la (re)aceptación de los Términos y la Política de Privacidad.
    Se usa cuando la versión vigente de los textos legales cambia tras el registro.
    """
    if not payload.accepted_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes aceptar los Términos y la Política de Privacidad.",
        )

    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado."
        )

    user.legal_accepted_at = datetime.utcnow()
    user.legal_accepted_version = settings.LEGAL_VERSION
    db.commit()
    db.refresh(user)
    return user


@router.get("/me/export")
def export_my_data(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Derecho de acceso y portabilidad (RGPD arts. 15 y 20): descarga todos los datos
    personales del usuario autenticado en un único JSON estructurado.
    """
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado."
        )

    games = db.query(Game).filter(Game.user_id == current_user_id).all()

    export = {
        "exportado": datetime.utcnow().isoformat() + "Z",
        "version_textos_legales": settings.LEGAL_VERSION,
        "perfil": {
            "username": user.username,
            "full_name": user.full_name,
            "chess_online_nick": user.chess_online_nick,
            "current_elo": user.current_elo,
            "target_elo": user.target_elo,
            "created_at": str(user.created_at),
            "legal_accepted_at": str(user.legal_accepted_at),
            "legal_accepted_version": user.legal_accepted_version,
        },
        "partidas": [
            {
                "white_player": g.white_player,
                "black_player": g.black_player,
                "result": g.result,
                "player_color": g.player_color,
                "game_date": g.game_date,
                "total_moves": g.total_moves,
                "created_at": str(g.created_at),
                "pgn": g.pgn_content,
                "errores_detectados": [
                    {
                        "move_number": e.move_number,
                        "move": e.algebraic_move,
                        "type": e.error_type,
                        "eval_loss_centipawns": e.eval_difference,
                        "theme": e.tactical_theme,
                        "description": e.description,
                    }
                    for e in db.query(MoveError).filter(MoveError.game_id == g.id).all()
                ],
            }
            for g in games
        ],
        "informes_coach": [
            {
                "estimated_level": r.estimated_level,
                "strengths": r.strengths,
                "weaknesses": r.weaknesses,
                "report_markdown": r.report_markdown,
                "created_at": str(r.created_at),
            }
            for r in db.query(CoachReport).filter(CoachReport.user_id == current_user_id).all()
        ],
        "consultas_gm": [
            {
                "question": c.question,
                "answer": c.answer,
                "status": c.status,
                "created_at": str(c.created_at),
            }
            for c in db.query(GMConsultation).filter(GMConsultation.user_id == current_user_id).all()
        ],
        "analisis_de_partidas": [
            {
                "game_type": a.game_type,
                "white_player": a.white_player,
                "black_player": a.black_player,
                "pgn": a.pgn,
                "fases_analisis": a.fases_analisis,
                "momentos_criticos": a.momentos_criticos,
                "factores_posicionales": a.factores_posicionales,
                "conclusiones_plan": a.conclusiones_plan,
                "gemini_feedback": a.gemini_feedback,
                "status": a.status,
                "created_at": str(a.created_at),
            }
            for a in db.query(UserGameAnalysis).filter(UserGameAnalysis.user_id == current_user_id).all()
        ],
        "procesamientos_pgn": [
            {
                "filename": t.filename,
                "status": t.status,
                "processed": t.processed,
                "skipped_duplicate": t.skipped_duplicate,
                "errors_found": t.errors_found,
                "created_at": str(t.created_at),
            }
            for t in db.query(ProcessingTask).filter(ProcessingTask.user_id == current_user_id).all()
        ],
        "entrenamiento": {
            "planes_semanales": [
                {
                    "start_date": str(p.start_date),
                    "end_date": str(p.end_date),
                    "is_active": p.is_active,
                    "created_at": str(p.created_at),
                }
                for p in db.query(WeeklyPlan).filter(WeeklyPlan.user_id == current_user_id).all()
            ],
            "tareas": [
                {
                    "category": str(task.category.value) if task.category else None,
                    "description": task.description,
                    "target_count": task.target_count,
                    "current_count": task.current_count,
                    "is_completed": task.is_completed,
                    "created_at": str(task.created_at),
                }
                for task in db.query(TrainingTask).filter(TrainingTask.user_id == current_user_id).all()
            ],
        },
        "partidas_gm_analizadas": [
            r.gm_game_id
            for r in db.query(UserAnalyzedGMGame).filter(UserAnalyzedGMGame.user_id == current_user_id).all()
        ],
        "progreso_finales": [
            {
                "lesson_id": p.lesson_id,
                "status": str(p.status.value) if p.status else None,
                "last_listened_second": p.last_listened_second,
                "updated_at": str(p.updated_at),
            }
            for p in db.query(UserEndgameProgress).filter(UserEndgameProgress.user_id == current_user_id).all()
        ],
    }

    content = json.dumps(export, ensure_ascii=False, indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="entrenador_ia_mis_datos.json"'
        },
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Derecho de supresión (RGPD art. 17): elimina definitivamente la cuenta y todos
    sus datos asociados.

    El borrado es explícito tabla por tabla (no dependemos del cascade ORM ni del
    ondelete SQL) para comportarse igual en SQLite y PostgreSQL.
    """
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado."
        )

    try:
        # Capturamos el username antes de eliminar (tras el commit el ORM expira el objeto)
        username = user.username

        # 1. Errores por jugada (dependen de games)
        game_ids = [g.id for g in db.query(Game.id).filter(Game.user_id == current_user_id)]
        db.query(MoveError).filter(MoveError.game_id.in_(game_ids)).delete(synchronize_session=False)

        # 2. Resto de tablas dependientes del usuario
        for model in (
            Game,
            CoachReport,
            ProcessingTask,
            TrainingTask,
            WeeklyPlan,
            UserAnalyzedGMGame,
            GMConsultation,
            UserGameAnalysis,
            UserEndgameProgress,
        ):
            db.query(model).filter(model.user_id == current_user_id).delete(synchronize_session=False)

        # 3. La cuenta en último lugar
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Error eliminando la cuenta %s", current_user_id, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo eliminar la cuenta. Inténtalo de nuevo."
        )

    logger.info("[RGPD] Cuenta %s (%s) eliminada con todos sus datos", current_user_id, username)
    return Response(status_code=status.HTTP_204_NO_CONTENT)