from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBP_FRAMES_ROOT = Path(
    os.getenv("AIC_KEYFRAMES_ROOT", str(PROJECT_ROOT.parent.parent / "data" / "synthetic_frames"))
).expanduser().resolve()
WEBP_THUMBNAILS_ROOT = Path(
    os.getenv("AIC_THUMBNAILS_ROOT", str(WEBP_FRAMES_ROOT))
).expanduser().resolve()
FRAMES_ROOT = WEBP_FRAMES_ROOT
DATA_ROOT = WEBP_FRAMES_ROOT.parent
EMBEDDING_ROOT = PROJECT_ROOT
ARTIFACT_ROOT = PROJECT_ROOT / "artifacts"
CURRENT_INDEX = ARTIFACT_ROOT / "current_index"
MUSIC_ROOT = Path(os.getenv("AIC_MUSIC_ROOT", str(PROJECT_ROOT / "music"))).expanduser().resolve()

DEFAULT_MODEL_NAME = "facebook/metaclip-2-worldwide-b16-384"
EMBEDDING_DIM = 512
