# Sentinel: AI System Monitoring Platform

Sentinel is a production-ready, predictive monitoring and automated incident response platform. It monitors system telemetry, detects both point outliers and contextual anomalies, forecasts capacity breaches, and provides local, private root cause analysis reasoning using an LLM.

**Built for modern SRE and DevSecOps.**

## Features

- 🚀 **Next.js & FastAPI**: Modern, fully typed full-stack architecture.
- 🧠 **Multi-Model ML**: Isolation Forest (outliers), LSTM Autoencoders (temporal shifts), and Prophet (capacity forecasting).
- 💬 **Streaming Root Cause Analysis**: Real-time incident explanation using local Llama 3.2 (Ollama).
- 🔄 **Kafka Streaming Ingestion**: Robust bulk metric ingestion for horizontal scaling.
- 🛡️ **Zero-Trust Security**: JWT auth, RBAC, Bcrypt, and strict security headers. Stop anomalous operators right at the gate.
- 📉 **Observability**: Built-in OpenTelemetry tracing, Prometheus metrics, and Grafana dashboarding.
- 🤖 **Automated Runbooks**: Automated mitigation protocols with dry-run support and high-risk manual gating.

## Project Structure
```text
Sentinel/
├── backend/            # FastAPI, PostgreSQL, ML Models
├── frontend/           # Next.js 15, Zustand, React Query, Tailwind
├── infra/              # Docker Compose, Prometheus, Grafana, Kafka
├── scripts/            # Helper scripts (dev, setup, test, train)
└── docs/               # Architecture, ADRs, Scaling reasoning
```

### Quick Start

1.  **Check Prerequisites**: Ensure Docker, Python 3.12+, Node.js 20+, and Ollama are installed.
2.  **Full Setup**: For a detailed step-by-step guide, see the [**Full Operational Runbook**](./docs/RUNBOOK.md).
3.  **Run the Platform**:
    ```powershell
    .\scripts\install.ps1  # First time only
    .\scripts\dev.ps1      # Starts everything
    ```

**Access Points:**
- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Default Credentials**: `admin` / `Sentinel@Admin1`

## Commands Reference
| Command | Description |
|---------|-------------|
| `.\scripts\seed.ps1` | Delete old DB and seed realistic 7-day data |
| `.\scripts\train.ps1` | Retrain all ML models against DB telemetry |
| `.\scripts\test.ps1` | Run Pytest backend test suite |
| `.\scripts\chaos.ps1`| Inject a simulated failure for ML detection |

## Design Philosophy

- **Dark Industrial Aesthetic**: Deep blacks, stark contrasts, and mono-spaced fonts prioritize legibility during high-stress incidents.
- **Fail-Open & Fallbacks**: If Kafka is down, ingestion falls back to Mock/REST endpoints. If Ollama is down, RCA logs an error but the App survives.
- **Data Privacy**: All telemetry, incidents, and RCA LLM generation happens on-premise without reaching out to third-party providers.

## Architecture & Scaling
Please refer to the detailed [Scale & Hardware Constraints](./docs/scale.md) document to see how Sentinel handles 10K+ metrics/sec and minimizes API latency during heavy ML inference.

---

**Authorized Personnel Only.**
