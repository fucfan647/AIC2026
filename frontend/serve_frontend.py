from __future__ import annotations

import argparse
import asyncio
import csv
try:
    import fcntl
except ImportError:
    fcntl = None
import httpx
try:
    import websockets
except ImportError:
    websockets = None
import json
import mimetypes
import os
import random
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse


FRONTEND_DIR = Path(__file__).resolve().parent
TEAM_STATE_PATH = FRONTEND_DIR / "team_state.json"
TEAM_CAPTURE_DIR = FRONTEND_DIR / "runtime" / "team_captures"
QUERY_ROOT = (
    FRONTEND_DIR.parent / "backend" / "query_BTC"
    if (FRONTEND_DIR.parent / "backend" / "query_BTC").is_dir()
    else FRONTEND_DIR.parent / "query_demo"
)
CSV_SUBMISSION_ROOT = FRONTEND_DIR / "submission"
USER_PROFILES_PATH = FRONTEND_DIR / "runtime" / "user_profiles.json"
SUBMISSION_LOG_PATH = FRONTEND_DIR / "runtime" / "submission_log.json"
HLS_ROOTS = [
    Path("/mlcv1/Datasets/HCMAI25/streaming/hls"),
    Path("/GuestShare_NAS/WorkingSpace/Personal/nghiadq/streaming/hls"),
]
HLS_ROOT = HLS_ROOTS[0]
_REPO_RECORDS_PATH = FRONTEND_DIR.parent / "backend/artifacts/current_index/records.sqlite"
_RESOURCE_RECORDS_PATH = (
    FRONTEND_DIR.parent.parent
    / "aic2026_resources/aic_resource/01_records_db/backend/artifacts/current_index/records.sqlite"
)
DEFAULT_RECORDS_PATH = _REPO_RECORDS_PATH if _REPO_RECORDS_PATH.is_file() else _RESOURCE_RECORDS_PATH
DEFAULT_DELETED_MANIFEST = FRONTEND_DIR.parent / "frames_deleted/active_deleted_manifest.jsonl"
DEFAULT_OCR_INDEX = Path(os.environ["OCR_INDEX"]) if os.getenv("OCR_INDEX") else (
    FRONTEND_DIR.parent.parent / "aic2026_resources/local_indexes/paddle_ocr.sqlite"
)
DEFAULT_ASR_INDEX = Path(os.environ["ASR_INDEX"]) if os.getenv("ASR_INDEX") else (
    FRONTEND_DIR.parent.parent
    / "/GuestShare_NAS/WorkingSpace/Personal/nghiadq/backend_final/system/backend/artifacts/asr_index/asr.sqlite"
)
def resolve_submission_sound_root() -> Path:
    env_path = os.getenv("SUBMISSION_SOUND_ROOT")
    if env_path and Path(env_path).is_dir():
        return Path(env_path)
    candidates = [
        FRONTEND_DIR.parent / "backend" / "music",
        FRONTEND_DIR / "music",
        FRONTEND_DIR.parent / "backend" / "src",
        Path(r"D:\Folder\AICHALLENGE2026\system\backend\music"),
    ]
    for cand in candidates:
        if cand.is_dir():
            return cand
    return FRONTEND_DIR.parent / "backend" / "music"


SUBMISSION_SOUND_ROOT = resolve_submission_sound_root()
SUBMISSION_SOUND_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"}
FORWARDED_HEADERS = ("Content-Type", "Range", "Accept", "User-Agent")
QUERY_FILENAME_PATTERN = re.compile(r"^query-(.+)-(kis|qa|trake)\.txt$", re.IGNORECASE)
EVENT_PATTERN = re.compile(r"^\s*E\d+\s*:", re.IGNORECASE | re.MULTILINE)
TIMED_PATH_PREFIXES = (
    "/search",
    "/temporal-search",
    "/translate-query",
    "/frame-text/",
    "/video-asr/",
    "/thumbnail/",
    "/keyframe/",
    "/keyframe-webp/",
    "/video/",
    "/videos/",
    "/hls/",
    "/health",
)


def empty_team_state() -> Dict[str, Any]:
    return {
        "members": {},
        "votes": [],
        "trake_frames": [],
        "trake_users": {},
        "submission_feedback": {},
        "active_query": "",
        "submission_counts": {},
    }


def normalize_user_key(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip()).lower()


def read_user_profiles(path: Path = USER_PROFILES_PATH) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def write_user_profiles(profiles: Dict[str, Any], path: Path = USER_PROFILES_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)
    tmp_path.replace(path)





def read_submission_log(path: Path = SUBMISSION_LOG_PATH) -> List[Dict[str, Any]]:
    if SUBMISSION_ACTIVITY_CSV_PATH.is_file():
        try:
            csv_text = SUBMISSION_ACTIVITY_CSV_PATH.read_text(encoding="utf-8").strip()
            csv_lines = [line for line in csv_text.splitlines() if line.strip()]
            if len(csv_lines) <= 1:
                # User cleared submission_activity.csv! Auto-sync submission_log.json and reset profiles!
                if path.is_file():
                    path.write_text("[]", encoding="utf-8")
                if USER_PROFILES_PATH.is_file():
                    try:
                        profs = json.loads(USER_PROFILES_PATH.read_text(encoding="utf-8"))
                        for p in profs.values():
                            if isinstance(p, dict):
                                p["total_submissions"] = 0
                        USER_PROFILES_PATH.write_text(json.dumps(profs, ensure_ascii=False, indent=2), encoding="utf-8")
                    except Exception:
                        pass
                return []
        except Exception:
            pass
    if not path.is_file():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def append_submission_log(record: Dict[str, Any], path: Path = SUBMISSION_LOG_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    logs = read_submission_log(path)
    logs.append(record)
    if len(logs) > 2000:
        logs = logs[-2000:]
    tmp_path = path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)
    tmp_path.replace(path)


def query_sort_key(filename: str) -> List[Tuple[int, Any]]:
    return [
        (0, int(part)) if part.isdigit() else (1, part.lower())
        for part in re.split(r"(\d+)", filename)
        if part
    ]


def parse_query_filename(filename: str) -> Tuple[str, str]:
    if Path(filename).name != filename:
        raise ValueError("ten query khong hop le")
    match = QUERY_FILENAME_PATTERN.fullmatch(filename)
    if not match:
        raise ValueError("query phai co dang query-...-(kis|qa|trake).txt")
    return filename[len("query-"):-len(".txt")], match.group(2).lower()


def csv_row_count(path: Path) -> int:
    if not path.is_file():
        return 0
    with path.open("r", encoding="utf-8", newline="") as file_obj:
        return sum(1 for row in csv.reader(file_obj) if row)


def load_query_catalog(
    query_root: Path = QUERY_ROOT,
    submission_root: Path = CSV_SUBMISSION_ROOT,
) -> List[Dict[str, Any]]:
    if not query_root.is_dir():
        return []
    queries = []
    for path in sorted(query_root.iterdir(), key=lambda item: query_sort_key(item.name)):
        if not path.is_file():
            continue
        try:
            label, task_type = parse_query_filename(path.name)
        except ValueError:
            continue
        output_path = submission_root / f"{path.stem}.csv"
        queries.append({
            "filename": path.name,
            "label": label,
            "task_type": task_type,
            "content": path.read_text(encoding="utf-8"),
            "answer_count": csv_row_count(output_path),
            "output_filename": output_path.name,
        })
    return queries


