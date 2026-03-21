# Backend Deps
cd "$PSScriptRoot\..\backend"
poetry install

# Frontend Deps
cd "$PSScriptRoot\..\frontend"
npm install

# Check Ollama
try {
    Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "Ollama is installed and running." -ForegroundColor Green
} catch {
    Write-Host "Ollama is not running locally. Please install it and run `ollama run llama3.2:3b` for RCA features." -ForegroundColor Yellow
}
