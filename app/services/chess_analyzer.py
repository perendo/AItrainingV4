import chess
import chess.pgn
import chess.engine
import io
import logging
import unicodedata
from typing import List, Tuple, Dict, Any
from sqlalchemy.orm import Session
from app.core.config import settings
from app.repositories.game_repo import game_repo
from app.models.user import User

logger = logging.getLogger("EntrenadorIA")

class ChessAnalyzerService:
    def __init__(self):
        self.stockfish_path = settings.STOCKFISH_PATH
        # Tiempo límite de cálculo para Stockfish por jugada (en segundos)
        self.analysis_time = 0.1 

    def _init_engine(self) -> chess.engine.SimpleEngine:
        """Inicializa el binario de Stockfish."""
        try:
            return chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
        except Exception as e:
            raise RuntimeError(f"No se pudo iniciar Stockfish en la ruta {self.stockfish_path}. Error: {str(e)}")

    def _clean_string(self, text: str) -> str:
            """Limpia, convierte a minúsculas y elimina tildes/caracteres extraños para comparaciones inmunes."""
            if not text:
                return ""
            
            # 1. Pasamos a minúsculas y limpiamos espacios repetidos
            text = " ".join(text.lower().split()).strip()
            
            # 2. Eliminamos tildes manualmente para asegurar compatibilidad de codificación
            text = (text.replace("ó", "o")
                        .replace("á", "a")
                        .replace("é", "e")
                        .replace("í", "i")
                        .replace("ú", "u")
                        .replace("ñ", "n"))
            
            # Normalización estándar de Unicode para quitar cualquier acento remanente
            text = "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
            
            return text
    def process_pgn_stream(self, db: Session, pgn_text: str, user_data: Any) -> Dict[str, int]:
            """
            Pipeline principal: Lee un string PGN (puede contener N partidas),
            valida al usuario de forma flexible mediante intersección de palabras clave,
            filtra duplicados usando fecha y jugadas, analiza en tiempo real y persiste en la BD.
            """
            engine = self._init_engine()
            pgn_file = io.StringIO(pgn_text)
            
            stats = {"processed": 0, "skipped_not_user": 0, "skipped_duplicate": 0, "errors_found": 0}
            
            # Indexamos las palabras clave limpias del usuario (Nombre real)
            user_raw = user_data.full_name.replace(",", " ")
            user_words = set(self._clean_string(user_raw).split())
            
            # Si tiene nick online, añadimos también sus palabras clave
            if user_data.chess_online_nick:
                nick_raw = user_data.chess_online_nick.replace(",", " ")
                user_words.update(self._clean_string(nick_raw).split())

            while True:
                game = chess.pgn.read_game(pgn_file)
                if game is None:
                    break  # Fin del archivo PGN
                
                headers = game.headers
                white = headers.get("White", "Unknown")
                black = headers.get("Black", "Unknown")
                result = headers.get("Result", "*")
                game_date = headers.get("Date", "????.??.??")
                
                # Limpiamos y troceamos los nombres de la partida actual en conjuntos de palabras
                white_words = set(self._clean_string(white.replace(",", " ")).split())
                black_words = set(self._clean_string(black.replace(",", " ")).split())
                
                # Buscamos coincidencia por intersección de palabras significativas
                intersection_white = user_words.intersection(white_words)
                intersection_black = user_words.intersection(black_words)
                
                # Consideramos coincidencia si comparten al menos 2 palabras (ej. "rendo" y "quindos")
                is_white = len(intersection_white) >= 2
                is_black = len(intersection_black) >= 2
                
                # Salvavidas para nicks o nombres cortos: si coincide una sola palabra de más de 3 letras
                if not is_white and not is_black:
                    is_white = any(word in white_words for word in user_words if len(word) > 3)
                    is_black = any(word in black_words for word in user_words if len(word) > 3)
                
                if not is_white and not is_black:
                    stats["skipped_not_user"] += 1
                    logger.info(f"Partida omitida (No pertenece al usuario): {white} vs {black}")
                    continue
                    
                player_color = "white" if is_white else "black"
                
                # Contar los movimientos de la línea principal de forma rápida
                total_moves = sum(1 for _ in game.mainline_moves())
                
                # Verificar duplicados usando el criterio de seguridad ampliado
                if game_repo.is_game_already_exists(
                    db, user_id=user_data.id, white=white, black=black, 
                    result=result, total_moves=total_moves, game_date=game_date
                ):
                    stats["skipped_duplicate"] += 1
                    logger.info(f"Partida duplicada omitida: {white} vs {black} ({game_date} - {total_moves} jugadas)")
                    continue

                # La partida es válida y nueva -> Procedemos al análisis jugada a jugada
                logger.info(f"Analizando partida nueva con Stockfish: {white} vs {black} [{result}]")
                move_errors = self._analyze_moves(game, engine, player_color)
                
                # Preparar datos para el repositorio
                game_dict = {
                    "user_id": user_data.id,
                    "white_player": white,
                    "black_player": black,
                    "result": result,
                    "player_color": player_color,
                    "total_moves": total_moves,
                    "game_date": game_date,
                    "pgn_content": str(game)
                }
                
                # Guardar partida y errores de golpe bajo la misma transacción SQL
                game_repo.create_game_with_errors(db, game_data=game_dict, errors_data=move_errors)
                
                stats["processed"] += 1
                stats["errors_found"] += len(move_errors)

            engine.quit()
            return stats
        
    def _analyze_moves(self, game: chess.pgn.Game, engine: chess.engine.SimpleEngine, player_color: str) -> List[Dict[str, Any]]:
        """Recorre la partida principal y analiza las decisiones del bando del usuario."""
        move_errors = []
        board = game.board()
        is_user_turn = (player_color == "white")
        prev_eval = 0 

        for node in game.mainline():
            move = node.move
            move_number = board.fullmove_number
            current_turn = board.turn 
            
            # Análisis previo al movimiento
            info = engine.analyse(board, chess.engine.Limit(time=self.analysis_time))
            score = info["score"].white()
            current_eval = score.score(mate_score=10000) if not score.is_mate() else (10000 if score.mate() > 0 else -10000)
            
            # Si corresponde al bando del usuario, calculamos el desvío táctico
            if (is_user_turn and current_turn == chess.WHITE) or (not is_user_turn and current_turn == chess.BLACK):
                
                if player_color == "white":
                    eval_loss = prev_eval - current_eval
                else:
                    eval_loss = current_eval - prev_eval
                
                error_type = None
                if eval_loss >= 100:
                    error_type = "Blunder"
                elif eval_loss >= 50:
                    error_type = "Mistake"
                elif eval_loss >= 30:
                    error_type = "Inaccuracy"
                
                if error_type:
                    algebraic_move = board.san(move)
                    
                    # Heurísticas básicas iniciales para los temas tácticos
                    theme = "Positional / Strategic"
                    if board.is_capture(move):
                        theme = "Tactical: Capture Blunder"
                    elif board.is_check():
                        theme = "Tactical: King Safety"
                        
                    move_errors.append({
                        "move_number": move_number,
                        "algebraic_move": algebraic_move,
                        "error_type": error_type,
                        "eval_difference": int(eval_loss),
                        "tactical_theme": theme,
                        "description": f"Pérdida de {eval_loss} CP en la jugada {move_number} ({algebraic_move}). Tipo: {error_type}."
                    })

            board.push(move)
            prev_eval = current_eval

        return move_errors

    def process_pgn_background(self, task_id: int, pgn_text: str, user_id: int):
        """
        Wrapper que ejecuta process_pgn_stream en background.
        Crea su propia sesión de BD y actualiza el registro ProcessingTask.
        """
        import app.core.database as database_module
        from app.models.task import ProcessingTask

        db = database_module.SessionLocal()
        try:
            task = db.query(ProcessingTask).filter(ProcessingTask.id == task_id).first()
            if not task:
                logger.error(f"Task {task_id} no encontrada en la BD.")
                return

            task.status = "processing"
            db.commit()

            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                task.status = "failed"
                task.error_message = "Usuario no encontrado."
                db.commit()
                return

            stats = self.process_pgn_stream(db, pgn_text=pgn_text, user_data=user)

            task.processed = stats["processed"]
            task.skipped_duplicate = stats["skipped_duplicate"]
            task.skipped_not_user = stats["skipped_not_user"]
            task.errors_found = stats["errors_found"]
            task.status = "completed"
            db.commit()

        except Exception as e:
            logger.error(f"Error en background task {task_id}: {str(e)}")
            try:
                task = db.query(ProcessingTask).filter(ProcessingTask.id == task_id).first()
                if task:
                    task.status = "failed"
                    task.error_message = str(e)[:500]
                    db.commit()
            except Exception:
                pass

        finally:
            db.close()

chess_analyzer_service = ChessAnalyzerService()