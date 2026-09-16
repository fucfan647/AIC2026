from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Support Windows path fallback and Linux NAS path fallback
_default_data_root = r"D:\Folder\AICHALLENGE2026\keyframes_AIC_2026"
if not Path(_default_data_root).exists() and Path("/GuestShare_NAS/WorkingSpace/Personal/nghiadq/synthetic_frames").exists():
    _default_data_root = "/GuestShare_NAS/WorkingSpace/Personal/nghiadq"

DATA_ROOT = Path(os.getenv("DATA_ROOT", _default_data_root))

_default_frames = DATA_ROOT / "synthetic_frames" / "synthetic_frames"
if not _default_frames.exists() and (DATA_ROOT / "synthetic_frames").exists():
    _default_frames = DATA_ROOT / "synthetic_frames"

FRAMES_ROOT = Path(os.getenv("FRAMES_ROOT", str(_default_frames)))

_default_webp = DATA_ROOT / "synthetic_frames_webp" if (DATA_ROOT / "synthetic_frames_webp").exists() else FRAMES_ROOT
WEBP_FRAMES_ROOT = Path(os.getenv("WEBP_FRAMES_ROOT", str(_default_webp)))
WEBP_THUMBNAILS_ROOT = Path(os.getenv("WEBP_THUMBNAILS_ROOT", str(WEBP_FRAMES_ROOT)))

EMBEDDING_ROOT = PROJECT_ROOT
ARTIFACT_ROOT = PROJECT_ROOT / "artifacts"
CURRENT_INDEX = ARTIFACT_ROOT / "current_index"
MUSIC_ROOT = PROJECT_ROOT / "music"

DEFAULT_MODEL_NAME = "facebook/metaclip-2-worldwide-b16-384"
EMBEDDING_DIM = 512
