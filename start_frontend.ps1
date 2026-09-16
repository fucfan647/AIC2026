# Start AIC2026 Frontend Server
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\frontend"

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Starting AIC2026 Frontend (FastAPI:8080)..." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

# Cau hinh thu muc keyframes tren may local (o cung ca nhan)
$KeyframesDir = "D:\keyframes_AIC_2026"
$BackendUrl = "http://192.168.20.156:8036"
$HlsUrl = "http://192.168.20.156:8052"

python -u serve_frontend.py `
  --host 0.0.0.0 `
  --port 8080 `
  --backend-url "$BackendUrl" `
  --hls-server-url "$HlsUrl" `
  --keyframes-dir "$KeyframesDir"

