from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings  # Asumimos que settings lee DATABASE_URL del .env

# Determinamos el dialecto desde la URL para aplicar configuración específica
# solo cuando corresponde (SQLite en dev / PostgreSQL en producción).
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

# El argumento connect_args es exclusivo y necesario para SQLite en entornos concurrentes
engine_kwargs: dict = {}
if _is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# Escuchamos el evento 'connect' para activar el modo WAL y optimizar SQLite en producción.
# Solo se aplica a SQLite: los PRAGMA no existen en PostgreSQL.
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        # Permite lecturas concurrentes mientras se escriben análisis o informes
        cursor.execute("PRAGMA journal_mode=WAL;")
        # Optimiza la velocidad de escritura en disco reduciendo sincronizaciones redundantes
        cursor.execute("PRAGMA synchronous=NORMAL;")
        # Si la BD está ocupada por un milisegundo, espera hasta 5s antes de lanzar error
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependencia que usaremos en los endpoints de FastAPI para abrir y cerrar la BD limpiamente
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def background_session() -> Iterator[Session]:
    """Sesión de BD para tareas en segundo plano (BackgroundTasks).

    Centraliza el patrón ``import app.core.database as database_module;
    db = database_module.SessionLocal()`` usado en los servicios, permitiendo
    que los tests intercambien ``SessionLocal`` por la sesión de prueba.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()