def build_csv_submission_row(
    query_path: Path,
    task_type: str,
    items: List[Dict[str, Any]],
    answer: Any = "",
) -> List[Any]:
    if not isinstance(items, list) or not items:
        raise ValueError("can it nhat mot frame")

    normalized = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("frame khong hop le")
        video_id = str(item.get("video_id", "")).strip()
        if not video_id or video_id.lower().endswith(".mp4") or "," in video_id:
            raise ValueError("video_id khong hop le")
        raw_frame_id = item.get("frame_id", item.get("frame_idx"))
        try:
            frame_id = int(raw_frame_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("frame_id phai la so nguyen") from exc
        if frame_id < 0:
            raise ValueError("frame_id khong duoc am")
        normalized.append((video_id, frame_id))

    if task_type == "kis":
        if len(normalized) != 1:
            raise ValueError("KIS moi dong chi nhan mot frame")
        return [normalized[0][0], normalized[0][1]]

    if task_type == "qa":
        if len(normalized) != 1:
            raise ValueError("QA moi dong chi nhan mot frame")
        answer_text = str(answer)
        if not answer_text.strip() or len(answer_text) > 100:
            raise ValueError("answer QA phai co tu 1 den 100 ky tu")
        return [normalized[0][0], normalized[0][1], answer_text]

    if task_type == "trake":
        video_id = normalized[0][0]
        if any(item_video_id != video_id for item_video_id, _ in normalized):
            raise ValueError("TRAKE chi nhan cac frame thuoc cung mot video")
        event_count = len(EVENT_PATTERN.findall(query_path.read_text(encoding="utf-8")))
        if event_count and len(normalized) != event_count:
            raise ValueError(f"TRAKE can dung {event_count} frame theo so event trong query")
        return [video_id, *[frame_id for _, frame_id in normalized]]

    raise ValueError("loai query khong hop le")


def load_frontend_metadata(
    records_path: Path,
    deleted_rows: set[int],
    deleted_keyframe_ids: set[str],
) -> Tuple[Dict[str, str], Dict[str, List[Dict[str, Any]]], Dict[str, List[Dict[str, Any]]]]:
    video_path_by_id: Dict[str, str] = {}
    representatives: Dict[str, Dict[int, Tuple[float, Dict[str, Any]]]] = {}
    frames_by_video: Dict[str, List[Dict[str, Any]]] = {}

    if not records_path.exists():
        sqlite_candidate = records_path.with_name("records.sqlite")
        local_cand = FRONTEND_DIR / "records.sqlite"
        if sqlite_candidate.exists():
            records_path = sqlite_candidate
        elif local_cand.exists():
            records_path = local_cand
        else:
            print(f"[frontend] Notice: records database not found at {records_path}. Shot/context expansion will be unavailable.", flush=True)
            return {}, {}, {}

    if records_path.suffix.lower() in {".sqlite", ".db"}:
        import sqlite3
        conn = sqlite3.connect(f"file:{records_path.resolve()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT row_id, keyframe_id, video_id, shot_id, frame_idx, timestamp_ms, image_file, shot_start_ms, shot_end_ms FROM records"
        )
        for row in cursor:
            video_id = str(row["video_id"]).strip()
            keyframe_id = str(row["keyframe_id"]).strip()
            if not video_id or not keyframe_id:
                continue
            source_row = int(row["row_id"])
            if source_row in deleted_rows or keyframe_id in deleted_keyframe_ids:
                continue
            shot_id = int(row["shot_id"]) if row["shot_id"] is not None else 0
            timestamp_ms = int(row["timestamp_ms"] or 0)
            shot_start_ms = timestamp_ms if row["shot_start_ms"] is None else int(row["shot_start_ms"])
            shot_end_ms = timestamp_ms if row["shot_end_ms"] is None else int(row["shot_end_ms"])
            midpoint_ms = (shot_start_ms + shot_end_ms) / 2.0
            distance = abs(timestamp_ms - midpoint_ms)
            frame = {
                "keyframe_id": keyframe_id,
                "video_id": video_id,
                "shot_id": shot_id,
                "timestamp_ms": timestamp_ms,
                "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                "frame_id": int(row["frame_idx"] or 0),
                "source_embedding_row": source_row,
            }
            frames_by_video.setdefault(video_id, []).append(frame)
            shots = representatives.setdefault(video_id, {})
            current = shots.get(shot_id)
            if current is None or distance < current[0]:
                shots[shot_id] = (distance, frame)
        conn.close()
    else:
        with records_path.open("r", encoding="utf-8") as file_obj:
            for line in file_obj:
                if not line.strip():
                    continue
                row = json.loads(line)
                video_id = str(row.get("video_id", "")).strip()
                video_path = str(row.get("video_path", "")).strip()
                if video_id and video_path:
                    video_path_by_id.setdefault(video_id, video_path)

                keyframe_id = str(row.get("keyframe_id", "")).strip()
                if not video_id or not keyframe_id:
                    continue
                try:
                    source_row = int(row.get("source_embedding_row", row.get("row", -1)))
                except (TypeError, ValueError):
                    continue
                if source_row in deleted_rows or keyframe_id in deleted_keyframe_ids:
                    continue
                try:
                    shot_id = int(row["shot_id"])
                    timestamp_ms = int(row.get("timestamp_ms", row.get("time_ms", 0)) or 0)
                    raw_start_ms = row.get("shot_start_ms")
                    raw_end_ms = row.get("shot_end_ms")
                    shot_start_ms = timestamp_ms if raw_start_ms is None else int(raw_start_ms)
                    shot_end_ms = timestamp_ms if raw_end_ms is None else int(raw_end_ms)
                except (KeyError, TypeError, ValueError):
                    continue

                midpoint_ms = (shot_start_ms + shot_end_ms) / 2.0
                distance = abs(timestamp_ms - midpoint_ms)
                frame = {
                    "keyframe_id": keyframe_id,
                    "video_id": video_id,
                    "shot_id": shot_id,
                    "timestamp_ms": timestamp_ms,
                    "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                    "frame_id": int(row.get("frame_idx", 0) or 0),
                    "source_embedding_row": source_row,
                }
                frames_by_video.setdefault(video_id, []).append(frame)
                shots = representatives.setdefault(video_id, {})
                current = shots.get(shot_id)
                if current is None or distance < current[0]:
                    shots[shot_id] = (distance, frame)

    shot_frames_by_video = {
        video_id: [
            item[1]
            for _, item in sorted(
                shots.items(),
                key=lambda pair: (pair[1][1]["timestamp_ms"], pair[0]),
            )
        ]
        for video_id, shots in representatives.items()
    }
    for frames in frames_by_video.values():
        frames.sort(key=lambda item: (item["timestamp_ms"], item["source_embedding_row"]))
    return video_path_by_id, shot_frames_by_video, frames_by_video


def select_frame_context(
    frames: List[Dict[str, Any]],
    timestamp_ms: int,
    *,
    count: int = 0,
    before: int = 24,
    after: int = 24,
) -> List[Dict[str, Any]]:
    if not frames:
        return []
    center_index = min(
        range(len(frames)),
        key=lambda index: abs(int(frames[index]["timestamp_ms"]) - timestamp_ms),
    )
    if count <= 0 or count >= len(frames):
        selected = [dict(frame) for frame in frames]
        if 0 <= center_index < len(selected):
            selected[center_index]["is_current"] = True
        return selected

    start = max(0, center_index - before)
    end = min(len(frames), center_index + after + 1)
    selected = [dict(frame) for frame in frames[start:end]]
    if 0 <= center_index - start < len(selected):
        selected[center_index - start]["is_current"] = True
    return selected


def select_shot_context(
    frames: List[Dict[str, Any]],
    shot_id: int,
    *,
    keyframe_id: str = "",
    timestamp_ms: Optional[int] = None,
    window_size: int = 24,
    shots_before: int = 11,
) -> List[Dict[str, Any]]:
    center_index = next(
        (index for index, frame in enumerate(frames) if int(frame["shot_id"]) == shot_id),
        -1,
    )
    if center_index < 0:
        return []

    selected_size = min(window_size, len(frames))
    start = max(0, min(center_index - shots_before, len(frames) - selected_size))
    selected = [dict(frame) for frame in frames[start:start + selected_size]]
    center = selected[center_index - start]
    if keyframe_id:
        center["keyframe_id"] = keyframe_id
    if timestamp_ms is not None:
        center["timestamp_ms"] = timestamp_ms
        center["timestamp_seconds"] = round(timestamp_ms / 1000.0, 3)
    center["is_candidate"] = True
    return selected


def load_deleted_frames(manifest_path: Path) -> tuple[set[int], set[str]]:
    rows: set[int] = set()
    keyframe_ids: set[str] = set()
    if not manifest_path.is_file():
        return rows, keyframe_ids
    with manifest_path.open("r", encoding="utf-8") as file_obj:
        for line in file_obj:
            if not line.strip():
                continue
            item = json.loads(line)
            rows.add(int(item["row"]))
            keyframe_ids.add(f"{item['video_id']}_{Path(item['image_file']).stem}")
    return rows, keyframe_ids


def read_team_state(path: Path = TEAM_STATE_PATH) -> Dict[str, Any]:
    if not path.exists():
        return empty_team_state()
    try:
        with path.open("r", encoding="utf-8") as file_obj:
            state = json.load(file_obj)
    except Exception:  # noqa: BLE001
        return empty_team_state()
    if not isinstance(state, dict):
        return empty_team_state()
    state.setdefault("members", {})
    state.setdefault("votes", [])
    state.setdefault("trake_frames", [])
    state.setdefault("trake_users", {})
    state.setdefault("submission_feedback", {})
    state.setdefault("active_query", "")
    state.setdefault("submission_counts", {})

    for vote in state["votes"]:
        if not vote.get("selection_id"):
            item = vote.get("item", {})
            vote["selection_id"] = f"vote:{vote.get('client_id', '')}:{item.get('keyframe_id', '')}"
    for frame in state["trake_frames"]:
        if not frame.get("selection_id"):
            item = frame.get("item", {})
            frame["selection_id"] = f"trake:{item.get('video_id', '')}:{item.get('keyframe_id', '')}"
    return state


def write_team_state(state: Dict[str, Any], path: Path = TEAM_STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as file_obj:
        json.dump(state, file_obj, ensure_ascii=False, indent=2)
    tmp_path.replace(path)


class TeamSocketHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._viewers: Dict[str, Dict[str, Any]] = {}
        self._ws_to_client: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)
        client_id = self._ws_to_client.pop(websocket, None)
        if client_id and client_id in self._viewers:
            self._viewers.pop(client_id, None)

    def update_viewer(
        self,
        client_id: str,
        name: str,
        filename: str,
        websocket: Optional[WebSocket] = None,
    ) -> None:
        if not client_id:
            return
        if websocket is not None:
            self._ws_to_client[websocket] = client_id
        clean_name = str(name).strip()
        clean_filename = str(filename).strip()
        if not clean_name or not clean_filename:
            self._viewers.pop(client_id, None)
            return
        self._viewers[client_id] = {
            "name": clean_name,
            "filename": clean_filename,
            "updated_at": time.time(),
        }

    def get_query_viewers(self) -> Dict[str, List[str]]:
        now = time.time()
        stale = [
            cid for cid, item in self._viewers.items()
            if now - float(item.get("updated_at", 0)) > 180
        ]
        for cid in stale:
            self._viewers.pop(cid, None)

        grouped: Dict[str, List[str]] = {}
        for item in self._viewers.values():
            fn = str(item.get("filename", "")).strip()
            name = str(item.get("name", "")).strip()
            if fn and name:
                names = grouped.setdefault(fn, [])
                if name not in names:
                    names.append(name)
        return grouped

    async def broadcast_viewers(self) -> None:
        await self.broadcast({
            "type": "viewers_update",
            "viewers": self.get_query_viewers(),
        })

    async def broadcast(self, state: Dict[str, Any]) -> None:
        stale_clients = []
        for websocket in list(self._clients):
            try:
                await websocket.send_json(state)
            except Exception:  # noqa: BLE001
                stale_clients.append(websocket)
        for websocket in stale_clients:
            self.disconnect(websocket)


def validate_dres_server(server_url: str) -> str:
    server_url = server_url.rstrip("/")
    if not server_url.startswith(("http://", "https://")):
        raise ValueError("DRES server phai bat dau bang http:// hoac https://")
    return server_url


def build_dres_submission_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    task_type = str(body.get("task_type", "")).strip().lower()
    if task_type == "qa":
        answer = str(body.get("answer", "")).strip()
        if not answer or len(answer) > 1000 or any(ord(char) < 32 for char in answer):
            raise ValueError("answer QA khong hop le")
        return {
            "answerSets": [{
                "answers": [{"text": answer}]
            }]
        }

    payload = body.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload DRES khong hop le")
    return payload


def urllib_request_bytes(req: urllib.request.Request, timeout: int = 30) -> Tuple[int, Dict[str, str], bytes]:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers.items()), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()


async def forward_urllib_request(req: urllib.request.Request, timeout: int = 30) -> Response:
    try:
        loop = asyncio.get_running_loop()
        status, headers, body = await loop.run_in_executor(None, urllib_request_bytes, req, timeout)
    except Exception as exc:  # noqa: BLE001
        target_url = getattr(req, "full_url", str(req))
        print(f"[proxy-error] Goi {target_url} that bai: {exc}", flush=True)
        return JSONResponse({"detail": f"Goi {target_url} that bai: {exc}"}, status_code=502)

    response_headers = {}
    for key, value in headers.items():
        if key.lower() not in {"connection", "transfer-encoding", "content-encoding"}:
            response_headers[key] = value
    return Response(
        content=body,
        status_code=status,
        headers=response_headers,
        media_type=response_headers.get("Content-Type"),
    )


