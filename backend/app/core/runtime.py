"""
==============================================================================
TỆP TIN: backend/app/core/runtime.py
LỚP: AppRuntime, LazyRuntime
MÔ TẢ:
    Quản lý vòng đời (Lifecycle) và trạng thái nạp của toàn bộ mô hình AI và Chỉ mục:
    - Nạp MetaCLIP-2, BEiT-3, PP-OCR, MonkeyOCR và ASR Text Index.
    - Khởi tạo RetrievalState và quản lý phân bổ bộ nhớ GPU (PyTorch FP16).
    - Tạo bảng báo cáo số liệu sức khỏe hệ thống (Health Metrics) chi tiết cho endpoint /health.
    - Hỗ trợ Lazy Loading đa luồng (LazyRuntime) để khởi động server không bị nghẽn mạng.
==============================================================================
"""

from __future__ import annotations

import argparse
import threading
import time
from typing import Any, Dict

import numpy as np

from .logging import uvicorn_log


class AppRuntime:
    """Lớp quản lý vòng đời và tài nguyên tính toán của Backend."""

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.status = "loading"
        self.stage = "starting"
        self.error = None
        self.state = None
        self.embedder = None
        self.beit3_state = None
        self.beit3_embedder = None
        self.beit3_error = None
        self.ocr_index = None
        self.monkey_ocr_index = None
        self.ocr_indexes: Dict[str, Any] = {}
        self.asr_index = None
        self.fuse_ranked_results = None
        self.fuse_with_asr = None
        self.temporal_service = None
        self.temporal_error = None
        self.started_at = time.time()
        self.excluded_indices = np.zeros((0,), dtype=np.int64)
        self._load()

    def _load(self):
        """Thực hiện tuần tự việc tải và khởi tạo các tài nguyên AI."""
        try:
            self.stage = "importing"
            from ..embedder import Beit3Config, Beit3Embedder, MetaClip2Config, MetaClip2Embedder
            from ..asr import AsrTextIndex, fuse_with_asr
            from ..index import RetrievalState
            from ..ocr import OcrTextIndex, fuse_ranked_results
            from ..temporal_search import TemporalSearchService

            self.stage = "loading_model"
            self.embedder = MetaClip2Embedder(
                MetaClip2Config(
                    model_name=self.args.model_name,
                    device=self.args.device,
                    dtype="float16" if str(self.args.device).startswith("cuda") else "float32",
                    local_files_only=self.args.local_files_only,
                )
            )
            uvicorn_log("INFO", f"Loading MetaCLIP-2 on {self.args.device} ({self.args.gpu_dtype})... OK")
            self.stage = "loading_index"
            if self.args.excluded_rows.is_file():
                self.excluded_indices = np.asarray(np.load(self.args.excluded_rows), dtype=np.int64)
                if self.excluded_indices.ndim != 1 or len(np.unique(self.excluded_indices)) != len(self.excluded_indices):
                    raise ValueError("excluded rows must be a unique 1D array")
                uvicorn_log("INFO", f"Excluding {len(self.excluded_indices)} moved frames")
            self.state = RetrievalState(
                records_db=self.args.records_db,
                video_ranges_path=self.args.video_ranges,
                embeddings_path=self.args.embeddings,
                config_path=self.args.config,
                backend=self.args.backend,
                device=self.args.device,
                gpu_dtype=self.args.gpu_dtype,
                embedding_dim=512,
                excluded_indices=self.excluded_indices,
                milvus_host=self.args.milvus_host if self.args.storage_backend == "milvus" else None,
                milvus_port=self.args.milvus_port,
                milvus_collection=self.args.milvus_collection if self.args.storage_backend == "milvus" else None,
            )
            self.fuse_ranked_results = fuse_ranked_results
            self.fuse_with_asr = fuse_with_asr
            if self.args.ocr_index.is_file():
                self.stage = "loading_ocr_cache"
                self.ocr_index = OcrTextIndex(
                    self.args.ocr_index,
                    cache_in_memory=True,
                    excluded_indices=self.excluded_indices,
                )
                if self.ocr_index.num_records != self.state.index.num_vectors:
                    raise ValueError(
                        f"OCR/vector mismatch: {self.ocr_index.num_records} != {self.state.index.num_vectors}"
                    )
                self.ocr_indexes["ppocr"] = self.ocr_index
                uvicorn_log("INFO", f"Caching PP-OCRv6 index ({self.ocr_index.num_records:,} frame)... OK")
            if self.args.monkey_ocr_index.is_file():
                self.stage = "loading_monkey_ocr_cache"
                self.monkey_ocr_index = OcrTextIndex(
                    self.args.monkey_ocr_index,
                    cache_in_memory=True,
                    excluded_indices=self.excluded_indices,
                )
                if self.monkey_ocr_index.source_num_records != self.state.index.num_vectors:
                    raise ValueError(
                        "MonkeyOCR/vector source mismatch: "
                        f"{self.monkey_ocr_index.source_num_records} != {self.state.index.num_vectors}"
                    )
                if self.monkey_ocr_index.num_records > self.state.index.num_vectors:
                    raise ValueError(
                        f"MonkeyOCR has too many rows: {self.monkey_ocr_index.num_records}"
                    )
                self.ocr_indexes["monkey"] = self.monkey_ocr_index
                uvicorn_log("INFO", f"Caching MonkeyOCRv2 index ({self.monkey_ocr_index.num_records:,} frame)... OK")
            if self.args.asr_index.is_file():
                self.stage = "loading_asr_cache"
                self.asr_index = AsrTextIndex(
                    self.args.asr_index,
                    cache_in_memory=True,
                    excluded_indices=self.excluded_indices,
                )
                uvicorn_log("INFO", "Caching ASR text index... OK")
            beit3_requirements = (
                self.args.beit3_embeddings,
                self.args.beit3_runtime_python,
                self.args.beit3_checkpoint,
                self.args.beit3_sentencepiece,
            )
            missing = [str(path) for path in beit3_requirements if not path.exists()]
            if missing:
                self.beit3_error = "missing BEiT-3 runtime path(s): " + ", ".join(missing)
                print(f"[lazy] BEiT-3 unavailable: {self.beit3_error}", flush=True)
            else:
                try:
                    print("[lazy] loading BEiT-3 text model", flush=True)
                    self.stage = "loading_beit3_model"
                    self.beit3_embedder = Beit3Embedder(
                        Beit3Config(
                            runtime_python_path=self.args.beit3_runtime_python,
                            checkpoint=self.args.beit3_checkpoint,
                            sentencepiece_model=self.args.beit3_sentencepiece,
                            device=self.args.device,
                            max_text_length=self.args.beit3_max_text_length,
                        )
                    )
                    print("[lazy] loading BEiT-3 index", flush=True)
                    self.stage = "loading_beit3_index"
                    self.beit3_state = RetrievalState(
                        records_db=self.args.records_db,
                        video_ranges_path=self.args.video_ranges,
                        embeddings_path=self.args.beit3_embeddings,
                        config_path=self.args.config,
                        backend=self.args.backend,
                        device=self.args.device,
                        gpu_dtype=self.args.gpu_dtype,
                        embedding_dim=1024,
                        excluded_indices=self.excluded_indices,
                        milvus_host=(
                            self.args.milvus_host
                            if self.args.storage_backend == "milvus"
                            else None
                        ),
                        milvus_port=self.args.milvus_port,
                        milvus_collection=(
                            self.args.beit3_milvus_collection
                            if self.args.storage_backend == "milvus"
                            else None
                        ),
                    )
                    if self.beit3_state.index.num_vectors != self.state.index.num_vectors:
                        raise ValueError(
                            "BEiT-3/MetaCLIP vector count mismatch: "
                            f"{self.beit3_state.index.num_vectors} != {self.state.index.num_vectors}"
                        )
                except Exception as exc:
                    self.beit3_state = None
                    self.beit3_embedder = None
                    self.beit3_error = str(exc)
                    print(f"[lazy] BEiT-3 unavailable: {exc}", flush=True)
            if self.args.enable_temporal_search:
                print("[lazy] preparing temporal search", flush=True)
                self.stage = "loading_temporal_search"
                try:
                    temporal_states = {"metaclip": self.state}
                    temporal_embedders = {"metaclip": self.embedder}
                    if self.beit3_state is not None and self.beit3_embedder is not None:
                        temporal_states["beit3"] = self.beit3_state
                        temporal_embedders["beit3"] = self.beit3_embedder
                    self.temporal_service = TemporalSearchService(
                        temporal_states,
                        temporal_embedders,
                        self.excluded_indices,
                        ocr_index=self.monkey_ocr_index or self.ocr_index,
                        asr_index=self.asr_index,
                        fuse_ranked_results=self.fuse_ranked_results,
                        fuse_with_asr=self.fuse_with_asr,
                        stage1_top_k=self.args.temporal_stage1_top_k,
                        local_top_k=self.args.temporal_local_top_k,
                        stage2_keep_k=self.args.temporal_stage2_keep_k,
                        output_top_k=self.args.temporal_output_top_k,
                        window_ms=self.args.temporal_window_ms,
                        session_ttl_seconds=self.args.temporal_session_ttl_seconds,
                        max_sessions=self.args.temporal_max_sessions,
                    )
                except Exception as exc:
                    self.temporal_service = None
                    self.temporal_error = str(exc)
                    print(f"[lazy] temporal search unavailable: {exc}", flush=True)
            self.stage = "ready"
            self.status = "ok"
            uvicorn_log("INFO", "Application startup complete.")
        except Exception as exc:
            self.error = str(exc)
            self.status = "error"
            self.stage = "error"
            uvicorn_log("ERROR", f"Startup error: {exc}")

    @property
    def ready(self) -> bool:
        """Kiểm tra xem hệ thống đã sẵn sàng phục vụ tìm kiếm chưa."""
        return self.status == "ok" and self.state is not None and self.embedder is not None

    def get_health_payload(self) -> Dict[str, Any]:
        """Tạo từ điển dữ liệu phản hồi cho endpoint /health."""
        payload: Dict[str, Any] = {
            "status": self.status,
            "stage": self.stage,
            "error": self.error,
            "uptime_seconds": round(time.time() - self.started_at, 3),
        }
        if self.state is not None:
            payload.update(
                {
                    "records": int(self.state.config.get("num_metadata", self.state.index.num_vectors)),
                    "vectors": self.state.index.num_vectors,
                    "excluded_rows": len(self.excluded_indices),
                    "searchable_vectors": self.state.index.num_vectors - len(self.excluded_indices),
                    "embedding_shape": list(self.state.embeddings.shape),
                    "embedding_dtype": str(self.state.embeddings.dtype),
                    "search_backend": self.state.index.backend,
                    "gpu_dtype": getattr(self.state.index, "dtype_name", None),
                    "gpu_memory_mb": round(getattr(self.state.index, "memory_bytes", 0) / (1024 ** 2), 3),
                    "model_name": self.args.model_name,
                    "load_seconds": self.state.load_seconds,
                    "storage_backend": self.state.storage_backend,
                    "metadata_backend": self.state.metadata_backend,
                    "milvus_collection": self.state.milvus_collection,
                    "milvus_version": self.state.milvus_version,
                    "milvus_load_seconds": self.state.milvus_load_seconds,
                    "milvus_in_search_path": False,
                    "temporal_search_enabled": self.args.enable_temporal_search,
                    "temporal_search_available": self.temporal_service is not None,
                    "temporal_search_error": self.temporal_error,
                    "temporal_search_backend": (
                        self.state.index.backend
                        if self.temporal_service is not None
                        else None
                    ),
                    "temporal_embedding_models": (
                        []
                        if self.temporal_service is None
                        else sorted(self.temporal_service.states)
                    ),
                    "temporal_parameters": (
                        None
                        if self.temporal_service is None
                        else self.temporal_service.parameters
                    ),
                    "ocr_available": self.ocr_index is not None,
                    "ocr_filter_available": self.ocr_index is not None,
                    "ocr_index_path": str(self.args.ocr_index),
                    "ocr_cache_mode": self.ocr_index.cache_mode if self.ocr_index is not None else None,
                    "ocr_records": self.ocr_index.num_records if self.ocr_index is not None else 0,
                    "ocr_text_records": self.ocr_index.num_text_records if self.ocr_index is not None else 0,
                    "ocr_models": {
                        "ppocr": {
                            "available": self.ocr_index is not None,
                            "path": str(self.args.ocr_index),
                            "records": self.ocr_index.num_records if self.ocr_index is not None else 0,
                            "source_records": self.ocr_index.source_num_records if self.ocr_index is not None else 0,
                            "coverage_ratio": self.ocr_index.coverage_ratio if self.ocr_index is not None else 0.0,
                            "partial": self.ocr_index.is_partial if self.ocr_index is not None else False,
                            "model_name": self.ocr_index.ocr_model if self.ocr_index is not None else None,
                        },
                        "monkey": {
                            "available": self.monkey_ocr_index is not None,
                            "path": str(self.args.monkey_ocr_index),
                            "records": self.monkey_ocr_index.num_records if self.monkey_ocr_index is not None else 0,
                            "source_records": self.monkey_ocr_index.source_num_records if self.monkey_ocr_index is not None else 0,
                            "coverage_ratio": self.monkey_ocr_index.coverage_ratio if self.monkey_ocr_index is not None else 0.0,
                            "partial": self.monkey_ocr_index.is_partial if self.monkey_ocr_index is not None else False,
                            "model_name": self.monkey_ocr_index.ocr_model if self.monkey_ocr_index is not None else None,
                        },
                    },
                    "asr_available": self.asr_index is not None,
                    "asr_index_path": str(self.args.asr_index),
                    "asr_cache_mode": self.asr_index.cache_mode if self.asr_index is not None else None,
                    "asr_videos": self.asr_index.num_videos if self.asr_index is not None else 0,
                    "asr_segments": self.asr_index.num_segments if self.asr_index is not None else 0,
                    "default_fusion_weights": {
                        "metaclip": self.args.metaclip_weight,
                        "ocr": self.args.ocr_weight,
                        "asr": self.args.asr_weight,
                    },
                    "embedding_models": {
                        "metaclip": {
                            "available": True,
                            "embedding_shape": list(self.state.embeddings.shape),
                            "model_name": self.args.model_name,
                        },
                        "beit3": {
                            "available": (
                                self.beit3_state is not None
                                and self.beit3_embedder is not None
                            ),
                            "embedding_shape": (
                                None
                                if self.beit3_state is None
                                else list(self.beit3_state.embeddings.shape)
                            ),
                            "model_name": "beit3_large_itc_patch16_224",
                            "storage_backend": (
                                None
                                if self.beit3_state is None
                                else self.beit3_state.storage_backend
                            ),
                            "milvus_collection": (
                                None
                                if self.beit3_state is None
                                else self.beit3_state.milvus_collection
                            ),
                            "error": self.beit3_error,
                        },
                    },
                }
            )
        return payload


class LazyRuntime(AppRuntime):
    """Runtime nạp mô hình bất đồng bộ trong background thread."""

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.status = "loading"
        self.stage = "starting"
        self.error = None
        self.state = None
        self.embedder = None
        self.beit3_state = None
        self.beit3_embedder = None
        self.beit3_error = None
        self.ocr_index = None
        self.monkey_ocr_index = None
        self.ocr_indexes: Dict[str, Any] = {}
        self.asr_index = None
        self.fuse_ranked_results = None
        self.fuse_with_asr = None
        self.temporal_service = None
        self.temporal_error = None
        self.started_at = time.time()
        self.excluded_indices = np.zeros((0,), dtype=np.int64)
        self.thread = threading.Thread(target=self._load, daemon=True)
        self.thread.start()


# Alias để giữ khả năng tương thích ngược
Runtime = AppRuntime
