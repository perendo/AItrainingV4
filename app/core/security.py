# app/core/security.py
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from app.core.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 1. Asegúrate de que esta función se llama exactamente así y empieza desde el inicio de la línea
def hash_password(password: str) -> str:
    """
    Toma una contraseña en texto plano y devuelve su versión encriptada (hash).
    """
    return pwd_context.hash(password)

# 2. Asegúrate de que esta función está presente
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Compara una contraseña introducida por el usuario con el hash de la base de datos.
    """
    return pwd_context.verify(plain_password, hashed_password)

# 3. Asegúrate de que esta función está presente
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Toma un diccionario de datos y genera un token JWT firmado.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt