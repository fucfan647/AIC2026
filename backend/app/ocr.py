from __future__ import annotations

import json
import math
import re
import sqlite3
import threading
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


_TOKEN_RE = re.compile(r"\w+", flags=re.UNICODE)


def normalize_ocr_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value)).casefold().split())


def fold_ocr_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", normalize_ocr_text(value))
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def build_fts_query(query: str, *, preserve_diacritics: bool = False) -> str:
    text = normalize_ocr_text(query) if preserve_diacritics else fold_ocr_text(query)
    tokens = [token for token in _TOKEN_RE.findall(text) if token]
    if not tokens:
        raise ValueError("OCR query contains no searchable tokens")
    escaped = [token.replace('"', '""') for token in tokens]
    if len(escaped) == 1:
        return f'"{escaped[0]}"'
    phrase = " ".join(escaped)
    all_terms = " AND ".join(f'"{token}"' for token in escaped)
    return f'"{phrase}" OR ({all_terms})'


@dataclass(frozen=True)
class OcrHit:
    row_id: int
    keyframe_id: str
    video_id: str
    shot_id: int | None
    timestamp_ms: int
    image_file: str
    ocr_text: str
    avg_confidence: float
    max_confidence: float
    line_count: int
    ocr_score: float
    ocr_rank: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "keyframe_id": self.keyframe_id,
            "video_id": self.video_id,
            "shot_id": self.shot_id,
            "timestamp_ms": self.timestamp_ms,
            "timestamp_seconds": round(self.timestamp_ms / 1000.0, 3),
            "image_file": self.image_file,
            "source_embedding_row": self.row_id,
            "ocr_text": self.ocr_text,
            "ocr_avg_confidence": self.avg_confidence,
            "ocr_max_confidence": self.max_confidence,
            "ocr_line_count": self.line_count,
            "ocr_score": self.ocr_score,
            "ocr_rank": self.ocr_rank,
        }


class OcrTextIndex:
    def __init__(self, path: Path, *, cache_in_memory: bool = False, excluded_indices=None):
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(f"OCR index not found: {self.path}")
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
        self.preserve_diacritics = self.ocr_model.casefold().startswith("monkey")
        if self.preserve_diacritics and self.metadata.get("search_diacritics") != "preserve":
            self.conn.close()
            raise ValueError(f"MonkeyOCR index needs accent-aware reindexing: {self.path}")

    @property
    def num_records(self) -> int:
        return int(self.metadata.get("num_records", 0))

    @property
    def num_text_records(self) -> int:
        return int(self.metadata.get("num_text_records", 0))

    @property
    def source_num_records(self) -> int:
        return int(self.metadata.get("source_num_records", self.num_records))

    @property
    def coverage_ratio(self) -> float:
        denominator = self.source_num_records
        return self.num_records / denominator if denominator else 0.0

    @property
    def is_partial(self) -> bool:
        return bool(self.metadata.get("is_partial", self.num_records != self.source_num_records))

    @property
    def ocr_model(self) -> str:
        return str(self.metadata.get("ocr_model", "unknown"))

    def search(
        self,
        query: str,
        *,
        limit: int | None,
        video_id: str | None = None,
        candidate_row_ids: Iterable[int] | None = None,
    ) -> list[OcrHit]:
        if limit is not None and int(limit) <= 0:
            return []
        params: list[Any] = [build_fts_query(query, preserve_diacritics=self.preserve_diacritics)]
        bm25_expression = "bm25(ocr_fts, 1.0)" if self.preserve_diacritics else "bm25(ocr_fts, 1.0, 1.0)"
        video_clause = ""
        if video_id:
            video_clause = " AND f.video_id = ?"
            params.append(str(video_id).strip().upper())
        candidate_clause = ""
        if candidate_row_ids is not None:
            candidate_ids = list(dict.fromkeys(int(value) for value in candidate_row_ids))
            if not candidate_ids:
                return []
            candidate_clause = f" AND f.row_id IN ({','.join('?' for _ in candidate_ids)})"
            params.extend(candidate_ids)
        limit_clause = ""
        if limit is not None:
            limit_clause = " LIMIT ?"
            params.append(int(limit))
        with self._lock:
            rows = self.conn.execute(
                f"""
                SELECT f.*, {bm25_expression} AS bm25_score
                FROM ocr_fts
                JOIN ocr_frames AS f ON f.row_id = ocr_fts.rowid
                WHERE ocr_fts MATCH ?{video_clause}{candidate_clause}
                  AND NOT EXISTS (SELECT 1 FROM excluded_rows e WHERE e.row_id = f.row_id)
                ORDER BY bm25_score ASC, f.row_id ASC{limit_clause}
                """,
                params,
            ).fetchall()
        return [
            OcrHit(
                row_id=int(row["row_id"]),
                keyframe_id=str(row["keyframe_id"]),
                video_id=str(row["video_id"]),
                shot_id=None if row["shot_id"] is None else int(row["shot_id"]),
                timestamp_ms=int(row["timestamp_ms"] or 0),
                image_file=str(row["image_file"] or ""),
                ocr_text=str(row["ocr_text"] or ""),
                avg_confidence=float(row["avg_confidence"] or 0.0),
                max_confidence=float(row["max_confidence"] or 0.0),
                line_count=int(row["line_count"] or 0),
                ocr_score=max(0.0, -float(row["bm25_score"] or 0.0)),
                ocr_rank=rank,
            )
            for rank, row in enumerate(rows, start=1)
        ]

    def get_frame_ocr(self, row_id: int | None = None, keyframe_id: str | None = None) -> dict[str, Any] | None:
        if row_id is None and not keyframe_id:
            return None
        with self._lock:
            if row_id is not None:
                row = self.conn.execute(
                    "SELECT ocr_text, avg_confidence, max_confidence, line_count FROM ocr_frames WHERE row_id = ?",
                    (int(row_id),),
                ).fetchone()
            else:
                row = self.conn.execute(
                    "SELECT ocr_text, avg_confidence, max_confidence, line_count FROM ocr_frames WHERE keyframe_id = ?",
                    (str(keyframe_id),),
                ).fetchone()
        if row is None:
            return None
        return {
            "ocr_text": str(row["ocr_text"] or ""),
            "avg_confidence": float(row["avg_confidence"] or 0.0),
            "max_confidence": float(row["max_confidence"] or 0.0),
            "line_count": int(row["line_count"] or 0),
        }


