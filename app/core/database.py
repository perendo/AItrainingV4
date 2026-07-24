from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings  # Asumimos que settings lee DATABASE_URL del .env

# El argumento connect_args es exclusivo y necesario para SQLite en entornos concurrentes
engine = create_engine(
    settings.DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# Escuchamos el evento 'connect' para activar el modo WAL y optimizar SQLite en producción
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