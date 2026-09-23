"""
==============================================================================
TỆP TIN: backend/app/controllers/health_controller.py
LỚP: HealthController
MÔ TẢ:
    Điều khiển endpoint kiểm tra tình trạng hệ thống:
    - GET /health: Cung cấp đầy đủ thông tin về uptime, trạng thái nạp model,
      số lượng vector, trạng thái VRAM GPU và cấu hình trọng số mặc định.
==============================================================================
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from typing import Any

from .base_controller import BaseController, json_response


class HealthController(BaseController):
    """Xử lý các truy vấn kiểm tra sức khỏe của Backend."""

    def handle_health(self, handler: BaseHTTPRequestHandler) -> None:
        """Trả về trạng thái sức khỏe và siêu dữ liệu chỉ mục của hệ thống."""
        payload = self.runtime.get_health_payload()
        json_response(handler, 200, payload)
