import pytest
from app.models.user import User
from app.models.game import Game, MoveError
from app.models.exercise import TrainingTask, ExerciseCategory
from app.repositories.user_repo import user_repo
from app.repositories.game_repo import game_repo
from app.core.security import hash_password


class TestUserRepository:
    def test_create_user(self, db_session):
        user = user_repo.create(db_session, obj_in={
            "username": "test_user",
            "full_name": "Test User",
            "hashed_password": hash_password("pass123"),
            "current_elo": 1500,
            "target_elo": 2000,
        })
        assert user.id is not None
        assert user.username == "test_user"

    def test_get_user_by_id(self, db_session):
        user = user_repo.create(db_session, obj_in={
            "username": "find_me",
            "full_name": "Find Me",
            "hashed_password": hash_password("pass123"),
            "current_elo": 1500,
            "target_elo": 2000,
        })
        found = user_repo.get(db_session, user.id)
        assert found is not None
        assert found.username == "find_me"

    def test_get_nonexistent_user(self, db_session):
        found = user_repo.get(db_session, 99999)
        assert found is None

    def test_get_default_user(self, db_session):
        user_repo.create(db_session, obj_in={
            "username": "first_user",
            "full_name": "First User",
            "hashed_password": hash_password("pass123"),
            "current_elo": 1500,
            "target_elo": 2000,
        })
        default = user_repo.get_default_user(db_session)
        assert default is not None

    def test_get_default_user_empty(self, db_session):
        default = user_repo.get_default_user(db_session)
        assert default is None

    def test_update_user(self, db_session):
        user = user_repo.create(db_session, obj_in={
            "username": "to_update",
            "full_name": "Old Name",
            "hashed_password": hash_password("pass123"),
            "current_elo": 1500,
            "target_elo": 2000,
        })
        updated = user_repo.update_user(db_session, user, {"full_name": "New Name"})
        assert updated.full_name == "New Name"


class TestGameRepository:
    def _create_user(self, db_session):
        return user_repo.create(db_session, obj_in={
            "username": "player1",
            "full_name": "Player One",
            "hashed_password": hash_password("pass123"),
            "current_elo": 1700,
            "target_elo": 2000,
        })

    def test_create_game_with_errors(self, db_session):
        user = self._create_user(db_session)
        game_data = {
            "user_id": user.id,
            "white_player": "Player One",
            "black_player": "Rival",
            "result": "1-0",
            "player_color": "white",
            "pgn_content": "1. e4 e5 1-0",
            "total_moves": 5,
            "game_date": "2026.01.01",
        }
        errors_data = [
            {
                "move_number": 5,
                "algebraic_move": "Nf3",
                "error_type": "Mistake",
                "eval_difference": 80,
                "tactical_theme": "Positional / Strategic",
                "description": "Test error",
            }
        ]
        game = game_repo.create_game_with_errors(db_session, game_data, errors_data)
        assert game.id is not None
        assert len(game.errors) == 1
        assert game.errors[0].algebraic_move == "Nf3"

    def test_get_user_games_with_errors(self, db_session):
        user = self._create_user(db_session)
        game_data = {
            "user_id": user.id,
            "white_player": "Player One",
            "black_player": "Rival",
            "result": "1-0",
            "player_color": "white",
            "pgn_content": "1. e4 e5 1-0",
            "total_moves": 5,
            "game_date": "2026.01.01",
        }
        game_repo.create_game_with_errors(db_session, game_data, [])
        games = game_repo.get_user_games_with_errors(db_session, user.id)
        assert len(games) >= 1

    def test_is_game_already_exists(self, db_session):
        user = self._create_user(db_session)
        game_data = {
            "user_id": user.id,
            "white_player": "Player One",
            "black_player": "Rival",
            "result": "1-0",
            "player_color": "white",
            "pgn_content": "1. e4 e5 1-0",
            "total_moves": 5,
            "game_date": "2026.01.01",
        }
        game_repo.create_game_with_errors(db_session, game_data, [])
        exists = game_repo.is_game_already_exists(
            db_session,
            user_id=user.id,
            white="Player One",
            black="Rival",
            result="1-0",
            total_moves=5,
            game_date="2026.01.01",
        )
        assert exists is True

    def test_is_game_not_exists(self, db_session):
        user = self._create_user(db_session)
        exists = game_repo.is_game_already_exists(
            db_session,
            user_id=user.id,
            white="Nobody",
            black="Nobody",
            result="1-0",
            total_moves=0,
            game_date="2099.01.01",
        )
        assert exists is False

    def test_count_user_games(self, db_session):
        user = self._create_user(db_session)
        for i in range(3):
            game_data = {
                "user_id": user.id,
                "white_player": "Player One",
                "black_player": f"Rival {i}",
                "result": "1-0",
                "player_color": "white",
                "pgn_content": "1. e4 e5 1-0",
                "total_moves": 5,
                "game_date": f"2026.01.0{i+1}",
            }
            game_repo.create_game_with_errors(db_session, game_data, [])
        count = game_repo.count_user_games(db_session, user.id)
        assert count == 3
