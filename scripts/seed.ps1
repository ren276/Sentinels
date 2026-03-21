$env:PYTHONPATH = "e:\Sentinels\backend"
cd e:\Sentinels\backend
poetry run python -c "from api.database import engine, Base; Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine); from api.seed import seed_database; import asyncio; asyncio.run(seed_database())"
Write-Host "Database seeded successfully." -ForegroundColor Green
