"""
==============================================================================
TỆP TIN: backend/app/controllers/media_controller.py
LỚP: MediaController
MÔ TẢ:
    Điều khiển các endpoint liên quan đến dữ liệu đa phương tiện (Media & Text Info):
    - GET /frame-text/{keyframe_id}: Truy xuất văn bản OCR và lời thoại ASR của một frame.
    - GET /thumbnail/{keyframe_id}: Phục vụ ảnh thumbnail thu nhỏ (WebP/JPEG).
    - GET /keyframe-webp/{keyframe_id} & /keyframe/{keyframe_id}: Phục vụ khung hình đầy đủ.
==============================================================================
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from .base_controller import BaseController, file_response, json_response
from ..config import WEBP_FRAMES_ROOT, WEBP_THUMBNAILS_ROOT


class MediaController(BaseController):
    """Xử lý các request liên quan đến hình ảnh và metadata frame."""

    def handle_frame_text(self, handler: BaseHTTPRequestHandler, keyframe_id: str) -> None:
        """Lấy thông tin chi tiết OCR và ASR của một frame theo keyframe_id."""
        if not self.runtime.ready:
            json_response(handler, 503, {"detail": f"backend is still loading ({self.runtime.stage})"})
            return

        unquoted_id = unquote(keyframe_id.strip())
        rec = self.runtime.state.metadata.get_by_keyframe_id(unquoted_id)
        if rec is None:
            json_response(handler, 404, {"detail": "unknown keyframe_id"})
            return

        row_id = rec.get("row_id")
        video_id = str(rec.get("video_id") or "")
        shot_id = rec.get("shot_id")
        timestamp_ms = int(rec.get("timestamp_ms", 0) or 0)
        image_file = str(rec.get("image_file") or "")

        ocr_info = None
        active_ocr_index = self.runtime.monkey_ocr_index or self.runtime.ocr_index
        if active_ocr_index is not None:
            ocr_info = active_ocr_index.get_frame_ocr(row_id=row_id, keyframe_id=unquoted_id)

        asr_info = None
        if self.runtime.asr_index is not None:
            asr_info = self.runtime.asr_index.get_frame_asr(
                video_id=video_id,
                timestamp_ms=timestamp_ms,
                keyframe_id=unquoted_id,
            )

        response_data = {
            "keyframe_id": unquoted_id,
            "video_id": video_id,
            "shot_id": shot_id,
            "timestamp_ms": timestamp_ms,
            "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
            "image_file": image_file,
            "ocr_text": ocr_info["ocr_text"] if ocr_info else "",
            "ocr_avg_confidence": ocr_info["avg_confidence"] if ocr_info else 0.0,
            "ocr_max_confidence": ocr_info["max_confidence"] if ocr_info else 0.0,
            "ocr_line_count": ocr_info["line_count"] if ocr_info else 0,
            "asr_text": asr_info["asr_text"] if asr_info else "",
            "asr_start_ms": asr_info["start_ms"] if asr_info else None,
            "asr_end_ms": asr_info["end_ms"] if asr_info else None,
            "asr_start_seconds": round(asr_info["start_ms"] / 1000.0, 3) if asr_info and asr_info["start_ms"] is not None else None,
            "asr_end_seconds": round(asr_info["end_ms"] / 1000.0, 3) if asr_info and asr_info["end_ms"] is not None else None,
        }
        json_response(handler, 200, response_data)

    def handle_image(self, handler: BaseHTTPRequestHandler, route_prefix: str, keyframe_id: str) -> None:
        """Phục vụ file ảnh nhị phân tương ứng với keyframe_id."""
        if not self.runtime.ready:
            json_response(handler, 503, {"detail": f"backend is still loading ({self.runtime.stage})"})
            return

        unquoted_id = unquote(keyframe_id.strip())
        rec = self.runtime.state.metadata.get_by_keyframe_id(unquoted_id)
        if rec is None:
            json_response(handler, 404, {"detail": "unknown keyframe_id"})
            return

        root = WEBP_THUMBNAILS_ROOT if route_prefix == "/thumbnail/" else WEBP_FRAMES_ROOT
        video_id = str(rec["video_id"])
        image_file_name = Path(str(rec["image_file"]))
        path = root / video_id / image_file_name.with_suffix(".webp").name
        if not path.is_file():
            path = root / video_id / image_file_name.with_suffix(".jpg").name
        if not path.is_file():
            path = root / video_id / image_file_name.name

        file_response(handler, path, accel_redirect=self.runtime.args.nginx_accel_redirect)