def create_app(
    backend_url: str,
    records_path: Path,
    deleted_manifest: Path = DEFAULT_DELETED_MANIFEST,
    team_state_path: Path = TEAM_STATE_PATH,
    team_capture_dir: Path = TEAM_CAPTURE_DIR,
    query_root: Path = QUERY_ROOT,
    csv_submission_root: Path = CSV_SUBMISSION_ROOT,
    hls_server_url: str = os.getenv("HLS_SERVER_URL", "http://127.0.0.1:8052"),
    keyframes_dir: Optional[Path] = None,
    thumbnail_root: Optional[Path] = None,
    team_hub_url: str = "",
    ocr_index_path: Optional[Path] = None,
    asr_index_path: Optional[Path] = None,
) -> FastAPI:
    if not team_hub_url:
        team_hub_url = os.getenv("TEAM_HUB_URL", "").strip()
    team_hub_url = team_hub_url.rstrip("/")

    translator_url = os.getenv("TRANSLATOR_URL", "http://127.0.0.1:8031")
    ocr_index_path = Path(ocr_index_path or DEFAULT_OCR_INDEX).resolve()
    asr_index_path = Path(asr_index_path or DEFAULT_ASR_INDEX).resolve()
    video_path_by_id: Dict[str, str] = {}
    shot_frames_by_video: Dict[str, List[Dict[str, Any]]] = {}
    frames_by_video: Dict[str, List[Dict[str, Any]]] = {}
    deleted_rows, deleted_keyframe_ids = load_deleted_frames(deleted_manifest)
    metadata_ready = threading.Event()

    def load_metadata_background() -> None:
        try:
            video_paths, shot_frames, all_frames = load_frontend_metadata(
                records_path,
                deleted_rows,
                deleted_keyframe_ids,
            )
            video_path_by_id.update(video_paths)
            shot_frames_by_video.update(shot_frames)
            frames_by_video.update(all_frames)
            shot_count = sum(len(frames) for frames in shot_frames.values())
            print(
                f"Shot metadata ready: {len(shot_frames)} videos, {shot_count} shots",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: khong load duoc video metadata: {exc}", flush=True)
        finally:
            metadata_ready.set()

    threading.Thread(target=load_metadata_background, daemon=True).start()
    extended_metadata_cache: Dict[str, Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]] = {}
    extended_metadata_lock = threading.Lock()

    def load_extended_local_metadata(video_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Load M/N/S frame metadata lazily from the extracted local resources."""
        requested_id = str(video_id or "").strip().upper()
        if not requested_id or keyframes_dir is None:
            return [], []
        if requested_id in extended_metadata_cache:
            return extended_metadata_cache[requested_id]

        if re.fullmatch(r"M\d{2}[-_]V\d{3}", requested_id):
            local_video_id = requested_id.replace("-", "_")
            keyframe_video_id = local_video_id.replace("_", "-")
        elif re.fullmatch(r"[NS]\d{2,3}[-_]V\d{3}", requested_id):
            local_video_id = requested_id.replace("_", "-")
            keyframe_video_id = local_video_id
        else:
            return [], []

        video_dir = Path(keyframes_dir) / local_video_id
        if not video_dir.is_dir():
            return [], []

        frames: List[Dict[str, Any]] = []
        metadata_file = video_dir / "metadata.json"
        if metadata_file.is_file():
            try:
                payload = json.loads(metadata_file.read_text(encoding="utf-8"))
                entries = payload.get(local_video_id, payload)
                if isinstance(entries, dict):
                    for ordinal, (frame_stem, info) in enumerate(entries.items()):
                        if not isinstance(info, dict):
                            continue
                        timestamp_text = str(info.get("time-stamp", "00:00:00.000"))
                        match = re.fullmatch(r"(\d+):(\d+):(\d+)(?:\.(\d+))?", timestamp_text)
                        if match:
                            hours, minutes, seconds, millis = match.groups()
                            timestamp_ms = (
                                (int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * 1000
                                + int((millis or "0")[:3].ljust(3, "0"))
                            )
                        else:
                            fps = float(info.get("fps", 25.0) or 25.0)
                            timestamp_ms = round(int(info.get("id", ordinal) or ordinal) * 1000.0 / fps)
                        image_file = f"{frame_stem}.webp"
                        if not (video_dir / image_file).is_file():
                            continue
                        frames.append({
                            "keyframe_id": f"{keyframe_video_id}_{frame_stem}",
                            "video_id": local_video_id,
                            "shot_id": int(info.get("shot", 0) or 0),
                            "timestamp_ms": int(timestamp_ms),
                            "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                            "frame_id": int(info.get("id", ordinal) or ordinal),
                            "source_embedding_row": -1,
                        })
            except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
                print(f"[frontend] Cannot parse local metadata {metadata_file}: {exc}", flush=True)
        else:
            fps = 25.0
            success_file = video_dir / "_SUCCESS"
            try:
                success_data = json.loads(success_file.read_text(encoding="utf-8"))
                fps = float(success_data.get("fps", fps) or fps)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                pass
            for image_file in sorted(video_dir.glob("*.webp")):
                match = re.fullmatch(r"shot_(\d+)_frame_(\d+)", image_file.stem, re.IGNORECASE)
                if not match:
                    continue
                shot_id, original_frame = (int(value) for value in match.groups())
                timestamp_ms = round(original_frame * 1000.0 / fps)
                frames.append({
                    "keyframe_id": f"{keyframe_video_id}_{image_file.stem}",
                    "video_id": local_video_id,
                    "shot_id": shot_id,
                    "timestamp_ms": int(timestamp_ms),
                    "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                    "frame_id": original_frame,
                    "source_embedding_row": -1,
                })

        frames.sort(key=lambda item: (item["timestamp_ms"], item["frame_id"]))
        frames_by_shot: Dict[int, List[Dict[str, Any]]] = {}
        for frame in frames:
            frames_by_shot.setdefault(int(frame["shot_id"]), []).append(frame)
        shot_frames = [
            shot_items[len(shot_items) // 2]
            for _, shot_items in sorted(
                frames_by_shot.items(),
                key=lambda item: (item[1][0]["timestamp_ms"], item[0]),
            )
        ]
        result = (frames, shot_frames)
        with extended_metadata_lock:
            extended_metadata_cache[requested_id] = result
            extended_metadata_cache[local_video_id] = result
            extended_metadata_cache[keyframe_video_id] = result
        return result

    team_socket_hub = TeamSocketHub()
    team_state_lock = asyncio.Lock()
    team_hub_client = httpx.AsyncClient(timeout=60.0, trust_env=False) if team_hub_url else None
    app = FastAPI(title="AIC2026 Frontend", default_response_class=JSONResponse)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def proxy_team_hub(request: Request, subpath: str) -> Response:
        target_url = team_hub_url.rstrip("/") + subpath
        query_string = request.url.query
        if query_string:
            target_url += f"?{query_string}"

        body = await request.body()
        headers = {}
        excluded_headers = {"host", "content-length"}
        for k, v in request.headers.items():
            if k.lower() not in excluded_headers:
                headers[k] = v

        last_error: Optional[Exception] = None
        for attempt in range(2):
            try:
                resp = await team_hub_client.request(
                    method=request.method,
                    url=target_url,
                    content=body,
                    headers=headers,
                )
                resp_headers = {}
                for k, v in resp.headers.items():
                    if k.lower() not in {"transfer-encoding", "content-encoding", "connection"}:
                        resp_headers[k] = v
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    headers=resp_headers,
                    media_type=resp.headers.get("content-type"),
                )
            except httpx.TransportError as exc:
                last_error = exc
                if attempt == 0:
                    await asyncio.sleep(0.15)
                    continue
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                break
        return JSONResponse(
            {"detail": f"Goi Team Hub that bai ({target_url}): {last_error}"},
            status_code=502,
        )

    if team_hub_url:
        @app.middleware("http")
        async def team_hub_proxy_middleware(request: Request, call_next):
            path = request.url.path
            if (
                path.startswith("/team/")
                or path.startswith("/team-capture/")
                or path.startswith("/dres/")
                or path in {"/submission/queries", "/submission/csv", "/correct-submission-sound.mp3"}
            ):
                return await proxy_team_hub(request, path)
            return await call_next(request)

    @app.middleware("http")
    async def log_request_timing(request: Request, call_next):
        path = request.url.path
        should_log = path == "/health" or path.startswith(TIMED_PATH_PREFIXES)
        if not should_log:
            return await call_next(request)

        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            total_ms = (time.perf_counter() - started_at) * 1000
            print(
                f"[frontend-timing] method={request.method} path={path} "
                f"status=500 total_ms={total_ms:.1f} error={type(exc).__name__}",
                flush=True,
            )
            raise

        total_ms = (time.perf_counter() - started_at) * 1000
        content_length = response.headers.get("content-length", "-")
        response.headers["Server-Timing"] = f"frontend;dur={total_ms:.1f}"
        response.headers["X-Frontend-Time-Ms"] = f"{total_ms:.1f}"
        print(
            f"[frontend-timing] method={request.method} path={path} "
            f"status={response.status_code} total_ms={total_ms:.1f} bytes={content_length}",
            flush=True,
        )
        return response

    backend_http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=8.0, read=120.0, write=15.0, pool=30.0),
        limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
        trust_env=False,
    )

    async def proxy_backend(request: Request, backend_path: str, timeout: int = 300) -> Response:
        body = await request.body() if request.method in {"POST", "PUT", "PATCH"} else None
        headers = {}
        for key in FORWARDED_HEADERS:
            value = request.headers.get(key)
            if value:
                headers[key] = value
        target = backend_url.rstrip("/") + backend_path
        try:
            req = backend_http_client.build_request(
                request.method,
                target,
                content=body,
                headers=headers,
                timeout=timeout,
            )
            resp = await backend_http_client.send(req)
            response_headers = {}
            for k, v in resp.headers.items():
                if k.lower() not in {"connection", "transfer-encoding", "content-encoding"}:
                    response_headers[k] = v
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=response_headers,
                media_type=resp.headers.get("content-type"),
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[proxy-error] Goi {target} that bai: {exc}", flush=True)
            return JSONResponse({"detail": f"Goi {target} that bai: {exc}"}, status_code=502)

    def get_video_path(video_id: str) -> Path:
        if not video_id or any(part in video_id for part in ("..", "/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid video id")
        video_path = video_path_by_id.get(video_id)
        if not video_path:
            raise HTTPException(status_code=404, detail="video_id not found")
        path = Path(video_path)
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail=f"video not found: {path}")
        return path

    def get_hls_path(video_id: str, asset_path: str) -> Path:
        if not video_id or any(part in video_id for part in ("..", "/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid video id")
        if not asset_path or any(part in asset_path for part in ("..", "\\")):
            raise HTTPException(status_code=400, detail="Invalid HLS path")
        for root in HLS_ROOTS:
            video_dir = root / video_id
            path = video_dir / asset_path
            try:
                resolved = path.resolve()
                resolved.relative_to(video_dir.resolve())
                if resolved.is_file():
                    return resolved
            except (ValueError, Exception):
                continue
        raise HTTPException(status_code=404, detail=f"HLS asset not found: {video_id}/{asset_path}")

    def hls_media_type(path: Path) -> str:
        if path.suffix == ".m3u8":
            return "application/vnd.apple.mpegurl"
        if path.suffix == ".ts":
            return "video/mp2t"
        if path.suffix == ".m4s":
            return "video/iso.segment"
        return mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    @app.get("/")
    async def index():
        html = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
        return HTMLResponse(
            content=html,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    @app.get("/health")
    async def health(request: Request):
        return await proxy_backend(request, "/health")

    @app.post("/search")
    async def search(request: Request):
        try:
            backend_request = await request.json()
            if not isinstance(backend_request, dict):
                raise ValueError("search body must be a JSON object")
            video_scope = str(backend_request.get("video_scope", "exclude-n")).strip().lower()
            if video_scope not in {"exclude-n", "n-only"}:
                video_scope = "exclude-n"
            requested_top_k = max(1, int(backend_request.get("top_k", 200) or 200))
            # The backend applies video_scope before vector similarity. Keep a
            # modest N pool so locally missing archives can be skipped while
            # still returning the requested number of visible cards.
            backend_request["video_scope"] = video_scope
            backend_request["top_k"] = max(1_000, requested_top_k) if video_scope == "n-only" else requested_top_k
            backend_response = await backend_http_client.post(
                backend_url.rstrip("/") + "/search",
                json=backend_request,
                timeout=300.0,
            )
            if backend_response.status_code != 200:
                return Response(
                    content=backend_response.content,
                    status_code=backend_response.status_code,
                    media_type=backend_response.headers.get("content-type"),
                )
            payload = backend_response.json()
            backend_returned = len(payload.get("results", []))

            def is_n_video(item: Dict[str, Any]) -> bool:
                video_id = str(item.get("video_id", "")).strip().upper()
                return re.match(r"^N\d{3}[-_]V\d{3}(?:$|[_-])", video_id) is not None

            results = []
            n_frames_per_video: Dict[str, int] = {}
            for item in payload.get("results", []):
                if int(item.get("source_embedding_row", -1)) in deleted_rows:
                    continue
                item_is_n = is_n_video(item)
                if video_scope == "n-only":
                    if not item_is_n:
                        continue
                    # Do not show N results whose archive has not been
                    # extracted locally; those cards would contain broken
                    # images because the GPU server does not host keyframes.
                    if resolve_local_keyframe_file(str(item.get("keyframe_id", ""))) is None:
                        continue
                    normalized_video_id = str(item.get("video_id", "")).strip().upper().replace("_", "-")
                    if n_frames_per_video.get(normalized_video_id, 0) >= 1:
                        continue
                    n_frames_per_video[normalized_video_id] = n_frames_per_video.get(normalized_video_id, 0) + 1
                elif item_is_n:
                    continue
                results.append(item)
            results = results[:requested_top_k]
            for rank, item in enumerate(results, start=1):
                item["rank"] = rank
            payload["results"] = results
            payload["returned"] = len(results)
            payload["frontend_excluded_rows"] = len(deleted_rows)
            payload["frontend_video_scope"] = video_scope
            payload["frontend_max_frames_per_video"] = 1 if video_scope == "n-only" else None
            payload["backend_returned_before_scope"] = backend_returned
            return JSONResponse(payload, status_code=200)
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Loc ket qua tim kiem that bai: {exc}"}, status_code=502)

    @app.post("/translate-query")
    async def translate_query(request: Request):
        body = await request.body()
        req = urllib.request.Request(
            translator_url.rstrip("/") + "/translate-query",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return await forward_urllib_request(req, timeout=300)

    @app.get("/frame-text/{keyframe_id:path}")
    async def frame_text(keyframe_id: str, request: Request):
        local_id = urllib.parse.unquote(str(keyframe_id)).strip()

        def read_local_frame_text() -> Optional[Dict[str, Any]]:
            if not records_path.is_file() or not ocr_index_path.is_file() or not asr_index_path.is_file():
                return None
            records_conn = sqlite3.connect(
                f"file:{records_path.resolve().as_posix()}?mode=ro", uri=True, timeout=10
            )
            records_conn.row_factory = sqlite3.Row
            try:
                rec = records_conn.execute(
                    "SELECT row_id, keyframe_id, video_id, shot_id, timestamp_ms, image_file "
                    "FROM records WHERE keyframe_id = ? LIMIT 1",
                    (local_id,),
                ).fetchone()
            finally:
                records_conn.close()
            if rec is None:
                return None

            row_id = int(rec["row_id"])
            video_id = str(rec["video_id"] or "")
            timestamp_ms = int(rec["timestamp_ms"] or 0)

            ocr_conn = sqlite3.connect(
                f"file:{ocr_index_path.as_posix()}?mode=ro", uri=True, timeout=10
            )
            ocr_conn.row_factory = sqlite3.Row
            try:
                ocr = ocr_conn.execute(
                    "SELECT ocr_text, avg_confidence, max_confidence, line_count "
                    "FROM ocr_frames WHERE keyframe_id = ? LIMIT 1",
                    (local_id,),
                ).fetchone()
            finally:
                ocr_conn.close()

            asr_conn = sqlite3.connect(
                f"file:{asr_index_path.as_posix()}?mode=ro", uri=True, timeout=10
            )
            asr_conn.row_factory = sqlite3.Row
            try:
                asr = asr_conn.execute(
                    "SELECT text_raw, start_ms, end_ms FROM asr_segments "
                    "WHERE row_id = ? ORDER BY overlap_ms DESC LIMIT 1",
                    (row_id,),
                ).fetchone()
                if asr is None:
                    asr = asr_conn.execute(
                        "SELECT text_raw, start_ms, end_ms FROM asr_segments "
                        "WHERE video_id = ? AND start_ms <= ? AND ? <= end_ms "
                        "ORDER BY (end_ms - start_ms) ASC LIMIT 1",
                        (video_id.upper(), timestamp_ms, timestamp_ms),
                    ).fetchone()
            finally:
                asr_conn.close()

            return {
                "keyframe_id": local_id,
                "video_id": video_id,
                "shot_id": rec["shot_id"],
                "timestamp_ms": timestamp_ms,
                "timestamp_seconds": round(timestamp_ms / 1000.0, 3),
                "image_file": str(rec["image_file"] or ""),
                "ocr_text": str(ocr["ocr_text"] or "") if ocr else "",
                "ocr_avg_confidence": float(ocr["avg_confidence"] or 0.0) if ocr else 0.0,
                "ocr_max_confidence": float(ocr["max_confidence"] or 0.0) if ocr else 0.0,
                "ocr_line_count": int(ocr["line_count"] or 0) if ocr else 0,
                "asr_text": str(asr["text_raw"] or "") if asr else "",
                "asr_start_ms": int(asr["start_ms"]) if asr else None,
                "asr_end_ms": int(asr["end_ms"]) if asr else None,
                "asr_start_seconds": round(int(asr["start_ms"]) / 1000.0, 3) if asr else None,
                "asr_end_seconds": round(int(asr["end_ms"]) / 1000.0, 3) if asr else None,
                "source": "local-sqlite",
                "source_embedding_row": row_id,
            }

        try:
            local_payload = await asyncio.to_thread(read_local_frame_text)
        except sqlite3.Error as exc:
            print(f"[frontend] Cannot read local frame text: {exc}", flush=True)
            local_payload = None
        if local_payload is not None:
            return local_payload
        return await proxy_backend(request, f"/frame-text/{urllib.parse.quote(local_id)}")

    @app.get("/video-asr/{video_id}")
    async def video_asr(video_id: str):
        if not video_id or any(part in video_id for part in ("..", "/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid video id")
        if not asr_index_path.is_file():
            raise HTTPException(status_code=503, detail=f"ASR index not found: {asr_index_path}")

        requested_video_id = video_id.strip().upper()
        canonical_video_id = requested_video_id
        video_id_aliases = [requested_video_id]
        video_id_match = re.fullmatch(r"([A-Z]\d{2,3})[-_](V\d{3})", requested_video_id)
        if video_id_match:
            group_id, video_number = video_id_match.groups()
            hyphenated_id = f"{group_id}-{video_number}"
            underscored_id = f"{group_id}_{video_number}"
            canonical_video_id = hyphenated_id if group_id.startswith(("N", "S")) else underscored_id
            video_id_aliases.extend((canonical_video_id, hyphenated_id, underscored_id))
        video_id_aliases = list(dict.fromkeys(video_id_aliases))

        def read_segments() -> List[Dict[str, Any]]:
            connection = sqlite3.connect(
                f"file:{asr_index_path.as_posix()}?mode=ro",
                uri=True,
                timeout=10,
            )
            connection.row_factory = sqlite3.Row
            try:
                placeholders = ",".join("?" for _ in video_id_aliases)
                rows = connection.execute(
                    f"""
                    SELECT video_id, segment_id, start_ms, end_ms, text_raw
                    FROM asr_segments
                    WHERE video_id IN ({placeholders})
                    ORDER BY start_ms, end_ms, segment_id
                    """,
                    video_id_aliases,
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                connection.close()

        try:
            segments = await asyncio.to_thread(read_segments)
        except sqlite3.Error as exc:
            raise HTTPException(status_code=500, detail=f"Cannot read ASR index: {exc}") from exc
        resolved_video_id = str(segments[0]["video_id"]) if segments else canonical_video_id
        return {
            "video_id": resolved_video_id,
            "requested_video_id": requested_video_id,
            "segments": segments,
            "returned": len(segments),
        }

    @app.post("/temporal-search")
    async def temporal_search(request: Request):
        return await proxy_backend(request, "/temporal-search")

    @app.get("/shot-context/{video_id}/{shot_id}")
    async def shot_context(
        request: Request,
        video_id: str,
        shot_id: int,
        keyframe_id: str = "",
        timestamp_ms: Optional[int] = None,
    ):
        if not video_id or any(part in video_id for part in ("..", "/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid video id")
        if keyframe_id in deleted_keyframe_ids:
            raise HTTPException(status_code=404, detail="Frame da duoc chuyen sang frames_deleted")
        if not metadata_ready.is_set():
            raise HTTPException(status_code=503, detail="Shot metadata is loading")
        local_all_frames, local_shot_frames = load_extended_local_metadata(video_id)
        available_shot_frames = shot_frames_by_video.get(video_id, []) or local_shot_frames
        available_shot_ids = {int(frame.get("shot_id", -1)) for frame in available_shot_frames}
        if local_all_frames and shot_id not in available_shot_ids:
            matched_frame = next(
                (frame for frame in local_all_frames if frame.get("keyframe_id") == keyframe_id),
                None,
            )
            if matched_frame is None and timestamp_ms is not None:
                matched_frame = min(
                    local_all_frames,
                    key=lambda frame: abs(int(frame.get("timestamp_ms", 0)) - timestamp_ms),
                )
            if matched_frame is not None:
                shot_id = int(matched_frame.get("shot_id", shot_id))
        frames = select_shot_context(
            available_shot_frames,
            shot_id,
            keyframe_id=keyframe_id,
            timestamp_ms=timestamp_ms,
        )
        if not frames:
            query = urllib.parse.urlencode({
                "keyframe_id": keyframe_id,
                **({"timestamp_ms": timestamp_ms} if timestamp_ms is not None else {}),
            })
            path = f"/shot-context/{urllib.parse.quote(video_id)}/{shot_id}"
            return await proxy_backend(request, f"{path}?{query}" if query else path)
        return {"frames": frames, "returned": len(frames), "window_size": 24}

    @app.get("/frame-context/{video_id}")
    async def frame_context(request: Request, video_id: str, timestamp_ms: int = 0, count: int = 0):
        if not metadata_ready.is_set():
            raise HTTPException(status_code=503, detail="Frame metadata is loading")
        local_all_frames, _ = load_extended_local_metadata(video_id)
        available_frames = frames_by_video.get(video_id, []) or local_all_frames
        frames = select_frame_context(available_frames, timestamp_ms, count=count)
        if not frames:
            query = urllib.parse.urlencode({"timestamp_ms": timestamp_ms, "count": count})
            return await proxy_backend(
                request,
                f"/frame-context/{urllib.parse.quote(video_id)}?{query}",
            )
        return {"frames": frames, "returned": len(frames), "window_size": count or len(frames)}

    LOCAL_KEYFRAME_ROOTS: List[Path] = []
    env_keyframes = os.getenv("KEYFRAMES_DIR") or os.getenv("LOCAL_KEYFRAME_DIR")
    candidate_roots = [
        thumbnail_root,
        keyframes_dir,
        Path(env_keyframes) if env_keyframes else None,
        Path(r"D:\Folder\AICHALLENGE2026\keyframes_AIC_2026"),
        Path(r"D:\AICHALLENGE2026\keyframes_AIC_2026"),
        Path(r"D:\keyframes_AIC_2026"),
        Path(r"C:\keyframes_AIC_2026"),
        Path(r"E:\keyframes_AIC_2026"),
    ]
    for c in candidate_roots:
        if c is not None and c.exists():
            # Resource ZIPs often contain repeated ``synthetic_frames`` folders.
            # Try the deepest existing folder first so each image normally needs
            # one filesystem lookup instead of probing every wrapper directory.
            sub_candidates = [
                c,
                c / "synthetic_frames",
                c / "synthetic_frames" / "synthetic_frames",
                c / "synthetic_frames_webp",
                c / "keyframes",
                c / "keyframes_AIC_2026",
            ]
            sub_candidates.sort(key=lambda path: len(path.parts), reverse=True)
            for sub in sub_candidates:
                if sub.is_dir() and sub not in LOCAL_KEYFRAME_ROOTS:
                    LOCAL_KEYFRAME_ROOTS.append(sub)
            try:
                for child in c.iterdir():
                    if child.is_dir() and (
                        child.name.startswith(("L", "K"))
                        or "synthetic" in child.name.lower()
                        or "keyframe" in child.name.lower()
                    ):
                        if child not in LOCAL_KEYFRAME_ROOTS:
                            LOCAL_KEYFRAME_ROOTS.append(child)
            except Exception:
                pass

    if keyframes_dir:
        exists_str = "TỒN TẠI: CÓ" if keyframes_dir.exists() else "TỒN TẠI: KHÔNG (Sai đường dẫn!)"
        print(f"[frontend] Đường dẫn keyframes_dir: {keyframes_dir} -> {exists_str}", flush=True)

    if LOCAL_KEYFRAME_ROOTS:
        print(f"[frontend] ĐÃ KÍCH HOẠT {len(LOCAL_KEYFRAME_ROOTS)} thư mục ảnh SSD: {[str(r) for r in LOCAL_KEYFRAME_ROOTS[:3]]}...", flush=True)
    else:
        print(f"[frontend] \033[91m[CẢNH BÁO]\033[0m Chưa nhận diện được thư mục ảnh nào trên SSD! Mọi ảnh sẽ bị kéo từ Server qua mạng làm chậm hệ thống!", flush=True)

    _local_keyframe_cache: Dict[str, Optional[Path]] = {}
    _missing_warning_count = 0

    def resolve_local_keyframe_file(keyframe_id: str) -> Optional[Path]:
        raw = urllib.parse.unquote(str(keyframe_id)).strip()
        if not raw:
            return None
        if raw in _local_keyframe_cache:
            return _local_keyframe_cache[raw]

        stem = Path(raw).stem
        parts = stem.rsplit("_", 1)
        if len(parts) == 2:
            video_id, frame_idx = parts[0], parts[1]
            video_ids = [video_id]
            names: List[str]
            is_extended_frame = False

            # Extended BEiT-3 metadata stores the complete local filename in
            # the keyframe id. M folders use underscores locally while N
            # folders use hyphens:
            #   M07-V024_frame_874 -> M07_V024/frame_874.webp
            #   N052-V003_shot_0001_frame_000100
            #       -> N052-V003/shot_0001_frame_000100.webp
            #   S01-V001_shot_0001_frame_000000
            #       -> S01-V001/shot_0001_frame_000000.webp
            extended_frame = re.fullmatch(
                r"((M\d{2}|N\d{3}|S\d{2})[-_]V\d{3})_(.+)",
                stem,
                re.IGNORECASE,
            )
            if extended_frame:
                is_extended_frame = True
                remote_video_id, batch_id, local_stem = extended_frame.groups()
                if batch_id.upper().startswith("M"):
                    local_video_id = remote_video_id.replace("-", "_").upper()
                else:
                    local_video_id = remote_video_id.replace("_", "-").upper()
                video_ids = [local_video_id]
                names = [f"{local_stem}.webp", f"{local_stem}.jpg", f"{local_stem}.jpeg"]
            else:
                try:
                    num = int(frame_idx)
                    names = [
                        f"{num:03d}.webp", f"{num}.webp", f"{frame_idx}.webp",
                        f"{num:04d}.webp", f"{num:05d}.webp", f"{num:06d}.webp",
                        f"{num:03d}.jpg", f"{num}.jpg", f"{frame_idx}.jpg", f"{frame_idx}.jpeg",
                        f"{num:04d}.jpg", f"{num:05d}.jpg", f"{num:06d}.jpg",
                    ]
                except ValueError:
                    names = [f"{frame_idx}.webp", f"{frame_idx}.jpg", f"{frame_idx}.jpeg"]

            batch_folder = re.split(r"[-_]", video_ids[0], maxsplit=1)[0]

            roots_to_search = (
                [Path(keyframes_dir)]
                if is_extended_frame and keyframes_dir is not None
                else LOCAL_KEYFRAME_ROOTS
            )
            for root in roots_to_search:
                if not root.is_dir():
                    continue
                for local_video_id in video_ids:
                    for name in names:
                        target = root / local_video_id / name
                        if target.is_file():
                            _local_keyframe_cache[raw] = target
                            return target
                        target_batch = root / batch_folder / local_video_id / name
                        if target_batch.is_file():
                            _local_keyframe_cache[raw] = target_batch
                            return target_batch

            if is_extended_frame:
                _local_keyframe_cache[raw] = None
                return None

        for root in LOCAL_KEYFRAME_ROOTS:
            if not root.is_dir():
                continue
            p = root / raw
            if p.is_file():
                _local_keyframe_cache[raw] = p
                return p
            for ext in (".webp", ".jpg", ".jpeg"):
                cand = root / f"{raw}{ext}"
                if cand.is_file():
                    _local_keyframe_cache[raw] = cand
                    return cand

        nonlocal _missing_warning_count
        _local_keyframe_cache[raw] = None
        if _missing_warning_count < 3:
            _missing_warning_count += 1
            print(f"[frontend] \033[93m[Thiếu ảnh SSD]\033[0m Không tìm thấy {raw} trong các thư mục SSD -> Kéo từ Server: {[str(r) for r in LOCAL_KEYFRAME_ROOTS[:2]]}", flush=True)
        return None

    @app.get("/keyframe/{keyframe_id:path}")
    async def keyframe(keyframe_id: str, request: Request):
        if keyframe_id in deleted_keyframe_ids:
            raise HTTPException(status_code=404, detail="Frame da duoc chuyen sang frames_deleted")
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            mime = mimetypes.guess_type(str(local_file))[0] or "image/jpeg"
            return FileResponse(
                local_file,
                media_type=mime,
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local"},
            )
        return await proxy_backend(request, f"/keyframe/{urllib.parse.quote(keyframe_id)}")

    @app.head("/keyframe/{keyframe_id:path}")
    async def keyframe_head(keyframe_id: str, request: Request):
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            mime = mimetypes.guess_type(str(local_file))[0] or "image/jpeg"
            return Response(
                status_code=200,
                media_type=mime,
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local"},
            )
        return await proxy_backend(request, f"/keyframe/{urllib.parse.quote(keyframe_id)}")

    @app.get("/thumbnail/{keyframe_id:path}")
    async def thumbnail(keyframe_id: str, request: Request):
        if keyframe_id in deleted_keyframe_ids:
            raise HTTPException(status_code=404, detail="Frame da duoc chuyen sang frames_deleted")
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            mime = mimetypes.guess_type(str(local_file))[0] or "image/jpeg"
            return FileResponse(
                local_file,
                media_type=mime,
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local"},
            )
        return await proxy_backend(request, f"/thumbnail/{urllib.parse.quote(keyframe_id)}")

    @app.head("/thumbnail/{keyframe_id:path}")
    async def thumbnail_head(keyframe_id: str, request: Request):
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            return Response(
                status_code=200,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local-jpg"},
            )
        return await proxy_backend(request, f"/thumbnail/{urllib.parse.quote(keyframe_id)}")

    @app.get("/keyframe-webp/{keyframe_id:path}")
    async def keyframe_webp(keyframe_id: str, request: Request):
        if keyframe_id in deleted_keyframe_ids:
            raise HTTPException(status_code=404, detail="Frame da duoc chuyen sang frames_deleted")
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            return FileResponse(
                local_file,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local-jpg"},
            )
        return await proxy_backend(request, f"/keyframe-webp/{urllib.parse.quote(keyframe_id)}")

    @app.head("/keyframe-webp/{keyframe_id:path}")
    async def keyframe_webp_head(keyframe_id: str, request: Request):
        local_file = resolve_local_keyframe_file(keyframe_id)
        if local_file is not None:
            return Response(
                status_code=200,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Keyframe-Source": "local-jpg"},
            )
        return await proxy_backend(request, f"/keyframe-webp/{urllib.parse.quote(keyframe_id)}")

    # Persistent connection pool for high-throughput async video streaming
    hls_http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=8.0, read=60.0, write=10.0, pool=30.0),
        limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
        follow_redirects=True,
        trust_env=False,
    )

    @app.on_event("shutdown")
    async def shutdown_clients():
        await backend_http_client.aclose()
        await hls_http_client.aclose()
        if team_hub_client is not None:
            await team_hub_client.aclose()

    async def proxy_stream_url(request: Request, target_url: str) -> Response:
        forward_headers = {}
        for key in ("range", "user-agent", "accept", "accept-encoding", "if-none-match", "if-modified-since"):
            val = request.headers.get(key)
            if val:
                forward_headers[key] = val

        try:
            req = hls_http_client.build_request(
                request.method,
                target_url,
                headers=forward_headers,
            )
            resp = await hls_http_client.send(req, stream=True)
        except Exception as exc:
            return JSONResponse({"detail": f"Proxy HLS streaming that bai: {exc}"}, status_code=502)

        out_headers = {}
        for key, value in resp.headers.items():
            if key.lower() not in {"connection", "transfer-encoding", "content-encoding", "keep-alive"}:
                out_headers[key] = value

        if ".ts" in target_url:
            out_headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif ".m3u8" in target_url:
            out_headers["Cache-Control"] = "public, max-age=60"

        if request.method == "HEAD":
            await resp.aclose()
            return Response(
                status_code=resp.status_code,
                headers=out_headers,
                media_type=resp.headers.get("content-type"),
            )

        async def body_stream():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await resp.aclose()

        return StreamingResponse(
            body_stream(),
            status_code=resp.status_code,
            headers=out_headers,
            media_type=resp.headers.get("content-type"),
        )

    async def proxy_url(request: Request, target_url: str, timeout: int = 300) -> Response:
        return await proxy_stream_url(request, target_url)

    @app.get("/hls/{video_id}/{asset_path:path}")
    async def get_hls_asset(video_id: str, asset_path: str, request: Request):
        try:
            path = get_hls_path(video_id, asset_path)
            return FileResponse(
                path,
                media_type=hls_media_type(path),
                headers={"Cache-Control": "public, max-age=31536000"},
            )
        except HTTPException:
            if hls_server_url:
                target = hls_server_url.rstrip("/") + f"/hls/{urllib.parse.quote(video_id)}/{asset_path}"
                return await proxy_stream_url(request, target)
            raise

    @app.head("/hls/{video_id}/{asset_path:path}")
    async def head_hls_asset(video_id: str, asset_path: str, request: Request):
        try:
            path = get_hls_path(video_id, asset_path)
            return FileResponse(
                path,
                media_type=hls_media_type(path),
                headers={"Cache-Control": "public, max-age=31536000"},
            )
        except HTTPException:
            if hls_server_url:
                target = hls_server_url.rstrip("/") + f"/hls/{urllib.parse.quote(video_id)}/{asset_path}"
                return await proxy_stream_url(request, target)
            raise

    @app.get("/videos/{video_id}")
    async def get_video(video_id: str, request: Request):
        try:
            path = get_video_path(video_id)
            media_type = mimetypes.guess_type(path.name)[0] or "video/mp4"
            return FileResponse(
                path,
                media_type=media_type,
                filename=path.name,
                headers={"Cache-Control": "public, max-age=31536000"},
            )
        except HTTPException:
            if hls_server_url:
                target = hls_server_url.rstrip("/") + f"/videos/{urllib.parse.quote(video_id)}"
                return await proxy_stream_url(request, target)
            raise

    @app.head("/videos/{video_id}")
    async def head_video(video_id: str, request: Request):
        try:
            path = get_video_path(video_id)
            media_type = mimetypes.guess_type(path.name)[0] or "video/mp4"
            return FileResponse(
                path,
                media_type=media_type,
                filename=path.name,
                headers={"Cache-Control": "public, max-age=31536000"},
            )
        except HTTPException:
            if hls_server_url:
                target = hls_server_url.rstrip("/") + f"/videos/{urllib.parse.quote(video_id)}"
                return await proxy_stream_url(request, target)
            raise

    @app.get("/video/{video_id}")
    async def get_legacy_video(video_id: str, request: Request):
        return await get_video(video_id, request)

    @app.head("/video/{video_id}")
    async def head_legacy_video(video_id: str, request: Request):
        return await head_video(video_id, request)

    @app.get("/team/state")
    async def team_state():
        state = read_team_state(team_state_path)
        state["submission_counts"] = {
            query["filename"]: query["answer_count"]
            for query in load_query_catalog(query_root, csv_submission_root)
        }
        state["query_viewers"] = team_socket_hub.get_query_viewers()
        return state

    @app.get("/submission/queries")
    async def submission_queries():
        return {"queries": load_query_catalog(query_root, csv_submission_root)}

    @app.post("/team/query")
    async def select_team_query(body: Dict[str, Any]):
        filename = str(body.get("filename", "")).strip()
        try:
            parse_query_filename(filename)
            query_path = query_root / filename
            if not query_path.is_file():
                raise ValueError("query khong ton tai")
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Query khong hop le: {exc}"}, status_code=400)

        async with team_state_lock:
            state = read_team_state(team_state_path)
            state["active_query"] = filename
            state["submission_counts"] = {
                query["filename"]: query["answer_count"]
                for query in load_query_catalog(query_root, csv_submission_root)
            }
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/submission/csv")
    async def submit_csv(body: Dict[str, Any]):
        filename = str(body.get("query_filename", "")).strip()
        try:
            _, task_type = parse_query_filename(filename)
            query_path = query_root / filename
            if not query_path.is_file():
                raise ValueError("query khong ton tai")
            row = build_csv_submission_row(
                query_path,
                task_type,
                body.get("items"),
                body.get("answer", ""),
            )
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Bai nop CSV khong hop le: {exc}"}, status_code=400)

        user_name = str(body.get("user_name", body.get("name", "Thành viên"))).strip() or "Thành viên"
        user_key = normalize_user_key(user_name)
        output_path = csv_submission_root / f"{query_path.stem}.csv"
        async with team_state_lock:
            csv_submission_root.mkdir(parents=True, exist_ok=True)
            lock_path = csv_submission_root / ".submission.lock"
            with lock_path.open("a+") as lock_file:
                if fcntl is not None:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
                count = csv_row_count(output_path)
                if count >= 100:
                    return JSONResponse({"detail": "File CSV da dat gioi han 100 dong"}, status_code=409)
                with output_path.open("a", encoding="utf-8", newline="") as file_obj:
                    if task_type == "qa":
                        escaped_answer = str(row[2]).replace('"', '""')
                        file_obj.write(f'{row[0]},{row[1]},"{escaped_answer}"\n')
                    else:
                        csv.writer(file_obj, lineterminator="\n").writerow(row)
                count += 1
                state = read_team_state(team_state_path)
                state.setdefault("submission_counts", {})[filename] = count
                write_team_state(state, team_state_path)

                content_summary = ""
                if task_type == "kis" and len(row) >= 2:
                    content_summary = f"Frame {row[0]} (ID: {row[1]})"
                elif task_type == "qa" and len(row) >= 3:
                    content_summary = f"Frame {row[0]} (ID: {row[1]}) | Đáp án: '{row[2]}'"
                elif task_type == "trake" and len(row) >= 2:
                    content_summary = f"Chuỗi frame {row[0]}: {', '.join(str(x) for x in row[1:])}"
                else:
                    content_summary = ", ".join(str(x) for x in row)

                now_ts = time.time()
                sub_record = {
                    "user_name": user_name,
                    "user_key": user_key,
                    "query_filename": filename,
                    "task_type": task_type,
                    "output_filename": output_path.name,
                    "content_summary": content_summary,
                    "row": row,
                    "timestamp": now_ts,
                }
                append_submission_log(sub_record)

                try:
                    import datetime
                    csv_activity_path = SUBMISSION_ACTIVITY_CSV_PATH
                    write_head = not csv_activity_path.exists()
                    with csv_activity_path.open("a", encoding="utf-8", newline="") as f_act:
                        act_writer = csv.writer(f_act)
                        if write_head:
                            act_writer.writerow(["ThoiGian", "NguoiSua", "CauHoi", "LoaiCau", "NoiDungSuaNop", "FileCSV"])
                        time_display = datetime.datetime.fromtimestamp(now_ts).strftime("%Y-%m-%d %H:%M:%S")
                        act_writer.writerow([time_display, user_name, filename, task_type, content_summary, output_path.name])
                except Exception:
                    pass

                profiles = read_user_profiles()
                user_prof = profiles.setdefault(user_key, {"name": user_name, "drafts": {}})
                user_prof["name"] = user_name
                user_prof["total_submissions"] = int(user_prof.get("total_submissions", 0)) + 1
                user_prof["last_submitted_at"] = time.time()
                write_user_profiles(profiles)

        await team_socket_hub.broadcast(state)
        return {
            "query_filename": filename,
            "output_filename": output_path.name,
            "answer_count": count,
            "row": row,
            "user_name": user_name,
        }

    @app.get("/correct-submission-sound.mp3")
    async def correct_submission_sound():
        sounds = [
            path
            for path in SUBMISSION_SOUND_ROOT.iterdir()
            if path.is_file()
            and path.stat().st_size > 0
            and path.suffix.lower() in SUBMISSION_SOUND_SUFFIXES
        ] if SUBMISSION_SOUND_ROOT.is_dir() else []
        if not sounds:
            raise HTTPException(status_code=404, detail="Submission sound not found")
        sound_path = random.choice(sounds)
        return FileResponse(
            sound_path,
            media_type=mimetypes.guess_type(sound_path.name)[0] or "audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )

    @app.websocket("/ws/team")
    async def team_websocket(websocket: WebSocket):
        if team_hub_url:
            await websocket.accept()
            hub_ws_url = team_hub_url.rstrip("/")
            if hub_ws_url.startswith("https://"):
                hub_ws_url = "wss://" + hub_ws_url[8:] + "/ws/team"
            elif hub_ws_url.startswith("http://"):
                hub_ws_url = "ws://" + hub_ws_url[7:] + "/ws/team"
            else:
                hub_ws_url = f"ws://{hub_ws_url}/ws/team"

            if websockets is None:
                await websocket.close(code=1011, reason="websockets library not installed")
                return

            try:
                async with websockets.connect(hub_ws_url, ping_interval=20, ping_timeout=20) as upstream_ws:
                    async def client_to_upstream():
                        try:
                            while True:
                                data = await websocket.receive_text()
                                await upstream_ws.send(data)
                        except Exception:
                            pass

                    async def upstream_to_client():
                        try:
                            async for message in upstream_ws:
                                await websocket.send_text(message)
                        except Exception:
                            pass

                    done, pending = await asyncio.wait(
                        [
                            asyncio.create_task(client_to_upstream()),
                            asyncio.create_task(upstream_to_client()),
                        ],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in pending:
                        task.cancel()
            except WebSocketDisconnect:
                pass
            except Exception as exc:
                print(f"[team-ws-proxy] Upstream Hub error ({hub_ws_url}): {exc}", flush=True)
                try:
                    await websocket.close(code=1011, reason=f"Upstream Hub unavailable: {exc}")
                except Exception:
                    pass
            return

        await team_socket_hub.connect(websocket)
        try:
            state = read_team_state(team_state_path)
            state["submission_counts"] = {
                query["filename"]: query["answer_count"]
                for query in load_query_catalog(query_root, csv_submission_root)
            }
            state["query_viewers"] = team_socket_hub.get_query_viewers()
            await websocket.send_json(state)
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                    if isinstance(msg, dict) and msg.get("type") == "viewing":
                        cid = str(msg.get("client_id", "")).strip()
                        cname = str(msg.get("name", "")).strip()
                        cfile = str(msg.get("filename", "")).strip()
                        if cid and cname and cfile:
                            team_socket_hub.update_viewer(cid, cname, cfile, websocket)
                            await team_socket_hub.broadcast_viewers()
                except Exception:
                    pass
        except WebSocketDisconnect:
            team_socket_hub.disconnect(websocket)
            await team_socket_hub.broadcast_viewers()
        except Exception:  # noqa: BLE001
            team_socket_hub.disconnect(websocket)
            await team_socket_hub.broadcast_viewers()

    @app.post("/team/viewing")
    async def report_viewing(body: Dict[str, Any]):
        cid = str(body.get("client_id", "")).strip()
        cname = str(body.get("name", "")).strip()
        cfile = str(body.get("filename", "")).strip()
        if cid and cname and cfile:
            team_socket_hub.update_viewer(cid, cname, cfile)
            await team_socket_hub.broadcast_viewers()
        return {"ok": True, "viewers": team_socket_hub.get_query_viewers()}

    @app.post("/team/user/sync")
    async def sync_user_profile(body: Dict[str, Any]):
        name = str(body.get("name", "")).strip()
        if not name:
            return JSONResponse({"detail": "name khong duoc rong"}, status_code=400)
        user_key = normalize_user_key(name)
        async with team_state_lock:
            profiles = read_user_profiles()
            user_prof = profiles.setdefault(user_key, {
                "name": name,
                "active_query": "",
                "drafts": {},
                "total_submissions": 0,
                "created_at": time.time(),
            })
            user_prof["name"] = name
            user_prof["updated_at"] = time.time()

            if "active_query" in body and body["active_query"]:
                clean_q = str(body["active_query"]).strip()
                if (query_root / clean_q).is_file():
                    user_prof["active_query"] = clean_q

            draft_qa = body.get("draft_qa_answer")
            target_query = body.get("active_query_for_draft") or user_prof.get("active_query")
            if draft_qa is not None and target_query:
                user_prof.setdefault("drafts", {})[str(target_query).strip()] = str(draft_qa)

            write_user_profiles(profiles)

        return {
            "user_key": user_key,
            "name": name,
            "active_query": user_prof.get("active_query", ""),
            "drafts": user_prof.get("drafts", {}),
            "total_submissions": user_prof.get("total_submissions", 0),
        }

    @app.post("/team/user/stats/clear")
    async def clear_user_stats():
        async with team_state_lock:
            if SUBMISSION_LOG_PATH.is_file():
                SUBMISSION_LOG_PATH.write_text("[]", encoding="utf-8")
            if SUBMISSION_ACTIVITY_CSV_PATH.is_file():
                SUBMISSION_ACTIVITY_CSV_PATH.write_text("ThoiGian,NguoiSua,CauHoi,LoaiCau,NoiDungSuaNop,FileCSV\n", encoding="utf-8")
            if USER_PROFILES_PATH.is_file():
                try:
                    profs = json.loads(USER_PROFILES_PATH.read_text(encoding="utf-8"))
                    for p in profs.values():
                        if isinstance(p, dict):
                            p["total_submissions"] = 0
                    USER_PROFILES_PATH.write_text(json.dumps(profs, ensure_ascii=False, indent=2), encoding="utf-8")
                except Exception:
                    pass
        return {"status": "ok", "message": "Đã xóa sạch lịch sử nộp bài"}

    @app.get("/team/user/stats")
    async def get_user_stats(name: str = ""):
        clean_name = str(name).strip()
        user_key = normalize_user_key(clean_name) if clean_name else ""
        logs = read_submission_log()

        counts_by_key: Dict[str, Dict[str, Any]] = {}
        for entry in logs:
            k = entry.get("user_key") or normalize_user_key(entry.get("user_name", "Ẩn danh"))
            disp_name = entry.get("user_name") or "Ẩn danh"
            if k not in counts_by_key:
                counts_by_key[k] = {"name": disp_name, "count": 0, "last_timestamp": 0}
            counts_by_key[k]["count"] += 1
            counts_by_key[k]["last_timestamp"] = max(
                counts_by_key[k]["last_timestamp"],
                float(entry.get("timestamp", 0))
            )

        leaderboard = sorted(
            counts_by_key.values(),
            key=lambda item: item["count"],
            reverse=True,
        )

        personal_logs = []
        if user_key:
            personal_logs = [
                entry for entry in reversed(logs)
                if (entry.get("user_key") == user_key or normalize_user_key(entry.get("user_name", "")) == user_key)
            ][:100]

        team_history = list(reversed(logs))[:150]
        return {
            "user_name": clean_name,
            "user_submissions_count": len(personal_logs),
            "total_team_submissions": len(logs),
            "personal_history": personal_logs,
            "team_history": team_history,
            "leaderboard": leaderboard,
        }

    @app.post("/team/member")
    async def save_team_member(body: Dict[str, Any]):
        try:
            client_id = str(body["client_id"]).strip()
            name = str(body["name"]).strip()
            if not client_id or not name:
                raise ValueError("client_id va name khong duoc rong")
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body member khong hop le: {exc}"}, status_code=400)

        async with team_state_lock:
            state = read_team_state(team_state_path)
            state["members"][client_id] = {"name": name, "updated_at": time.time()}
            trake_user = state["trake_users"].setdefault(client_id, {
                "name": name,
                "event": 1,
                "frames": [],
                "updated_at": time.time(),
            })
            trake_user["name"] = name
            trake_user["updated_at"] = time.time()
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/submission-feedback")
    async def broadcast_submission_feedback(body: Dict[str, Any]):
        verdict = str(body.get("verdict", "")).strip().lower()
        name = str(body.get("name", "")).strip()[:100]
        event_id = str(body.get("event_id", "")).strip() or str(uuid.uuid4())
        keyframe_ids = [
            str(value).strip()
            for value in body.get("keyframe_ids", [])
            if str(value).strip()
        ][:100]
        if verdict not in {"correct", "wrong", "clear"} or not name or not keyframe_ids:
            return JSONResponse({"detail": "Submission feedback khong hop le"}, status_code=400)
        event = {
            "type": "submission_feedback",
            "event_id": event_id,
            "verdict": verdict,
            "name": name,
            "keyframe_ids": keyframe_ids,
        }
        async with team_state_lock:
            state = read_team_state(team_state_path)
            shared_feedback = state["submission_feedback"]
            if verdict == "correct":
                for keyframe_id in [
                    key for key, value in shared_feedback.items()
                    if str(value.get("verdict", "")) == "wrong"
                ]:
                    shared_feedback.pop(keyframe_id, None)
            has_correct = any(
                str(value.get("verdict", "")) == "correct"
                for value in shared_feedback.values()
            )
            for keyframe_id in keyframe_ids:
                if verdict == "clear":
                    shared_feedback.pop(keyframe_id, None)
                elif verdict != "wrong" or not has_correct:
                    shared_feedback[keyframe_id] = {
                        "verdict": verdict,
                        "name": name,
                        "event_id": event_id,
                        "updated_at": time.time(),
                    }
            if len(shared_feedback) > 1000:
                newest = sorted(
                    shared_feedback.items(),
                    key=lambda item: float(item[1].get("updated_at", 0)),
                    reverse=True,
                )[:1000]
                state["submission_feedback"] = dict(newest)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        await team_socket_hub.broadcast(event)
        return event

    @app.post("/team/vote")
    async def save_team_vote(body: Dict[str, Any]):
        try:
            client_id = str(body["client_id"]).strip()
            name = str(body["name"]).strip()
            item = body["item"]
            keyframe_id = str(item["keyframe_id"])
            if not client_id or not name or not keyframe_id:
                raise ValueError("client_id, name va keyframe_id khong duoc rong")
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body vote khong hop le: {exc}"}, status_code=400)

        async with team_state_lock:
            state = read_team_state(team_state_path)
            state["members"][client_id] = {"name": name, "updated_at": time.time()}
            votes = [
                vote for vote in state.get("votes", [])
                if not (vote.get("client_id") == client_id and vote.get("item", {}).get("keyframe_id") == keyframe_id)
            ]
            votes.append({
                "selection_id": uuid.uuid4().hex,
                "client_id": client_id,
                "user_key": normalize_user_key(name),
                "name": name,
                "item": item,
                "created_at": time.time(),
            })
            expired = votes[:-200]
            state["votes"] = votes[-200:]
            for vote in expired:
                delete_capture_for_vote(vote)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/add")
    async def add_trake_frame(body: Dict[str, Any]):
        try:
            client_id = str(body["client_id"]).strip()
            name = str(body["name"]).strip()
            item = body["item"]
            keyframe_id = str(item["keyframe_id"]).strip()
            video_id = str(item["video_id"]).strip()
            frame_id = int(item.get("frame_id", item.get("frame_idx")))
            if not client_id or not name or not keyframe_id or not video_id or frame_id < 0:
                raise ValueError("client_id, name, video_id, keyframe_id va frame_id khong hop le")
            item = dict(item)
            item["frame_id"] = frame_id
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body TRAKE frame khong hop le: {exc}"}, status_code=400)

        async with team_state_lock:
            state = read_team_state(team_state_path)
            trake_frames = state["trake_frames"]
            if trake_frames and any(frame.get("item", {}).get("video_id") != video_id for frame in trake_frames):
                return JSONResponse({"detail": "TRAKE chi nhan cac frame thuoc cung mot video."}, status_code=400)
            duplicate = any(
                frame.get("item", {}).get("video_id") == video_id
                and (
                    frame.get("item", {}).get("keyframe_id") == keyframe_id
                    or str(frame.get("item", {}).get("frame_id", "")) == str(frame_id)
                )
                for frame in trake_frames
            )
            if not duplicate:
                state["members"][client_id] = {"name": name, "updated_at": time.time()}
                trake_frames.append({
                    "selection_id": uuid.uuid4().hex,
                    "client_id": client_id,
                    "user_key": normalize_user_key(name),
                    "name": name,
                    "item": item,
                    "created_at": time.time(),
                })
                state["trake_frames"] = trake_frames[-200:]
                write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/capture")
    async def save_team_capture(request: Request):
        params = request.query_params
        try:
            client_id = str(params["client_id"]).strip()
            name = str(params["name"]).strip()
            video_id = str(params["video_id"]).strip()
            frame_id = int(params["frame_id"])
            timestamp_ms = int(params["timestamp_ms"])
            fps = float(params["fps"])
            shot_id = str(params.get("shot_id", "")).strip()
            target = str(params.get("target", "team")).strip().lower()
            event_num = int(params.get("event", 1))
            if not client_id or not name or not video_id or frame_id < 0 or timestamp_ms < 0 or fps <= 0:
                raise ValueError("tham so capture khong hop le")
            if target not in {"team", "trake", "trake_user"}:
                raise ValueError("target capture khong hop le")
            event_num = max(1, min(5, event_num))
            content_type = request.headers.get("content-type", "").split(";", 1)[0]
            if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                raise ValueError("capture phai la JPEG, PNG hoac WebP")
            image = await request.body()
            if not image or len(image) > 8 * 1024 * 1024:
                raise ValueError("capture rong hoac lon hon 8 MB")
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body capture khong hop le: {exc}"}, status_code=400)

        selection_id = uuid.uuid4().hex
        suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[content_type]
        team_capture_dir.mkdir(parents=True, exist_ok=True)
        image_path = team_capture_dir / f"{selection_id}{suffix}"
        image_path.write_bytes(image)
        image_url = f"/team-capture/{selection_id}{suffix}"
        item = {
            "keyframe_id": f"capture_{selection_id}",
            "video_id": video_id,
            "shot_id": shot_id,
            "frame_id": frame_id,
            "timestamp_ms": timestamp_ms,
            "timestamp_seconds": round(timestamp_ms / 1000, 3),
            "fps": fps,
            "image_url": image_url,
            "thumbnail_url": image_url,
            "is_capture": True,
        }
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state["members"][client_id] = {"name": name, "updated_at": time.time()}
            selection = {
                "selection_id": selection_id,
                "client_id": client_id,
                "user_key": normalize_user_key(name),
                "name": name,
                "item": item,
                "created_at": time.time(),
            }
            if target == "trake_user":
                user_entry = state["trake_users"].setdefault(client_id, {
                    "name": name,
                    "event": event_num,
                    "frames": [],
                    "updated_at": time.time(),
                })
                user_entry["name"] = name
                user_entry["event"] = event_num
                user_entry["updated_at"] = time.time()
                target_frames = user_entry.setdefault("frames", [])
                if any(
                    frame.get("item", {}).get("video_id") == video_id
                    and str(frame.get("item", {}).get("frame_id", "")) == str(frame_id)
                    for frame in target_frames
                ):
                    image_path.unlink(missing_ok=True)
                    return state
                selection["event"] = event_num
                target_frames.append(selection)
                expired = target_frames[:-50]
                user_entry["frames"] = target_frames[-50:]
            else:
                target_frames = state["trake_frames"] if target == "trake" else state["votes"]
                if target == "trake" and target_frames and any(
                    frame.get("item", {}).get("video_id") != video_id for frame in target_frames
                ):
                    image_path.unlink(missing_ok=True)
                    return JSONResponse({"detail": "TRAKE chi nhan cac frame thuoc cung mot video."}, status_code=400)
                if target == "trake" and any(
                    frame.get("item", {}).get("video_id") == video_id
                    and str(frame.get("item", {}).get("frame_id", "")) == str(frame_id)
                    for frame in target_frames
                ):
                    image_path.unlink(missing_ok=True)
                    return state
                target_frames.append(selection)
                expired = target_frames[:-200]
                if target == "trake":
                    state["trake_frames"] = target_frames[-200:]
                else:
                    state["votes"] = target_frames[-200:]
            for vote in expired:
                delete_capture_for_vote(vote)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.get("/team-capture/{filename}")
    async def get_team_capture(filename: str):
        if not filename or Path(filename).name != filename or Path(filename).suffix not in {".jpg", ".png", ".webp"}:
            raise HTTPException(status_code=404, detail="Capture not found")
        path = team_capture_dir / filename
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Capture not found")
        return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})

    def delete_capture_for_vote(vote: Dict[str, Any]) -> None:
        item = vote.get("item", {})
        if not item.get("is_capture"):
            return
        filename = Path(str(item.get("image_url", ""))).name
        if filename and Path(filename).name == filename:
            (team_capture_dir / filename).unlink(missing_ok=True)

    @app.post("/team/remove")
    async def remove_team_vote(body: Dict[str, Any]):
        selection_id = str(body.get("selection_id", "")).strip()
        if not selection_id:
            return JSONResponse({"detail": "selection_id khong duoc rong"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            removed = [vote for vote in state.get("votes", []) if vote.get("selection_id") == selection_id]
            state["votes"] = [vote for vote in state.get("votes", []) if vote.get("selection_id") != selection_id]
            for vote in removed:
                delete_capture_for_vote(vote)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/remove")
    async def remove_trake_frame(body: Dict[str, Any]):
        selection_id = str(body.get("selection_id", "")).strip()
        if not selection_id:
            return JSONResponse({"detail": "selection_id khong duoc rong"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            removed = [
                frame for frame in state["trake_frames"]
                if frame.get("selection_id") == selection_id
            ]
            state["trake_frames"] = [
                frame for frame in state["trake_frames"]
                if frame.get("selection_id") != selection_id
            ]
            for frame in removed:
                delete_capture_for_vote(frame)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/clear")
    async def clear_trake_frames():
        async with team_state_lock:
            state = read_team_state(team_state_path)
            removed = state["trake_frames"]
            state["trake_frames"] = []
            for frame in removed:
                delete_capture_for_vote(frame)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/user-state")
    async def update_trake_user_state(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        name = str(body.get("name", "")).strip()
        event_num = int(body.get("event", 1))
        if not client_id:
            return JSONResponse({"detail": "client_id khong duoc rong"}, status_code=400)
        event_num = max(1, min(5, event_num))
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state.setdefault("trake_users", {})
            user_entry = state["trake_users"].setdefault(client_id, {
                "name": name or "Thành viên",
                "event": event_num,
                "frames": [],
                "updated_at": time.time(),
            })
            if name:
                user_entry["name"] = name
            user_entry["event"] = event_num
            user_entry["updated_at"] = time.time()
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/user-frame/add")
    async def add_trake_user_frame(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        name = str(body.get("name", "")).strip()
        item = body.get("item")
        event_num = int(body.get("event", 1))
        if not client_id or not item:
            return JSONResponse({"detail": "client_id va item khong duoc rong"}, status_code=400)
        event_num = max(1, min(5, event_num))
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state.setdefault("trake_users", {})
            user_entry = state["trake_users"].setdefault(client_id, {
                "name": name or "Thành viên",
                "event": event_num,
                "frames": [],
                "updated_at": time.time(),
            })
            if name:
                user_entry["name"] = name
            user_entry["event"] = event_num
            user_entry["updated_at"] = time.time()

            frames = user_entry.setdefault("frames", [])
            keyframe_id = str(item.get("keyframe_id", ""))
            if not any(f.get("item", {}).get("keyframe_id") == keyframe_id for f in frames):
                frames.append({
                    "selection_id": uuid.uuid4().hex,
                    "event": event_num,
                    "item": item,
                    "created_at": time.time(),
                })
                user_entry["frames"] = frames[-50:]
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/user-frame/remove")
    async def remove_trake_user_frame(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        selection_id = str(body.get("selection_id", "")).strip()
        if not client_id or not selection_id:
            return JSONResponse({"detail": "client_id va selection_id khong duoc rong"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state.setdefault("trake_users", {})
            user_entry = state["trake_users"].get(client_id)
            if user_entry and "frames" in user_entry:
                removed = [
                    frame for frame in user_entry["frames"]
                    if frame.get("selection_id") == selection_id
                ]
                user_entry["frames"] = [
                    frame for frame in user_entry["frames"]
                    if frame.get("selection_id") != selection_id
                ]
                for frame in removed:
                    delete_capture_for_vote(frame)
                user_entry["updated_at"] = time.time()
                write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/user-frame/clear")
    async def clear_trake_user_frames(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        if not client_id:
            return JSONResponse({"detail": "client_id khong duoc rong"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state.setdefault("trake_users", {})
            user_entry = state["trake_users"].get(client_id)
            if user_entry:
                for frame in user_entry.get("frames", []):
                    delete_capture_for_vote(frame)
                user_entry["frames"] = []
                user_entry["updated_at"] = time.time()
                write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/user/remove")
    async def remove_trake_user(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        if not client_id:
            return JSONResponse({"detail": "client_id khong duoc rong"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            user_entry = state.setdefault("trake_users", {}).pop(client_id, None)
            removed_votes = [
                vote for vote in state.get("votes", [])
                if vote.get("client_id") == client_id
            ]
            state["votes"] = [
                vote for vote in state.get("votes", [])
                if vote.get("client_id") != client_id
            ]
            state.setdefault("members", {}).pop(client_id, None)
            for frame in (user_entry or {}).get("frames", []):
                delete_capture_for_vote(frame)
            for vote in removed_votes:
                delete_capture_for_vote(vote)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/trake/reorder")
    async def reorder_trake_frames(body: Dict[str, Any]):
        frames = body.get("frames")
        if not isinstance(frames, list):
            return JSONResponse({"detail": "frames phai la list"}, status_code=400)
        async with team_state_lock:
            state = read_team_state(team_state_path)
            state["trake_frames"] = frames[:200]
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/team/clear")
    async def clear_team_votes(body: Dict[str, Any]):
        client_id = str(body.get("client_id", "")).strip()
        name = str(body.get("name", "")).strip()
        user_key = normalize_user_key(name) if name else ""
        if not client_id and not user_key:
            return JSONResponse({"detail": "client_id hoac name khong duoc rong"}, status_code=400)

        async with team_state_lock:
            state = read_team_state(team_state_path)

            def is_match(vote: Dict[str, Any]) -> bool:
                if user_key and (
                    vote.get("user_key") == user_key
                    or normalize_user_key(vote.get("name", "")) == user_key
                ):
                    return True
                if client_id and vote.get("client_id") == client_id:
                    return True
                return False

            removed = [vote for vote in state.get("votes", []) if is_match(vote)]
            state["votes"] = [vote for vote in state.get("votes", []) if not is_match(vote)]
            for vote in removed:
                delete_capture_for_vote(vote)
            write_team_state(state, team_state_path)
        await team_socket_hub.broadcast(state)
        return state

    @app.post("/dres/login")
    async def login_dres(body: Dict[str, Any]):
        try:
            server_url = validate_dres_server(str(body["server_url"]))
            username = str(body["username"])
            password = str(body["password"])
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body login DRES khong hop le: {exc}"}, status_code=400)

        data = json.dumps({"username": username, "password": password}).encode("utf-8")
        req = urllib.request.Request(
            f"{server_url}/api/v2/login",
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        return await forward_urllib_request(req, timeout=30)

    @app.post("/dres/evaluations")
    async def list_dres_evaluations(body: Dict[str, Any]):
        try:
            server_url = validate_dres_server(str(body["server_url"]))
            session_id = str(body["session_id"])
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body evaluation DRES khong hop le: {exc}"}, status_code=400)

        query = urllib.parse.urlencode({"session": session_id})
        req = urllib.request.Request(
            f"{server_url}/api/v2/client/evaluation/list?{query}",
            headers={"Accept": "application/json"},
            method="GET",
        )
        return await forward_urllib_request(req, timeout=30)

    @app.post("/dres/submit")
    async def submit_dres(body: Dict[str, Any]):
        try:
            server_url = validate_dres_server(str(body["server_url"]))
            session_id = str(body["session_id"]).strip()
            evaluation_id = str(body["evaluation_id"]).strip()
            if not session_id or not evaluation_id:
                raise ValueError("session_id va evaluation_id khong duoc rong")
            payload = build_dres_submission_payload(body)
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"detail": f"Body submit DRES khong hop le: {exc}"}, status_code=400)

        query = urllib.parse.urlencode({"session": session_id})
        target = f"{server_url}/api/v2/submit/{urllib.parse.quote(evaluation_id)}?{query}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            target,
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        return await forward_urllib_request(req, timeout=30)

    @app.post("/api/log-latency")
    async def log_latency(request: Request):
        try:
            data = await request.json()
            user = data.get("user") or "Client"
            path = data.get("path") or "/search"
            up = float(data.get("transit_up_ms") or 0)
            srv = float(data.get("server_ms") or 0)
            down = float(data.get("transit_down_ms") or 0)
            rtt = float(data.get("rtt_ms") or 0)
            client_epoch = data.get("client_epoch")
            diff_str = ""
            if client_epoch:
                skew = (time.time() * 1000) - float(client_epoch) - up
                diff_str = f" | Lệch đồng hồ: {skew:+.0f}ms"

            print(
                f"\n\033[96m==================== [SEARCH LATENCY REPORT] ====================\033[0m\n"
                f"  Người dùng: \033[1m{user}\033[0m | Endpoint: {path}\n"
                f"  \033[33m🛫 Chặng đi (Client -> Backend) : {up:>7.1f} ms\033[0m\n"
                f"  \033[32m⚙️ Backend xử lý                : {srv:>7.1f} ms\033[0m\n"
                f"  \033[33m🛬 Chặng về (Backend -> Client) : {down:>7.1f} ms\033[0m\n"
                f"  \033[36m🔄 Tổng thời gian phản hồi (RTT): {rtt:>7.1f} ms{diff_str}\033[0m\n"
                f"\033[96m=================================================================\033[0m\n",
                flush=True,
            )
        except Exception:
            pass
        return {"status": "ok"}

    @app.api_route("/{asset_path:path}", methods=["GET", "HEAD"])
    async def static_asset(asset_path: str, request: Request):
        if not asset_path:
            raise HTTPException(status_code=404, detail="Not found")
        path = FRONTEND_DIR / asset_path
        try:
            resolved = path.resolve()
            resolved.relative_to(FRONTEND_DIR)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc
        if not resolved.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        content = resolved.read_bytes()
        media_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
        headers = {
            "Content-Length": str(len(content)),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        return Response(
            content=b"" if request.method == "HEAD" else content,
            media_type=media_type,
            headers=headers,
        )

    app.state.video_path_by_id = video_path_by_id
    app.state.shot_frames_by_video = shot_frames_by_video
    app.state.metadata_ready = metadata_ready
    app.state.records_path = records_path
    app.state.backend_url = backend_url
    app.state.deleted_rows = deleted_rows
    app.state.deleted_keyframe_ids = deleted_keyframe_ids
    app.state.team_state_path = team_state_path
    app.state.team_capture_dir = team_capture_dir
    app.state.team_hub_url = team_hub_url
    app.state.ocr_index_path = ocr_index_path
    app.state.asr_index_path = asr_index_path
    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chay frontend FastAPI va media endpoint truc tiep.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--backend-url", default="http://127.0.0.1:8036")
    parser.add_argument(
        "--team-hub-url",
        default=os.getenv("TEAM_HUB_URL", ""),
        help="URL cua Team Hub (vi du: http://192.168.1.10:8080 hoac http://server_ip:8080). Neu de trong thi tu dong dong vai Master Hub.",
    )
    parser.add_argument("--hls-server-url", default=os.getenv("HLS_SERVER_URL", "http://127.0.0.1:8052"))
    parser.add_argument("--records-path", type=Path, default=DEFAULT_RECORDS_PATH)
    parser.add_argument("--ocr-index", type=Path, default=DEFAULT_OCR_INDEX)
    parser.add_argument("--asr-index", type=Path, default=DEFAULT_ASR_INDEX)
    parser.add_argument("--deleted-manifest", type=Path, default=DEFAULT_DELETED_MANIFEST)
    parser.add_argument("--query-root", type=Path, default=QUERY_ROOT)
    parser.add_argument(
        "--keyframes-dir",
        "--keyframe-root",
        dest="keyframes_dir",
        type=Path,
        default=Path(os.environ["KEYFRAMES_DIR"]) if os.getenv("KEYFRAMES_DIR") else None,
        help="Thu muc chua keyframes tren may local (tu dong fallback sang Backend neu thieu frame)",
    )
    parser.add_argument(
        "--thumbnail-root",
        dest="thumbnail_root",
        type=Path,
        default=None,
        help="Thu muc chua thumbnails tren may local (neu co)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    app = create_app(
        backend_url=args.backend_url,
        records_path=args.records_path,
        deleted_manifest=args.deleted_manifest,
        query_root=args.query_root,
        hls_server_url=args.hls_server_url,
        keyframes_dir=args.keyframes_dir,
        thumbnail_root=getattr(args, "thumbnail_root", None),
        team_hub_url=args.team_hub_url,
        ocr_index_path=args.ocr_index,
        asr_index_path=args.asr_index,
    )
    print(f"Frontend FastAPI: http://{args.host}:{args.port}/")
    print(f"Proxy backend: {args.backend_url}")
    if args.team_hub_url:
        print(f"Team Hub upstream (Edge Member mode): {args.team_hub_url}")
    else:
        print("Team Hub: Master Mode (hosting WebSocket /ws/team & saving submissions locally)")
    print(f"Remote HLS server: {args.hls_server_url}")
    print(f"Video records: {args.records_path} (metadata preload runs in background)")
    print(f"Local OCR index: {args.ocr_index}")
    print(f"Local ASR index: {args.asr_index}")
    print(f"Deleted frame filter: {args.deleted_manifest} ({len(app.state.deleted_rows)} rows)")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
