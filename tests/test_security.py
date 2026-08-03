import pytest
from datetime import timedelta
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
import jwt


class TestPasswordHashing:
    def test_hash_y_verify_correcto(self):
        pwd = "mi_contraseña_segura"
        hashed = hash_password(pwd)
        assert verify_password(pwd, hashed) is True

    def test_hash_diferente_cada_vez(self):
        hashed1 = hash_password("misma_clave")
        hashed2 = hash_password("misma_clave")
        assert hashed1 != hashed2

    def test_verify_falla_con_contraseña_incorrecta(self):
        hashed = hash_password("correcta")
        assert verify_password("incorrecta", hashed) is False

    def test_hash_no_es_texto_plano(self):
        hashed = hash_password("secreta")
        assert hashed != "secreta"
        assert len(hashed) > 20


class TestJWT:
    def test_create_y_decodificar_token(self):
        data = {"sub": "42"}
        token = create_access_token(data)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "42"
        assert "exp" in payload

    def test_token_con_expiry_personalizado(self):
        data = {"sub": "1"}
        token = create_access_token(data, expires_delta=timedelta(minutes=5))
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "1"

    def test_token_falla_con_secret_key_incorrecta(self):
        data = {"sub": "1"}
        token = create_access_token(data)
        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(token, "clave_incorrecta", algorithms=[ALGORITHM])

    def test_token_contiene_claims_requeridos(self):
        data = {"sub": "5"}
        token = create_access_token(data)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        assert payload["sub"] == "5"
        assert "exp" in payload
