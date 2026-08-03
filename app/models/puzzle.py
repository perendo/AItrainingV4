# D:\AItrainingV4\app\models\puzzle.py
from sqlalchemy import Column, Integer, String, Text
from app.models.base import TimeStampedModel

class Puzzle(TimeStampedModel):
    __tablename__ = "puzzles"

    id = Column(String(50), primary_key=True, index=True)  # Mapea 'PuzzleId' (ej: "000a9")
    fen = Column(String(200), nullable=False)               # Mapea 'FEN'
    moves = Column(Text, nullable=False)                    # Mapea 'Moves'
    rating = Column(Integer, index=True, nullable=False)    # Mapea 'Rating'
    rating_deviation = Column(Integer, nullable=True)       # Mapea 'RatingDeviation'
    popularity = Column(Integer, nullable=True)             # Mapea 'Popularity'
    nb_plays = Column(Integer, nullable=True)               # Mapea 'NbPlays'
    themes = Column(String(500), index=True)                # Mapea 'Themes'
    game_url = Column(String(200), nullable=True)           # Mapea 'GameUrl'
    opening_tags = Column(String(300), nullable=True, index=True) # Mapea 'OpeningTags'