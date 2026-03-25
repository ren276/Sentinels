# Sentinel v1.0 — Operational Excellence

Welcome to the command center manual for Sentinel. This document outlines how to manage, tune, and troubleshoot the platform at a production scale.

---

## 🛠 Prerequisites Checklist

1. **Host OS**: Windows 10/11 (PowerShell 7 recommended).
2. **Resource Allocation**: Minimum 16GB RAM, 4 CPU cores (Ollama requirements).
3. **Software**:
   - **Docker Desktop**: Ensures Redis, Kafka, and Observability services are containerized.
   - **Python 3.12+**: Core backend logic and ML inference.
   - **Node.js 20+**: Frontend React/Next.js engine.
   - **Ollama**: Local model runner (install and run `ollama serve`).

---

## 🚀 Lifecycle Management

### 1. Initialization
If this is a fresh clone, run the installation script:
```powershell
.\scripts\install.ps1
```
This script handles Python virtual environments (`.venv`), Poetry sync, and NPM audit.

### 2. Standard Launch
Starts all services with production-hardened environment variables:
```powershell
.\scripts\dev.ps1
```

### 3. Database Maintenance
Sentinel uses an automated migration and seeding strategy:
- **Seed realistic data**: `.\scripts\seed.ps1` (Wipes DB and generates 7 days of metrics/incidents).
- **Manual migrations**: All tables are defined in `backend/api/database.py` and applied on startup via SQLAlchemy.

---

## 🧠 ML & Analysis Operations

### Model Retraining
Sentinel's models (Isolation Forest, prophet) are self-improving but can be manually retrained if system patterns shift:
```powershell
.\scripts\train.ps1
```
This triggers the `ml.train` module to pull the last 7 days of telemetry and update the Champion models in the Registry.

### Root Cause Analysis (LLM) Tuning
Sentinel uses **Llama 3.2:3b** for sub-second, private Root Cause Analysis.
- **Verification**: Ensure `OLLAMA_MODEL=llama3.2:3b` is set in your `.env`.
- **Model Switch**: You can change the model by updating `OLLAMA_MODEL` and running `ollama pull [new_model]`.

---

## 🛡 Security & RBAC

| Role | Access Level | Description |
| :--- | :--- | :--- |
| **Root Admin** | Full | Can manage users, SLOs, and perform high-risk runbook executions. |
| **Operator** | Write | Can acknowledge incidents and execute dry-run runbooks. |
| **Viewer** | Read-Only | Access to dashboards and anomaly lab; no mutation rights. |

**Default Admin**: `admin` / `Sentinel@Admin1`
**Default Viewer**: `viewer` / `Sentinel@View1`

---

## 🚨 Troubleshooting

### "Max client connections reached"
- **Cause**: Background jobs not releasing sessions or PG pool saturated.
- **Fix**: We have hardened the session logic with `async with` context managers. If it persists, increase `pool_size` in `api/database.py`.

### "WebSocket disconnected"
- **Cause**: Browser tab idle or dev server hot-reload.
- **Fix**: Sentinel automatically attempts re-connection every 2 seconds. Check the "WS Connection" indicator in the Sidebar.

### "IndentationError" on Startup
- **Cause**: Python syntax corruption in `main.py`.
- **Fix**: Check `backend/api/main.py` for any trailing whitespace or incorrect tab levels after manual edits.

---

**Authorized Personnel Only.**
*Created by Sandesh Verma*
