Write-Host "Checking Ollama Connection and Models..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -ErrorAction Stop
    Write-Host "Ollama is responding." -ForegroundColor Green
    
    $hasLlama = $false
    foreach ($model in $response.models) {
        Write-Host "Found model: $($model.name)"
        if ($model.name -match "llama3.2:3b") {
            $hasLlama = $true
        }
    }
    
    if (-not $hasLlama) {
        Write-Host "llama3.2:3b is missing. Pulling now..." -ForegroundColor Yellow
        $body = @{ name = "llama3.2:3b" } | ConvertTo-Json
        Invoke-RestMethod -Uri "http://localhost:11434/api/pull" -Method Post -Body $body -ContentType "application/json"
        Write-Host "llama3.2:3b successfully pulled!" -ForegroundColor Green
    } else {
        Write-Host "llama3.2:3b is ready for RCA tasks." -ForegroundColor Green
    }
} catch {
    Write-Host "Failed to connect to Ollama on http://localhost:11434" -ForegroundColor Red
    Write-Host "Please ensure Ollama is installed and running."
}
