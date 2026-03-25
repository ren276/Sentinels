# Sentinel v1.0 — System Monitoring Platform

Sentinel is a production-ready, predictive monitoring and automated incident response platform. It monitors system telemetry, detects both point outliers and contextual anomalies, forecasts capacity breaches, and provides local, private root cause analysis reasoning using an LLM.

---

## 🏗 Features

- 🚀 **FastAPI & Next.js**: Modern, fully typed full-stack architecture for v1.0.
- 🧠 **Multi-Model ML**: Isolation Forest (outliers), LSTM Autoencoders (temporal shifts), and Prophet (capacity forecasting).
- 💬 **Root Cause Analysis**: Real-time incident explanation using local Llama 3.2 (Ollama).
- 🔄 **Kafka Streaming Ingestion**: Robust bulk metric ingestion for horizontal scaling.
- 🛡️ **Zero-Trust Security**: JWT auth, RBAC, Bcrypt, and strict security headers. 
- 📉 **Observability**: Built-in OpenTelemetry tracing, Prometheus metrics, and Grafana dashboarding.
- 🤖 **Automated Runbooks**: Automated mitigation protocols with dry-run support and high-risk manual gating.

---

## 📂 Project Structure

```text
Sentinel/
├── backend/            # FastAPI, PostgreSQL, ML Models
├── frontend/           # Next.js 15, Zustand, React Query, Tailwind
├── infra/              # Docker Compose, Prometheus, Grafana, Kafka
├── scripts/            # Helper scripts (dev, setup, test, train)
└── docs/               # Architecture, Scaling, Operations
```

---

## 🚀 Quick Start

1.  **Check Prerequisites**: Ensure Docker, Python 3.12+, Node.js 20+, and Ollama are installed.
2.  **Run the Platform**:
    ```powershell
    .\scripts\install.ps1  # First time only
    .\scripts\dev.ps1      # Starts everything (Infrastructure, Backend, Frontend)
    ```

**Access Points:**
- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Grafana**: [http://localhost:3001](http://localhost:3001)

**Default Credentials:**
- **Admin**: `admin` / `Sentinel#2026!Admin`
- **Observer**: `viewer` / `Sentinel#2026!View`

---

## 📘 Documentation

For a deep dive into running and scaling Sentinel, please refer to the following guides:

1.  **[Operational Runbook](./docs/OPERATIONS.md)**: Extensive guide on setup, lifecycle management, and troubleshooting.
2.  **[Scaling & Architecture Philosophy](./docs/SCALING.md)**: Detailed breakdown of the project architecture and multi-model ML scaling.

---

## 🛠 Commands Reference

| Command | Description |
|---------|-------------|
| `.\scripts\seed.ps1` | Delete old DB and seed realistic 7-day data |
| `.\scripts\train.ps1` | Retrain all ML models against DB telemetry |
| `.\scripts\test.ps1` | Run Pytest backend test suite |
| `.\scripts\chaos.ps1`| Inject a simulated failure for ML detection |

---

**Authorized Personnel Only.**
*Created by Sandesh Verma*