class UnionOcrIndex:
    """
    Union OCR index combining multiple OCR engines (e.g. MonkeyOCR and PP-OCR/PaddleOCR).
    - Merges search hits across all underlying indexes.
    - Boosts hits detected by multiple engines (multi-engine consensus).
    - Combines frame-level OCR text and confidences.
    - Fully implements the OcrTextIndex interface.
    """

    def __init__(self, indexes: list[OcrTextIndex], *, name: str = "union"):
        self.indexes = [idx for idx in indexes if idx is not None]
        self.name = name
        self.cache_mode = "memory" if any(getattr(idx, "cache_mode", "") == "memory" for idx in self.indexes) else "disk"

    @property
    def num_records(self) -> int:
        return max((idx.num_records for idx in self.indexes), default=0)

    @property
    def num_text_records(self) -> int:
        return max((idx.num_text_records for idx in self.indexes), default=0)

    @property
    def source_num_records(self) -> int:
        return max((idx.source_num_records for idx in self.indexes), default=0)

    @property
    def coverage_ratio(self) -> float:
        return max((idx.coverage_ratio for idx in self.indexes), default=0.0)

    @property
    def is_partial(self) -> bool:
        return any(idx.is_partial for idx in self.indexes)

    @property
    def ocr_model(self) -> str:
        models = [idx.ocr_model for idx in self.indexes]
        return f"union ({'+'.join(models)})" if models else "union"

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "ocr_model": self.ocr_model,
            "sub_models": [idx.ocr_model for idx in self.indexes],
            "num_records": self.num_records,
            "num_text_records": self.num_text_records,
            "source_num_records": self.source_num_records,
            "coverage_ratio": self.coverage_ratio,
            "is_partial": self.is_partial,
            "cache_mode": self.cache_mode,
        }

    def search(
        self,
        query: str,
        *,
        limit: int | None,
        video_id: str | None = None,
        candidate_row_ids: Iterable[int] | None = None,
    ) -> list[OcrHit]:
        if limit is not None and int(limit) <= 0:
            return []
        if not self.indexes:
            return []

        c_ids = list(candidate_row_ids) if candidate_row_ids is not None else None
        sub_limit = None if limit is None else max(int(limit) * 2, 500)

        all_hits: list[list[OcrHit]] = []
        for idx in self.indexes:
            try:
                hits = idx.search(
                    query,
                    limit=sub_limit,
                    video_id=video_id,
                    candidate_row_ids=c_ids,
                )
                all_hits.append(hits)
            except ValueError:
                continue

        if not all_hits:
            return []

        merged: dict[str, dict[str, Any]] = {}
        for hits in all_hits:
            for hit in hits:
                kid = hit.keyframe_id
                if kid not in merged:
                    merged[kid] = {
                        "base_hit": hit,
                        "engines_count": 1,
                        "max_score": hit.ocr_score,
                        "scores": [hit.ocr_score],
                        "texts": [hit.ocr_text] if hit.ocr_text else [],
                        "avg_confidences": [hit.avg_confidence],
                        "max_confidences": [hit.max_confidence],
                        "line_counts": [hit.line_count],
                    }
                else:
                    entry = merged[kid]
                    entry["engines_count"] += 1
                    entry["max_score"] = max(entry["max_score"], hit.ocr_score)
                    entry["scores"].append(hit.ocr_score)
                    if hit.ocr_text and hit.ocr_text not in entry["texts"]:
                        entry["texts"].append(hit.ocr_text)
                    entry["avg_confidences"].append(hit.avg_confidence)
                    entry["max_confidences"].append(hit.max_confidence)
                    entry["line_counts"].append(hit.line_count)

        final_hits: list[OcrHit] = []
        for kid, entry in merged.items():
            base: OcrHit = entry["base_hit"]
            # Consensus boost: if confirmed by multiple engines, boost by 15%
            if entry["engines_count"] > 1:
                combined_score = entry["max_score"] * 1.15
            else:
                combined_score = entry["max_score"]

            texts = entry["texts"]
            if len(texts) == 0:
                combined_text = base.ocr_text
            elif len(texts) == 1:
                combined_text = texts[0]
            else:
                t1, t2 = texts[0], texts[1]
                if fold_ocr_text(t1) == fold_ocr_text(t2):
                    combined_text = t1
                elif t1 in t2:
                    combined_text = t2
                elif t2 in t1:
                    combined_text = t1
                else:
                    combined_text = " | ".join(texts)

            avg_conf = max(entry["avg_confidences"]) if entry["avg_confidences"] else base.avg_confidence
            max_conf = max(entry["max_confidences"]) if entry["max_confidences"] else base.max_confidence
            line_cnt = max(entry["line_counts"]) if entry["line_counts"] else base.line_count

            final_hits.append(
                OcrHit(
                    row_id=base.row_id,
                    keyframe_id=base.keyframe_id,
                    video_id=base.video_id,
                    shot_id=base.shot_id,
                    timestamp_ms=base.timestamp_ms,
                    image_file=base.image_file,
                    ocr_text=combined_text,
                    avg_confidence=avg_conf,
                    max_confidence=max_conf,
                    line_count=line_cnt,
                    ocr_score=combined_score,
                    ocr_rank=0,
                )
            )

        final_hits.sort(key=lambda h: (-h.ocr_score, h.row_id))
        if limit is not None:
            final_hits = final_hits[:limit]

        return [
            OcrHit(
                row_id=h.row_id,
                keyframe_id=h.keyframe_id,
                video_id=h.video_id,
                shot_id=h.shot_id,
                timestamp_ms=h.timestamp_ms,
                image_file=h.image_file,
                ocr_text=h.ocr_text,
                avg_confidence=h.avg_confidence,
                max_confidence=h.max_confidence,
                line_count=h.line_count,
                ocr_score=h.ocr_score,
                ocr_rank=rank,
            )
            for rank, h in enumerate(final_hits, start=1)
        ]

    def get_frame_ocr(self, row_id: int | None = None, keyframe_id: str | None = None) -> dict[str, Any] | None:
        if row_id is None and not keyframe_id:
            return None
        sub_results = [
            idx.get_frame_ocr(row_id=row_id, keyframe_id=keyframe_id)
            for idx in self.indexes
        ]
        valid_results = [r for r in sub_results if r is not None and (r.get("ocr_text") or r.get("line_count", 0) > 0)]
        if not valid_results:
            non_none = [r for r in sub_results if r is not None]
            return non_none[0] if non_none else None

        texts: list[str] = []
        for r in valid_results:
            t = str(r.get("ocr_text", "")).strip()
            if t and t not in texts:
                texts.append(t)

        if not texts:
            combined_text = ""
        elif len(texts) == 1:
            combined_text = texts[0]
        else:
            t1, t2 = texts[0], texts[1]
            if fold_ocr_text(t1) == fold_ocr_text(t2):
                combined_text = t1
            elif t1 in t2:
                combined_text = t2
            elif t2 in t1:
                combined_text = t1
            else:
                combined_text = " | ".join(texts)

        return {
            "ocr_text": combined_text,
            "avg_confidence": max((float(r.get("avg_confidence", 0.0)) for r in valid_results), default=0.0),
            "max_confidence": max((float(r.get("max_confidence", 0.0)) for r in valid_results), default=0.0),
            "line_count": max((int(r.get("line_count", 0)) for r in valid_results), default=0),
        }



