import logging
import json
import re
from typing import List, Optional, Dict, Any
import google.generativeai as genai
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.gm_game import GMGame
from app.core.config import settings

logger = logging.getLogger("GMGameService")

class GMGameService:
    _model = None

    def __init__(self):
        # Lazy initialization of the model
        pass
    
    @property
    def model(self) -> Any:
        if self._model is None:            
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._model = genai.GenerativeModel("gemini-2.5-flash")
        return self._model
    def get_games_by_gm_or_theme(
        self,
        db: Session,
        gm_name: str,
        theme: Optional[str] = None,
        limit: int = 5
    ) -> List[GMGame]:

        # 1. Buscar en BD local (coincidencia en gm_name, white o black)
        search_pattern = f"%{gm_name}%"
        query = db.query(GMGame).filter(
            or_(
                GMGame.gm_name.ilike(search_pattern),
                GMGame.white.ilike(search_pattern),
                GMGame.black.ilike(search_pattern)
            )
        )
        if theme:
            query = query.filter(GMGame.theme_tags.ilike(f"%{theme}%"))

        local_games = query.limit(limit).all()
        if len(local_games) >= limit:
            return local_games

        # 2. Si faltan partidas, solicitar a Gemini
        needed = limit - len(local_games)
        logger.info(f"Solicitando a Gemini {needed} partidas famosas de '{gm_name}'...")

        ai_games = self._fetch_famous_games_from_gemini(db, gm_name, theme, needed)
        return local_games + ai_games

    def _fetch_famous_games_from_gemini(
        self,
        db: Session,
        gm_name: str,
        theme: Optional[str],
        limit: int
    ) -> List[GMGame]:

        theme_context = f" enfocado en el tema táctico/posicional '{theme}'" if theme else ""

        prompt = f"""
        Actúa como un Gran Maestro de ajedrez e historiador.
        Genera una lista de las {limit} partidas más famosas, emblemáticas e instruidas del Gran Maestro {gm_name}{theme_context}.

        Debes devolver UNICAMENTE un JSON que cumpla estrictamente con la estructura de una lista de objetos.
        Cada objeto debe tener los campos: "gm_name", "white", "black", "event", "year", "result", "pgn", "theme_tags".
        El campo "year" debe ser un número entero.
        El campo "theme_tags" debe ser un texto o lista de etiquetas separadas por comas.
        El campo "pgn" debe ser la notación PGN de la partida.
        No incluyas comentarios en el JSON ni bloques de formato markdown.
        """

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.1,
                }
            )

            raw_text = response.text.strip()

            # Limpieza de bloque Markdown si Gemini añade ```json ... ```
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```[a-zA-Z]*\n?", "", raw_text)
                raw_text = re.sub(r"\n?```$", "", raw_text)

            # Parsear el JSON ya limpio
            games_data = json.loads(raw_text)

            saved_games = []
            for item in games_data:
                # Normalizar el año por si viene como string
                raw_year = item.get("year", 0)
                year_val = int(raw_year) if str(raw_year).isdigit() else 0

                # Normalizar theme_tags (Gemini a menudo devuelve lista de strings)
                raw_tags = item.get("theme_tags", theme or "classic")
                if isinstance(raw_tags, list):
                    tags_str = ", ".join(str(t) for t in raw_tags)
                else:
                    tags_str = str(raw_tags) if raw_tags else "classic"

                # Evitar duplicados en SQLite
                exists = db.query(GMGame).filter(
                    GMGame.white == item.get("white"),
                    GMGame.black == item.get("black"),
                    GMGame.year == year_val
                ).first()

                if exists:
                    saved_games.append(exists)
                    continue

                new_game = GMGame(
                    gm_name=item.get("gm_name", gm_name.capitalize()),
                    white=item.get("white", "Desconocido"),
                    black=item.get("black", "Desconocido"),
                    event=item.get("event", "Partida Famosa"),
                    year=year_val,
                    result=item.get("result", "*"),
                    pgn=item.get("pgn", ""),
                    theme_tags=tags_str
                )
                db.add(new_game)
                saved_games.append(new_game)

            db.commit()
            return saved_games

        except json.JSONDecodeError as jde:
            logger.error(f"Error de parseo JSON desde Gemini: {jde}. Respuesta original: {raw_text}")
            db.rollback()
            return []
        except Exception as e:
            logger.error(f"Error procesando Gemini para {gm_name}: {e}", exc_info=True)
            db.rollback()
            return []


gm_game_service = GMGameService()