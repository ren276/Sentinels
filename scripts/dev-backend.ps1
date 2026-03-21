$env:PYTHONPATH = "e:\Sentinels\backend"
$env:ENVIRONMENT = "development"
cd e:\Sentinels\backend
poetry run uvicorn api.main:app --reload --port 8000
