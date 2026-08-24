# app/schemas/user.py
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime

# Campos compartidos por todos los esquemas de usuario
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="Nombre de usuario único para login")
    full_name: str = Field(..., min_length=3, max_length=150, description="Nombre y apellidos del jugador")
    chess_online_nick: Optional[str] = Field(None, max_length=100, description="Nick de Chess.com o Lichess")
    current_elo: int = Field(1500, ge=100, le=3000, description="ELO actual del jugador")
    target_elo: int = Field(2000, ge=100, le=3000, description="ELO objetivo del jugador")

# Esquema para registrar un usuario por primera vez (Pide la contraseña)
class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Contraseña en texto plano para el registro")
    accepted_terms: bool = Field(
        ...,
        description="Consentimiento expreso RGPD: aceptación de Términos y Política de Privacidad",
    )

    @model_validator(mode="after")
    def _terms_must_be_accepted(self) -> "UserCreate":
        if not self.accepted_terms:
            raise ValueError(
                "Debes aceptar los Términos y la Política de Privacidad para registrarte."
            )
        return self

# Esquema para actualizar el perfil del usuario más adelante
class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=3, max_length=150)
    chess_online_nick: Optional[str] = Field(None, max_length=100)
    current_elo: Optional[int] = Field(None, ge=100, le=3000)
    target_elo: Optional[int] = Field(None, ge=100, le=3000)
    password: Optional[str] = Field(None, min_length=6, description="Nueva contraseña en texto plano; se hashea antes de guardarse")

# Esquema de respuesta (Lo que la API devuelve al cliente de forma pública)
class UserResponse(UserBase):
    id: int
    created_at: datetime
    legal_accepted_at: Optional[datetime] = None
    legal_accepted_version: Optional[str] = None

    # Activamos la compatibilidad con objetos de SQLAlchemy (ORM)
    model_config = {
        "from_attributes": True
    }

# Re-aceptación de los textos legales cuando cambia su versión (RGPD, art. 6.1.a)
class LegalAcceptRequest(BaseModel):
    accepted_terms: bool = Field(..., description="Debe ser true para registrar la aceptación")

# Esquema complementario para el manejo de Tokens JWT
class Token(BaseModel):
    access_token: str
    token_type: str