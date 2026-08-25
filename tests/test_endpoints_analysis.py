import json
from unittest.mock import patch, MagicMock, PropertyMock

import pytest

from app.models.gm_game import GMGame
from app.services.gemini_client import GeminiClient

VALID_FEEDBACK = {
    "feedback_fases": {"apertura": "OK", "medio_juego": "OK", "final": "OK"},
    "respuestas_preguntas_criticas": {"mejora_piezas": "Alfil", "amenaza_real": "Ninguna"},
    "matriz_posicional": {"material": "Igual", "rey": "Seguro", "espacio": "Ok"},
    "auditoria_conclusiones": {"plan_correcto": True, "evaluacion_error": "Ninguno", "concepto_reforzar": "Finales"},
}

FORM_BLOCKS = {
    "fases_analisis": {"apertura": "Apertura italiana", "medio_juego": "Dominio centro", "final": "Conversión"},
    "momentos_criticos": {"pieza_a_mejorar": "Caballo", "amenaza_rival": "Dama en h5"},
    "factores_posicionales": {"material": "Igual", "seguridad_rey": "Enrocado", "espacio": "Ventaja"},
    "conclusiones_plan": {"plan_estrategico": "Avanzar d4", "error_conceptual_grave": "Peones doblados", "idea_a_repasar": "Finales de torres"},
}

USER_PGN = """[Event "Liga"]
[White "Pedro Rendo"]
[Black "Rival Liga"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
"""


def _mock_gemini(model, text=json.dumps(VALID_FEEDBACK)):
    mock_response = MagicMock()
    mock_response.text = text
    mock_response.candidates = None
    model.return_value.generate_content.return_value = mock_response


def _create_gm_game(db_session):
    game = GMGame(
        gm_name="Capablanca",
        white="Jose Raul Capablanca",
        black="Frank James Marshall",
        event="Test",
        year=1921,
        result="1-0",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0",
    )
    db_session.add(game)
    db_session.commit()
    return game


class TestSubmitGameAnalysis:
    def test_submit_partida_gm(self, client, db_session, auth_headers):
        gm_game = _create_gm_game(db_session)

        payload = {
            "gm_game_id": gm_game.id,
            "game_type": "GM",
            **FORM_BLOCKS,
        }

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            resp = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)

        # Respuesta inmediata y no bloqueante (HTTP 202).
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "processing"
        analysis_id = data["analysis_id"]

        # La tarea de fondo ya corrió (TestClient ejecuta BackgroundTasks tras la respuesta).
        status_resp = client.get(
            f"/api/v1/game-analysis/{analysis_id}/status", headers=auth_headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["status"] == "completed"
        assert status_data["has_feedback"] is True

        full = client.get(f"/api/v1/game-analysis/{analysis_id}", headers=auth_headers).json()
        assert full["game_type"] == "GM"
        assert full["white_player"] == "Jose Raul Capablanca"
        assert full["black_player"] == "Frank James Marshall"
        assert full["pgn"] == gm_game.pgn
        assert full["gemini_feedback"] is not None

    def test_submit_partida_gm_handles_gemini_failure(self, client, db_session, auth_headers):
        gm_game = _create_gm_game(db_session)
        payload = {"gm_game_id": gm_game.id, "game_type": "GM", **FORM_BLOCKS}

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            # Simula un timeout/error de Gemini durante la auditoría en segundo plano.
            mock_model.return_value.generate_content.side_effect = RuntimeError(
                "Gemini superó el tiempo de espera"
            )
            resp = client.post(
                "/api/v1/game-analysis/submit", json=payload, headers=auth_headers
            )

        # 1. Respuesta inmediata y no bloqueante (HTTP 202).
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "processing"
        analysis_id = data["analysis_id"]

        # 2. La tarea de fondo captura la excepción sin romper la app.
        status_resp = client.get(
            f"/api/v1/game-analysis/{analysis_id}/status", headers=auth_headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        # 3. El estado pasa a "failed" con mensaje de error para el frontend.
        assert status_data["status"] == "failed"
        assert status_data["error_message"]
        assert "Gran Maestro" in status_data["error_message"]

    def test_submit_agota_reintentos_y_expone_intentos(self, client, db_session, auth_headers):
        """Tras agotar los reintentos queda 'failed' con attempts==2 y campos expuestos."""
        gm_game = _create_gm_game(db_session)
        payload = {"gm_game_id": gm_game.id, "game_type": "GM", **FORM_BLOCKS}

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            mock_model.return_value.generate_content.side_effect = RuntimeError(
                "Gemini no responde (timeout de red)"
            )
            resp = client.post(
                "/api/v1/game-analysis/submit", json=payload, headers=auth_headers
            )
        analysis_id = resp.json()["analysis_id"]

        full = client.get(f"/api/v1/game-analysis/{analysis_id}", headers=auth_headers).json()
        assert full["status"] == "failed"
        assert full["audit_attempts"] == 2
        assert "2 intentos" in full["error_message"]

        history = client.get("/api/v1/game-analysis/history", headers=auth_headers).json()
        item = next(a for a in history if a["id"] == analysis_id)
        assert item["status"] == "failed"
        assert item["audit_attempts"] == 2

    def test_submit_reintenta_tras_fallo_puntual(self, client, db_session, auth_headers):
        """Primer intento caído, segundo correcto: se completa solo y resetea intentos."""
        gm_game = _create_gm_game(db_session)
        payload = {"gm_game_id": gm_game.id, "game_type": "GM", **FORM_BLOCKS}

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            mock_response = MagicMock()
            mock_response.text = json.dumps(VALID_FEEDBACK)
            mock_response.candidates = None
            mock_model.return_value.generate_content.side_effect = [
                RuntimeError("Gemini no responde (timeout de red)"),
                mock_response,
            ]
            resp = client.post(
                "/api/v1/game-analysis/submit", json=payload, headers=auth_headers
            )
        analysis_id = resp.json()["analysis_id"]

        status = client.get(
            f"/api/v1/game-analysis/{analysis_id}/status", headers=auth_headers
        ).json()
        assert status["status"] == "completed"
        assert status["has_feedback"] is True

        full = client.get(f"/api/v1/game-analysis/{analysis_id}", headers=auth_headers).json()
        assert full["audit_attempts"] == 0
        assert full["error_message"] is None

    def test_submit_partida_propia(self, client, auth_headers):
        payload = {
            "game_type": "USER",
            "white_player": "Pedro Rendo",
            "black_player": "Rival Liga",
            "pgn": USER_PGN,
            **FORM_BLOCKS,
        }

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            resp = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)

        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "processing"

        status_resp = client.get(
            f"/api/v1/game-analysis/{data['analysis_id']}/status", headers=auth_headers
        )
        assert status_resp.json()["status"] == "completed"

        full = client.get(f"/api/v1/game-analysis/{data['analysis_id']}", headers=auth_headers).json()
        assert full["game_type"] == "USER"
        assert full["game_id"] is None
        assert full["white_player"] == "Pedro Rendo"
        assert full["black_player"] == "Rival Liga"
        assert full["gemini_feedback"] is not None

    def test_submit_partida_propia_sin_pgn_falla(self, client, auth_headers):
        payload = {
            "game_type": "USER",
            "white_player": "Pedro",
            "black_player": "Rival",
            **FORM_BLOCKS,
        }
        resp = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)
        assert resp.status_code == 400

    def test_submit_gm_inexistente_falla(self, client, auth_headers):
        payload = {
            "gm_game_id": "no-existe",
            "game_type": "GM",
            **FORM_BLOCKS,
        }
        resp = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)
        assert resp.status_code == 400

    def test_game_type_invalido_falla(self, client, auth_headers):
        payload = {
            "game_type": "OTRO",
            "pgn": USER_PGN,
            **FORM_BLOCKS,
        }
        resp = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)
        assert resp.status_code == 422


