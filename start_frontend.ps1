# Start AIC2026 Frontend Server
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\frontend"

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Starting AIC2026 Frontend (FastAPI:8080)..." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

python -u serve_frontend.py `
  --host 127.0.0.1 `
  --port 8080 `
  --backend-url "http://127.0.0.1:8036" `
  --hls-server-url "http://127.0.0.1:8052"
