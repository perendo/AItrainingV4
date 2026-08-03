import pytest
import os


class TestConfig:
    def test_settings_lee_database_url(self):
        from app.core.config import settings
        assert settings.DATABASE_URL is not None

    def test_settings_api_v1_str(self):
        from app.core.config import settings
        assert settings.API_V1_STR == "/api/v1"

    def test_settings_stockfish_path(self):
        from app.core.config import settings
        assert settings.STOCKFISH_PATH is not None

    def test_settings_gemini_api_key(self):
        from app.core.config import settings
        assert isinstance(settings.GEMINI_API_KEY, str)


class TestDatabase:
    def test_engine_se_crea_correctamente(self):
        from app.core.database import engine
        assert engine is not None

    def test_session_local_funciona(self, db_session):
        result = db_session.execute(
            __import__("sqlalchemy").text("SELECT 1")
        ).scalar()
        assert result == 1

    def test_base_metadata_crea_tablas(self, db_engine):
        from app.core.database import Base
        from sqlalchemy import inspect

        inspector = inspect(db_engine)
        tables = inspector.get_table_names()
        assert "users" in tables
        assert "games" in tables
        assert "move_errors" in tables
