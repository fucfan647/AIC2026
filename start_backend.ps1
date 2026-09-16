# Start AIC2026 Backend Server
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\backend"

$Beit3Embeddings = "$ScriptDir\merged_beit3_large_numeric\embeddings.npy"
$Beit3Runtime = "$ScriptDir\beit3_runtime"
$Beit3Checkpoint = "$Beit3Runtime\beit3_large_itc_patch16_224.pth"
$Beit3Sentencepiece = "$Beit3Runtime\beit3.spm"
$Beit3Python = "$Beit3Runtime\python"

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Starting AIC2026 Backend (Torch-GPU / CUDA:8036)..." -ForegroundColor Green
Write-Host "  MetaCLIP-2 Embeddings: embeddings.npy" -ForegroundColor Cyan
if (Test-Path $Beit3Embeddings) {
    Write-Host "  BEiT-3 Embeddings:     $Beit3Embeddings (FOUND)" -ForegroundColor Green
} else {
    Write-Host "  BEiT-3 Embeddings:     $Beit3Embeddings (NOT FOUND)" -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Green

python -u -m app.lazy_server `
  --records-db "artifacts/current_index/records.sqlite" `
  --video-ranges "artifacts/current_index/video_ranges.json" `
  --embeddings "embeddings.npy" `
  --beit3-embeddings "$Beit3Embeddings" `
  --beit3-checkpoint "$Beit3Checkpoint" `
  --beit3-sentencepiece "$Beit3Sentencepiece" `
  --beit3-runtime-python "$Beit3Python" `
  --config "artifacts/current_index/index_config.json" `
  --asr-index "artifacts/asr_index/asr.sqlite" `
  --ocr-index "artifacts/current_index/monkey_ocr.sqlite" `
  --monkey-ocr-index "artifacts/current_index/monkey_ocr.sqlite" `
  --host 127.0.0.1 `
  --port 8036 `
  --storage-backend file `
  --backend torch-gpu `
  --device cuda `
  --gpu-dtype float16 `
  --model-name "facebook/metaclip-2-worldwide-b16-384" `
  --enable-temporal-search

