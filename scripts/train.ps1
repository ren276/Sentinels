$env:PYTHONPATH = "e:\Sentinels\backend"
cd e:\Sentinels\backend
poetry run python ml/train.py
Write-Host "ML models trained and registered to MLflow." -ForegroundColor Green
