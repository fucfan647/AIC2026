"""
==============================================================================
TỆP TIN: backend/app/core/cli.py
LỚP: CliParser
MÔ TẢ:
    Quản lý việc phân tích các tham số và cờ dòng lệnh CLI (Command Line Arguments):
    - Đảm bảo tương thích 100% với tất cả các cờ hiện tại được truyền từ run_backend.sh.
    - Cung cấp giá trị mặc định cho đường dẫn Database, Model, Port, GPU và Trọng số.
==============================================================================
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


class CliParser:
    """Bộ phân tích tham số dòng lệnh cho hệ thống Backend."""

    @staticmethod
    def create_parser() -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(description="Lazy synthetic MetaCLIP-2 retrieval server.")
        parser.add_argument("--records-db", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/current_index/records.sqlite")
        parser.add_argument("--video-ranges", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/current_index/video_ranges.json")
        parser.add_argument("--embeddings", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/merged_metaclip2_numeric/embeddings.npy")
        parser.add_argument("--beit3-embeddings", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/merged_beit3_large_numeric/embeddings.npy")
        parser.add_argument("--beit3-runtime-python", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/hf_cache_metaclip2/hub/beit3_runtime/python")
        parser.add_argument("--beit3-checkpoint", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/hf_cache_metaclip2/hub/beit3_runtime/beit3_large_itc_patch16_224.pth")
        parser.add_argument("--beit3-sentencepiece", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/hf_cache_metaclip2/hub/beit3_runtime/beit3.spm")
        parser.add_argument("--beit3-max-text-length", type=int, default=64)
        parser.add_argument("--config", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/current_index/index_config.json")
        parser.add_argument("--ocr-index", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/current_index/ocr.sqlite")
        parser.add_argument("--monkey-ocr-index", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/current_index/monkey_ocr_partial.sqlite")
        parser.add_argument("--asr-index", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend/artifacts/asr_index/asr.sqlite")
        parser.add_argument("--excluded-rows", type=Path, default="/GuestShare_NAS/WorkingSpace/Personal/nghiadq/frames_deleted/moved_frame_rows.npy")
        parser.add_argument("--storage-backend", choices=["milvus", "file"], default="milvus")
        parser.add_argument("--milvus-host", default="127.0.0.1")
        parser.add_argument("--milvus-port", type=int, default=19533)
        parser.add_argument("--milvus-collection", default="synthetic_metaclip2_backend_store_v1")
        parser.add_argument("--beit3-milvus-collection", default="synthetic_beit3_large_backend_store_v1")
        parser.add_argument("--host", default="0.0.0.0")
        parser.add_argument("--port", type=int, default=8026)
        parser.add_argument("--backend", choices=["linear", "torch-gpu"], default="torch-gpu")
        parser.add_argument("--device", default="cuda")
        parser.add_argument("--gpu-dtype", choices=["float16", "float32"], default="float16")
        parser.add_argument("--model-name", default="facebook/metaclip-2-worldwide-b16-384")
        parser.add_argument("--local-files-only", action="store_true")
        parser.add_argument("--metaclip-weight", type=float, default=0.59)
        parser.add_argument("--ocr-weight", type=float, default=0.41)
        parser.add_argument("--asr-weight", type=float, default=0.0)
        parser.add_argument("--enable-temporal-search", action="store_true")
        parser.add_argument("--temporal-stage1-top-k", type=int, default=200)
        parser.add_argument("--temporal-local-top-k", type=int, default=200)
        parser.add_argument("--temporal-stage2-keep-k", type=int, default=200)
        parser.add_argument("--temporal-output-top-k", type=int, default=200)
        parser.add_argument("--temporal-window-ms", type=int, default=300000)
        parser.add_argument("--temporal-session-ttl-seconds", type=int, default=1800)
        parser.add_argument("--temporal-max-sessions", type=int, default=64)
        parser.add_argument("--lazy-load", action="store_true")
        parser.add_argument(
            "--nginx-accel-redirect",
            action="store_true",
            help="Let Nginx serve validated WebP files through X-Accel-Redirect.",
        )
        parser.add_argument(
            "--proctitle",
            type=str,
            default=os.getenv("PROC_TITLE", "aic_system"),
            help="Process title shown in ps/nvitop",
        )
        return parser

    @classmethod
    def parse_args(cls, args=None) -> argparse.Namespace:
        """Phân tích danh sách đối số truyền vào hoặc lấy từ sys.argv."""
        parser = cls.create_parser()
        return parser.parse_args(args)
