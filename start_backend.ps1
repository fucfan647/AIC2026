param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "system.config.json"),
    [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "scripts\system_common.ps1")

if (-not $SkipCheck) {
    & (Join-Path $PSScriptRoot "check_system.ps1") -Scope Backend -ConfigPath $ConfigPath
}
$config = Read-AicSystemConfig -ConfigPath $ConfigPath
$python = Get-AicPythonExecutable -Config $config

$env:AIC_KEYFRAMES_ROOT = Resolve-AicSystemPath -Value ([string]$config.paths.keyframes_root)
$env:AIC_THUMBNAILS_ROOT = Resolve-AicSystemPath -Value ([string]$config.paths.thumbnails_root)
$env:AIC_MUSIC_ROOT = Resolve-AicSystemPath -Value ([string]$config.paths.music_root)

$disabledRoot = Join-Path $PSScriptRoot ".disabled"
$beit3Embeddings = if (Test-AicFeatureEnabled -Config $config -Name "beit3") { Resolve-AicSystemPath -Value ([string]$config.paths.beit3_embeddings) } else { Join-Path $disabledRoot "beit3_embeddings.npy" }
$beit3Checkpoint = if (Test-AicFeatureEnabled -Config $config -Name "beit3") { Resolve-AicSystemPath -Value ([string]$config.paths.beit3_checkpoint) } else { Join-Path $disabledRoot "beit3_checkpoint.pth" }
$beit3Sentencepiece = if (Test-AicFeatureEnabled -Config $config -Name "beit3") { Resolve-AicSystemPath -Value ([string]$config.paths.beit3_sentencepiece) } else { Join-Path $disabledRoot "beit3.spm" }
$beit3RuntimePython = if (Test-AicFeatureEnabled -Config $config -Name "beit3") { Resolve-AicSystemPath -Value ([string]$config.paths.beit3_runtime_python) } else { Join-Path $disabledRoot "beit3_python" }
$ppocrIndex = if (Test-AicFeatureEnabled -Config $config -Name "ppocr") { Resolve-AicSystemPath -Value ([string]$config.paths.ppocr_index) } else { Join-Path $disabledRoot "ppocr.sqlite" }
$monkeyOcrIndex = if (Test-AicFeatureEnabled -Config $config -Name "monkey_ocr") { Resolve-AicSystemPath -Value ([string]$config.paths.monkey_ocr_index) } else { Join-Path $disabledRoot "monkey_ocr.sqlite" }
$asrIndex = if (Test-AicFeatureEnabled -Config $config -Name "asr") { Resolve-AicSystemPath -Value ([string]$config.paths.asr_index) } else { Join-Path $disabledRoot "asr.sqlite" }
$modelName = if ([string]::IsNullOrWhiteSpace([string]$config.paths.metaclip_model_dir)) { [string]$config.backend.model_name } else { Resolve-AicSystemPath -Value ([string]$config.paths.metaclip_model_dir) }

$arguments = @(
    "-u", "-m", "app.lazy_server",
    "--records-db", (Resolve-AicSystemPath -Value ([string]$config.paths.records_db)),
    "--video-ranges", (Resolve-AicSystemPath -Value ([string]$config.paths.video_ranges)),
    "--embeddings", (Resolve-AicSystemPath -Value ([string]$config.paths.metaclip_embeddings)),
    "--beit3-embeddings", $beit3Embeddings,
    "--beit3-checkpoint", $beit3Checkpoint,
    "--beit3-sentencepiece", $beit3Sentencepiece,
    "--beit3-runtime-python", $beit3RuntimePython,
    "--beit3-max-text-length", [string]$config.backend.beit3_max_text_length,
    "--config", (Resolve-AicSystemPath -Value ([string]$config.paths.index_config)),
    "--ocr-index", $ppocrIndex,
    "--monkey-ocr-index", $monkeyOcrIndex,
    "--asr-index", $asrIndex,
    "--excluded-rows", (Resolve-AicSystemPath -Value ([string]$config.paths.excluded_rows)),
    "--storage-backend", [string]$config.backend.storage_backend,
    "--milvus-host", [string]$config.backend.milvus_host,
    "--milvus-port", [string]$config.backend.milvus_port,
    "--milvus-collection", [string]$config.backend.milvus_collection,
    "--beit3-milvus-collection", [string]$config.backend.beit3_milvus_collection,
    "--host", [string]$config.backend.host,
    "--port", [string]$config.backend.port,
    "--backend", [string]$config.backend.search_backend,
    "--device", [string]$config.backend.device,
    "--gpu-dtype", [string]$config.backend.gpu_dtype,
    "--model-name", $modelName,
    "--metaclip-weight", [string]$config.backend.metaclip_weight,
    "--ocr-weight", [string]$config.backend.ocr_weight,
    "--asr-weight", [string]$config.backend.asr_weight,
    "--temporal-stage1-top-k", [string]$config.backend.temporal_stage1_top_k,
    "--temporal-local-top-k", [string]$config.backend.temporal_local_top_k,
    "--temporal-stage2-keep-k", [string]$config.backend.temporal_stage2_keep_k,
    "--temporal-output-top-k", [string]$config.backend.temporal_output_top_k,
    "--temporal-window-ms", [string]$config.backend.temporal_window_ms,
    "--temporal-session-ttl-seconds", [string]$config.backend.temporal_session_ttl_seconds,
    "--temporal-max-sessions", [string]$config.backend.temporal_max_sessions
)
if ([bool]$config.backend.local_files_only) { $arguments += "--local-files-only" }
if ([bool]$config.backend.lazy_load) { $arguments += "--lazy-load" }
if ([bool]$config.backend.nginx_accel_redirect) { $arguments += "--nginx-accel-redirect" }
if (Test-AicFeatureEnabled -Config $config -Name "temporal_search") { $arguments += "--enable-temporal-search" }

Write-Host "============================================================" -ForegroundColor Green
Write-Host " AIC2026 Backend: http://$($config.backend.host):$($config.backend.port)" -ForegroundColor Green
Write-Host " Keyframes:  $env:AIC_KEYFRAMES_ROOT" -ForegroundColor Cyan
Write-Host " Thumbnails: $env:AIC_THUMBNAILS_ROOT" -ForegroundColor Cyan
Write-Host " Model:  $modelName" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green

Push-Location (Join-Path $PSScriptRoot "backend")
try {
    & $python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
