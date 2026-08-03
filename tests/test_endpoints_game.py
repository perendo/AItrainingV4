import io
import os
import time
import pytest


def wait_for_task(client, task_id, auth_headers, timeout=30):
    """Espera a que una tarea termine, consultando el endpoint de estado."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/api/v1/games/tasks/{task_id}", headers=auth_headers)
        data = resp.json()
        if data["status"] in ("completed", "failed"):
            return data
        time.sleep(0.1)
    pytest.fail(f"Task {task_id} no terminó en {timeout}s")


class TestGameEndpoints:
    def test_upload_pgn_partida_unica(self, client, registered_user, auth_headers, sample_pgn_single):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", sample_pgn_single.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "id" in data
        assert data["filename"] == "test.pgn"
        assert data["status"] == "pending"

        # Verificar que la tarea completó
        task = wait_for_task(client, data["id"], auth_headers)
        assert task["status"] == "completed"
        assert task["processed"] >= 1
        assert task["errors_found"] >= 0

    def test_upload_pgn_multiples_partidas(self, client, registered_user, auth_headers, sample_pgn_multi):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("multi.pgn", sample_pgn_multi.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        task = wait_for_task(client, resp.json()["id"], auth_headers)
        assert task["status"] == "completed"
        assert task["processed"] >= 1

    def test_upload_pgn_sin_partidas_usuario(self, client, registered_user, auth_headers, sample_pgn_not_user):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("no_user.pgn", sample_pgn_not_user.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        task = wait_for_task(client, resp.json()["id"], auth_headers)
        assert task["status"] == "completed"
        assert task["skipped_not_user"] >= 1

    def test_upload_pgn_formato_invalido_falla(self, client, registered_user, auth_headers):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.png", b"not a pgn", "image/png")},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_upload_pgn_sin_auth_falla(self, client):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", b"1. e4 e5 1-0", "text/plain")},
        )
        assert resp.status_code == 401

    def test_list_games_vacio(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/games/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_games_con_datos(self, client, registered_user, auth_headers, sample_pgn_single):
        upload_resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", sample_pgn_single.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        wait_for_task(client, upload_resp.json()["id"], auth_headers)

        resp = client.get("/api/v1/games/", headers=auth_headers)
        assert resp.status_code == 200
        games = resp.json()
        assert len(games) >= 1
        assert "errors" in games[0]

    def test_upload_pgn_real_pedro(self, client, registered_user, auth_headers, pedro_pgn_path):
        if not os.path.exists(pedro_pgn_path):
            pytest.skip("Fichero PedroBasedatos.pgn no encontrado")

        with open(pedro_pgn_path, "rb") as f:
            resp = client.post(
                "/api/v1/games/upload-pgn",
                files={"file": ("pedro.pgn", f, "text/plain")},
                headers=auth_headers,
            )
        assert resp.status_code == 202
        task = wait_for_task(client, resp.json()["id"], auth_headers, timeout=120)
        assert task["status"] == "completed"
        assert task["processed"] >= 1
        assert task["errors_found"] >= 0

    def test_task_status_endpoint(self, client, registered_user, auth_headers, sample_pgn_single):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", sample_pgn_single.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        task_id = resp.json()["id"]
        task = wait_for_task(client, task_id, auth_headers)
        assert task["status"] == "completed"
        assert task["processed"] >= 1

    def test_task_status_no_existe_falla(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/games/tasks/9999", headers=auth_headers)
        assert resp.status_code == 404

    def test_task_status_otro_usuario_falla(self, client, registered_user, auth_headers, sample_pgn_single):
        resp = client.post(
            "/api/v1/games/upload-pgn",
            files={"file": ("test.pgn", sample_pgn_single.encode("utf-8"), "text/plain")},
            headers=auth_headers,
        )
        task_id = resp.json()["id"]

        # Registrar otro usuario
        client.post("/api/v1/users/register", json={
            "username": "otro_user",
            "full_name": "Otro Usuario",
            "password": "pass123456",
        })
        from app.core.security import create_access_token
        other_token = create_access_token(data={"sub": "2"})
        other_headers = {"Authorization": f"Bearer {other_token}"}

        resp = client.get(f"/api/v1/games/tasks/{task_id}", headers=other_headers)
        assert resp.status_code == 404
