import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from app.models.gm_game import GMGame
from app.services.gemini_client import GeminiClient

def test_search_gm_games_local_cache(client, db_session):
    # Crear una partida en la BD local
    game = GMGame(
        gm_name="Capablanca",
        white="Jose Raul Capablanca",
        black="Frank James Marshall",
        event="New York Masters",
        year=1918,
        result="1-0",
        pgn="1. e4 e5 2. Nf3",
        theme_tags="Tactical Attack, Sacrifice"
    )
    db_session.add(game)
    db_session.commit()

    response = client.get("/api/v1/gm-games/search?gm_name=Capablanca&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["white"] == "Jose Raul Capablanca"
    assert data[0]["black"] == "Frank James Marshall"
    assert data[0]["theme_tags"] == "Tactical Attack, Sacrifice"

@patch.object(GeminiClient, "model", new_callable=PropertyMock)
def test_search_gm_games_gemini_fallback(mock_model, client):
    # Mock de Gemini devolviendo un objeto JSON con theme_tags como lista
    mock_response = MagicMock()
    mock_response.text = '''[
      {
        "gm_name": "Capablanca",
        "white": "Capablanca",
        "black": "Lasker",
        "event": "World Championship",
        "year": 1921,
        "result": "1-0",
        "pgn": "1. d4 d5 2. c4 e6",
        "theme_tags": ["Endgame Technique", "Positional Play"]
      }
    ]'''
    mock_model.return_value.generate_content.return_value = mock_response

    response = client.get("/api/v1/gm-games/search?gm_name=Fischer&limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["white"] == "Capablanca"
    assert data[0]["theme_tags"] == "Endgame Technique, Positional Play"
