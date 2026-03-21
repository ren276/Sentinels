# ADR 003: Background APScheduler for ML Tasks

## Status
Accepted

## Context
Machine Learning anomaly detection must happen continuously on fresh data, but triggering an inference run on *every* single incoming metric payload (10K/sec) is computationally unfeasible.

## Decision
We chose to decouple ingestion from anomaly detection.
Ingestion simply writes to the Database and Redis. An APScheduler job runs every 1 minute (`scheduler.add_job(detect_anomalies_job, 'interval', minutes=1)`), querying the last 15 minutes of data, computing rolling features, scoring, and routing alerts.

## Consequences
- **Positive**: The system is resilient to traffic bursts. Anomalies are evaluated in batches, which is vastly more efficient for matrix operations in numpy/sklearn.
- **Negative**: Time-to-detect (TTD) floor is 1 minute. Anomalies are not instantly flagged the millisecond they occur, which is an acceptable tradeoff for capacity planning.
