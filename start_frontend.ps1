param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "system.config.json"),
    [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "scripts\system_common.ps1")

if (-not $SkipCheck) {
    & (Join-Path $PSScriptRoot "check_system.ps1") -Scope Frontend -ConfigPath $ConfigPath
}
$config = Read-AicSystemConfig -ConfigPath $ConfigPath
$python = Get-AicPythonExecutable -Config $config

$env:SSLKEYLOGFILE = $null
$env:HLS_SERVER_URL = [string]$config.frontend.hls_server_url
$env:TRANSLATOR_URL = [string]$config.frontend.translator_url
$env:SUBMISSION_SOUND_ROOT = Resolve-AicSystemPath -Value ([string]$config.paths.music_root)

$arguments = @(
    "-u", "serve_frontend.py",
    "--host", [string]$config.frontend.host,
    "--port", [string]$config.frontend.port,
    "--backend-url", [string]$config.frontend.backend_url,
    "--hls-server-url", [string]$config.frontend.hls_server_url,
    "--records-path", (Resolve-AicSystemPath -Value ([string]$config.paths.records_db)),
    "--deleted-manifest", (Resolve-AicSystemPath -Value ([string]$config.paths.deleted_manifest)),
    "--query-root", (Resolve-AicSystemPath -Value ([string]$config.paths.query_root)),
    "--keyframe-root", (Resolve-AicSystemPath -Value ([string]$config.paths.keyframes_root)),
    "--thumbnail-root", (Resolve-AicSystemPath -Value ([string]$config.paths.thumbnails_root))
)

$browserUrl = "http://127.0.0.1:$($config.frontend.port)/"
Write-Host "============================================================" -ForegroundColor Green
Write-Host " AIC2026 Frontend: $browserUrl" -ForegroundColor Green
Write-Host " Backend proxy:    $($config.frontend.backend_url)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green

if ([bool]$config.frontend.open_browser) {
    Start-Process $browserUrl
}

Push-Location (Join-Path $PSScriptRoot "frontend")
try {
    & $python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Frontend exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
