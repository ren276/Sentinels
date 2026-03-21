# Sentinel Architecture

Sentinel uses a modern streaming architecture designed for low-latency anomaly detection and root cause analysis.

## System Diagram

```mermaid
graph TD
    Client[Next.js Frontend] -->|REST / WebSocket| API[FastAPI Backend]
    
    subgraph Data Layer
        API --> PG[(PostgreSQL)]
        API --> Redis[(Redis)]
    end
    
    subgraph Ingestion
        Telegraf/OTel --> Kafka[Kafka Topic: sentinel.metrics]
        Kafka --> API_Collector[FastAPI Ingestion Worker]
        API_Collector --> Redis
        API_Collector --> PG
    end
    
    subgraph ML Pipeline
        Redis --> FeatureEng[Feature Engineering]
        FeatureEng --> IF[Isolation Forest]
        FeatureEng --> LSTMAE[LSTM Autoencoder]
        IF --> Scorer(Ensemble Scorer)
        LSTMAE --> Scorer
        Scorer -->|if score > threshold| AlertRouter
    end
    
    subgraph Response
        AlertRouter[Alert Router / Deduplication] --> Notification(Slack / Email)
        AlertRouter --> RCA_Engine[Ollama RCA Engine]
        RCA_Engine -->|Streaming Reasoning| API
    end
```

## Component Roles
- **FastAPI**: Core logic, API serving, WebSocket streaming, and background task scheduling.
- **PostgreSQL**: Persistent storage of entities, historical telemetry, and ML model registry.
- **Redis**: High-speed caching, rate limiting, pub/sub, deduplication for alerts.
- **Kafka**: Decouples metric ingestion from processing.
- **Ollama**: Local LLM execution for data-private Root Cause Analysis.
