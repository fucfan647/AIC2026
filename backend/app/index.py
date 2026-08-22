from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Literal

import numpy as np

from .config import EMBEDDING_DIM

SearchBackend = Literal["linear", "torch-gpu"]


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON at {path}:{line_no}: {exc}") from exc


def sample_validate_embeddings(
    embeddings: np.ndarray,
    expected_dim: int | None = None,
    sample_count: int = 128,
) -> None:
    if embeddings.ndim != 2 or (expected_dim is not None and embeddings.shape[1] != expected_dim):
        expected = "N x D" if expected_dim is None else f"N x {expected_dim}"
        raise ValueError(f"embedding matrix must be ({expected}), got {embeddings.shape}")
    if len(embeddings) == 0:
        return
    sample_count = min(sample_count, len(embeddings))
    indices = np.unique(np.linspace(0, len(embeddings) - 1, sample_count, dtype=np.int64))
    sample = np.asarray(embeddings[indices], dtype=np.float32)
    if not np.isfinite(sample).all():
        raise ValueError("sampled embeddings contain NaN or Inf")
    norms = np.linalg.norm(sample, axis=1)
    bad = np.flatnonzero(np.abs(norms - 1.0) > 1e-2)
    if len(bad):
        raise ValueError(f"sampled embeddings are not normalized; sample row {int(bad[0])} norm={float(norms[bad[0]]):.6f}")


class LinearIndex:
    backend: SearchBackend = "linear"

    def __init__(self, embeddings: np.ndarray, excluded_indices: np.ndarray | None = None):
        self.embeddings = np.asarray(embeddings, dtype=np.float32)
        self.excluded_mask = np.zeros((len(self.embeddings),), dtype=bool)
        if excluded_indices is not None:
            self.excluded_mask[np.asarray(excluded_indices, dtype=np.int64)] = True

    @property
    def num_vectors(self) -> int:
        return int(self.embeddings.shape[0])

    @property
    def dim(self) -> int:
        return int(self.embeddings.shape[1])

    def search(self, query: np.ndarray, top_k: int, min_score: float | None, candidate_indices: np.ndarray | None = None):
        query = np.asarray(query, dtype=np.float32).reshape(-1)
        if query.shape != (self.dim,):
            raise ValueError(f"query vector shape must be ({self.dim},), got {query.shape}")
        if candidate_indices is None:
            candidates = np.flatnonzero(~self.excluded_mask)
            scores = np.asarray(self.embeddings @ query, dtype=np.float32)
        else:
            candidates = np.asarray(candidate_indices, dtype=np.int64).reshape(-1)
            candidates = candidates[~self.excluded_mask[candidates]]
            scores = np.zeros((self.num_vectors,), dtype=np.float32)
            if len(candidates):
                scores[candidates] = np.asarray(self.embeddings[candidates] @ query, dtype=np.float32)
        if min_score is not None:
            candidates = candidates[scores[candidates] >= float(min_score)]
        total_matches = int(len(candidates))
        if top_k <= 0 or top_k >= total_matches:
            selected = candidates[np.argsort(-scores[candidates])] if total_matches else candidates
        else:
            rough = candidates[np.argpartition(-scores[candidates], top_k - 1)[:top_k]]
            selected = rough[np.argsort(-scores[rough])]
        return selected.astype(np.int64), scores[selected].astype(np.float32), total_matches


class TorchGpuIndex:
    backend: SearchBackend = "torch-gpu"

    def __init__(self, embeddings: np.ndarray, device: str = "cuda", dtype: str = "float16", excluded_indices: np.ndarray | None = None):
        import torch

        if dtype not in {"float16", "float32"}:
            raise ValueError("dtype must be float16 or float32")
        self.torch = torch
        self.device = torch.device(device)
        self.dtype_name = dtype
        torch_dtype = torch.float16 if dtype == "float16" else torch.float32
        source = torch.from_numpy(np.asarray(embeddings))
        self.embeddings = source.to(device=self.device, dtype=torch_dtype).contiguous()
        self.excluded_mask = torch.zeros((len(self.embeddings),), dtype=torch.bool, device=self.device)
        if excluded_indices is not None and len(excluded_indices):
            excluded_tensor = torch.as_tensor(
                np.asarray(excluded_indices, dtype=np.int64), device=self.device, dtype=torch.long
            )
            self.excluded_mask[excluded_tensor] = True
        torch.cuda.synchronize(self.device)

    @property
    def num_vectors(self) -> int:
        return int(self.embeddings.shape[0])

    @property
    def dim(self) -> int:
        return int(self.embeddings.shape[1])

    @property
    def memory_bytes(self) -> int:
        return int(self.embeddings.numel() * self.embeddings.element_size())

    def search(self, query, top_k: int, min_score: float | None, candidate_indices: np.ndarray | None = None):
        torch = self.torch
        if torch.is_tensor(query):
            query_tensor = query.detach().reshape(-1).to(device=self.device, dtype=self.embeddings.dtype)
        else:
            query_tensor = torch.as_tensor(np.asarray(query), device=self.device, dtype=self.embeddings.dtype).reshape(-1)
        if tuple(query_tensor.shape) != (self.dim,):
            raise ValueError(f"query vector shape must be ({self.dim},), got {tuple(query_tensor.shape)}")
        if candidate_indices is None:
            candidate_base = None
            candidate_embeddings = self.embeddings
            candidate_count = self.num_vectors
            eligible = ~self.excluded_mask
        else:
            candidate_np = np.asarray(candidate_indices, dtype=np.int64).reshape(-1)
            candidate_base = torch.as_tensor(candidate_np, device=self.device, dtype=torch.long)
            candidate_embeddings = self.embeddings.index_select(0, candidate_base)
            candidate_count = int(candidate_base.numel())
            eligible = ~self.excluded_mask.index_select(0, candidate_base)
        scores = torch.mv(candidate_embeddings, query_tensor)
        if min_score is not None:
            eligible &= scores >= float(min_score)
        keep = torch.nonzero(eligible, as_tuple=False).reshape(-1)
        filtered_scores = scores.index_select(0, keep)
        total_matches = int(keep.numel())
        selected_count = total_matches if top_k <= 0 else min(int(top_k), total_matches)
        if selected_count:
            selected_scores, positions = torch.topk(filtered_scores, selected_count, largest=True, sorted=True)
            positions = keep.index_select(0, positions)
            selected = positions if candidate_base is None else candidate_base.index_select(0, positions)
        else:
            selected = torch.empty((0,), dtype=torch.long, device=self.device)
            selected_scores = torch.empty((0,), dtype=self.embeddings.dtype, device=self.device)
        torch.cuda.synchronize(self.device)
        return selected.cpu().numpy().astype(np.int64), selected_scores.float().cpu().numpy().astype(np.float32), total_matches


