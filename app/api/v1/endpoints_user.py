# app/api/v1/endpoints_user.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse, Token
from app.core.security import hash_password, verify_password, create_access_token
# Importamos la dependencia que creamos en el paso anterior para leer el JWT
from app.api.v1.dependencies import get_current_user_id

router = APIRouter()


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

    # 2. Crear la instancia del modelo encriptando la contraseña
    new_user = User(
        username=payload.username,
        full_name=payload.full_name,
        chess_online_nick=payload.chess_online_nick,
        current_elo=payload.current_elo,
        target_elo=payload.target_elo,
        hashed_password=hash_password(payload.password)  # Encriptación segura
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
    # 1. Buscar al usuario por su username
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Verificar si la contraseña introducida coincide con el hash guardado
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Generamos el token JWT vinculando el ID único del usuario
    access_token = create_access_token(data={"sub": str(user.id)})
    
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