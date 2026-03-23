# Wait for backing services to be ready
Write-Host "Checking for Ollama..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    if ($response.models.name -notcontains "llama3.2:3b") {
        Write-Host "Warning: llama3.2:3b model not found in Ollama. Pulling..." -ForegroundColor Yellow
        Invoke-RestMethod -Uri "http://localhost:11434/api/pull" -Method Post -Body '{"name": "llama3.2:3b"}' -ContentType "application/json"
    }
    Write-Host "Ollama is ready!" -ForegroundColor Green
} catch {
    Write-Host "Ollama is not running locally. RCA Streaming will fail." -ForegroundColor Red
}

Write-Host "Starting required infrastructure..." -ForegroundColor Cyan
cd "$PSScriptRoot\..\infra"
docker-compose up -d redis

Write-Host "Waiting for database..."
Start-Sleep -Seconds 3

# Run migrations (assuming alembic) and start backend
cd "$PSScriptRoot\..\backend"

Write-Host "Starting Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$PSScriptRoot\..\backend`"; poetry run uvicorn api.main:app --reload --host 127.0.0.1 --port 8000 --reload-exclude mlruns"

# Start Frontend
cd "$PSScriptRoot\..\frontend"
Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$PSScriptRoot\..\frontend`"; npm run dev"

Write-Host "All services started! Access frontend at http://localhost:3000" -ForegroundColor Green
