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
            "accepted_terms": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "nuevo_jugador"
        assert "id" in data
        assert "hashed_password" not in data
        # El registro debe dejar constancia del consentimiento legal (RGPD)
        assert data["legal_accepted_at"] is not None
        assert data["legal_accepted_version"]

    def test_register_sin_aceptar_terminos_falla(self, client):
        resp = client.post("/api/v1/users/register", json={
            "username": "sin_consentimiento",
            "full_name": "Jugador Sin Consentimiento",
            "password": "segura123",
            "accepted_terms": False,
        })
        assert resp.status_code == 422

    def test_register_duplicado_falla(self, client, registered_user):
        resp = client.post("/api/v1/users/register", json={
            "username": registered_user["username"],
            "full_name": "Otro Nombre",
            "password": "otra123456",
            "accepted_terms": True,
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


class TestLegalRGPD:
    """Derechos RGPD: consentimiento, portabilidad y supresión."""

    def test_legal_accept_registra_version(self, client, registered_user, auth_headers):
        resp = client.post(
            "/api/v1/users/me/legal-accept",
            json={"accepted_terms": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["legal_accepted_at"] is not None
        assert data["legal_accepted_version"]

    def test_legal_accept_rechaza_false(self, client, registered_user, auth_headers):
        resp = client.post(
            "/api/v1/users/me/legal-accept",
            json={"accepted_terms": False},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_export_sin_token_falla(self, client, registered_user):
        resp = client.get("/api/v1/users/me/export")
        assert resp.status_code == 401

    def test_export_devuelve_json_descargable(self, client, registered_user, auth_headers):
        resp = client.get("/api/v1/users/me/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]
        assert "attachment" in resp.headers["content-disposition"]
        data = resp.json()
        assert data["perfil"]["username"] == registered_user["username"]
        for clave in (
            "partidas",
            "informes_coach",
            "consultas_gm",
            "analisis_de_partidas",
            "entrenamiento",
            "progreso_finales",
        ):
            assert clave in data

    def test_delete_me_borra_cuenta_y_datos(self, client, db_session, registered_user, auth_headers):
        from app.models.game import Game
        from app.models.gm_consultation import GMConsultation

        uid = registered_user["id"]

        # Sembramos datos dependientes (partida y consulta al GM) para verificar
        # el borrado en cascada de todas las tablas del usuario
        partida = Game(
            user_id=uid,
            white_player="Jugador A",
            black_player="Jugador B",
            result="1-0",
            player_color="white",
            pgn_content="1. e4 e5 2. Nf3 1-0",
            total_moves=2,
            game_date="2026.01.01",
        )
        consulta = GMConsultation(user_id=uid, question="¿Cómo ataco el rey?", status="completed")
        db_session.add_all([partida, consulta])
        db_session.commit()

        resp = client.delete("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 204

        # No queda rastro del usuario en ninguna tabla dependiente
        db_session.expire_all()
        assert db_session.query(Game).filter(Game.user_id == uid).count() == 0
        assert db_session.query(GMConsultation).filter(GMConsultation.user_id == uid).count() == 0

        # La cuenta ya no existe ni permite login
        resp_login = client.post("/api/v1/users/login", data={
            "username": registered_user["username"],
            "password": "test123456",
        })
        assert resp_login.status_code == 401

    def test_delete_me_sin_token_falla(self, client):
        resp = client.delete("/api/v1/users/me")
        assert resp.status_code == 401


class TestRootEndpoint:
    def test_root(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "proyecto" in data
        assert data["estado"] == "Online"
