"""
MLflow model registry: champion/challenger management.
"""
import structlog

log = structlog.get_logger()


def setup_mlflow() -> None:
    """Initialize MLflow tracking."""
    try:
        import mlflow
        from api.config import settings
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)
        log.info("mlflow.initialized",
                 uri=settings.MLFLOW_TRACKING_URI,
                 experiment=settings.MLFLOW_EXPERIMENT_NAME)
    except Exception as exc:
        log.warning("mlflow.setup_failed", error=str(exc))


def get_champion_model(service_id: str, model_type: str):
    """Load champion model from MLflow registry."""
    try:
        import mlflow
        from mlflow.tracking import MlflowClient
        from api.config import settings

        client = MlflowClient()
        exp = client.get_experiment_by_name(settings.MLFLOW_EXPERIMENT_NAME)
        if not exp:
            return None
        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=(
                f"tags.service_id = '{service_id}' AND "
                f"tags.model_type = '{model_type}' AND "
                f"tags.is_champion = 'true'"
            ),
            order_by=["start_time DESC"],
            max_results=1,
        )
        if not runs:
            return None
        run_id = runs[0].info.run_id
        model_uri = f"runs:/{run_id}/model"
        
        if model_type == "isolation_forest":
            scaler_uri = f"runs:/{run_id}/scaler"
            m = mlflow.sklearn.load_model(model_uri)
            s = mlflow.sklearn.load_model(scaler_uri)
            return m, s
        elif model_type == "lstm_ae":
            m = mlflow.keras.load_model(model_uri)
            t = runs[0].data.metrics.get("reconstruction_threshold", 1.0)
            return m, t
        elif model_type in ("prophet", "arima"):
            return mlflow.pyfunc.load_model(model_uri)
        return None
    except Exception as exc:
        log.warning("mlflow.champion_load_failed", model_type=model_type, error=str(exc))
        return None


def promote_to_champion(
    run_id: str,
    service_id: str,
    model_type: str,
    new_metrics: dict,
) -> None:
    """Promote a run to champion, demoting current champion."""
    try:
        import mlflow
        from mlflow.tracking import MlflowClient
        from api.config import settings

        client = MlflowClient()
        exp = client.get_experiment_by_name(settings.MLFLOW_EXPERIMENT_NAME)
        if not exp:
            return
        # Demote old champion
        old_champions = client.search_runs(
            experiment_ids=[exp.experiment_id],
            filter_string=(
                f"tags.is_champion = 'true' AND "
                f"tags.model_type = '{model_type}' AND "
                f"tags.service_id = '{service_id}'"
            ),
        )
        for run in old_champions:
            client.set_tag(run.info.run_id, "is_champion", "false")
        # Promote new
        client.set_tag(run_id, "is_champion", "true")
        client.set_tag(run_id, "service_id", service_id)
        client.set_tag(run_id, "model_type", model_type)
        log.info("model.promoted", run_id=run_id, service_id=service_id,
                 model_type=model_type, metrics=new_metrics)
    except Exception as exc:
        log.warning("mlflow.promote_failed", error=str(exc))


def should_promote(
    champion_metrics: dict,
    challenger_metrics: dict,
    metric_key: str = "mae",
    improvement_threshold: float = 0.10,
) -> bool:
    """Promote if challenger is 10%+ better."""
    champ = champion_metrics.get(metric_key, float("inf"))
    chal = challenger_metrics.get(metric_key, float("inf"))
    return chal < champ * (1 - improvement_threshold)
