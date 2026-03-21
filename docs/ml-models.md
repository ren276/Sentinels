# Machine Learning Model Cards

Sentinel utilizes a multi-model ensemble approach to balance recall and precision in anomaly detection and forecasting.

## Isolation Forest (Anomaly Detection)
- **Goal**: Detect point anomalies and multi-dimensional outliers in latency, error rate, and CPU metrics.
- **Features**: Aggregated 15-minute rolling statistics (mean, variance, skew) of network/system metrics.
- **Performance**: High recall, low computational cost. Prone to false positives during bursty traffic.

## LSTM Autoencoder (Sequence Anomalies)
- **Goal**: Detect contextual anomalies (e.g., slow memory leaks, cyclical shifts) that are not point outliers.
- **Features**: 24-step sequence (each step = 5 mins) of normalized CPU, memory, and latency.
- **Performance**: High precision, captures temporal dependencies. Expensive to run at edge.

## Prophet (Capacity Forecasting)
- **Goal**: Predict when CPU or Memory will breach 80% capacity within a 30-minute to 24-hour horizon.
- **Features**: Historical univariate time-series data with weekly and daily seasonality.
- **Performance**: Robust to missing data and trend shifts. Built-in confidence intervals (which Sentinel renders visually).

## Llama 3.2 3B (Root Cause Analysis Engine)
- **Goal**: Provide human-readable RCA streams triggered by an Incident.
- **Input Context**: Last 30 mins of telemetry, anomaly scores, dependency graph neighbors, and known runbooks.
- **Performance**: Runs locally via Ollama to ensure data privacy. Streams tokens via WebSockets natively.
