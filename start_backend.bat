@echo off
setlocal
cd /d "%~dp0backend"

set "BEIT3_EMBEDDINGS=%~dp0merged_beit3_large_numeric\embeddings.npy"
set "BEIT3_RUNTIME=%~dp0beit3_runtime"
set "BEIT3_CHECKPOINT=%BEIT3_RUNTIME%\beit3_large_itc_patch16_224.pth"
set "BEIT3_SENTENCEPIECE=%BEIT3_RUNTIME%\beit3.spm"
set "BEIT3_PYTHON=%BEIT3_RUNTIME%\python"

echo ============================================================
echo   Starting AIC2026 Backend (Torch-GPU / CUDA:8036)...
echo ============================================================

python -u -m app.lazy_server ^
  --records-db "artifacts/current_index/records.sqlite" ^
  --video-ranges "artifacts/current_index/video_ranges.json" ^
  --embeddings "embeddings.npy" ^
  --beit3-embeddings "%BEIT3_EMBEDDINGS%" ^
  --beit3-checkpoint "%BEIT3_CHECKPOINT%" ^
  --beit3-sentencepiece "%BEIT3_SENTENCEPIECE%" ^
  --beit3-runtime-python "%BEIT3_PYTHON%" ^
  --config "artifacts/current_index/index_config.json" ^
  --asr-index "artifacts/asr_index/asr.sqlite" ^
  --ocr-index "artifacts/current_index/monkey_ocr.sqlite" ^
  --monkey-ocr-index "artifacts/current_index/monkey_ocr.sqlite" ^
  --host 127.0.0.1 ^
  --port 8036 ^
  --storage-backend file ^
  --backend torch-gpu ^
  --device cuda ^
  --gpu-dtype float16 ^
  --model-name "facebook/metaclip-2-worldwide-b16-384" ^
  --enable-temporal-search ^
  --proctitle "aic_system"

pause
