param (
    [string]$Service = "payment-gateway",
    [string]$Type = "latency_spike",
    [int]$Duration = 15
)

$HostUri = "http://localhost:8000/api/v1/chaos/inject"
$Body = @{
    service = $Service
    type = $Type
    duration_minutes = $Duration
} | ConvertTo-Json

Invoke-RestMethod -Uri $HostUri -Method Post -Body $Body -ContentType "application/json"
Write-Host "Injected $Type into $Service for $Duration minutes." -ForegroundColor Red
