"""Rebuild existing MonkeyOCR and Chunkformer FTS indexes for accent-sensitive BM25.

Run this once after extracting older resource ZIPs. Each original SQLite file is
kept beside the migrated file as ``.before_accent.bak``.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import unicodedata
from pathlib import Path


def reindex(path: Path, *, kind: str) -> None:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    backup = path.with_name(path.name + ".before_accent.bak")
    temporary = path.with_name(path.name + ".accent.tmp")
    if backup.exists() or temporary.exists():
        raise FileExistsError(f"Migration backup or temporary file already exists beside {path}")

    source = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        metadata = {key: json.loads(value) for key, value in source.execute("SELECT key, value FROM index_meta")}
        if metadata.get("search_diacritics") == "preserve":
            raise ValueError(f"Index already preserves accents: {path}")
        if kind == "monkey" and not str(metadata.get("ocr_model", "")).casefold().startswith("monkey"):
            raise ValueError(f"Not a MonkeyOCR index: {path}")
        target = sqlite3.connect(temporary)
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()

    conn = sqlite3.connect(temporary)
    try:
        conn.create_function("nfc", 1, lambda value: unicodedata.normalize("NFC", value))
        if kind == "monkey":
            conn.execute("BEGIN")
            conn.execute("DROP TABLE ocr_fts")
            conn.execute("UPDATE ocr_frames SET ocr_text = nfc(ocr_text) WHERE ocr_text != nfc(ocr_text)")
            conn.execute(
                "CREATE VIRTUAL TABLE ocr_fts USING fts5("
                "ocr_text, content='ocr_frames', content_rowid='row_id', "
                "tokenize='unicode61 remove_diacritics 0')"
            )
            conn.execute(
                "INSERT INTO ocr_fts(rowid, ocr_text) "
                "SELECT row_id, ocr_text FROM ocr_frames WHERE ocr_text != ''"
            )
            version = 3
        else:
            conn.execute("BEGIN")
            conn.execute("DROP TABLE asr_fts")
            conn.execute("UPDATE asr_segments SET text_raw = nfc(text_raw) WHERE text_raw != nfc(text_raw)")
            conn.execute(
                "CREATE VIRTUAL TABLE asr_fts USING fts5("
                "text_raw, content='asr_segments', content_rowid='segment_rowid', "
                "tokenize='unicode61 remove_diacritics 0')"
            )
            conn.execute(
                "INSERT INTO asr_fts(rowid, text_raw) "
                "SELECT segment_rowid, text_raw FROM asr_segments WHERE text_raw != ''"
            )
            version = 2
        conn.execute("INSERT OR REPLACE INTO index_meta VALUES ('schema_version', ?)", (json.dumps(version),))
        conn.execute("INSERT OR REPLACE INTO index_meta VALUES ('search_diacritics', ?)", (json.dumps("preserve"),))
        conn.commit()
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {temporary}")
    finally:
        conn.close()

    os.replace(path, backup)
    try:
        os.replace(temporary, path)
    except OSError:
        os.replace(backup, path)
        raise
    print(f"Reindexed {kind}: {path}\nBackup: {backup}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--monkey-index", type=Path, required=True)
    parser.add_argument("--asr-index", type=Path, required=True)
    args = parser.parse_args()
    reindex(args.monkey_index, kind="monkey")
    reindex(args.asr_index, kind="asr")
