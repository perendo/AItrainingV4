import pytest
import json
from unittest.mock import patch, MagicMock
from app.services.llm_coach import llm_coach_service


class TestCoachEndpoints:
    def _upload_a_game(self, client, auth_headers):
        pgn = """[Event "Test"]
[White "Rendo Quindos, Pedro"]
[Black "Rival"]
[Result "1-0"]
[Date "2026.01.01"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
"""
        client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", pgn.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )

    def test_diagnostic_genera_informe(self, client, registered_user, auth_headers):
        self._upload_a_game(client, auth_headers)

        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "estimated_level": "Intermedio (~1500 ELO)",
            "strengths": ["Buena preparación de apertura", "Cálculo táctico sólido"],
            "weaknesses": ["Finales de torres", "Juego posicional"],
            "report_markdown": "## Diagnóstico\nTu nivel es intermedio."
        })
        mock_response.candidates = None

        with patch.object(llm_coach_service.client.models, "generate_content", return_value=mock_response):
            resp = client.post("/api/v1/coach/diagnostic", headers=auth_headers)

        assert resp.status_code == 201
        data = resp.json()
        assert "report_markdown" in data
        assert "estimated_level" in data

    def test_diagnostic_sin_partidas_falla(self, client, registered_user, auth_headers):
        resp = client.post("/api/v1/coach/diagnostic", headers=auth_headers)
        assert resp.status_code == 400

    def test_diagnostic_historial(self, client, registered_user, auth_headers):
        self._upload_a_game(client, auth_headers)

        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "estimated_level": "Intermedio (~1500 ELO)",
            "strengths": ["Buena preparación de apertura", "Cálculo táctico sólido"],
            "weaknesses": ["Finales de torres", "Juego posicional"],
            "report_markdown": "## Informe #1"
        })
        mock_response.candidates = None

        with patch.object(llm_coach_service.client.models, "generate_content", return_value=mock_response):
            client.post("/api/v1/coach/diagnostic", headers=auth_headers)

        resp = client.get("/api/v1/coach/history", headers=auth_headers)
        assert resp.status_code == 200
        informes = resp.json()
        assert len(informes) >= 1
