from __future__ import annotations

import json
import re
import sqlite3
import threading
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

_TOKEN_RE = re.compile(r"\w+", flags=re.UNICODE)


def fold_asr_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", " ".join(str(value).casefold().split()))
    folded = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return folded.replace("đ", "d")


def build_asr_fts_query(query: str) -> str:
    tokens = [token for token in _TOKEN_RE.findall(fold_asr_text(query)) if token]
    if not tokens:
        raise ValueError("ASR query contains no searchable tokens")
    escaped = [token.replace('"', '""') for token in tokens]
    if len(escaped) == 1:
        return f'"{escaped[0]}"'
    phrase = " ".join(escaped)
    all_terms = " AND ".join(f'"{token}"' for token in escaped)
    return f'"{phrase}" OR ({all_terms})'


@dataclass(frozen=True)
class AsrHit:
    row_id: int
    keyframe_id: str
    video_id: str
    shot_id: int | None
    timestamp_ms: int
    image_file: str
    segment_id: int
    start_ms: int
    end_ms: int
    asr_text: str
    asr_score: float
    asr_rank: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "keyframe_id": self.keyframe_id,
            "video_id": self.video_id,
            "shot_id": self.shot_id,
            "timestamp_ms": self.timestamp_ms,
            "timestamp_seconds": round(self.timestamp_ms / 1000.0, 3),
            "image_file": self.image_file,
            "source_embedding_row": self.row_id,
            "asr_segment_id": self.segment_id,
            "asr_start_ms": self.start_ms,
            "asr_end_ms": self.end_ms,
            "asr_start_seconds": round(self.start_ms / 1000.0, 3),
            "asr_end_seconds": round(self.end_ms / 1000.0, 3),
            "asr_text": self.asr_text,
            "asr_score": self.asr_score,
            "asr_rank": self.asr_rank,
            "match_source": ["asr"],
        }


class AsrTextIndex:
    def __init__(self, path: Path, *, cache_in_memory: bool = False, excluded_indices=None):
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(f"ASR index not found: {self.path}")
        disk_conn = sqlite3.connect(
            f"file:{self.path.resolve()}?mode=ro",
            uri=True,
            check_same_thread=False,
        )
        if cache_in_memory:
            self.conn = sqlite3.connect(":memory:", check_same_thread=False)
            disk_conn.backup(self.conn)
            disk_conn.close()
        else:
            self.conn = disk_conn
        self.cache_mode = "memory" if cache_in_memory else "disk"
        self.conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self.conn.execute("CREATE TEMP TABLE excluded_rows (row_id INTEGER PRIMARY KEY)")
        if excluded_indices is not None:
            self.conn.executemany(
                "INSERT INTO excluded_rows(row_id) VALUES (?)",
                ((int(row_id),) for row_id in excluded_indices),
            )
        self.metadata = {
            str(row["key"]): json.loads(row["value"])
            for row in self.conn.execute("SELECT key, value FROM index_meta")
        }

    @property
    def num_segments(self) -> int:
        return int(self.metadata.get("num_segments", 0))

    @property
    def num_videos(self) -> int:
        return int(self.metadata.get("num_videos", 0))

    def search(
        self,
        query: str,
        *,
        limit: int | None,
        video_id: str | None = None,
    ) -> list[AsrHit]:
        if limit is not None and int(limit) <= 0:
            return []
        params: list[Any] = [build_asr_fts_query(query)]
        video_clause = ""
        if video_id:
            video_clause = " AND s.video_id = ?"
            params.append(str(video_id).strip().upper())
        limit_clause = ""
        if limit is not None:
            limit_clause = " LIMIT ?"
            params.append(int(limit))
        with self._lock:
            rows = self.conn.execute(
                f"""
                SELECT s.*, bm25(asr_fts, 1.0, 1.0) AS bm25_score
                FROM asr_fts
                JOIN asr_segments AS s ON s.segment_rowid = asr_fts.rowid
                WHERE asr_fts MATCH ?{video_clause}
                  AND NOT EXISTS (SELECT 1 FROM excluded_rows e WHERE e.row_id = s.row_id)
                ORDER BY bm25_score ASC, s.segment_rowid ASC{limit_clause}
                """,
                params,
            ).fetchall()
        return [
            AsrHit(
                row_id=int(row["row_id"]),
                keyframe_id=str(row["keyframe_id"]),
                video_id=str(row["video_id"]),
                shot_id=None if row["shot_id"] is None else int(row["shot_id"]),
                timestamp_ms=int(row["timestamp_ms"]),
                image_file=str(row["image_file"] or ""),
                segment_id=int(row["segment_id"]),
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]),
                asr_text=str(row["text_raw"] or ""),
                asr_score=max(0.0, -float(row["bm25_score"] or 0.0)),
                asr_rank=rank,
            )
            for rank, row in enumerate(rows, start=1)
        ]


