#!/usr/bin/env bash
# ==============================================================================
#  AIC 2026 - Run Frontend Gateway on Server
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

cd "$FRONTEND_DIR"

if [ -n "$PYTHON" ]; then
    PY_BIN="$PYTHON"
elif [ -f "/GuestShare_NAS/WorkingSpace/Personal/nghiadq/miniconda3/envs/sal/bin/python" ]; then
    PY_BIN="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/miniconda3/envs/sal/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PY_BIN="$(command -v python3)"
else
    PY_BIN="python"
fi

HOST="${FRONTEND_HOST:-0.0.0.0}"
PORT="${FRONTEND_PORT:-8080}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8036}"
HLS_SERVER_URL="${HLS_SERVER_URL:-http://127.0.0.1:8052}"

echo "============================================================"
echo "  Starting AIC2026 Frontend Gateway..."
echo "  Python:      $PY_BIN"
echo "  Address:     http://$HOST:$PORT"
echo "  Backend URL: $BACKEND_URL"
echo "============================================================"

exec "$PY_BIN" -u serve_frontend.py \
  --host "$HOST" \
  --port "$PORT" \
  --backend-url "$BACKEND_URL" \
  --hls-server-url "$HLS_SERVER_URL" \
  --deleted-manifest "../backend/artifacts/current_index/active_deleted_manifest.jsonl"
