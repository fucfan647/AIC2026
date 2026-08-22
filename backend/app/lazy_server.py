from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import numpy as np

from .config import WEBP_FRAMES_ROOT, WEBP_THUMBNAILS_ROOT
from .temporal_search import TemporalSearchError, TemporalSearchService

# Enable ANSI colors on Windows console
os.system("")

C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_GREEN = "\033[32m"
C_CYAN = "\033[36m"
C_YELLOW = "\033[33m"
C_RED = "\033[31m"


def uvicorn_log(level: str, message: str) -> None:
    if level == "INFO":
        level_tag = f"{C_GREEN}INFO{C_RESET}:    "
    elif level == "WARNING":
        level_tag = f"{C_YELLOW}WARNING{C_RESET}: "
    else:
        level_tag = f"{C_RED}ERROR{C_RESET}:   "
    sys.stdout.write(f"{level_tag} {message}\n")
    sys.stdout.flush()


class Runtime:
    def __init__(self, args):
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
        self.ocr_indexes = {}
        self.asr_index = None
        self.fuse_ranked_results = None
        self.fuse_with_asr = None
        self.temporal_service = None
        self.temporal_error = None
        self.started_at = time.time()
        self.excluded_indices = np.zeros((0,), dtype=np.int64)
        self._load()

    def _load(self):
        try:
            self.stage = "importing"
            from .embedder import Beit3Config, Beit3Embedder, MetaClip2Config, MetaClip2Embedder
            from .asr import AsrTextIndex, fuse_with_asr
            from .index import RetrievalState
            from .ocr import OcrTextIndex, fuse_ranked_results

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
        return self.status == "ok" and self.state is not None and self.embedder is not None


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def file_response(handler: BaseHTTPRequestHandler, path: Path, *, accel_redirect: bool = False):
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


class LazyRuntime(Runtime):
    def __init__(self, args):
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
        self.ocr_indexes = {}
        self.asr_index = None
        self.fuse_ranked_results = None
        self.fuse_with_asr = None
        self.temporal_service = None
        self.temporal_error = None
        self.started_at = time.time()
        self.excluded_indices = np.zeros((0,), dtype=np.int64)
        self.thread = threading.Thread(target=self._load, daemon=True)
        self.thread.start()