def fuse_ranked_results(
    visual_results: list[dict[str, Any]],
    ocr_hits: list[OcrHit],
    *,
    top_k: int,
    visual_weight: float,
    ocr_weight: float,
    rrf_k: int = 60,
) -> list[dict[str, Any]]:
    del rrf_k  # Retained in the signature for compatibility with existing callers.
    epsilon = 1e-6
    visual_weight = max(0.0, float(visual_weight))
    ocr_weight = max(0.0, float(ocr_weight))
    weight_sum = visual_weight + ocr_weight
    if weight_sum <= 0:
        return []
    visual_weight /= weight_sum
    ocr_weight /= weight_sum

    def minmax(scores: dict[str, float]) -> dict[str, float]:
        if not scores:
            return {}
        minimum = min(scores.values())
        maximum = max(scores.values())
        span = maximum - minimum
        if span <= epsilon:
            return {key: 1.0 for key in scores}
        return {key: (value - minimum) / span for key, value in scores.items()}

    visual_normalized = minmax({
        str(result["keyframe_id"]): float(result.get("score", 0.0))
        for result in visual_results
    })
    ocr_normalized = minmax({hit.keyframe_id: float(hit.ocr_score) for hit in ocr_hits})
    fused: dict[str, dict[str, Any]] = {}
    for visual_rank, result in enumerate(visual_results, start=1):
        item = dict(result)
        item.update(
            {
                "visual_rank": visual_rank,
                "visual_score": float(result.get("score", 0.0)),
                "ocr_rank": None,
                "ocr_score": None,
                "ocr_text": "",
                "match_source": ["visual"],
            }
        )
        fused[str(item["keyframe_id"])] = item

    for hit in ocr_hits:
        item = fused.get(hit.keyframe_id)
        if item is None:
            item = hit.as_dict()
            item.update({"visual_rank": None, "visual_score": None, "match_source": ["ocr"]})
            fused[hit.keyframe_id] = item
        else:
            item.update(hit.as_dict())
            item["match_source"] = ["visual", "ocr"]

    for keyframe_id, item in fused.items():
        visual_score = visual_normalized.get(keyframe_id, 0.0)
        normalized_ocr_score = ocr_normalized.get(keyframe_id, 0.0)
        denominator = 0.0
        if visual_weight > 0:
            denominator += visual_weight / (visual_score + epsilon)
        if ocr_weight > 0:
            denominator += ocr_weight / (normalized_ocr_score + epsilon)
        item["_fusion_score"] = 0.0 if denominator <= 0 else 1.0 / denominator

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


