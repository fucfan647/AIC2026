import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.app.asr import AsrTextIndex, build_asr_index
from backend.app.ocr import OcrTextIndex, build_ocr_index


class AccentBm25Tests(unittest.TestCase):
    def test_monkey_and_asr_preserve_accents_while_ppocr_folds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / "records.sqlite"
            conn = sqlite3.connect(records)
            conn.execute(
                "CREATE TABLE records (row_id INTEGER PRIMARY KEY, keyframe_id TEXT, video_id TEXT, "
                "shot_id INTEGER, shot_start_ms INTEGER, shot_end_ms INTEGER, "
                "timestamp_ms INTEGER, image_file TEXT)"
            )
            conn.executemany(
                "INSERT INTO records VALUES (?, ?, 'L01_V001', NULL, NULL, NULL, ?, ?)",
                [(1, "L01_V001_001", 100, "001.jpg"), (2, "L01_V001_002", 2000, "002.jpg")],
            )
            conn.commit()
            conn.close()

            ocr_jsonl = root / "ocr.jsonl"
            with ocr_jsonl.open("w", encoding="utf-8") as handle:
                for image_file, value in (("001.jpg", "má"), ("002.jpg", "ma")):
                    handle.write(json.dumps({"video_id": "L01_V001", "image_file": image_file, "full_text": value}) + "\n")

            monkey_path = root / "monkey.sqlite"
            build_ocr_index(ocr_results_path=ocr_jsonl, records_db=records, output_path=monkey_path, ocr_model="MonkeyOCRv2")
            monkey = OcrTextIndex(monkey_path)
            try:
                self.assertEqual([hit.keyframe_id for hit in monkey.search("má", limit=None)], ["L01_V001_001"])
                self.assertEqual([hit.keyframe_id for hit in monkey.search("ma", limit=None)], ["L01_V001_002"])
            finally:
                monkey.conn.close()

            ppocr_path = root / "ppocr.sqlite"
            build_ocr_index(ocr_results_path=ocr_jsonl, records_db=records, output_path=ppocr_path, ocr_model="PP-OCRv6")
            ppocr = OcrTextIndex(ppocr_path)
            try:
                self.assertEqual(len(ppocr.search("ma", limit=None)), 2)
            finally:
                ppocr.conn.close()

            videos = root / "videos"
            videos.mkdir()
            (videos / "L01_V001.json").write_text(
                json.dumps(
                    {
                        "status": "ok",
                        "video_id": "L01_V001",
                        "segments": [
                            {"segment_id": 1, "start_ms": 0, "end_ms": 500, "text_raw": "má"},
                            {"segment_id": 2, "start_ms": 1750, "end_ms": 2250, "text_raw": "ma"},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            asr_path = root / "asr.sqlite"
            build_asr_index(asr_videos_dir=videos, records_db=records, output_path=asr_path)
            asr = AsrTextIndex(asr_path)
            try:
                self.assertEqual([hit.keyframe_id for hit in asr.search("má", limit=None)], ["L01_V001_001"])
                self.assertEqual([hit.keyframe_id for hit in asr.search("ma", limit=None)], ["L01_V001_002"])
            finally:
                asr.conn.close()


if __name__ == "__main__":
    unittest.main()
