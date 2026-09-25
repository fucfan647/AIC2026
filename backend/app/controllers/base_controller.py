"""
==============================================================================
TỆP TIN: backend/app/controllers/base_controller.py
LỚP: BaseController
MÔ TẢ:
    Lớp điều khiển cơ sở cung cấp các hàm trợ giúp (helpers) cho giao tiếp HTTP:
    - json_response: Tuần tự hóa dictionary thành JSON và gửi mã phản hồi HTTP.
    - file_response: Truyền tải file ảnh tĩnh (JPEG/WebP) hỗ trợ X-Accel-Redirect.
    - parse_json_body: Đọc và giải mã dữ liệu JSON từ request body an toàn.
==============================================================================
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Dict

from ..config import WEBP_FRAMES_ROOT
from ..core.exceptions import BadRequestError


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    """Gửi phản hồi JSON về client."""
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def file_response(handler: BaseHTTPRequestHandler, path: Path, *, accel_redirect: bool = False) -> None:
    """Truyền file nhị phân (ảnh) về client qua chunking 1MB."""
    if not path.is_file():
        json_response(handler, 404, {"detail": f"file not found: {path}"})
        return
    content_type = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/webp"
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(path.stat().st_size))
    if accel_redirect:
        try:
            relative_path = path.relative_to(WEBP_FRAMES_ROOT)
            handler.send_header("X-Accel-Redirect", f"/_protected_webp/{relative_path.as_posix()}")
            handler.end_headers()
            return
        except ValueError:
            pass
    handler.end_headers()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            handler.wfile.write(chunk)


def parse_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    """Đọc và giải mã JSON payload từ luồng rfile của handler."""
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length <= 0:
        return {}
    try:
        raw_data = handler.rfile.read(length).decode("utf-8")
        return json.loads(raw_data)
    except Exception as exc:
        raise BadRequestError(f"invalid JSON body: {exc}")


class BaseController:
    """Lớp Controller cơ sở."""
    def __init__(self, runtime: Any):
        self.runtime = runtime
