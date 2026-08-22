import pytest
from pydantic import ValidationError
from app.schemas.user import UserCreate, UserUpdate, UserResponse, Token
from app.schemas.game import MoveErrorBase, MoveErrorResponse, GameBase, GameResponse, GameSummaryResponse, PuzzleResponse
from app.schemas.exercise import TrainingTaskResponse, UpdateTaskProgress, PuzzleSolutionRequest, WeeklyPlanResponse
from app.schemas.coach import CoachReportJSON


class TestUserSchemas:
    def test_user_create_valido(self):
        user = UserCreate(
            username="pedro",
            full_name="Pedro Rendo",
            chess_online_nick="pedroq",
            current_elo=1700,
            target_elo=2000,
            password="test123",
        )
        assert user.username == "pedro"
        assert user.current_elo == 1700

    def test_user_create_username_corto_falla(self):
        with pytest.raises(ValidationError):
            UserCreate(
                username="ab",
                full_name="Pedro Rendo",
                password="test123",
            )

    def test_user_create_elo_fuera_rango_falla(self):
        with pytest.raises(ValidationError):
            UserCreate(
                username="pedro",
                full_name="Pedro Rendo",
                current_elo=5000,
                password="test123",
            )

    def test_user_create_password_corta_falla(self):
        with pytest.raises(ValidationError):
            UserCreate(
                username="pedro",
                full_name="Pedro Rendo",
                password="123",
            )

    def test_user_update_campos_opcionales(self):
        update = UserUpdate(full_name="Nuevo Nombre")
        data = update.model_dump(exclude_unset=True)
        assert data == {"full_name": "Nuevo Nombre"}

    def test_user_update_vacio(self):
        update = UserUpdate()
        data = update.model_dump(exclude_unset=True)
        assert data == {}

    def test_token_schema(self):
        token = Token(access_token="abc123", token_type="bearer")
        assert token.access_token == "abc123"


class TestGameSchemas:
    def test_move_error_base(self):
        err = MoveErrorBase(
            move_number=14,
            algebraic_move="Nf3",
            error_type="Mistake",
            eval_difference=80,
            tactical_theme="Positional / Strategic",
        )
        assert err.move_number == 14

    def test_move_error_eval_negativo(self):
        err = MoveErrorBase(
            move_number=5,
            algebraic_move="Bxf7",
            error_type="Blunder",
            eval_difference=-250,
            tactical_theme="Tactical: Capture Blunder",
        )
        assert err.eval_difference == -250

    def test_game_response_con_errores(self):
        from datetime import datetime

        resp = GameResponse(
            id=1,
            user_id=1,
            white_player="Pedro",
            black_player="Rival",
            result="1-0",
            player_color="white",
            pgn_content="1. e4 e5 1-0",
            created_at=datetime.now(),
            errors=[],
        )
        assert resp.errors == []


class TestCoachSchemas:
    def test_coach_report_json_valido(self):
        report = CoachReportJSON(
            report_markdown="## Informe completo en Markdown",
        )
        assert report.report_markdown == "## Informe completo en Markdown"

    def test_coach_report_json_omitir_report_markdown_falla(self):
        with pytest.raises(ValidationError):
            CoachReportJSON()


class TestExerciseSchemas:
    def test_update_task_progress(self):
        prog = UpdateTaskProgress(increment=3)
        assert prog.increment == 3

    def test_update_task_progress_default(self):
        prog = UpdateTaskProgress()
        assert prog.increment == 1

    def test_solution_validation_request(self):
        req = PuzzleSolutionRequest(user_moves="e2e4 e7e5")
        assert req.user_moves == "e2e4 e7e5"
