# Start AIC2026 Backend Server
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\backend"


python -u -m app.lazy_server `
  --records-db "artifacts/current_index/records.sqlite" `
  --video-ranges "artifacts/current_index/video_ranges.json" `
  --embeddings "embeddings.npy" `
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
