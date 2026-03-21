# Sentinel Operational Runbook

Welcome to the Sentinel AI System Monitoring Platform. This guide provides step-by-step instructions on setting up, running, and troubleshooting the entire stack.

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed on your **Windows** machine:

1.  **Docker Desktop**: Required for PostgreSQL, Redis, Kafka, and Observability tools.
2.  **Python 3.12+**: The backend logic and ML models run on Python.
3.  **Poetry**: For Python dependency management.
    *   *Install via:* `pip install poetry`
4.  **Node.js 20+**: Required for the Next.js frontend.
5.  **Ollama**: Required for local Root Cause Analysis (RCA).
    *   *Action:* Install Ollama and run `ollama pull llama3.2:3b`.

---

## 🚀 Initial Setup

If this is your first time setting up the project, follow these steps in a **PowerShell** terminal at the project root:

1.  **Install All Dependencies**:
    This script installs both Backend (Poetry) and Frontend (NPM) dependencies.
    ```powershell
    .\scripts\install.ps1
    ```

2.  **Pull Infrastructure Images**:
    Ensure Docker is running, then pull the required images:
    ```powershell
    docker-compose -f .\infra\docker-compose.yml pull
    ```

---

## 🏃 Running the Platform

To start the entire platform (Infrastructure, Backend, and Frontend), simply run:

```powershell
.\scripts\dev.ps1
```

### What happens when you run `dev.ps1`?
*   **Ollama Check**: Verifies if Ollama is running and has the correct model.
*   **Docker Infrastructure**: Spins up `postgres` and `redis` containers.
*   **Database Initialization**: Automatically creates tables in PostgreSQL (using `sentinel_db`).
*   **Backend Launch**: Starts the FastAPI server at `http://localhost:8000` in a **new terminal window**.
*   **Frontend Launch**: Starts the Next.js dev server at `http://localhost:3000` in a **new terminal window**.

---

## 📊 Access Points

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:3000](http://localhost:3000) | Main dashboard and management console. |
| **API Docs (Swagger)** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive API documentation. |
| **Prometheus** | [http://localhost:9090](http://localhost:9090) | Raw metric data. |
| **Grafana** | [http://localhost:3001](http://localhost:3001) | Visualization dashboards. |

**Default Credentials:**
*   **Username**: `admin`
*   **Password**: `Sentinel@Admin1`

---

## 🛠 Common Troubleshooting

### ❌ Database Password/Connection Errors
If you see `InvalidPasswordError` or connection issues:
1. Stop the environment.
2. Wipe the old Docker volumes:
   ```powershell
   docker-compose -f .\infra\docker-compose.yml down -v
   ```
3. Restart with `.\scripts\dev.ps1`.

### ❌ Corruption in Python Environment (`.venv`)
If the backend throws strange `SyntaxError` or "module not found" errors after a bulk update:
1. Delete the `.venv` folder in `backend/`.
2. Run `poetry install` inside the `backend/` directory.

### ❌ "Cannot insert multiple commands" or "Syntax error at or near ':'"
These are typically caused by `asyncpg` parsing issues. They have been patched in `api/database.py` and `api/seed.py`. Ensure you are using the latest version of these files.

---

## 📦 Maintenance Scripts

| Script | Purpose |
| :--- | :--- |
| `.\scripts\seed.ps1` | Resets the DB and generates 7 days of realistic metric/incident data. |
| `.\scripts\train.ps1` | Manually triggers retraining of all ML models. |
| `.\scripts\test.ps1` | Runs the backend unit and integration test suite. |
| `.\scripts\chaos.ps1` | Injects a "Latency Spike" or "CPU Hog" chaos event to test ML detection. |
