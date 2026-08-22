import pytest


class TestExerciseEndpoints:
    def test_get_training_plan_vacio(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/training/all-tasks", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_generate_weekly_plan(self, client, registered_user, auth_headers):
        resp = client.post("/api/v1/training/weekly/generate", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "tasks" in data
        assert len(data["tasks"]) >= 1
        assert data["is_active"] is True

    def test_all_tasks_tras_generar(self, client, registered_user, auth_headers):
        client.post("/api/v1/training/weekly/generate", headers=auth_headers)
        resp = client.get("/api/v1/training/all-tasks", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3

    def test_pending_tasks_vacio(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/training/pending-tasks", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_generate_weekly_plan_reemplaza_anterior(self, client, registered_user, auth_headers):
        client.post("/api/v1/training/weekly/generate", headers=auth_headers)
        resp = client.post("/api/v1/training/weekly/generate", headers=auth_headers)
        assert resp.status_code == 200

        resp_tasks = client.get("/api/v1/training/all-tasks", headers=auth_headers)
        assert resp_tasks.status_code == 200
        assert len(resp_tasks.json()) == 3

    def test_complete_training_task(self, client, registered_user, auth_headers):
        plan = client.post("/api/v1/training/weekly/generate", headers=auth_headers).json()
        task_id = plan["tasks"][0]["id"]
        resp = client.post(f"/api/v1/training/tasks/{task_id}/complete", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["current_count"] == 1

    def test_complete_training_task_no_existe(self, client, registered_user, auth_headers):
        resp = client.post("/api/v1/training/tasks/9999/complete", headers=auth_headers)
        assert resp.status_code == 404

    def test_next_puzzle_sin_datos(self, client, registered_user, auth_headers):
        plan = client.post("/api/v1/training/weekly/generate", headers=auth_headers).json()
        task_id = plan["tasks"][0]["id"]
        resp = client.get(f"/api/v1/training/tasks/{task_id}/next-puzzle", headers=auth_headers)
        assert resp.status_code == 404

    def test_next_puzzle_task_no_existe(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/training/tasks/9999/next-puzzle", headers=auth_headers)
        assert resp.status_code == 404
