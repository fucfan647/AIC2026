#!/usr/bin/env bash
# ==============================================================================
#  AIC 2026 - Run Backend Engine on Server
#  Process Title on nvitop / nvidia-smi: aic_system
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

cd "$BACKEND_DIR"

# 1. Select Python Interpreter
if [ -n "$PYTHON" ]; then
    PY_BIN="$PYTHON"
elif [ -x "/home/nghiadq/miniconda3/envs/metaclip2/bin/python" ]; then
    # Local-disk runtime avoids slow and unstable imports from the NAS env.
    PY_BIN="/home/nghiadq/miniconda3/envs/metaclip2/bin/python"
elif [ -f "/GuestShare_NAS/WorkingSpace/Personal/nghiadq/miniconda3/envs/sal/bin/python" ]; then
    PY_BIN="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/miniconda3/envs/sal/bin/python"
elif [ -f "$BACKEND_DIR/.venv/bin/python" ]; then
    PY_BIN="$BACKEND_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PY_BIN="$(command -v python3)"
else
    PY_BIN="python"
fi

# 2. Configure GPU Device (Default GPU 0, override via GPU_ID or CUDA_VISIBLE_DEVICES)
GPU_ID="${GPU_ID:-2}"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-$GPU_ID}"

# 3. Configure Network Host & Port
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8036}"

# 4. Process Name Mask for nvitop & nvidia-smi
export PROC_TITLE="${PROC_TITLE:-aic_system}"
export AIC_KEYFRAMES_ROOT="${AIC_KEYFRAMES_ROOT:-/GuestShare_NAS/WorkingSpace/Personal/nghiadq/synthetic_frames}"

# 5. Model & Index Artifact Paths
RECORDS_DB="artifacts/current_index/records.sqlite"
VIDEO_RANGES="artifacts/current_index/video_ranges.json"
EMBEDDINGS="embeddings.npy"
CONFIG_JSON="artifacts/current_index/index_config.json"
ASR_INDEX="artifacts/asr_index/asr.sqlite"
PPOCR_INDEX="artifacts/current_index/paddle_ocr.sqlite"
MONKEY_OCR_INDEX="artifacts/current_index/monkey_ocr.sqlite"

BEIT3_DIR="$SCRIPT_DIR/merged_beit3_large_numeric"
BEIT3_RUNTIME="$SCRIPT_DIR/beit3_runtime"
BEIT3_EMBEDDINGS="$BEIT3_DIR/embeddings.npy"
BEIT3_CHECKPOINT="$BEIT3_RUNTIME/beit3_large_itc_patch16_224.pth"
BEIT3_SPM="$BEIT3_RUNTIME/beit3.spm"
BEIT3_PYTHON="$BEIT3_RUNTIME/python"

echo "============================================================"
echo "  Starting AIC2026 Backend on Server..."
echo "  Python:       $PY_BIN"
echo "  GPU:          CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
echo "  Address:      http://$HOST:$PORT"
echo "  nvitop Title: $PROC_TITLE"
echo "============================================================"

# Check BEiT-3 availability
BEIT3_ARGS=()
if [ -f "$BEIT3_EMBEDDINGS" ] && [ -f "$BEIT3_CHECKPOINT" ]; then
    echo "[+] BEiT-3 artifacts detected."
    BEIT3_ARGS=(
        --beit3-embeddings "$BEIT3_EMBEDDINGS"
        --beit3-checkpoint "$BEIT3_CHECKPOINT"
        --beit3-sentencepiece "$BEIT3_SPM"
        --beit3-runtime-python "$BEIT3_PYTHON"
    )
else
    echo "[-] BEiT-3 artifacts not found or incomplete, skipping BEiT-3."
fi

# Run with exec -a so OS process table and nvitop immediately name it 'aic_system'
exec -a "$PROC_TITLE" "$PY_BIN" -u -m app.lazy_server \
  --records-db "$RECORDS_DB" \
  --video-ranges "$VIDEO_RANGES" \
  --embeddings "$EMBEDDINGS" \
  "${BEIT3_ARGS[@]}" \
  --config "$CONFIG_JSON" \
  --asr-index "$ASR_INDEX" \
  --ocr-index "$PPOCR_INDEX" \
  --monkey-ocr-index "$MONKEY_OCR_INDEX" \
  --host "$HOST" \
  --port "$PORT" \
  --storage-backend file \
  --backend torch-gpu \
  --device cuda \
  --gpu-dtype float16 \
  --model-name "facebook/metaclip-2-worldwide-b16-384" \
  --enable-temporal-search \
  --proctitle "$PROC_TITLE"
