# ADR 005: TimescaleDB Future Migration

## Status
Proposed

## Context
Currently, Sentinel uses standard PostgreSQL `TIMESTAMP` columns and standard B-Tree indexes for metric ingestion. At 10,000 metrics a second, table bloat and index maintenance will cause degradation within weeks.

## Decision
While V1 uses standard Postgres for setup simplicity in Docker, V2 MUST migrate the `metrics` table to a TimescaleDB Hypertable.

## Consequences
- **Positive**: Chunking metrics by time intervals will speed up the 15-minute rolling window queries required by the ML Pipeline. Continuous Aggregates will make rendering the 24-hour frontend UI completely instant.
- **Negative**: Adds a dependency on a TimescaleDB extension/cloud rather than vanilla PostgreSQL. Backup and replication logic becomes slightly more complex.
