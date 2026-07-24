from typing import Optional
from sqlalchemy.orm import Session
from app.repositories.base import BaseRepository
from app.models.user import User

class UserRepository(BaseRepository[User]):
    def __init__(self):
        super().__init__(User)

    def get_default_user(self, db: Session) -> Optional[User]:
        """
        Retorna el primer usuario registrado en el sistema.
        Útil para esta fase monolocal donde el sistema es para un único alumno.
        """
        return db.query(self.model).first()

    def get_or_create_default_user(self, db: Session) -> User:
        """
        Busca el usuario por defecto. Si no existe, lo crea con valores predeterminados.
        Ideal para la inicialización del sistema y para asegurar que siempre haya un usuario.
        """
        db_user = self.get_default_user(db)
        if db_user is None:
            # Los datos para el usuario por defecto podrían venir de un archivo de configuración
            default_user_data = {
                "email": "default.user@example.com",
                "full_name": "Default User",
            }
            db_user = self.create(db, obj_in=default_user_data)
        return db_user

    def update_user(self, db: Session, db_user: User, update_data: dict) -> User:
        """Actualiza de forma segura los campos de perfil del usuario."""
        for field, value in update_data.items():
            if value is not None:
                setattr(db_user, field, value)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

# Instancia singleton para importar en los servicios/endpoints
user_repo = UserRepository()