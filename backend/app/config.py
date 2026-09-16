from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
# Support AIC_KEYFRAMES_ROOT, Windows path, and Linux NAS path fallback
_nas_frames = Path("/GuestShare_NAS/WorkingSpace/Personal/nghiadq/synthetic_frames")
_default_cand = PROJECT_ROOT.parent.parent / "data" / "synthetic_frames"
if not _default_cand.exists() and _nas_frames.exists():
    _default_cand = _nas_frames

_raw_keyframes = os.getenv("AIC_KEYFRAMES_ROOT", os.getenv("FRAMES_ROOT", str(_default_cand)))
WEBP_FRAMES_ROOT = Path(_raw_keyframes).expanduser().resolve()
WEBP_THUMBNAILS_ROOT = Path(
    os.getenv("AIC_THUMBNAILS_ROOT", os.getenv("WEBP_THUMBNAILS_ROOT", str(WEBP_FRAMES_ROOT)))
).expanduser().resolve()
FRAMES_ROOT = WEBP_FRAMES_ROOT
DATA_ROOT = WEBP_FRAMES_ROOT.parent
EMBEDDING_ROOT = PROJECT_ROOT
ARTIFACT_ROOT = PROJECT_ROOT / "artifacts"
CURRENT_INDEX = ARTIFACT_ROOT / "current_index"
MUSIC_ROOT = Path(os.getenv("AIC_MUSIC_ROOT", os.getenv("MUSIC_ROOT", str(PROJECT_ROOT / "music")))).expanduser().resolve()

DEFAULT_MODEL_NAME = "facebook/metaclip-2-worldwide-b16-384"
EMBEDDING_DIM = 512