def fuse_with_asr(
    base_results: list[dict[str, Any]],
    asr_hits: list[AsrHit],
    *,
    top_k: int,
    base_weight: float,
    asr_weight: float,
    rrf_k: int = 60,
) -> list[dict[str, Any]]:
    base_weight = max(0.0, float(base_weight))
    asr_weight = max(0.0, float(asr_weight))
    weight_sum = base_weight + asr_weight
    if weight_sum <= 0:
        return []
    base_weight /= weight_sum
    asr_weight /= weight_sum
    fused: dict[str, dict[str, Any]] = {}
    ranks: dict[str, tuple[int | None, int | None]] = {}
    for base_rank, result in enumerate(base_results, start=1):
        keyframe_id = str(result["keyframe_id"])
        item = dict(result)
        item["base_rank"] = base_rank
        item.setdefault("asr_rank", None)
        item.setdefault("asr_score", None)
        item.setdefault("asr_text", "")
        item.setdefault("match_source", ["visual"])
        fused[keyframe_id] = item
        ranks[keyframe_id] = (base_rank, None)
    for hit in asr_hits:
        keyframe_id = hit.keyframe_id
        if keyframe_id in fused:
            base_rank, previous_asr_rank = ranks[keyframe_id]
            if previous_asr_rank is not None:
                continue
            item = fused[keyframe_id]
            sources = list(item.get("match_source") or [])
            if "asr" not in sources:
                sources.append("asr")
            item.update(hit.as_dict())
            item["match_source"] = sources
            item["base_rank"] = base_rank
            ranks[keyframe_id] = (base_rank, hit.asr_rank)
        else:
            item = hit.as_dict()
            item["base_rank"] = None
            fused[keyframe_id] = item
            ranks[keyframe_id] = (None, hit.asr_rank)
    for keyframe_id, item in fused.items():
        base_rank, asr_rank = ranks[keyframe_id]
        score = 0.0
        if base_rank is not None and base_weight > 0:
            score += base_weight / (rrf_k + base_rank)
        if asr_rank is not None and asr_weight > 0:
            score += asr_weight / (rrf_k + asr_rank)
        item["_fusion_score"] = score
    ranked = sorted(fused.values(), key=lambda item: (-float(item["_fusion_score"]), str(item["keyframe_id"])))
    if top_k > 0:
        ranked = ranked[:top_k]
    max_score = max((float(item["_fusion_score"]) for item in ranked), default=1.0)
    for rank, item in enumerate(ranked, start=1):
        raw_score = float(item.pop("_fusion_score"))
        item["rank"] = rank
        item["fusion_score"] = raw_score
        item["score"] = raw_score / max_score if max_score > 0 else 0.0
    return ranked