class MetadataStore:
    def __init__(self, sqlite_path: Path, video_ranges_path: Path):
        self.sqlite_path = sqlite_path
        self.conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.video_ranges = json.loads(video_ranges_path.read_text(encoding="utf-8")) if video_ranges_path.is_file() else {}

    def get_by_keyframe_id(self, keyframe_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM records WHERE keyframe_id = ?",
            (str(keyframe_id),),
        ).fetchone()
        return None if row is None else dict(row)

    def get_rows(self, row_ids: list[int]) -> dict[int, dict]:
        if not row_ids:
            return {}
        found: dict[int, dict] = {}
        for start in range(0, len(row_ids), 900):
            chunk = [int(value) for value in row_ids[start : start + 900]]
            placeholders = ",".join("?" for _ in chunk)
            rows = self.conn.execute(
                f"SELECT * FROM records WHERE row_id IN ({placeholders})",
                chunk,
            ).fetchall()
            for row in rows:
                item = dict(row)
                found[int(item["row_id"])] = item
        return found

    def get_adjacent(self, row_id: int, video_id: str) -> dict:
        rows = self.get_rows([int(row_id) - 1, int(row_id) + 1])
        return {
            position: item
            for position, candidate_id in (("previous", int(row_id) - 1), ("next", int(row_id) + 1))
            if (item := rows.get(candidate_id)) is not None and str(item.get("video_id")) == str(video_id)
        }

    def candidate_indices_for_video(self, video_id: str | None):
        if not video_id:
            return None
        item = self.video_ranges.get(str(video_id).strip().upper())
        if not item:
            return np.zeros((0,), dtype=np.int64)
        return np.arange(int(item["start"]), int(item["end"]), dtype=np.int64)


class RetrievalState:
    def __init__(
        self,
        records_db: Path,
        video_ranges_path: Path,
        embeddings_path: Path,
        config_path: Path,
        *,
        backend: SearchBackend,
        device: str,
        gpu_dtype: str,
        embedding_dim: int | None = EMBEDDING_DIM,
        excluded_indices: np.ndarray | None = None,
        milvus_host: str | None = None,
        milvus_port: int = 19533,
        milvus_collection: str | None = None,
    ):
        started = time.perf_counter()
        self.records_db = records_db
        self.video_ranges_path = video_ranges_path
        self.embeddings_path = embeddings_path
        self.config_path = config_path
        self.config = json.loads(config_path.read_text(encoding="utf-8"))
        self.storage_backend = "npy"
        self.metadata_backend = "sqlite"
        self.milvus_collection = None
        self.milvus_version = None
        self.milvus_load_seconds = None
        if milvus_collection:
            if not milvus_host:
                raise ValueError("milvus_host is required when milvus_collection is set")
            from .milvus_store import MilvusRepository

            snapshot = MilvusRepository(
                host=milvus_host,
                port=milvus_port,
                collection=milvus_collection,
                embedding_dim=int(embedding_dim or EMBEDDING_DIM),
            ).load()
            self.embeddings = snapshot.embeddings
            self.metadata = snapshot.metadata
            self.storage_backend = "milvus"
            self.metadata_backend = "ram"
            self.milvus_collection = snapshot.collection
            self.milvus_version = snapshot.server_version
            self.milvus_load_seconds = snapshot.load_seconds
        else:
            self.embeddings = np.load(embeddings_path, mmap_mode="r")
            self.metadata = MetadataStore(records_db, video_ranges_path)
        expected_records = int(self.config.get("num_metadata", self.embeddings.shape[0]))
        if expected_records != len(self.embeddings):
            raise ValueError(f"metadata/vector mismatch: {expected_records} != {len(self.embeddings)}")
        sample_validate_embeddings(self.embeddings, expected_dim=embedding_dim)
        self.index = (
            TorchGpuIndex(self.embeddings, device=device, dtype=gpu_dtype, excluded_indices=excluded_indices)
            if backend == "torch-gpu"
            else LinearIndex(self.embeddings, excluded_indices=excluded_indices)
        )
        self.load_seconds = round(time.perf_counter() - started, 3)

    def candidates_for_video(self, video_id: str | None):
        return self.metadata.candidate_indices_for_video(video_id)
