# Project Overview

This is a full-stack application for chess training. It consists of a Python backend and a JavaScript/TypeScript frontend.

## Backend

The backend is a [FastAPI](https://fastapi.tiangolo.com/) application that provides a REST API for managing users, games, training plans, and puzzles.

**Key Technologies:**

*   **FastAPI:** A modern, fast (high-performance) web framework for building APIs with Python 3.7+ based on standard Python type hints.
*   **SQLAlchemy:** The Python SQL Toolkit and Object Relational Mapper.
*   **Pydantic:** Data validation and settings management using Python type annotations.
*   **Chess:** A pure Python chess library with move generation and validation, PGN parsing and writing, and more.
*   **JSON Web Tokens (JWT):** For authentication.

**Running the Backend:**

To run the backend, you need to have Python 3.7+ installed.

1.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
2.  **Run the server:**
    ```bash
    uvicorn app.main:app --reload
    ```
The server will be running at `http://127.0.0.1:8000`.

## Frontend

The frontend is a [Next.js](https://nextjs.org/) application that consumes the backend API and provides the user interface.

**Key Technologies:**

*   **Next.js:** A React framework for building full-stack web applications.
*   **React:** A JavaScript library for building user interfaces.
*   **TypeScript:** A typed superset of JavaScript that compiles to plain JavaScript.
*   **Tailwind CSS:** A utility-first CSS framework for rapidly building custom user interfaces.
*   **Jest:** A delightful JavaScript Testing Framework with a focus on simplicity.

**Running the Frontend:**

To run the frontend, you need to have Node.js and npm installed.

1.  **Navigate to the `frontend` directory:**
    ```bash
    cd frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
The application will be running at `http://localhost:3000`.

## Development Conventions

*   **API Versioning:** The API is versioned under `/api/v1`.
*   **Authentication:** The application uses JSON Web Tokens (JWT) for authentication. The token is sent in the `Authorization` header as a Bearer token.
*   **Error Handling:** The frontend has a centralized `apiFetch` function that handles API errors, including 401 Unauthorized errors which trigger a redirect to the login page.
*   **Styling:** The frontend uses Tailwind CSS for styling, with some components from `shadcn`.
*   **Testing:** The frontend uses Jest for unit and integration tests. The backend has tests in the `tests` directory.