def make_handler(runtime: Runtime):
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
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                payload = {
                    "status": runtime.status,
                    "stage": runtime.stage,
                    "error": runtime.error,
                    "uptime_seconds": round(time.time() - runtime.started_at, 3),
                }
                if runtime.state is not None:
                    payload.update(
                        {
                            "records": int(runtime.state.config.get("num_metadata", runtime.state.index.num_vectors)),
                            "vectors": runtime.state.index.num_vectors,
                            "excluded_rows": len(runtime.excluded_indices),
                            "searchable_vectors": runtime.state.index.num_vectors - len(runtime.excluded_indices),
                            "embedding_shape": list(runtime.state.embeddings.shape),
                            "embedding_dtype": str(runtime.state.embeddings.dtype),
                            "search_backend": runtime.state.index.backend,
                            "gpu_dtype": getattr(runtime.state.index, "dtype_name", None),
                            "gpu_memory_mb": round(getattr(runtime.state.index, "memory_bytes", 0) / (1024 ** 2), 3),
                            "model_name": runtime.args.model_name,
                            "load_seconds": runtime.state.load_seconds,
                            "storage_backend": runtime.state.storage_backend,
                            "metadata_backend": runtime.state.metadata_backend,
                            "milvus_collection": runtime.state.milvus_collection,
                            "milvus_version": runtime.state.milvus_version,
                            "milvus_load_seconds": runtime.state.milvus_load_seconds,
                            "milvus_in_search_path": False,
                            "temporal_search_enabled": runtime.args.enable_temporal_search,
                            "temporal_search_available": runtime.temporal_service is not None,
                            "temporal_search_error": runtime.temporal_error,
                            "temporal_search_backend": (
                                runtime.state.index.backend
                                if runtime.temporal_service is not None
                                else None
                            ),
                            "temporal_embedding_models": (
                                []
                                if runtime.temporal_service is None
                                else sorted(runtime.temporal_service.states)
                            ),
                            "temporal_parameters": (
                                None
                                if runtime.temporal_service is None
                                else runtime.temporal_service.parameters
                            ),
                            "ocr_available": runtime.ocr_index is not None,
                            "ocr_filter_available": runtime.ocr_index is not None,
                            "ocr_index_path": str(runtime.args.ocr_index),
                            "ocr_cache_mode": runtime.ocr_index.cache_mode if runtime.ocr_index is not None else None,
                            "ocr_records": runtime.ocr_index.num_records if runtime.ocr_index is not None else 0,
                            "ocr_text_records": runtime.ocr_index.num_text_records if runtime.ocr_index is not None else 0,
                            "ocr_models": {
                                "ppocr": {
                                    "available": runtime.ocr_index is not None,
                                    "path": str(runtime.args.ocr_index),
                                    "records": runtime.ocr_index.num_records if runtime.ocr_index is not None else 0,
                                    "source_records": runtime.ocr_index.source_num_records if runtime.ocr_index is not None else 0,
                                    "coverage_ratio": runtime.ocr_index.coverage_ratio if runtime.ocr_index is not None else 0.0,
                                    "partial": runtime.ocr_index.is_partial if runtime.ocr_index is not None else False,
                                    "model_name": runtime.ocr_index.ocr_model if runtime.ocr_index is not None else None,
                                },
                                "monkey": {
                                    "available": runtime.monkey_ocr_index is not None,
                                    "path": str(runtime.args.monkey_ocr_index),
                                    "records": runtime.monkey_ocr_index.num_records if runtime.monkey_ocr_index is not None else 0,
                                    "source_records": runtime.monkey_ocr_index.source_num_records if runtime.monkey_ocr_index is not None else 0,
                                    "coverage_ratio": runtime.monkey_ocr_index.coverage_ratio if runtime.monkey_ocr_index is not None else 0.0,
                                    "partial": runtime.monkey_ocr_index.is_partial if runtime.monkey_ocr_index is not None else False,
                                    "model_name": runtime.monkey_ocr_index.ocr_model if runtime.monkey_ocr_index is not None else None,
                                },
                            },
                            "asr_available": runtime.asr_index is not None,
                            "asr_index_path": str(runtime.args.asr_index),
                            "asr_cache_mode": runtime.asr_index.cache_mode if runtime.asr_index is not None else None,
                            "asr_videos": runtime.asr_index.num_videos if runtime.asr_index is not None else 0,
                            "asr_segments": runtime.asr_index.num_segments if runtime.asr_index is not None else 0,
                            "default_fusion_weights": {
                                "metaclip": runtime.args.metaclip_weight,
                                "ocr": runtime.args.ocr_weight,
                                "asr": runtime.args.asr_weight,
                            },
                            "embedding_models": {
                                "metaclip": {
                                    "available": True,
                                    "embedding_shape": list(runtime.state.embeddings.shape),
                                    "model_name": runtime.args.model_name,
                                },
                                "beit3": {
                                    "available": (
                                        runtime.beit3_state is not None
                                        and runtime.beit3_embedder is not None
                                    ),
                                    "embedding_shape": (
                                        None
                                        if runtime.beit3_state is None
                                        else list(runtime.beit3_state.embeddings.shape)
                                    ),
                                    "model_name": "beit3_large_itc_patch16_224",
                                    "storage_backend": (
                                        None
                                        if runtime.beit3_state is None
                                        else runtime.beit3_state.storage_backend
                                    ),
                                    "milvus_collection": (
                                        None
                                        if runtime.beit3_state is None
                                        else runtime.beit3_state.milvus_collection
                                    ),
                                    "error": runtime.beit3_error,
                                },
                            },
                        }
                    )
                json_response(self, 200, payload)
                return
            image_route = next(
                (
                    prefix
                    for prefix in ("/thumbnail/", "/keyframe-webp/", "/keyframe/")
                    if parsed.path.startswith(prefix)
                ),
                None,
            )
            if image_route is not None:
                if not runtime.ready:
                    json_response(self, 503, {"detail": f"backend is still loading ({runtime.stage})"})
                    return
                keyframe_id = unquote(parsed.path.rsplit("/", 1)[-1])
                rec = runtime.state.metadata.get_by_keyframe_id(keyframe_id)
                if rec is None:
                    json_response(self, 404, {"detail": "unknown keyframe_id"})
                    return
                root = WEBP_THUMBNAILS_ROOT if image_route == "/thumbnail/" else WEBP_FRAMES_ROOT
                video_id = str(rec["video_id"])
                image_file_name = Path(str(rec["image_file"]))
                path = root / video_id / image_file_name.with_suffix(".webp").name
                if not path.is_file():
                    path = root / video_id / image_file_name.with_suffix(".jpg").name
                if not path.is_file():
                    path = root / video_id / image_file_name.name
                file_response(self, path, accel_redirect=runtime.args.nginx_accel_redirect)
                return
            json_response(self, 404, {"detail": "not found"})

        def do_POST(self):
            self._start_time = time.perf_counter()
            parsed = urlparse(self.path)
            if parsed.path not in {"/search", "/temporal-search"}:
                json_response(self, 404, {"detail": "not found"})
                return
            if not runtime.ready:
                json_response(self, 503, {"detail": f"backend is still loading ({runtime.stage})"})
                return
            length = int(self.headers.get("Content-Length", "0") or 0)
            try:
                request = json.loads(self.rfile.read(length).decode("utf-8"))
            except Exception as exc:
                json_response(self, 400, {"detail": f"invalid JSON body: {exc}"})
                return
            if parsed.path == "/temporal-search":
                if runtime.temporal_service is None:
                    detail = (
                        "temporal search is disabled"
                        if not runtime.args.enable_temporal_search
                        else runtime.temporal_error or "temporal search is unavailable"
                    )
                    json_response(self, 503, {"detail": detail})
                    return
                try:
                    json_response(self, 200, runtime.temporal_service.handle(request))
                except TemporalSearchError as exc:
                    json_response(self, exc.status_code, {"detail": str(exc)})
                except Exception as exc:
                    json_response(self, 500, {"detail": f"temporal search failed: {exc}"})
                return
            try:
                query = str(request.get("query", "")).strip()
                raw_queries = request.get("queries", [])
                if not isinstance(raw_queries, list):
                    raise ValueError("queries must be an array")
                queries = [str(value).strip() for value in raw_queries if str(value).strip()]
                if len(queries) > 5:
                    raise ValueError("queries supports at most 5 items")
                if queries and len(queries) < 2:
                    raise ValueError("queries must contain between 2 and 5 non-empty items")
                keyframe_id = str(request.get("keyframe_id", "")).strip()
                image_weight = float(request.get("image_weight", 0.7))
                text_weight = float(request.get("text_weight", 0.3))
                top_k = int(request.get("top_k", 100))
                min_score = request.get("min_score")
                min_score = None if min_score is None else float(min_score)
                video_id = request.get("video_id")
                search_mode = str(request.get("search_mode", "visual"))
                embedding_model = str(request.get("embedding_model", "metaclip")).strip().lower()
                metaclip_weight = float(request.get("metaclip_weight", runtime.args.metaclip_weight))
                ocr_weight = float(request.get("ocr_weight", runtime.args.ocr_weight))
                asr_weight = float(request.get("asr_weight", runtime.args.asr_weight))
                ocr_query_provided = "ocr_query" in request
                ocr_query = str(request.get("ocr_query", "")).strip()
                effective_ocr_query = ocr_query if ocr_query_provided else query
                ocr_model = str(request.get("ocr_model", "monkey")).strip().lower()
                asr_query_provided = "asr_query" in request
                asr_query = str(request.get("asr_query", "")).strip()
                effective_asr_query = asr_query if asr_query_provided else query
                ocr_filter = str(request.get("ocr_filter", "")).strip()
                if embedding_model not in {"metaclip", "beit3"}:
                    raise ValueError("embedding_model must be metaclip or beit3")
                if ocr_model not in {"ppocr", "monkey"}:
                    raise ValueError("ocr_model must be ppocr or monkey")
                if search_mode not in {"visual", "hybrid", "similarity"}:
                    raise ValueError("search_mode must be visual, hybrid, or similarity")
                if (
                    not 0 <= metaclip_weight <= 1
                    or not 0 <= ocr_weight <= 1
                    or not 0 <= asr_weight <= 1
                    or metaclip_weight + ocr_weight + asr_weight <= 0
                ):
                    raise ValueError("fusion weights must be between 0 and 1 with a positive sum")
                if not query and not queries and not keyframe_id and not ocr_filter and not effective_ocr_query and not effective_asr_query:
                    raise ValueError("query, keyframe_id, ocr_query, asr_query, or ocr_filter must not be empty")
            except Exception as exc:
                json_response(self, 400, {"detail": str(exc)})
                return

            text_only = (
                not query
                and not queries
                and not keyframe_id
                and not ocr_filter
                and search_mode == "hybrid"
                and metaclip_weight == 0
                and (
                    (ocr_query_provided and bool(effective_ocr_query) and ocr_weight > 0)
                    or (asr_query_provided and bool(effective_asr_query) and asr_weight > 0)
                )
            )
            if text_only:
                search_state = runtime.state
                search_embedder = runtime.embedder
            elif embedding_model == "beit3":
                if runtime.beit3_state is None or runtime.beit3_embedder is None:
                    json_response(self, 503, {"detail": runtime.beit3_error or "BEiT-3 search is unavailable"})
                    return
                search_state = runtime.beit3_state
                search_embedder = runtime.beit3_embedder
            else:
                search_state = runtime.state
                search_embedder = runtime.embedder
            started = time.perf_counter()
            source_row_id = None
            if text_only:
                query_vector = None
                encode_timings = {}
            elif keyframe_id:
                source = search_state.metadata.get_by_keyframe_id(keyframe_id)
                if source is None:
                    json_response(self, 404, {"detail": "unknown keyframe_id"})
                    return
                source_row_id = int(source["row_id"])
                query_vector = np.asarray(search_state.embeddings[source_row_id], dtype=np.float32)
                encode_timings = {"embedding_lookup_ms": round((time.perf_counter() - started) * 1000.0, 3)}
                if query:
                    if not (0 <= image_weight <= 1 and 0 <= text_weight <= 1) or image_weight + text_weight <= 0:
                        json_response(self, 400, {"detail": "similarity weights must be between 0 and 1 with a positive sum"})
                        return
                    text_vector, text_timings = search_embedder.encode_text_profiled(query)
                    weight_sum = image_weight + text_weight
                    query_vector = (image_weight / weight_sum) * query_vector + (text_weight / weight_sum) * np.asarray(text_vector, dtype=np.float32)
                    norm = float(np.linalg.norm(query_vector))
                    if not np.isfinite(norm) or norm <= 0:
                        json_response(self, 400, {"detail": "combined query vector is invalid"})
                        return
                    query_vector = query_vector / norm
                    encode_timings.update({f"text_{key}": value for key, value in text_timings.items()})
            else:
                query_texts = queries or [query or ocr_filter or effective_ocr_query or effective_asr_query]
                query_vectors = []
                encode_timings = {}
                for query_index, query_text in enumerate(query_texts, start=1):
                    vector, timings = search_embedder.encode_text_profiled(query_text)
                    query_vectors.append(np.asarray(vector, dtype=np.float32))
                    encode_timings.update({f"query_{query_index}_{key}": value for key, value in timings.items()})
                query_vector = np.mean(query_vectors, axis=0)
                norm = float(np.linalg.norm(query_vector))
                if not np.isfinite(norm) or norm <= 0:
                    json_response(self, 400, {"detail": "combined query vector is invalid"})
                    return
                query_vector = query_vector / norm
            candidate_indices = search_state.candidates_for_video(video_id)
            active_ocr_index = runtime.ocr_indexes.get(ocr_model)
            use_ocr = (
                source_row_id is None
                and search_mode == "hybrid"
                and active_ocr_index is not None
                and ocr_weight > 0
                and bool(effective_ocr_query)
            )
            use_asr = (
                source_row_id is None
                and search_mode == "hybrid"
                and runtime.asr_index is not None
                and asr_weight > 0
                and bool(effective_asr_query)
            )
            use_ocr_filter = (
                source_row_id is None
                and bool(ocr_filter)
                and active_ocr_index is not None
            )
            if ocr_filter and active_ocr_index is None:
                json_response(self, 503, {"detail": f"OCR filter model {ocr_model} is unavailable"})
                return
            if ocr_query_provided and effective_ocr_query and ocr_weight > 0 and active_ocr_index is None:
                json_response(self, 503, {"detail": f"OCR model {ocr_model} is unavailable"})
                return
            if active_ocr_index is None:
                ocr_weight = 0.0
            if search_mode == "hybrid" and effective_asr_query and asr_weight > 0 and runtime.asr_index is None:
                json_response(self, 503, {"detail": "ASR search is unavailable"})
                return
            has_semantic_query = bool(query or queries or keyframe_id)
            ocr_filter_hits = []
            ocr_search_ms = 0.0
            asr_search_ms = 0.0
            if use_ocr_filter:
                ocr_started = time.perf_counter()
                ocr_filter_hits = active_ocr_index.search(
                    ocr_filter,
                    limit=None,
                    video_id=video_id,
                )
                ocr_search_ms = (time.perf_counter() - ocr_started) * 1000.0
                candidate_indices = np.asarray(
                    [hit.row_id for hit in ocr_filter_hits], dtype=np.int64
                )
                candidate_count = int(len(candidate_indices))
                requested_top_k = candidate_count if top_k <= 0 else min(candidate_count, top_k)
            elif use_ocr:
                candidate_count = search_state.index.num_vectors if candidate_indices is None else int(len(candidate_indices))
                requested_top_k = top_k if text_only else (
                    candidate_count if top_k <= 0 else min(candidate_count, max(400, top_k * 4))
                )
            elif use_asr and not text_only:
                candidate_count = search_state.index.num_vectors if candidate_indices is None else int(len(candidate_indices))
                requested_top_k = candidate_count if top_k <= 0 else min(candidate_count, max(400, top_k * 4))
            else:
                requested_top_k = top_k if source_row_id is None or top_k <= 0 else top_k + 1
            retrieval_started = time.perf_counter()
            if text_only:
                selected = np.zeros((0,), dtype=np.int64)
                scores = np.zeros((0,), dtype=np.float32)
                total_matches = 0
            else:
                selected, scores, total_matches = search_state.index.search(
                    query_vector,
                    top_k=requested_top_k,
                    min_score=min_score,
                    candidate_indices=candidate_indices,
                )
            retrieval_ms = (time.perf_counter() - retrieval_started) * 1000.0
            metadata_started = time.perf_counter()
            metadata_by_row = {} if text_only else search_state.metadata.get_rows([int(value) for value in selected.tolist()])
            metadata_ms = (time.perf_counter() - metadata_started) * 1000.0
            results = []
            for rank, (idx, score) in enumerate(zip(selected, scores), start=1):
                if source_row_id is not None and int(idx) == source_row_id:
                    continue
                rec = metadata_by_row.get(int(idx))
                if rec is None:
                    continue
                timestamp_ms = int(rec.get("timestamp_ms", 0) or 0)
                result = {
                        "rank": len(results) + 1,
                        "score": float(score),
                        "keyframe_id": rec["keyframe_id"],
                        "video_id": rec["video_id"],
                        "shot_id": rec.get("shot_id"),
                        "timestamp_ms": timestamp_ms,
                        "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                        "image_file": rec.get("image_file"),
                        "source_embedding_row": int(idx),
                    }
                if queries:
                    adjacent = search_state.metadata.get_adjacent(int(idx), str(rec["video_id"]))
                    result["adjacent_frames"] = {
                        position: {
                            "keyframe_id": frame["keyframe_id"],
                            "video_id": frame["video_id"],
                            "shot_id": frame.get("shot_id"),
                            "timestamp_ms": int(frame.get("timestamp_ms", 0) or 0),
                            "timestamp_seconds": round(int(frame.get("timestamp_ms", 0) or 0) / 1000.0, 3),
                        }
                        for position, frame in adjacent.items()
                    }
                results.append(result)
                if not use_ocr and top_k > 0 and len(results) >= top_k:
                    break
            fusion_ms = 0.0
            if use_ocr_filter:
                fusion_started = time.perf_counter()
                if has_semantic_query:
                    selected_row_ids = {
                        int(item["source_embedding_row"]) for item in results
                    }
                    ranked_ocr_hits = [
                        hit for hit in ocr_filter_hits if hit.row_id in selected_row_ids
                    ]
                    results = runtime.fuse_ranked_results(
                        results,
                        ranked_ocr_hits,
                        top_k=top_k,
                        visual_weight=0.7,
                        ocr_weight=0.3,
                    )
                else:
                    results = runtime.fuse_ranked_results(
                        [],
                        ocr_filter_hits,
                        top_k=top_k,
                        visual_weight=0.0,
                        ocr_weight=1.0,
                    )
                for rank, item in enumerate(results, start=1):
                    item["rank"] = rank
                fusion_ms = (time.perf_counter() - fusion_started) * 1000.0
                total_matches = len(ocr_filter_hits)
            elif use_ocr:
                ocr_started = time.perf_counter()
                ocr_limit = None if text_only and top_k <= 0 else requested_top_k
                ocr_hits = active_ocr_index.search(effective_ocr_query, limit=ocr_limit, video_id=video_id)
                ocr_search_ms = (time.perf_counter() - ocr_started) * 1000.0
                fusion_started = time.perf_counter()
                visual_results = results if metaclip_weight > 0 else []
                results = runtime.fuse_ranked_results(
                    visual_results,
                    ocr_hits,
                    top_k=top_k,
                    visual_weight=metaclip_weight,
                    ocr_weight=ocr_weight,
                )
                fusion_ms = (time.perf_counter() - fusion_started) * 1000.0
                total_matches = len({item["keyframe_id"] for item in visual_results} | {hit.keyframe_id for hit in ocr_hits})
            if use_asr:
                asr_started = time.perf_counter()
                asr_limit = None if text_only and top_k <= 0 else requested_top_k
                asr_hits = runtime.asr_index.search(
                    effective_asr_query,
                    limit=asr_limit,
                    video_id=video_id,
                )
                asr_search_ms = (time.perf_counter() - asr_started) * 1000.0
                fusion_started = time.perf_counter()
                base_results = results if metaclip_weight + ocr_weight > 0 else []
                results = runtime.fuse_with_asr(
                    base_results,
                    asr_hits,
                    top_k=top_k,
                    base_weight=metaclip_weight + (ocr_weight if use_ocr else 0.0),
                    asr_weight=asr_weight,
                )
                fusion_ms += (time.perf_counter() - fusion_started) * 1000.0
                total_matches = len({item["keyframe_id"] for item in base_results} | {hit.keyframe_id for hit in asr_hits})
            total_ms = (time.perf_counter() - started) * 1000.0
            search_backend = (f"{search_state.index.backend}+ocr_filter_fts5" if has_semantic_query else "ocr_fts5") if use_ocr_filter else (f"{search_state.index.backend}+ocr_fts5" if use_ocr and metaclip_weight > 0 else ("ocr_fts5" if use_ocr else search_state.index.backend))
            if use_asr:
                search_backend = "asr_fts5" if text_only and not use_ocr else search_backend + "+asr_fts5"
            json_response(
                self,
                200,
                {
                    "results": results,
                    "returned": len(results),
                    "total_matches": total_matches,
                    "total_candidates": search_state.index.num_vectors - len(runtime.excluded_indices),
                    "filtered_candidates": None if candidate_indices is None else int(len(candidate_indices)),
                    "video_id": None if not video_id else str(video_id).strip().upper(),
                    "search_mode": "similarity" if source_row_id is not None else ("hybrid" if use_ocr or use_ocr_filter or use_asr else "visual"),
                    "query_keyframe_id": keyframe_id or None,
                    "query_text": query or None,
                    "ocr_query": effective_ocr_query or None,
                    "ocr_model": ocr_model,
                    "ocr_coverage_ratio": active_ocr_index.coverage_ratio if active_ocr_index is not None else 0.0,
                    "asr_query": effective_asr_query or None,
                    "queries": queries or None,
                    "embedding_model": embedding_model,
                    "similarity_weights": {"image": image_weight, "text": text_weight} if keyframe_id and query else None,
                    "search_backend": search_backend,
                    "ocr_available": active_ocr_index is not None,
                    "asr_available": runtime.asr_index is not None,
                    "ocr_filter": ocr_filter or None,
                    "fusion_weights": ({"visual": 0.7, "metaclip": 0.7, "ocr": 0.3, "asr": asr_weight} if has_semantic_query else {"visual": 0.0, "metaclip": 0.0, "ocr": 1.0, "asr": asr_weight}) if use_ocr_filter else {"visual": metaclip_weight, "metaclip": metaclip_weight, "ocr": ocr_weight, "asr": asr_weight},
                    "search_seconds": round(total_ms / 1000.0, 4),
                    "timings_ms": {
                        **encode_timings,
                        "retrieval_ms": round(retrieval_ms, 3),
                        "metadata_ms": round(metadata_ms, 3),
                        "ocr_search_ms": round(ocr_search_ms, 3),
                        "asr_search_ms": round(asr_search_ms, 3),
                        "fusion_ms": round(fusion_ms, 3),
                        "total_ms": round(total_ms, 3),
                    },
                },
            )

    return Handler


def parse_args():
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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("=" * 60, flush=True)
    print("  AIC2026 Backend Runtime (Torch-GPU / CUDA)", flush=True)
    print("=" * 60, flush=True)
    runtime = LazyRuntime(args) if args.lazy_load else Runtime(args)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(runtime))
    uvicorn_log("INFO", f"Server running on http://{args.host}:{args.port} (Press CTRL+C to quit)")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
