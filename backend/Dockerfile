FROM python:3.12-slim

WORKDIR /app

# System dependencies for Prophet / TensorFlow / psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - && \
    ln -s /root/.local/bin/poetry /usr/local/bin/poetry

# Copy dependency files first for layer caching
COPY pyproject.toml poetry.lock* ./

# Install production deps only
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --without dev

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
