"""
==============================================================================
TỆP TIN: backend/app/server/http_server.py
LỚP: BackendHttpServer
MÔ TẢ:
    Quản lý hạ tầng mạng máy chủ HTTP (Threading HTTP Server):
    - Đóng gói ThreadingHTTPServer của Python để xử lý đồng thời nhiều kết nối.
    - Cung cấp Handler với cơ chế ghi log chuẩn Uvicorn kèm tính toán độ trễ request.
    - Khởi chạy và đóng cổng dịch vụ an toàn.
==============================================================================
"""

from __future__ import annotations

import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Type

from .router import Router
from ..core.logging import C_BOLD, C_GREEN, C_RED, C_RESET, C_YELLOW, uvicorn_log


def create_request_handler(router: Router) -> Type[BaseHTTPRequestHandler]:
    """Tạo lớp RequestHandler được gắn với bộ định tuyến Router."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            msg = fmt % args
            parts = msg.split('"')
            client_ip = self.client_address[0]
            client_port = self.client_address[1] if len(self.client_address) > 1 else ""
            client_str = f"{client_ip}:{client_port}" if client_port else client_ip
            if len(parts) >= 3:
                req_line = parts[1]
                rest = parts[2].strip().split()
                status_code = int(rest[0]) if rest and rest[0].isdigit() else 200
                latency_str = ""
                if hasattr(self, "_start_time"):
                    duration_ms = (time.perf_counter() - self._start_time) * 1000.0
                    latency_str = f" - {duration_ms:.1f}ms"
                if 200 <= status_code < 300:
                    status_text = f"{C_GREEN}{status_code} OK{C_RESET}" if status_code == 200 else f"{C_GREEN}{status_code}{C_RESET}"
                    level = "INFO"
                elif 300 <= status_code < 400:
                    status_text = f"{C_YELLOW}{status_code}{C_RESET}"
                    level = "INFO"
                elif status_code == 404:
                    status_text = f"{C_RED}404 Not Found{C_RESET}"
                    level = "WARNING"
                else:
                    status_text = f"{C_RED}{status_code}{C_RESET}"
                    level = "ERROR" if status_code >= 500 else "WARNING"
                uvicorn_log(level, f"{client_str} - {C_BOLD}\"{req_line}\"{C_RESET} {status_text}{latency_str}")
            else:
                uvicorn_log("INFO", f"{client_str} - {msg}")

        def do_GET(self):
            self._start_time = time.perf_counter()
            router.route_get(self)

        def do_POST(self):
            self._start_time = time.perf_counter()
            router.route_post(self)

    return Handler


class BackendHttpServer:
    """Máy chủ HTTP đa luồng cho Backend."""

    def __init__(self, host: str, port: int, router: Router):
        self.host = host
        self.port = port
        self.router = router
        handler_cls = create_request_handler(router)
        self.server = ThreadingHTTPServer((host, port), handler_cls)

    def serve_forever(self) -> None:
        """Bắt đầu lắng nghe và phục vụ các kết nối HTTP."""
        uvicorn_log("INFO", f"Uvicorn running on http://{self.host}:{self.port} (Press CTRL+C to quit)")
        self.server.serve_forever()

    def shutdown(self) -> None:
        """Đóng máy chủ."""
        self.server.shutdown()
        self.server.server_close()