def _load_frame_metadata(records_db: Path):
    conn = sqlite3.connect(f"file:{Path(records_db).resolve()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows_by_video: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows_by_shot: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    try:
        for row in conn.execute("SELECT * FROM records ORDER BY video_id, row_id"):
            item = dict(row)
            video_id = str(item["video_id"])
            rows_by_video[video_id].append(item)
            if item["shot_id"] is not None:
                rows_by_shot[(video_id, int(item["shot_id"]))].append(item)
    finally:
        conn.close()
    shots_by_video: dict[str, list[tuple[int, int, int]]] = defaultdict(list)
    for (video_id, shot_id), rows in rows_by_shot.items():
        starts = [int(row["shot_start_ms"]) for row in rows if row["shot_start_ms"] is not None]
        ends = [int(row["shot_end_ms"]) for row in rows if row["shot_end_ms"] is not None]
        if starts and ends:
            shots_by_video[video_id].append((shot_id, min(starts), max(ends)))
    for shots in shots_by_video.values():
        shots.sort(key=lambda item: (item[1], item[2], item[0]))
    return rows_by_video, rows_by_shot, shots_by_video


def _representative_frame(
    video_id: str,
    start_ms: int,
    end_ms: int,
    rows_by_video,
    rows_by_shot,
    shots_by_video,
) -> tuple[dict[str, Any], int]:
    midpoint = (start_ms + end_ms) // 2
    overlaps = []
    for shot_id, shot_start_ms, shot_end_ms in shots_by_video.get(video_id, []):
        overlap_ms = max(0, min(end_ms, shot_end_ms) - max(start_ms, shot_start_ms))
        if overlap_ms > 0:
            overlaps.append((overlap_ms, -abs(((shot_start_ms + shot_end_ms) // 2) - midpoint), shot_id))
    if overlaps:
        overlap_ms, _, shot_id = max(overlaps)
        candidates = rows_by_shot[(video_id, shot_id)]
    else:
        overlap_ms = 0
        candidates = rows_by_video.get(video_id, [])
    if not candidates:
        raise ValueError(f"no frame metadata for ASR video {video_id}")
    frame = min(candidates, key=lambda row: (abs(int(row["timestamp_ms"]) - midpoint), int(row["row_id"])))
    return frame, overlap_ms


def build_asr_index(*, asr_videos_dir: Path, records_db: Path, output_path: Path) -> dict[str, Any]:
    asr_videos_dir = Path(asr_videos_dir)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.unlink(missing_ok=True)
    rows_by_video, rows_by_shot, shots_by_video = _load_frame_metadata(records_db)

    conn = sqlite3.connect(temp_path)
    video_count = segment_count = 0
    try:
        conn.executescript(
            """
            PRAGMA journal_mode=DELETE;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE asr_segments (
                segment_rowid INTEGER PRIMARY KEY,
                video_id TEXT NOT NULL,
                segment_id INTEGER NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                text_raw TEXT NOT NULL,
                text_normalized TEXT NOT NULL,
                row_id INTEGER NOT NULL,
                keyframe_id TEXT NOT NULL,
                shot_id INTEGER,
                timestamp_ms INTEGER NOT NULL,
                image_file TEXT NOT NULL,
                overlap_ms INTEGER NOT NULL,
                UNIQUE(video_id, segment_id)
            );
            """
        )
        batch = []
        for path in sorted(asr_videos_dir.glob("L*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("status") != "ok":
                raise ValueError(f"ASR artifact is not successful: {path}")
            video_id = str(payload["video_id"])
            if video_id not in rows_by_video:
                raise ValueError(f"ASR video is absent from frame metadata: {video_id}")
            video_count += 1
            for segment in payload.get("segments", []):
                start_ms = int(segment["start_ms"])
                end_ms = int(segment["end_ms"])
                if not 0 <= start_ms < end_ms:
                    raise ValueError(f"invalid ASR timestamp: {video_id} segment {segment.get('segment_id')}")
                frame, overlap_ms = _representative_frame(
                    video_id,
                    start_ms,
                    end_ms,
                    rows_by_video,
                    rows_by_shot,
                    shots_by_video,
                )
                text_raw = str(segment.get("text_raw") or "").strip()
                normalized = fold_asr_text(str(segment.get("text_normalized") or text_raw))
                batch.append(
                    (
                        segment_count + 1,
                        video_id,
                        int(segment["segment_id"]),
                        start_ms,
                        end_ms,
                        text_raw,
                        normalized,
                        int(frame["row_id"]),
                        str(frame["keyframe_id"]),
                        None if frame["shot_id"] is None else int(frame["shot_id"]),
                        int(frame["timestamp_ms"]),
                        str(frame["image_file"] or ""),
                        int(overlap_ms),
                    )
                )
                segment_count += 1
                if len(batch) >= 5000:
                    conn.executemany("INSERT INTO asr_segments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch)
                    batch.clear()
        if batch:
            conn.executemany("INSERT INTO asr_segments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch)
        conn.executescript(
            """
            CREATE INDEX idx_asr_segments_video_id ON asr_segments(video_id);
            CREATE INDEX idx_asr_segments_row_id ON asr_segments(row_id);
            CREATE INDEX idx_asr_segments_shot ON asr_segments(video_id, shot_id);
            CREATE VIRTUAL TABLE asr_fts USING fts5(
                text_raw,
                text_normalized,
                content='asr_segments',
                content_rowid='segment_rowid',
                tokenize='unicode61 remove_diacritics 2'
            );
            INSERT INTO asr_fts(rowid, text_raw, text_normalized)
            SELECT segment_rowid, text_raw, text_normalized FROM asr_segments WHERE text_normalized != '';
            """
        )
        fallback_count = int(conn.execute("SELECT COUNT(*) FROM asr_segments WHERE overlap_ms = 0").fetchone()[0])
        metadata = {
            "schema_version": 1,
            "num_videos": video_count,
            "num_segments": segment_count,
            "num_fallback_mappings": fallback_count,
            "source_asr_videos_dir": str(asr_videos_dir.resolve()),
            "source_records_db": str(Path(records_db).resolve()),
        }
        conn.executemany(
            "INSERT INTO index_meta(key, value) VALUES (?, ?)",
            [(key, json.dumps(value, ensure_ascii=False)) for key, value in metadata.items()],
        )
        conn.commit()
    finally:
        conn.close()
    temp_path.replace(output_path)
    return {"output_path": str(output_path), **metadata}
