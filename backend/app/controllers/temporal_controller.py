"""
==============================================================================
TỆP TIN: backend/app/controllers/temporal_controller.py
LỚP: TemporalController
MÔ TẢ:
    Điều khiển endpoint tìm kiếm chuỗi hành động theo thời gian:
    - POST /temporal-search: Nhận diện và xử lý các hành động start, continue,
      replace, reset theo từng chặng (stages) và quản lý session phiên làm việc.
==============================================================================
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from typing import Any, Dict

from .base_controller import BaseController, json_response
from ..temporal_search import TemporalSearchError


class TemporalController(BaseController):
    """Xử lý yêu cầu tìm kiếm chuỗi thời gian Temporal Search."""

    def handle_temporal_search(self, handler: BaseHTTPRequestHandler, request_body: Dict[str, Any]) -> None:
        """Thực thi tìm kiếm chuỗi hành động qua TemporalSearchService."""
        if not self.runtime.ready:
            json_response(handler, 503, {"detail": f"backend is still loading ({self.runtime.stage})"})
            return

        if self.runtime.temporal_service is None:
            detail = (
                "temporal search is disabled"
                if not self.runtime.args.enable_temporal_search
                else self.runtime.temporal_error or "temporal search is unavailable"
            )
            json_response(handler, 503, {"detail": detail})
            return

        try:
            result = self.runtime.temporal_service.handle(request_body)
            json_response(handler, 200, result)
        except TemporalSearchError as exc:
            json_response(handler, exc.status_code, {"detail": str(exc)})
        except Exception as exc:
            json_response(handler, 500, {"detail": f"temporal search failed: {exc}"})
