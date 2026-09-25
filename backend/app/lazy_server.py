"""
==============================================================================
TỆP TIN: backend/app/lazy_server.py
MÔ TẢ:
    Tệp tin điều phối trung tâm (Main Orchestrator Entrypoint) cho Backend:
    - Tiếp nhận các cờ dòng lệnh CLI từ run_backend.sh qua CliParser.
    - Khởi tạo AppRuntime / LazyRuntime nạp mô hình AI (MetaCLIP-2, BEiT-3, OCR, ASR).
    - Khởi tạo Service Layer (SearchPipelineService) và tầng Controllers.
    - Đăng ký các tuyến đường vào Router và khởi chạy máy chủ BackendHttpServer.
    - Bảo toàn 100% khả năng tương thích ngược của tất cả hàm và cờ CLI.
==============================================================================
"""

from __future__ import annotations

import os

from .core.cli import CliParser
from .core.logging import uvicorn_log
from .core.runtime import AppRuntime, LazyRuntime, Runtime
from .controllers.base_controller import file_response, json_response
from .controllers.health_controller import HealthController
from .controllers.media_controller import MediaController
from .controllers.search_controller import SearchController
from .controllers.temporal_controller import TemporalController
from .server.http_server import BackendHttpServer, create_request_handler
from .server.router import Router
from .services.search_service import SearchPipelineService

# Tương thích ngược với các lệnh gọi parse_args cũ
parse_args = CliParser.parse_args


def make_handler(runtime: AppRuntime):
    """Tạo request handler kết nối với router và runtime (tương thích ngược)."""
    search_service = SearchPipelineService(runtime)
    health_controller = HealthController(runtime)
    media_controller = MediaController(runtime)
    search_controller = SearchController(runtime, search_service)
    temporal_controller = TemporalController(runtime)
    router = Router(
        health_controller=health_controller,
        media_controller=media_controller,
        search_controller=search_controller,
        temporal_controller=temporal_controller,
    )
    return create_request_handler(router)


def main() -> int:
    args = parse_args()
    if args.proctitle:
        try:
            import setproctitle
            setproctitle.setproctitle(args.proctitle)
        except Exception:
            pass

    print("=" * 60, flush=True)
    print("  AIC2026 Backend Runtime (Torch-GPU / CUDA) - Modular OOP", flush=True)
    print("=" * 60, flush=True)

    runtime = LazyRuntime(args) if args.lazy_load else AppRuntime(args)
    search_service = SearchPipelineService(runtime)
    health_controller = HealthController(runtime)
    media_controller = MediaController(runtime)
    search_controller = SearchController(runtime, search_service)
    temporal_controller = TemporalController(runtime)

    router = Router(
        health_controller=health_controller,
        media_controller=media_controller,
        search_controller=search_controller,
        temporal_controller=temporal_controller,
    )

    server = BackendHttpServer(args.host, args.port, router)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        uvicorn_log("INFO", "Shutting down server...")
        server.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
