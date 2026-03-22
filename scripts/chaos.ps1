param (
    [string]$Service = "payment-gateway",
    [string]$Type = "latency_spike",
    [int]$Duration = 15
)

# Login first to get token
$LoginBody = @{
    username = "admin"
    password = "Sentinel@Admin1"
} | ConvertTo-Json

$LoginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method Post -Body $LoginBody -ContentType "application/json"
$Token = $LoginResponse.access_token

# Inject chaos with auth header
$HostUri = "http://localhost:8000/api/v1/chaos/inject"
$Body = @{
    service = $Service
    type = $Type
    duration_minutes = $Duration
} | ConvertTo-Json

$Headers = @{ Authorization = "Bearer $Token" }

Invoke-RestMethod -Uri $HostUri -Method Post -Body $Body -ContentType "application/json" -Headers $Headers
Write-Host "Injected $Type into $Service for $Duration minutes." -ForegroundColor Red