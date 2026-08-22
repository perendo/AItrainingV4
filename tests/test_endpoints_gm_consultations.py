import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from app.services.gemini_client import GeminiClient


@patch.object(GeminiClient, "model", new_callable=PropertyMock)
def test_create_consultation_returns_202_and_processes(mock_model, client, auth_headers):
    mock_response = MagicMock()
    mock_response.text = "Excelente pregunta. La respuesta corta es **centralizar**."
    mock_model.return_value.generate_content.return_value = mock_response

    # 1. Envío asíncrono -> HTTP 202 con consultation_id y estado "processing"
    resp = client.post(
        "/api/v1/gm-consultations/",
        json={"question": "¿Cómo debo jugar la apertura como blancas?"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "processing"
    consultation_id = data["consultation_id"]
    assert consultation_id is not None

    # 2. La tarea de fondo ya corrió (TestClient ejecuta BackgroundTasks tras la respuesta)
    status_resp = client.get(
        f"/api/v1/gm-consultations/{consultation_id}/status",
        headers=auth_headers,
    )
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["status"] == "completed"
    assert "centralizar" in (status_data["answer"] or "")

    # 3. Probar GET /{consultation_id} (detalle completo)
    detail_resp = client.get(
        f"/api/v1/gm-consultations/{consultation_id}",
        headers=auth_headers,
    )
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["consultation_id"] == consultation_id
    assert detail_data["question"] == "¿Cómo debo jugar la apertura como blancas?"
    assert "centralizar" in (detail_data["answer"] or "")

    # 4. Probar GET / (historial)
    list_resp = client.get(
        "/api/v1/gm-consultations/",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert isinstance(list_data, list)
    assert len(list_data) >= 1
    assert any(c["consultation_id"] == consultation_id for c in list_data)


def test_create_consultation_rejects_short_question(client, auth_headers):
    resp = client.post(
        "/api/v1/gm-consultations/",
        json={"question": "ab"},
        headers=auth_headers,
    )
    # Pydantic devuelve 422 por la longitud mínima.
    assert resp.status_code == 422


def test_status_not_found_returns_404(client, auth_headers):
    resp = client.get(
        "/api/v1/gm-consultations/999999/status",
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_create_requires_auth(client):
    resp = client.post(
        "/api/v1/gm-consultations/",
        json={"question": "¿Cuál es la mejor defensa?"},
    )
    assert resp.status_code == 401


def test_startup_cleanup_recovers_stuck_tasks(db_session, registered_user):
    from app.main import cleanup_stuck_background_tasks
    from app.models.gm_consultation import GMConsultation
    from app.models.user_game_analysis import UserGameAnalysis

    # Tareas que quedaron "processing" por un reinicio del servidor.
    db_session.add(
        GMConsultation(user_id=registered_user["id"], question="duda", status="processing")
    )
    db_session.add(
        UserGameAnalysis(
            user_id=registered_user["id"], status="processing", created_at="2026-01-01T00:00:00"
        )
    )
    db_session.commit()

    cleanup_stuck_background_tasks()

    consultations = (
        db_session.query(GMConsultation)
        .filter(GMConsultation.user_id == registered_user["id"])
        .all()
    )
    analyses = (
        db_session.query(UserGameAnalysis)
        .filter(UserGameAnalysis.user_id == registered_user["id"])
        .all()
    )
    assert all(c.status == "failed" for c in consultations)
    assert all(a.status == "failed" for a in analyses)
    assert consultations[0].error_message


@patch.object(GeminiClient, "model", new_callable=PropertyMock)
def test_create_consultation_handles_gemini_failure(mock_model, client, auth_headers):
    # Simula un fallo de red/timeout en la llamada a Gemini.
    mock_model.return_value.generate_content.side_effect = RuntimeError(
        "Gemini no responde (timeout de red)"
    )

    # 1. El envío asíncrono sigue respondiendo HTTP 202.
    resp = client.post(
        "/api/v1/gm-consultations/",
        json={"question": "¿Cómo debo plantear la defensa frente a la siciliana?"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "processing"
    consultation_id = data["consultation_id"]
    assert consultation_id is not None

    # 2. La tarea de fondo captura la excepción sin romper la app.
    status_resp = client.get(
        f"/api/v1/gm-consultations/{consultation_id}/status",
        headers=auth_headers,
    )
    assert status_resp.status_code == 200
    status_data = status_resp.json()

    # 3. El estado pasa a "failed" y el mensaje de error es legible por el frontend.
    assert status_data["status"] == "failed"
    assert status_data["error_message"]
    assert "Gemini" in status_data["error_message"]
