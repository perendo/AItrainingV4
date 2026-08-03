import pytest


class TestExerciseEndpoints:
    def test_get_training_plan_vacio(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/exercise/", headers=auth_headers)
        assert resp.status_code == 200

    def test_generate_weekly_plan(self, client, registered_user, auth_headers):
        resp = client.post("/api/v1/exercise/weekly/generate", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "tasks" in data
        assert len(data["tasks"]) >= 1
        assert data["is_active"] is True

    def test_get_active_weekly_plan(self, client, registered_user, auth_headers):
        client.post("/api/v1/exercise/weekly/generate", headers=auth_headers)
        resp = client.get("/api/v1/exercise/weekly/active", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data is not None
        assert data["is_active"] is True

    def test_get_active_weekly_plan_none(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/exercise/weekly/active", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() is None

    def test_generate_weekly_plan_reemplaza_anterior(self, client, registered_user, auth_headers):
        client.post("/api/v1/exercise/weekly/generate", headers=auth_headers)
        resp = client.post("/api/v1/exercise/weekly/generate", headers=auth_headers)
        assert resp.status_code == 200

        resp_active = client.get("/api/v1/exercise/weekly/active", headers=auth_headers)
        assert resp_active.status_code == 200
