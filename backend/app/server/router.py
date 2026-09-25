"""
==============================================================================
TỆP TIN: backend/app/server/router.py
LỚP: Router
MÔ TẢ:
    Bộ định tuyến yêu cầu HTTP (Request Router):
    - Ánh xạ đường dẫn URL và phương thức HTTP (GET, POST) tới Controller thích hợp.
    - Hỗ trợ các đường dẫn tĩnh (/health, /search) và đường dẫn động theo prefix
      (/thumbnail/, /frame-text/, /keyframe-webp/).
==============================================================================
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from ..controllers.base_controller import json_response, parse_json_body
from ..controllers.health_controller import HealthController
from ..controllers.media_controller import MediaController
from ..controllers.search_controller import SearchController
from ..controllers.temporal_controller import TemporalController


class Router:
    """Bộ điều hướng URL đến các Controller tương ứng."""

    def __init__(
        self,
        health_controller: HealthController,
        media_controller: MediaController,
        search_controller: SearchController,
        temporal_controller: TemporalController,
    ):
        self.health_controller = health_controller
        self.media_controller = media_controller
        self.search_controller = search_controller
        self.temporal_controller = temporal_controller

    def route_get(self, handler: BaseHTTPRequestHandler) -> None:
        """Xử lý điều hướng các yêu cầu HTTP GET."""
        parsed = urlparse(handler.path)
        path = parsed.path

        if path == "/health":
            self.health_controller.handle_health(handler)
            return

        if path.startswith("/frame-text/"):
            keyframe_id = path[len("/frame-text/"):].strip()
            self.media_controller.handle_frame_text(handler, keyframe_id)
            return

        for prefix in ("/thumbnail/", "/keyframe-webp/", "/keyframe/"):
            if path.startswith(prefix):
                keyframe_id = path.rsplit("/", 1)[-1]
                self.media_controller.handle_image(handler, prefix, keyframe_id)
                return

        json_response(handler, 404, {"detail": "not found"})

    def route_post(self, handler: BaseHTTPRequestHandler) -> None:
        """Xử lý điều hướng các yêu cầu HTTP POST."""
        parsed = urlparse(handler.path)
        path = parsed.path

        if path not in {"/search", "/temporal-search"}:
            json_response(handler, 404, {"detail": "not found"})
            return

        try:
            body = parse_json_body(handler)
        except Exception as exc:
            json_response(handler, 400, {"detail": str(exc)})
            return

        if path == "/temporal-search":
            self.temporal_controller.handle_temporal_search(handler, body)
            return

        if path == "/search":
            self.search_controller.handle_search(handler, body)
            return
