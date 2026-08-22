import pytest


class TestUserEndpoints:
    def test_register_user(self, client):
        resp = client.post("/api/v1/users/register", json={
            "username": "nuevo_jugador",
            "full_name": "Nuevo Jugador",
            "chess_online_nick": "nuevo_nick",
            "current_elo": 1500,
            "target_elo": 2000,
            "password": "segura123",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "nuevo_jugador"
        assert "id" in data
        assert "hashed_password" not in data

    def test_register_user_duplicado_falla(self, client, registered_user):
        resp = client.post("/api/v1/users/register", json={
            "username": registered_user["username"],
            "full_name": "Otro Nombre",
            "password": "otra123456",
        })
        assert resp.status_code == 400

    def test_login_exitoso(self, client, registered_user):
        resp = client.post("/api/v1/users/login", data={
            "username": registered_user["username"],
            "password": "test123456",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_contraseña_incorrecta_falla(self, client, registered_user):
        resp = client.post("/api/v1/users/login", data={
            "username": registered_user["username"],
            "password": "contraseña_mala",
        })
        assert resp.status_code == 401

    def test_login_usuario_inexistente_falla(self, client):
        resp = client.post("/api/v1/users/login", data={
            "username": "no_existo",
            "password": "cualquiera",
        })
        assert resp.status_code == 401

    def test_get_me(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == registered_user["username"]

    def test_get_me_sin_token_falla(self, client):
        resp = client.get("/api/v1/users/me")
        assert resp.status_code == 401

    def test_update_me(self, client, registered_user, auth_headers):
        resp = client.put(
            "/api/v1/users/me",
            json={"full_name": "Nombre Actualizado", "current_elo": 1800},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Nombre Actualizado"
        assert resp.json()["current_elo"] == 1800

    def test_update_me_cambia_contraseña(self, client, registered_user, auth_headers):
        resp = client.put(
            "/api/v1/users/me",
            json={"password": "nueva_segura_456"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        # La contraseña nunca se devuelve en la respuesta
        assert "hashed_password" not in resp.json()
        assert "password" not in resp.json()

        # La contraseña antigua ya no funciona...
        resp_old = client.post("/api/v1/users/login", data={
            "username": registered_user["username"],
            "password": "test123456",
        })
        assert resp_old.status_code == 401

        # ...y la nueva sí
        resp_new = client.post("/api/v1/users/login", data={
            "username": registered_user["username"],
            "password": "nueva_segura_456",
        })
        assert resp_new.status_code == 200
        assert "access_token" in resp_new.json()


class TestRootEndpoint:
    def test_root(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "proyecto" in data
        assert data["estado"] == "Online"