class TestSaveDraft:
    def test_save_draft_partida_propia_pendiente(self, client, auth_headers):
        payload = {
            "game_type": "USER",
            "white_player": "Pedro Rendo",
            "black_player": "Rival Liga",
            "pgn": USER_PGN,
        }
        resp = client.post("/api/v1/game-analysis/save-draft", json=payload, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["game_type"] == "USER"
        assert data["gemini_feedback"] is None

    def test_save_draft_sin_pgn_falla(self, client, auth_headers):
        payload = {"game_type": "USER", "white_player": "A", "black_player": "B"}
        resp = client.post("/api/v1/game-analysis/save-draft", json=payload, headers=auth_headers)
        assert resp.status_code == 400


class TestHistory:
    def test_history_orden_desc(self, client, db_session, auth_headers):
        gm_game = _create_gm_game(db_session)
        payload = {"gm_game_id": gm_game.id, "game_type": "GM", **FORM_BLOCKS}

        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers)
            client.post("/api/v1/game-analysis/save-draft", json={
                "game_type": "USER", "pgn": USER_PGN, "white_player": "P", "black_player": "N"
            }, headers=auth_headers)

        resp = client.get("/api/v1/game-analysis/history", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["game_type"] == "USER"  # más reciente (draft)

    def test_history_list_raiz(self, client, db_session, auth_headers):
        gm_game = _create_gm_game(db_session)
        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            client.post("/api/v1/game-analysis/submit", json={
                "gm_game_id": gm_game.id, **FORM_BLOCKS
            }, headers=auth_headers)

        resp = client.get("/api/v1/game-analysis/", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_by_id(self, client, auth_headers):
        payload = {"game_type": "USER", "pgn": USER_PGN, "white_player": "Pedro", "black_player": "N", **FORM_BLOCKS}
        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            created = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers).json()

        resp = client.get(f"/api/v1/game-analysis/{created['analysis_id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["white_player"] == "Pedro"

    def test_reevaluar_actualiza_sin_duplicar(self, client, auth_headers):
        payload = {"game_type": "USER", "pgn": USER_PGN, "white_player": "Pedro", "black_player": "N", **FORM_BLOCKS}
        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            created = client.post("/api/v1/game-analysis/submit", json=payload, headers=auth_headers).json()

        reeval_payload = {
            "game_type": "USER",
            "pgn": USER_PGN,
            "white_player": "Pedro",
            "black_player": "N",
            "analysis_id": created["analysis_id"],
            **FORM_BLOCKS,
        }
        with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
            _mock_gemini(mock_model)
            resp = client.post("/api/v1/game-analysis/submit", json=reeval_payload, headers=auth_headers)

        assert resp.status_code == 202
        assert resp.json()["analysis_id"] == created["analysis_id"]

        historial = client.get("/api/v1/game-analysis/history", headers=auth_headers).json()
        assert len(historial) == 1
