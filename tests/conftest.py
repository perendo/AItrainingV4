import os
import shutil
import sys
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if sys.platform == "win32":
    os.environ["STOCKFISH_PATH"] = "D:\\AItrainingV4\\stockfish\\stockfish.exe"
else:
    os.environ["STOCKFISH_PATH"] = shutil.which("stockfish") or "/usr/games/stockfish"
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"

from app.core.database import Base, get_db
import app.core.database as database_module
from app.main import app
from app.models.user import User
from app.models.game import Game, MoveError, CoachReport
from app.models.exercise import TrainingTask, WeeklyPlan
from app.models.puzzle import Puzzle as ChessPuzzle
from app.models.task import ProcessingTask
from app.core.security import hash_password, create_access_token


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(scope="function")
def client(db_engine):
    from fastapi.testclient import TestClient

    TestSession = sessionmaker(bind=db_engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    original_session_local = database_module.SessionLocal
    database_module.SessionLocal = TestSession

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    database_module.SessionLocal = original_session_local


@pytest.fixture
def sample_user_data():
    return {
        "username": "pedro_test",
        "full_name": "Rendo Quindos, Pedro",
        "chess_online_nick": "pedro_quindos",
        "current_elo": 1700,
        "target_elo": 2000,
        "password": "test123456",
        "accepted_terms": True,
    }


@pytest.fixture
def registered_user(client, sample_user_data):
    resp = client.post("/api/v1/users/register", json=sample_user_data)
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture
def auth_headers(registered_user):
    resp_token = create_access_token(data={"sub": str(registered_user["id"])})
    return {"Authorization": f"Bearer {resp_token}"}


@pytest.fixture
def sample_pgn_single():
    return """[Event "Test"]
[Site "?"]
[Date "2026.01.01"]
[White "Rendo Quindos, Pedro"]
[Black "Oponente Test"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0
"""


@pytest.fixture
def sample_pgn_multi():
    return """[Event "Test1"]
[Site "?"]
[Date "2026.01.01"]
[White "Rendo Quindos, Pedro"]
[Black "Oponente A"]
[Result "1-0"]

1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. c3 Bd6 1-0

[Event "Test2"]
[Site "?"]
[Date "2026.01.02"]
[White "Oponente B"]
[Black "Rendo Quindos, Pedro"]
[Result "0-1"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 0-1
"""


@pytest.fixture
def sample_pgn_not_user():
    return """[Event "Test"]
[Site "?"]
[Date "2026.01.01"]
[White "Oponente X"]
[Black "Oponente Y"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O 1-0
"""


@pytest.fixture
def pedro_pgn_path():
    return os.path.join(os.path.dirname(__file__), "..", "Historico partidas", "PedroBasedatos.pgn")
