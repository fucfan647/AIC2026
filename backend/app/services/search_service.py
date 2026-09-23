"""
==============================================================================
TỆP TIN: backend/app/services/search_service.py
LỚP: SearchPipelineService
MÔ TẢ:
    Dịch vụ điều phối tìm kiếm đa phương thức (Multi-modal Search Pipeline):
    - Phân tích và validate loại truy vấn: Text-only, Visual-only, Similarity hay Hybrid.
    - Điều phối trích xuất đặc trưng vector qua MetaCLIP-2 hoặc BEiT-3.
    - Thực thi tính toán độ tương đồng Cosine Similarity trên GPU (PyTorch FP16).
    - Thực hiện tìm kiếm phụ trợ qua OCR Text (MonkeyOCR/PPOCR) và ASR Speech.
    - Hợp nhất điểm số ứng viên qua thuật toán Linear Fusion / RRF.
    - Đo đạc chính xác thời gian trễ từng chặng (timings_ms).
==============================================================================
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np

from ..core.exceptions import BadRequestError, NotFoundError, ServiceUnavailableError


class SearchPipelineService:
    """Dịch vụ thực thi quy trình tìm kiếm hỗn hợp đa phương thức."""

    def __init__(self, runtime: Any):
        self.runtime = runtime

    def execute_search(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi toàn bộ pipeline tìm kiếm và trả về payload kết quả hoàn chỉnh."""
        query = params.get("query", "")
        queries = params.get("queries", [])
        keyframe_id = params.get("keyframe_id", "")
        image_weight = params.get("image_weight", 0.7)
        text_weight = params.get("text_weight", 0.3)
        top_k = params.get("top_k", 100)
        min_score = params.get("min_score")
        video_id = params.get("video_id")
        search_mode = params.get("search_mode", "visual")
        embedding_model = params.get("embedding_model", "metaclip")
        metaclip_weight = params.get("metaclip_weight", self.runtime.args.metaclip_weight)
        ocr_weight = params.get("ocr_weight", self.runtime.args.ocr_weight)
        asr_weight = params.get("asr_weight", self.runtime.args.asr_weight)
        ocr_query_provided = params.get("ocr_query_provided", False)
        effective_ocr_query = params.get("effective_ocr_query", "")
        ocr_model = params.get("ocr_model", "monkey")
        asr_query_provided = params.get("asr_query_provided", False)
        effective_asr_query = params.get("effective_asr_query", "")
        ocr_filter = params.get("ocr_filter", "")

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
            search_state = self.runtime.state
            search_embedder = self.runtime.embedder
        elif embedding_model == "beit3":
            if self.runtime.beit3_state is None or self.runtime.beit3_embedder is None:
                raise ServiceUnavailableError(self.runtime.beit3_error or "BEiT-3 search is unavailable")
            search_state = self.runtime.beit3_state
            search_embedder = self.runtime.beit3_embedder
        else:
            search_state = self.runtime.state
            search_embedder = self.runtime.embedder

        started = time.perf_counter()
        source_row_id = None

        if text_only:
            query_vector = None
            encode_timings = {}
        elif keyframe_id:
            source = search_state.metadata.get_by_keyframe_id(keyframe_id)
            if source is None:
                raise NotFoundError("unknown keyframe_id")
            source_row_id = int(source["row_id"])
            query_vector = np.asarray(search_state.embeddings[source_row_id], dtype=np.float32)
            encode_timings = {"embedding_lookup_ms": round((time.perf_counter() - started) * 1000.0, 3)}
            if query:
                if not (0 <= image_weight <= 1 and 0 <= text_weight <= 1) or image_weight + text_weight <= 0:
                    raise BadRequestError("similarity weights must be between 0 and 1 with a positive sum")
                text_vector, text_timings = search_embedder.encode_text_profiled(query)
                weight_sum = image_weight + text_weight
                query_vector = (image_weight / weight_sum) * query_vector + (text_weight / weight_sum) * np.asarray(text_vector, dtype=np.float32)
                norm = float(np.linalg.norm(query_vector))
                if not np.isfinite(norm) or norm <= 0:
                    raise BadRequestError("combined query vector is invalid")
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
                raise BadRequestError("combined query vector is invalid")
            query_vector = query_vector / norm

        candidate_indices = search_state.candidates_for_video(video_id)
        active_ocr_index = self.runtime.ocr_indexes.get(ocr_model)

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
            and self.runtime.asr_index is not None
            and asr_weight > 0
            and bool(effective_asr_query)
        )
        use_ocr_filter = (
            source_row_id is None
            and bool(ocr_filter)
            and active_ocr_index is not None
        )

        if ocr_filter and active_ocr_index is None:
            raise ServiceUnavailableError(f"OCR filter model {ocr_model} is unavailable")
        if ocr_query_provided and effective_ocr_query and ocr_weight > 0 and active_ocr_index is None:
            raise ServiceUnavailableError(f"OCR model {ocr_model} is unavailable")
        if active_ocr_index is None:
            ocr_weight = 0.0
        if search_mode == "hybrid" and effective_asr_query and asr_weight > 0 and self.runtime.asr_index is None:
            raise ServiceUnavailableError("ASR search is unavailable")

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
        results: List[Dict[str, Any]] = []

        for rank, (row_id, score) in enumerate(zip(selected.tolist(), scores.tolist()), start=1):
            if source_row_id is not None and row_id == source_row_id:
                continue
            rec = metadata_by_row.get(int(row_id))
            if rec is None:
                continue
            item = dict(rec)
            item["visual_rank"] = rank
            item["visual_score"] = float(score)
            item["ocr_rank"] = None
            item["ocr_score"] = None
            item["ocr_text"] = ""
            item["match_source"] = ["visual"]
            item["fusion_score"] = float(score)
            results.append(item)
            if 0 < top_k <= len(results):
                break

        metadata_ms = (time.perf_counter() - metadata_started) * 1000.0
        fusion_ms = 0.0

        if use_ocr_filter:
            fusion_started = time.perf_counter()
            if has_semantic_query:
                results = self.runtime.fuse_ranked_results(
                    results,
                    ocr_filter_hits,
                    top_k=top_k,
                    visual_weight=0.7,
                    ocr_weight=0.3,
                )
            else:
                results = self.runtime.fuse_ranked_results(
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
            results = self.runtime.fuse_ranked_results(
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
            asr_hits = self.runtime.asr_index.search(
                effective_asr_query,
                limit=asr_limit,
                video_id=video_id,
            )
            asr_search_ms = (time.perf_counter() - asr_started) * 1000.0
            fusion_started = time.perf_counter()
            base_results = results if metaclip_weight + ocr_weight > 0 else []
            results = self.runtime.fuse_with_asr(
                base_results,
                asr_hits,
                top_k=top_k,
                base_weight=metaclip_weight + (ocr_weight if use_ocr else 0.0),
                asr_weight=asr_weight,
            )
            fusion_ms += (time.perf_counter() - fusion_started) * 1000.0
            total_matches = len({item["keyframe_id"] for item in base_results} | {hit.keyframe_id for hit in asr_hits})

        if query_vector is not None:
            for item in results:
                row_id = int(item["source_embedding_row"])
                embedding = np.asarray(search_state.embeddings[row_id], dtype=np.float32)
                item["cosine_similarity"] = float(np.dot(embedding, query_vector))

        total_ms = (time.perf_counter() - started) * 1000.0
        search_backend = (f"{search_state.index.backend}+ocr_filter_fts5" if has_semantic_query else "ocr_fts5") if use_ocr_filter else (f"{search_state.index.backend}+ocr_fts5" if use_ocr and metaclip_weight > 0 else ("ocr_fts5" if use_ocr else search_state.index.backend))
        if use_asr:
            search_backend = "asr_fts5" if text_only and not use_ocr else search_backend + "+asr_fts5"

        fusion_weights_dict = (
            {"visual": 0.7, "metaclip": 0.7, "ocr": 0.3, "asr": asr_weight}
            if has_semantic_query
            else {"visual": 0.0, "metaclip": 0.0, "ocr": 1.0, "asr": asr_weight}
        ) if use_ocr_filter else {
            "visual": metaclip_weight,
            "metaclip": metaclip_weight,
            "ocr": ocr_weight,
            "asr": asr_weight
        }

        return {
            "results": results,
            "returned": len(results),
            "total_matches": total_matches,
            "total_candidates": search_state.index.num_vectors - len(self.runtime.excluded_indices),
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
            "asr_available": self.runtime.asr_index is not None,
            "ocr_filter": ocr_filter or None,
            "fusion_weights": fusion_weights_dict,
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
        }
