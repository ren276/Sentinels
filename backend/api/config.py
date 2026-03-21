from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://sentinel:sentinelpassword"
        "@localhost:5432/sentinel_db"
    )

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Kafka (disabled by default for local dev)
    KAFKA_ENABLED: bool = False
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_USE_SASL: bool = False
    KAFKA_USERNAME: str = ""
    KAFKA_PASSWORD: str = ""

    # Auth — JWT_SECRET_KEY REQUIRED, min 32 chars
    JWT_SECRET_KEY: str = "CHANGE_ME_MINIMUM_32_CHARACTERS_REQUIRED_HERE_NOW"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2:3b"

    # MLflow
    MLFLOW_TRACKING_URI: str = "./mlruns"
    MLFLOW_EXPERIMENT_NAME: str = "sentinel"

    # Observability
    JAEGER_HOST: str = "localhost"
    JAEGER_PORT: int = 6831
    PROMETHEUS_ENABLED: bool = True

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # Notifications (optional)
    SLACK_WEBHOOK_URL: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_FROM: str = ""
    SMTP_PASSWORD: str = ""

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def jwt_secret_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters. "
                "Generate: python -c \"import secrets; "
                "print(secrets.token_hex(32))\""
            )
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def db_must_be_postgres(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must be PostgreSQL")
        return v

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

import structlog
log = structlog.get_logger()
log.info(
    "config.loaded",
    environment=settings.ENVIRONMENT,
    database=settings.DATABASE_URL.split("@")[-1],
    redis=settings.REDIS_URL.split("@")[-1],
    ollama_model=settings.OLLAMA_MODEL,
    kafka_enabled=settings.KAFKA_ENABLED,
)
