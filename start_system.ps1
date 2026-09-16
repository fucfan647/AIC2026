param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "system.config.json")
)

$ErrorActionPreference = "Stop"
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
& (Join-Path $PSScriptRoot "check_system.ps1") -Scope All -ConfigPath $resolvedConfig

$powerShellExecutable = (Get-Process -Id $PID).Path
$backendScript = Join-Path $PSScriptRoot "start_backend.ps1"
$backendCommand = "& '$($backendScript.Replace("'", "''"))' -ConfigPath '$($resolvedConfig.Replace("'", "''"))' -SkipCheck"

Write-Host "Opening backend in a separate PowerShell window..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath $powerShellExecutable -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
) -PassThru

try {
    & (Join-Path $PSScriptRoot "start_frontend.ps1") -ConfigPath $resolvedConfig -SkipCheck
} finally {
    if (-not $backendProcess.HasExited) {
        Write-Host "Stopping backend started by start_system.ps1..." -ForegroundColor Yellow
        Stop-Process -Id $backendProcess.Id
    }
}
