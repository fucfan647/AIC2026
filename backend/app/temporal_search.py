from __future__ import annotations

import math
import threading
import time
import uuid
from dataclasses import dataclass

import numpy as np


class TemporalSearchError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = int(status_code)


@dataclass
class TemporalSession:
    session_id: str
    current_stage: int
    queries: list[str]
    sequences: list[dict]
    stage_sequences: dict[int, list[dict]]
    stage_configs: dict[int, dict]
    embedding_model: str
    video_id: str | None
    created_at: float
    updated_at: float


class TemporalSearchService:
    def __init__(
        self,
        states: dict[str, object],
        embedders: dict[str, object],
        excluded_indices: np.ndarray,
        *,
        ocr_index=None,
        asr_index=None,
        fuse_ranked_results=None,
        fuse_with_asr=None,
        stage1_top_k: int = 200,
        local_top_k: int = 200,
        stage2_keep_k: int = 200,
        output_top_k: int = 200,
        window_ms: int = 45_000,
        session_ttl_seconds: int = 1_800,
        max_sessions: int = 64,
    ):
        values = {
            "stage1_top_k": stage1_top_k,
            "local_top_k": local_top_k,
            "stage2_keep_k": stage2_keep_k,
            "output_top_k": output_top_k,
            "window_ms": window_ms,
            "session_ttl_seconds": session_ttl_seconds,
            "max_sessions": max_sessions,
        }
        if any(int(value) <= 0 for value in values.values()):
            raise ValueError(f"temporal parameters must be positive: {values}")
        if "metaclip" not in states or "metaclip" not in embedders:
            raise ValueError("temporal search requires MetaCLIP state and embedder")
        meta = states["metaclip"].metadata
        if not hasattr(meta, "records") and not hasattr(meta, "conn"):
            raise ValueError("temporal search requires metadata records or sqlite connection")

        self.states = dict(states)
        self.embedders = dict(embedders)
        self.ocr_index = ocr_index
        self.asr_index = asr_index
        self.fuse_ranked_results = fuse_ranked_results
        self.fuse_with_asr = fuse_with_asr
        self.stage1_top_k = int(stage1_top_k)
        self.local_top_k = int(local_top_k)
        self.stage2_keep_k = int(stage2_keep_k)
        self.output_top_k = int(output_top_k)
        self.window_ms = int(window_ms)
        self.session_ttl_seconds = int(session_ttl_seconds)
        self.max_sessions = int(max_sessions)
        self.sessions: dict[str, TemporalSession] = {}
        self.lock = threading.RLock()

        excluded = {int(value) for value in np.asarray(excluded_indices, dtype=np.int64)}
        grouped: dict[str, list[tuple[int, int]]] = {}
        if hasattr(meta, "records"):
            raw_records = meta.records
            for record in raw_records:
                row_id = int(record["row_id"])
                timestamp_ms = record.get("timestamp_ms")
                if row_id in excluded or timestamp_ms is None:
                    continue
                grouped.setdefault(str(record["video_id"]).upper(), []).append(
                    (int(timestamp_ms), row_id)
                )
        else:
            rows = meta.conn.execute("SELECT row_id, video_id, timestamp_ms FROM records").fetchall()
            for r in rows:
                row_id = int(r["row_id"])
                timestamp_ms = r["timestamp_ms"]
                if row_id in excluded or timestamp_ms is None:
                    continue
                grouped.setdefault(str(r["video_id"]).upper(), []).append(
                    (int(timestamp_ms), row_id)
                )
        self.video_timestamps: dict[str, np.ndarray] = {}
        self.video_row_ids: dict[str, np.ndarray] = {}
        for video_id, pairs in grouped.items():
            pairs.sort(key=lambda item: (item[0], item[1]))
            self.video_timestamps[video_id] = np.asarray(
                [item[0] for item in pairs], dtype=np.int64
            )
            self.video_row_ids[video_id] = np.asarray(
                [item[1] for item in pairs], dtype=np.int64
            )

    @property
    def parameters(self) -> dict:
        return {
            "stage1_top_k": self.stage1_top_k,
            "local_top_k": self.local_top_k,
            "stage2_keep_k": self.stage2_keep_k,
            "output_top_k": self.output_top_k,
            "temporal_window_ms": self.window_ms,
            "temporal_direction": "forward",
            "session_ttl_seconds": self.session_ttl_seconds,
        }

    def handle(self, request: dict) -> dict:
        if not isinstance(request, dict):
            raise TemporalSearchError("request body must be a JSON object")
        action = str(request.get("action", "")).strip().lower()
        with self.lock:
            self._expire_sessions()
            if action == "start":
                return self._start(request)
            if action == "continue":
                return self._continue(request)
            if action == "replace":
                return self._continue(request, replace=True)
            if action == "reset":
                return self._reset(request)
        raise TemporalSearchError("action must be start, continue, replace, or reset")

    def _start(self, request: dict) -> dict:
        config = self._stage_config(request)
        query = config["query"]
        embedding_model = config["embedding_model"]
        state = self.states[embedding_model]
        video_id = str(request.get("video_id", "")).strip().upper() or None
        started = time.perf_counter()

        candidate_started = time.perf_counter()
        candidate_indices = state.candidates_for_video(video_id)
        candidate_filter_ms = (time.perf_counter() - candidate_started) * 1000.0
        results, search_info = self._search_stage(
            config,
            candidate_indices=candidate_indices,
            top_k=self.stage1_top_k,
            video_id=video_id,
        )

        replaced_session_id = str(request.get("session_id", "")).strip()
        if replaced_session_id:
            self.sessions.pop(replaced_session_id, None)
        now = time.time()
        session_id = uuid.uuid4().hex
        stage1_sequences = [
            {"scenes": [item], "sequence_score": item["normalized_score"]}
            for item in results
        ]
        self.sessions[session_id] = TemporalSession(
            session_id=session_id,
            current_stage=1,
            queries=[query],
            sequences=stage1_sequences,
            stage_sequences={1: stage1_sequences},
            stage_configs={1: config},
            embedding_model=embedding_model,
            video_id=video_id,
            created_at=now,
            updated_at=now,
        )
        self._enforce_session_limit()
        total_ms = (time.perf_counter() - started) * 1000.0
        return {
            "session_id": session_id,
            "stage": 1,
            "stage_count": 1,
            "query": query,
            "queries": [query],
            "results": results,
            "returned": len(results),
            "total_matches": int(search_info["total_matches"]),
            "total_candidates": int(
                state.index.num_vectors
                if candidate_indices is None
                else len(candidate_indices)
            ),
            "video_id": video_id,
            "embedding_model": embedding_model,
            "search_backend": f"{search_info['search_backend']}-temporal-stage1",
            "stage_config": config,
            "parameters": self.parameters,
            "timings_ms": {
                "candidate_filter_ms": round(candidate_filter_ms, 3),
                **search_info["timings_ms"],
                "session_update_ms": round(
                    max(0.0, total_ms - candidate_filter_ms - search_info["total_ms"]),
                    3,
                ),
                "total_ms": round(total_ms, 3),
            },
        }

    def _continue(self, request: dict, *, replace: bool = False) -> dict:
        session_id = str(request.get("session_id", "")).strip()
        if not session_id:
            raise TemporalSearchError("session_id is required")
        session = self.sessions.get(session_id)
        if session is None:
            raise TemporalSearchError("temporal session not found or expired", 404)
        if not replace and session.current_stage >= 3:
            raise TemporalSearchError("temporal session already completed; start a new session")
        config = self._stage_config(request, required_model=session.embedding_model)
        query = config["query"]
        if replace:
            try:
                target_stage = int(request.get("stage"))
            except (TypeError, ValueError):
                raise TemporalSearchError("stage must be 2 or 3 for replace") from None
            if target_stage not in (2, 3) or target_stage > session.current_stage:
                raise TemporalSearchError("only a completed stage 2 or 3 can be replaced")
        else:
            target_stage = session.current_stage + 1
        parent_sequences = session.stage_sequences.get(target_stage - 1)
        if not parent_sequences:
            raise TemporalSearchError(f"stage {target_stage - 1} results are required")
        started = time.perf_counter()

        prepared = self._prepare_stage(config)
        encode_ms = float(prepared["encode_ms"])
        encode_profile = prepared["encode_profile"]

        candidate_filter_ms = 0.0
        local_search_ms = 0.0
        sequence_build_ms = 0.0
        best_by_key: dict[tuple[str, ...], dict] = {}
        local_candidates = 0
        for parent in parent_sequences:
            scenes = parent["scenes"]
            anchor = scenes[-1]
            filter_started = time.perf_counter()
            candidates = self._forward_candidates(
                str(anchor["video_id"]), int(anchor["timestamp_ms"])
            )
            candidate_filter_ms += (time.perf_counter() - filter_started) * 1000.0
            local_candidates += int(len(candidates))
            if len(candidates) == 0:
                continue

            local_results, search_info = self._search_stage(
                config,
                candidate_indices=candidates,
                top_k=self.local_top_k,
                video_id=str(anchor["video_id"]),
                prepared=prepared,
            )
            local_search_ms += float(search_info["total_ms"])
            build_started = time.perf_counter()
            for scene in local_results:
                combined_scenes = [*scenes, scene]
                sequence_score = self._harmonic_mean(
                    [float(item["normalized_score"]) for item in combined_scenes]
                )
                key = tuple(str(item["keyframe_id"]) for item in combined_scenes)
                current = best_by_key.get(key)
                candidate = self._sequence(combined_scenes, sequence_score, 0)
                if current is None or sequence_score > float(current["sequence_score"]):
                    best_by_key[key] = candidate
            sequence_build_ms += (time.perf_counter() - build_started) * 1000.0

        ranking_started = time.perf_counter()
        ranked = sorted(
            best_by_key.values(),
            key=lambda item: (
                -float(item["sequence_score"]),
                -float(item["scenes"][-1]["normalized_score"]),
                str(item["video_id"]),
                tuple(int(scene["timestamp_ms"]) for scene in item["scenes"]),
            ),
        )
        keep_k = self.stage2_keep_k if target_stage == 2 else self.output_top_k
        ranked = ranked[:keep_k]
        for rank, item in enumerate(ranked, start=1):
            item["rank"] = rank
        ranking_ms = (time.perf_counter() - ranking_started) * 1000.0

        session.current_stage = target_stage
        session.queries = [*session.queries[: target_stage - 1], query]
        session.stage_configs = {
            stage: saved_config
            for stage, saved_config in session.stage_configs.items()
            if stage < target_stage
        }
        session.stage_configs[target_stage] = config
        session.sequences = ranked
        session.stage_sequences = {
            stage: sequences
            for stage, sequences in session.stage_sequences.items()
            if stage < target_stage
        }
        session.stage_sequences[target_stage] = ranked
        session.updated_at = time.time()
        total_ms = (time.perf_counter() - started) * 1000.0
        accounted = encode_ms + candidate_filter_ms + local_search_ms + sequence_build_ms + ranking_ms
        return {
            "session_id": session.session_id,
            "stage": target_stage,
            "stage_count": target_stage,
            "replaced": bool(replace),
            "query": query,
            "queries": list(session.queries),
            "results": ranked,
            "returned": len(ranked),
            "total_candidates": int(local_candidates),
            "video_id": session.video_id,
            "embedding_model": session.embedding_model,
            "search_backend": f"{prepared['search_backend']}-temporal-stage{target_stage}",
            "stage_config": config,
            "parameters": self.parameters,
            "timings_ms": {
                "encode_query_ms": round(encode_ms, 3),
                "candidate_filter_ms": round(candidate_filter_ms, 3),
                "local_search_ms": round(local_search_ms, 3),
                "sequence_build_ms": round(sequence_build_ms, 3),
                "ranking_ms": round(ranking_ms, 3),
                "session_update_ms": round(max(0.0, total_ms - accounted), 3),
                "total_ms": round(total_ms, 3),
                "encode_profile_ms": encode_profile,
            },
        }

    def _reset(self, request: dict) -> dict:
        session_id = str(request.get("session_id", "")).strip()
        removed = bool(session_id and self.sessions.pop(session_id, None) is not None)
        return {"status": "ok", "session_id": session_id or None, "removed": removed}

    def _forward_candidates(self, video_id: str, anchor_timestamp_ms: int) -> np.ndarray:
        normalized_video_id = str(video_id).upper()
        timestamps = self.video_timestamps.get(normalized_video_id)
        row_ids = self.video_row_ids.get(normalized_video_id)
        if timestamps is None or row_ids is None:
            return np.zeros((0,), dtype=np.int64)
        start = int(np.searchsorted(timestamps, int(anchor_timestamp_ms), side="right"))
        end = int(
            np.searchsorted(
                timestamps, int(anchor_timestamp_ms) + self.window_ms, side="right"
            )
        )
        return row_ids[start:end]

    def _stage_config(self, request: dict, *, required_model: str | None = None) -> dict:
        query = str(request.get("query", "")).strip()
        original_query = str(request.get("original_query", "")).strip()
        ocr_query = str(request.get("ocr_query", "")).strip()
        asr_query = str(request.get("asr_query", "")).strip()
        embedding_model = str(
            request.get("embedding_model", required_model or "metaclip")
        ).strip().lower()
        if embedding_model not in {"metaclip", "beit3"}:
            raise TemporalSearchError("embedding_model must be metaclip or beit3")
        if required_model is not None and embedding_model != required_model:
            raise TemporalSearchError(
                f"temporal session model is locked to {required_model}; reset and start from Query A to use {embedding_model}",
                409,
            )
        if embedding_model not in self.states or embedding_model not in self.embedders:
            raise TemporalSearchError(f"{embedding_model} search is unavailable", 503)
        try:
            semantic_weight = float(request.get("metaclip_weight", 1.0))
            ocr_weight = float(request.get("ocr_weight", 0.0))
            asr_weight = float(request.get("asr_weight", 0.0))
        except (TypeError, ValueError) as exc:
            raise TemporalSearchError(f"invalid fusion weight: {exc}") from None
        if any(weight < 0 or weight > 1 for weight in (semantic_weight, ocr_weight, asr_weight)):
            raise TemporalSearchError("fusion weights must be between 0 and 1")
        if semantic_weight + ocr_weight + asr_weight <= 0:
            raise TemporalSearchError("at least one fusion weight must be positive")
        if semantic_weight > 0 and not query:
            raise TemporalSearchError("query must not be empty when semantic weight is positive")
        if ocr_weight > 0 and not ocr_query:
            raise TemporalSearchError("ocr_query must not be empty when OCR weight is positive")
        if asr_weight > 0 and not asr_query:
            raise TemporalSearchError("asr_query must not be empty when ASR weight is positive")
        if ocr_weight > 0 and (self.ocr_index is None or self.fuse_ranked_results is None):
            raise TemporalSearchError("OCR search is unavailable", 503)
        if asr_weight > 0 and (self.asr_index is None or self.fuse_with_asr is None):
            raise TemporalSearchError("ASR search is unavailable", 503)
        return {
            "query": query,
            "original_query": original_query or query,
            "ocr_query": ocr_query,
            "asr_query": asr_query,
            "embedding_model": embedding_model,
            "search_mode": "hybrid" if ocr_weight > 0 or asr_weight > 0 else "visual",
            "metaclip_weight": semantic_weight,
            "ocr_weight": ocr_weight,
            "asr_weight": asr_weight,
        }

    def _prepare_stage(self, config: dict) -> dict:
        started = time.perf_counter()
        query_vector = None
        encode_profile = {}
        if config["query"] and config["metaclip_weight"] > 0:
            query_vector, encode_profile = self.embedders[
                config["embedding_model"]
            ].encode_text_profiled(config["query"])
        encode_ms = (time.perf_counter() - started) * 1000.0
        backends = [self.states[config["embedding_model"]].index.backend]
        if config["ocr_weight"] > 0:
            backends.append("ocr_fts5")
        if config["asr_weight"] > 0:
            backends.append("asr_fts5")
        return {
            "query_vector": query_vector,
            "encode_profile": encode_profile,
            "encode_ms": encode_ms,
            "asr_hits_by_video": {},
            "search_backend": "+".join(backends),
        }

    def _search_stage(
        self,
        config: dict,
        *,
        candidate_indices: np.ndarray | None,
        top_k: int,
        video_id: str | None,
        prepared: dict | None = None,
    ) -> tuple[list[dict], dict]:
        started = time.perf_counter()
        prepared = prepared or self._prepare_stage(config)
        state = self.states[config["embedding_model"]]
        candidate_values = None if candidate_indices is None else [int(value) for value in candidate_indices]
        candidate_set = None if candidate_values is None else set(candidate_values)
        use_ocr = config["ocr_weight"] > 0
        use_asr = config["asr_weight"] > 0
        requested_top_k = max(int(top_k), 400, int(top_k) * 4) if use_ocr or use_asr else int(top_k)

        retrieval_started = time.perf_counter()
        visual_results = []
        total_matches = 0
        if prepared["query_vector"] is not None and config["metaclip_weight"] > 0:
            selected, scores, total_matches = state.index.search(
                prepared["query_vector"],
                top_k=requested_top_k,
                min_score=None,
                candidate_indices=candidate_indices,
            )
            metadata = state.metadata.get_rows([int(value) for value in selected.tolist()])
            for row_id, raw_score in zip(selected, scores):
                record = metadata.get(int(row_id))
                if record is None:
                    continue
                visual_results.append({
                    "rank": len(visual_results) + 1,
                    "score": float(raw_score),
                    "keyframe_id": record["keyframe_id"],
                    "video_id": record["video_id"],
                    "shot_id": record.get("shot_id"),
                    "timestamp_ms": int(record.get("timestamp_ms") or 0),
                    "image_file": record.get("image_file"),
                    "source_embedding_row": int(row_id),
                })
        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000.0

        ocr_started = time.perf_counter()
        ocr_hits = []
        results = visual_results
        if use_ocr:
            ocr_hits = self.ocr_index.search(
                config["ocr_query"],
                limit=requested_top_k,
                video_id=video_id,
                candidate_row_ids=candidate_values,
            )
            results = self.fuse_ranked_results(
                visual_results if config["metaclip_weight"] > 0 else [],
                ocr_hits,
                top_k=requested_top_k if use_asr else top_k,
                visual_weight=config["metaclip_weight"],
                ocr_weight=config["ocr_weight"],
            )
        ocr_ms = (time.perf_counter() - ocr_started) * 1000.0

        asr_started = time.perf_counter()
        asr_hits = []
        if use_asr:
            cache_key = str(video_id or "").upper()
            if cache_key not in prepared["asr_hits_by_video"]:
                limit = requested_top_k if candidate_indices is None else None
                prepared["asr_hits_by_video"][cache_key] = self.asr_index.search(
                    config["asr_query"], limit=limit, video_id=video_id
                )
            asr_hits = prepared["asr_hits_by_video"][cache_key]
            if candidate_set is not None:
                asr_hits = [hit for hit in asr_hits if int(hit.row_id) in candidate_set]
            results = self.fuse_with_asr(
                results if config["metaclip_weight"] + config["ocr_weight"] > 0 else [],
                asr_hits,
                top_k=top_k,
                base_weight=config["metaclip_weight"] + config["ocr_weight"],
                asr_weight=config["asr_weight"],
            )
        elif len(results) > top_k:
            results = results[:top_k]
        asr_ms = (time.perf_counter() - asr_started) * 1000.0

        scenes = []
        for rank, item in enumerate(results[:top_k], start=1):
            row_id = int(item["source_embedding_row"])
            record = state.metadata.get_rows([row_id]).get(row_id)
            if record is None:
                continue
            fused = use_ocr or use_asr
            scene = self._scene(
                record,
                config["query"] or config["ocr_query"] or config["asr_query"],
                float(item.get("visual_score", item.get("score", 0.0)) or 0.0),
                rank,
                normalized_score=(
                    float(np.clip(item.get("score", 0.0), 0.0, 1.0))
                    if fused
                    else None
                ),
            )
            for key in (
                "ocr_text", "ocr_score", "ocr_rank", "asr_text", "asr_score",
                "asr_rank", "match_source", "fusion_score", "visual_score",
            ):
                if key in item:
                    scene[key] = item[key]
            scenes.append(scene)
        total_ms = (time.perf_counter() - started) * 1000.0
        return scenes, {
            "total_matches": int(total_matches or len({item.keyframe_id for item in ocr_hits} | {item.keyframe_id for item in asr_hits})),
            "search_backend": prepared["search_backend"],
            "total_ms": total_ms,
            "timings_ms": {
                "encode_query_ms": round(float(prepared["encode_ms"]), 3),
                "retrieval_ms": round(retrieval_ms, 3),
                "ocr_search_ms": round(ocr_ms, 3),
                "asr_search_ms": round(asr_ms, 3),
            },
        }

    @staticmethod
    def _normalize_score(raw_score: float) -> float:
        return float(np.clip((float(raw_score) + 1.0) / 2.0, 0.0, 1.0))

    @staticmethod
    def _harmonic_mean(scores: list[float]) -> float:
        if not scores or any(float(score) <= 0.0 for score in scores):
            return 0.0
        return float(len(scores) / math.fsum(1.0 / float(score) for score in scores))

    def _scene(
        self,
        record: dict,
        query: str,
        raw_score: float,
        rank: int,
        *,
        normalized_score: float | None = None,
    ) -> dict:
        timestamp_ms = int(record.get("timestamp_ms") or 0)
        return {
            "rank": int(rank),
            "query": query,
            "score": float(raw_score),
            "raw_score": float(raw_score),
            "normalized_score": (
                self._normalize_score(float(raw_score))
                if normalized_score is None
                else float(normalized_score)
            ),
            "keyframe_id": record["keyframe_id"],
            "video_id": record["video_id"],
            "shot_id": record.get("shot_id"),
            "timestamp_ms": timestamp_ms,
            "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
            "image_file": record.get("image_file"),
            "source_embedding_row": int(record["row_id"]),
        }

    @staticmethod
    def _sequence(scenes: list[dict], score: float, rank: int) -> dict:
        timestamps = [int(scene["timestamp_ms"]) for scene in scenes]
        shot_ids = [scene.get("shot_id") for scene in scenes]
        numeric_shots = [int(value) for value in shot_ids if value is not None]
        return {
            "rank": int(rank),
            "video_id": scenes[0]["video_id"],
            "sequence_score": float(score),
            "temporal_score": float(score),
            "span_seconds": round((timestamps[-1] - timestamps[0]) / 1000.0, 3),
            "span_shots": (
                int(max(numeric_shots) - min(numeric_shots)) if numeric_shots else 0
            ),
            "scenes": scenes,
        }

    def _expire_sessions(self) -> None:
        cutoff = time.time() - self.session_ttl_seconds
        expired = [
            session_id
            for session_id, session in self.sessions.items()
            if session.updated_at < cutoff
        ]
        for session_id in expired:
            self.sessions.pop(session_id, None)

    def _enforce_session_limit(self) -> None:
        overflow = len(self.sessions) - self.max_sessions
        if overflow <= 0:
            return
        oldest = sorted(self.sessions.values(), key=lambda session: session.updated_at)
        for session in oldest[:overflow]:
            self.sessions.pop(session.session_id, None)
