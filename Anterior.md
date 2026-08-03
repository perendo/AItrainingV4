# Project Overview

This project is a sophisticated AI-powered chess coach backend. It analyzes users' chess games to identify tactical and strategic weaknesses and provides personalized training plans to help them improve.

The application is built with Python using the FastAPI framework, follows a clean architecture pattern, and leverages powerful tools like the Stockfish chess engine and Google's Gemini large language model.

## Key Technologies

*   **Backend:** FastAPI
*   **Web Server:** Uvicorn
*   **Database:** SQLAlchemy (defaults to SQLite)
*   **Chess Analysis:** Stockfish & `python-chess`
*   **AI Coaching:** Google Gemini
*   **Data Validation:** Pydantic
*   **Configuration:** `python-dotenv`

---

# Architecture

The project follows a clean, modular architecture, separating concerns into distinct layers:

*   `app/api`: Contains the FastAPI endpoints that expose the application's functionality.
*   `app/core`: Holds the core application setup, including configuration, database connection, and global middleware.
*   `app/models`: Defines the SQLAlchemy database models.
*   `app/schemas`: Contains the Pydantic schemas used for data validation and serialization in the API.
*   `app/repositories`: Implements the data access layer, abstracting all database interactions.
*   `app/services`: Contains the core business logic.
    *   `ChessAnalyzerService`: Manages the interaction with the Stockfish engine to analyze games and identify errors.
    *   `LLMCoachService`: Communicates with the Gemini API to generate natural language feedback and training plans based on the analysis.

## Database Schema

The database consists of the following tables:

*   `users`: Stores user profile information.
*   `games`: Stores information about each game, including players, result, and the full PGN content.
*   `move_errors`: Contains a detailed record of each mistake, blunder, or inaccuracy found during analysis, including the move, the evaluation difference, and a tactical theme.
*   `training_plans`: Stores the high-level training plans generated for a user.
*   `training_tasks`: Stores the specific, actionable tasks that make up a training plan.

---

# Building and Running the Project

## Prerequisites

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
2.  **Configure Environment:**
    *   Create a `.env` file in the project root.
    *   Add the following variables:
        ```env
        # The connection string for your database.
        DATABASE_URL="sqlite:///./entrenador_ia.db"

        # The absolute path to the Stockfish executable.
        STOCKFISH_PATH="d:\AItrainingV4\stockfish\stockfish.exe"

        # Your API key for the Google Gemini service.
        GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```

## Running the Application

To run the development server, use the following command from the project root:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`. Interactive documentation (Swagger UI) can be accessed at `http://127.0.0.1:8000/docs`.

---

# Development Conventions

*   **Code Style:** The project follows standard Python conventions (PEP 8).
*   **Type Hinting:** All functions and methods should include type hints for clarity and static analysis.
*   **Testing:** (TODO: Add instructions on how to run tests once a testing framework is in place).
*   **Commits:** Commits should be clear and descriptive. (TODO: Specify a commit message convention if desired).
