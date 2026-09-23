"""
==============================================================================
TỆP TIN: backend/app/controllers/search_controller.py
LỚP: SearchController
MÔ TẢ:
    Điều khiển endpoint tìm kiếm chính của hệ thống:
    - POST /search: Kiểm tra và xác thực (validate) toàn bộ tham số tìm kiếm,
      trích xuất trọng số hợp nhất (fusion weights), và chuyển giao cho
      SearchPipelineService để thực thi truy vấn.
==============================================================================
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
from typing import Any, Dict

from .base_controller import BaseController, json_response
from ..core.exceptions import BackendError, BadRequestError
from ..services.search_service import SearchPipelineService


class SearchController(BaseController):
    """Xử lý các yêu cầu tìm kiếm POST /search."""

    def __init__(self, runtime: Any, search_service: SearchPipelineService):
        super().__init__(runtime)
        self.search_service = search_service

    def handle_search(self, handler: BaseHTTPRequestHandler, request_body: Dict[str, Any]) -> None:
        """Validate tham số và thực thi tìm kiếm."""
        if not self.runtime.ready:
            json_response(handler, 503, {"detail": f"backend is still loading ({self.runtime.stage})"})
            return

        try:
            params = self._validate_and_extract_params(request_body)
        except Exception as exc:
            json_response(handler, 400, {"detail": str(exc)})
            return

        try:
            response_payload = self.search_service.execute_search(params)
            json_response(handler, 200, response_payload)
        except BackendError as exc:
            json_response(handler, exc.status_code, {"detail": exc.detail})
        except Exception as exc:
            json_response(handler, 500, {"detail": f"search failed: {exc}"})

    def _validate_and_extract_params(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Kiểm tra và chuẩn hóa dữ liệu đầu vào."""
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
        metaclip_weight = float(request.get("metaclip_weight", self.runtime.args.metaclip_weight))
        ocr_weight = float(request.get("ocr_weight", self.runtime.args.ocr_weight))
        asr_weight = float(request.get("asr_weight", self.runtime.args.asr_weight))
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

        return {
            "query": query,
            "queries": queries,
            "keyframe_id": keyframe_id,
            "image_weight": image_weight,
            "text_weight": text_weight,
            "top_k": top_k,
            "min_score": min_score,
            "video_id": video_id,
            "search_mode": search_mode,
            "embedding_model": embedding_model,
            "metaclip_weight": metaclip_weight,
            "ocr_weight": ocr_weight,
            "asr_weight": asr_weight,
            "ocr_query_provided": ocr_query_provided,
            "effective_ocr_query": effective_ocr_query,
            "ocr_model": ocr_model,
            "asr_query_provided": asr_query_provided,
            "effective_asr_query": effective_asr_query,
            "ocr_filter": ocr_filter,
        }