def _read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {exc}") from exc


def _ocr_keyframe_id(result: dict[str, Any]) -> str:
    relative_path = Path(str(result.get("relative_path", "")))
    video_id = str(result.get("video_id") or (relative_path.parts[0] if len(relative_path.parts) > 1 else "")).strip()
    image_file = str(result.get("image_file") or relative_path.name).strip()
    if not video_id or not image_file:
        raise ValueError(f"OCR result cannot be mapped to a keyframe: {result}")
    return f"{video_id}_{Path(image_file).stem}"


def build_ocr_index(
    *,
    ocr_results_path: Path,
    records_db: Path,
    output_path: Path,
    ocr_model: str,
    allow_partial: bool = False,
) -> dict[str, Any]:
    """Build an OCR index for a MonkeyOCR or PaddleOCR model name."""
    model_name = str(ocr_model).casefold()
    if model_name.startswith("monkey"):
        preserve_diacritics = True
    elif model_name.startswith(("paddle", "ppocr", "pp-ocr")):
        preserve_diacritics = False
    else:
        raise ValueError(f"Unsupported OCR model: {ocr_model}")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    if temp_path.exists():
        temp_path.unlink()

    conn = sqlite3.connect(temp_path)
    try:
        conn.executescript(
            """
            PRAGMA journal_mode=DELETE;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE raw_ocr (
                keyframe_id TEXT PRIMARY KEY,
                ocr_text TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                avg_confidence REAL NOT NULL,
                max_confidence REAL NOT NULL,
                line_count INTEGER NOT NULL
            );
            """
        )
        batch = []
        for result in _read_jsonl(ocr_results_path):
            regions = [region for region in (result.get("regions") or []) if isinstance(region, dict)]
            confidences = [
                float(region["recognition_score"])
                for region in regions
                if region.get("recognition_score") is not None and math.isfinite(float(region["recognition_score"]))
            ]
            ocr_text = unicodedata.normalize("NFC", str(result.get("full_text") or result.get("monkey_text") or "").strip())
            region_line_count = sum(bool(str(region.get("text") or "").strip()) for region in regions)
            batch.append(
                (
                    _ocr_keyframe_id(result),
                    ocr_text,
                    fold_ocr_text(ocr_text),
                    sum(confidences) / len(confidences) if confidences else 0.0,
                    max(confidences) if confidences else 0.0,
                    region_line_count or sum(bool(line.strip()) for line in ocr_text.splitlines()),
                )
            )
            if len(batch) >= 5000:
                conn.executemany("INSERT INTO raw_ocr VALUES (?, ?, ?, ?, ?, ?)", batch)
                batch.clear()
        if batch:
            conn.executemany("INSERT INTO raw_ocr VALUES (?, ?, ?, ?, ?, ?)", batch)

        conn.execute("ATTACH DATABASE ? AS metadata", (str(Path(records_db).resolve()),))
        raw_count = int(conn.execute("SELECT COUNT(*) FROM raw_ocr").fetchone()[0])
        metadata_count = int(conn.execute("SELECT COUNT(*) FROM metadata.records").fetchone()[0])
        missing = [
            row[0]
            for row in conn.execute(
                "SELECT r.keyframe_id FROM raw_ocr r LEFT JOIN metadata.records m USING (keyframe_id) WHERE m.row_id IS NULL LIMIT 20"
            )
        ]
        if missing or raw_count > metadata_count or (not allow_partial and raw_count != metadata_count):
            raise ValueError(
                f"OCR/metadata mismatch: ocr={raw_count}, metadata={metadata_count}, "
                f"allow_partial={allow_partial}, missing examples={missing}"
            )

        conn.executescript(
            """
            CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE ocr_frames (
                row_id INTEGER PRIMARY KEY,
                keyframe_id TEXT NOT NULL UNIQUE,
                video_id TEXT NOT NULL,
                shot_id INTEGER,
                timestamp_ms INTEGER NOT NULL,
                image_file TEXT NOT NULL,
                ocr_text TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                avg_confidence REAL NOT NULL,
                max_confidence REAL NOT NULL,
                line_count INTEGER NOT NULL
            );
            INSERT INTO ocr_frames
            SELECT m.row_id, m.keyframe_id, m.video_id, m.shot_id, m.timestamp_ms,
                   m.image_file, r.ocr_text, r.normalized_text, r.avg_confidence,
                   r.max_confidence, r.line_count
            FROM raw_ocr r JOIN metadata.records m USING (keyframe_id);
            DROP TABLE raw_ocr;
            CREATE INDEX idx_ocr_frames_video_id ON ocr_frames(video_id);
            """
        )
        if preserve_diacritics:
            conn.executescript(
                """
                CREATE VIRTUAL TABLE ocr_fts USING fts5(
                    ocr_text,
                    content='ocr_frames',
                    content_rowid='row_id',
                    tokenize='unicode61 remove_diacritics 0'
                );
                INSERT INTO ocr_fts(rowid, ocr_text)
                SELECT row_id, ocr_text FROM ocr_frames WHERE ocr_text != '';
                """
            )
        else:
            conn.executescript(
                """
                CREATE VIRTUAL TABLE ocr_fts USING fts5(
                    ocr_text,
                    normalized_text,
                    content='ocr_frames',
                    content_rowid='row_id',
                    tokenize='unicode61 remove_diacritics 2'
                );
                INSERT INTO ocr_fts(rowid, ocr_text, normalized_text)
                SELECT row_id, ocr_text, normalized_text FROM ocr_frames WHERE normalized_text != '';
                """
            )
        text_count = int(conn.execute("SELECT COUNT(*) FROM ocr_frames WHERE normalized_text != ''").fetchone()[0])
        metadata = {
            "schema_version": 3 if preserve_diacritics else 2,
            "num_records": raw_count,
            "num_text_records": text_count,
            "source_num_records": metadata_count,
            "coverage_ratio": raw_count / metadata_count if metadata_count else 0.0,
            "is_partial": raw_count != metadata_count,
            "ocr_model": str(ocr_model),
            "search_diacritics": "preserve" if preserve_diacritics else "fold",
            "source_ocr_results": str(Path(ocr_results_path).resolve()),
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
