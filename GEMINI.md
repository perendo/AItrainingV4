# EntrenadorIA Full-Stack Project

This is a full-stack web application designed to be an AI-powered chess coach. It allows users to upload their games, receive detailed analysis, and get personalized training plans.

---

## Architecture

The project is composed of a Python backend and a Next.js frontend.

### Backend

The backend is built with **FastAPI** and follows a clean architecture pattern, separating concerns into distinct layers:

*   `app/api`: FastAPI endpoints (the "Controller" layer).
*   `app/services`: Contains the core business logic.
*   `app/repositories`: Data access layer abstracting database interactions.
*   `app/models`: SQLAlchemy ORM models.
*   `app/schemas`: Pydantic data validation schemas.
*   `app/core`: Core application setup, including configuration, database connection, and security.

### Frontend

The frontend is a **Next.js (React)** application built with TypeScript.

*   `frontend/src`: Contains all the frontend source code.
*   `frontend/src/app`: The main application routing structure.
*   `frontend/src/components`: Reusable React components.
*   `frontend/src/lib`: Utility functions, API clients, and type definitions.

---

## Key Technologies

| Area      | Technology                                   |
|-----------|----------------------------------------------|
| **Backend** | FastAPI, SQLAlchemy, Pydantic, Uvicorn       |
| **Frontend**| Next.js, React, TypeScript, Tailwind CSS     |
| **Database**| SQLAlchemy with SQLite (default)             |
| **Chess Engine** | Stockfish                                    |
| **AI Coach**| Google Gemini                                |
| **Testing** | Pytest                                       |

---

## Setup and Installation

### Prerequisites

*   Python 3.10+
*   Node.js (LTS version recommended)
*   [Stockfish](https://stockfishchess.org/download/) executable.
*   An API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 1. Configure Environment

Create a `.env` file in the project root by copying the `.env.example` if it exists, or create a new one. Add the following variables:

```env
# The connection string for your database.
DATABASE_URL="sqlite:///./entrenador_ia.db"

# The absolute path to the Stockfish executable.
# Use double backslashes on Windows.
STOCKFISH_PATH="d:\AItrainingV4\stockfish\stockfish.exe"

# Your API key for the Google Gemini service.
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Secret key for JWT
SECRET_KEY="your_super_secret_key"
```

### 2. Install Dependencies

**Backend:**
It is recommended to use a virtual environment.
```bash
# Create and activate a virtual environment
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On macOS/Linux
# source .venv/bin/activate

# Install Python packages
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

---

## Building and Running the Project

The easiest way to run the entire application is to use the provided script. This will start both the backend and frontend servers concurrently.

```bash
python start_servers.py
```

*   **Backend** will be available at `http://127.0.0.1:8000`.
    *   API documentation (Swagger UI) at `http://127.0.0.1:8000/api/v1/docs`.
*   **Frontend** will be available at `http://localhost:3000`.

To run the servers individually:

*   **Backend:** `uvicorn app.main:app --reload`
*   **Frontend:** `cd frontend && npm run dev`

---

## Database

*   The database uses SQLite by default and tables are created automatically when the backend server starts.
*   To populate the database with chess puzzles from the Lichess dataset, run the following script:
    ```bash
    python ejercicios/import_puzzles.py
    ```

---

## Testing

The backend uses `pytest` for testing.

To run the tests, execute the following command from the project root:

```bash
pytest
```

The test configuration is in `pytest.ini`.

---

## Development Conventions

*   **Backend:** Code style follows **PEP 8**. All code should be type-hinted.
*   **Frontend:** Code style is enforced by **ESLint**. Run `npm run lint` in the `frontend` directory to check for issues.
