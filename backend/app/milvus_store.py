from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np


METADATA_FIELDS = (
    "keyframe_id",
    "video_id",
    "shot_id",
    "frame_idx",
    "timestamp_ms",
    "image_file",
    "image_path",
    "shot_start_frame",
    "shot_end_frame",
    "shot_start_ms",
    "shot_end_ms",
)
NULLABLE_INTEGER_FIELDS = {
    "shot_id",
    "frame_idx",
    "timestamp_ms",
    "shot_start_frame",
    "shot_end_frame",
    "shot_start_ms",
    "shot_end_ms",
}


@dataclass(frozen=True)
class MilvusSnapshot:
    embeddings: np.ndarray
    metadata: "RamMetadataStore"
    load_seconds: float
    server_version: str
    collection: str


class RamMetadataStore:
    def __init__(self, records: list[dict]):
        self.records = records
        self.keyframe_rows: dict[str, int] = {}
        video_rows: dict[str, list[int]] = {}
        for row_id, record in enumerate(records):
            if int(record["row_id"]) != row_id:
                raise ValueError(f"metadata row order mismatch at {row_id}")
            keyframe_id = str(record["keyframe_id"])
            if keyframe_id in self.keyframe_rows:
                raise ValueError(f"duplicate keyframe_id: {keyframe_id}")
            self.keyframe_rows[keyframe_id] = row_id
            video_rows.setdefault(str(record["video_id"]).upper(), []).append(row_id)
        self.video_rows = {
            video_id: np.asarray(row_ids, dtype=np.int64)
            for video_id, row_ids in video_rows.items()
        }

    def __len__(self) -> int:
        return len(self.records)

    def get_by_keyframe_id(self, keyframe_id: str) -> dict | None:
        row_id = self.keyframe_rows.get(str(keyframe_id))
        return None if row_id is None else self.records[row_id]

    def get_rows(self, row_ids: list[int]) -> dict[int, dict]:
        return {
            row_id: self.records[row_id]
            for value in row_ids
            if 0 <= (row_id := int(value)) < len(self.records)
        }

    def get_adjacent(self, row_id: int, video_id: str) -> dict:
        rows = self.get_rows([int(row_id) - 1, int(row_id) + 1])
        return {
            position: item
            for position, candidate_id in (
                ("previous", int(row_id) - 1),
                ("next", int(row_id) + 1),
            )
            if (item := rows.get(candidate_id)) is not None
            and str(item.get("video_id")) == str(video_id)
        }

    def candidate_indices_for_video(self, video_id: str | None):
        if not video_id:
            return None
        return self.video_rows.get(
            str(video_id).strip().upper(), np.zeros((0,), dtype=np.int64)
        )


class MilvusRepository:
    def __init__(
        self,
        host: str,
        port: int,
        collection: str,
        embedding_dim: int,
        batch_size: int = 5000,
    ):
        self.host = host
        self.port = int(port)
        self.collection_name = collection
        self.embedding_dim = int(embedding_dim)
        self.batch_size = int(batch_size)
        self.alias = "backend_storage_loader"

    def load(self) -> MilvusSnapshot:
        from pymilvus import Collection, connections, utility

        started = time.perf_counter()
        connections.connect(
            alias=self.alias,
            host=self.host,
            port=str(self.port),
            timeout=30,
        )
        try:
            if not utility.has_collection(self.collection_name, using=self.alias):
                raise RuntimeError(
                    f"Milvus collection does not exist: {self.collection_name}"
                )
            server_version = str(utility.get_server_version(using=self.alias))
            collection = Collection(self.collection_name, using=self.alias)
            self._validate_schema(collection)
            collection.load()
            utility.wait_for_loading_complete(
                self.collection_name, using=self.alias, timeout=900
            )
            count = int(collection.num_entities)
            embeddings = np.empty((count, self.embedding_dim), dtype=np.float32)
            records: list[dict | None] = [None] * count
            output_fields = ["row_id", *METADATA_FIELDS, "embedding"]

            for start in range(0, count, self.batch_size):
                end = min(start + self.batch_size, count)
                rows = collection.query(
                    expr=f"row_id >= {start} and row_id < {end}",
                    output_fields=output_fields,
                    limit=end - start,
                )
                rows.sort(key=lambda row: int(row["row_id"]))
                if [int(row["row_id"]) for row in rows] != list(range(start, end)):
                    raise RuntimeError(
                        f"Milvus row_id mismatch in range [{start}, {end})"
                    )
                embeddings[start:end] = np.asarray(
                    [row.pop("embedding") for row in rows], dtype=np.float32
                )
                for row in rows:
                    row_id = int(row["row_id"])
                    for field in NULLABLE_INTEGER_FIELDS:
                        if int(row[field]) == -1:
                            row[field] = None
                    records[row_id] = row
                print(f"[milvus-storage] loaded {end}/{count}", flush=True)

            if any(record is None for record in records):
                raise RuntimeError("Milvus snapshot contains missing metadata rows")
            metadata = RamMetadataStore(records)  # type: ignore[arg-type]
            collection.release()
            return MilvusSnapshot(
                embeddings=embeddings,
                metadata=metadata,
                load_seconds=round(time.perf_counter() - started, 3),
                server_version=server_version,
                collection=self.collection_name,
            )
        finally:
            connections.disconnect(self.alias)

    def _validate_schema(self, collection) -> None:
        fields = {field.name: field for field in collection.schema.fields}
        required = {"row_id", *METADATA_FIELDS, "embedding"}
        missing = sorted(required - fields.keys())
        if missing:
            raise RuntimeError(f"Milvus collection is missing fields: {missing}")
        actual_dim = int(fields["embedding"].params.get("dim", 0))
        if actual_dim != self.embedding_dim:
            raise RuntimeError(
                f"Milvus embedding dimension mismatch: {actual_dim} != {self.embedding_dim}"
            )
