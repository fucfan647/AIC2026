from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(r"D:\Folder\AICHALLENGE2026\keyframes_AIC_2026")
FRAMES_ROOT = DATA_ROOT / "synthetic_frames" / "synthetic_frames"
WEBP_FRAMES_ROOT = FRAMES_ROOT
WEBP_THUMBNAILS_ROOT = FRAMES_ROOT
EMBEDDING_ROOT = PROJECT_ROOT
ARTIFACT_ROOT = PROJECT_ROOT / "artifacts"
CURRENT_INDEX = ARTIFACT_ROOT / "current_index"

DEFAULT_MODEL_NAME = "facebook/metaclip-2-worldwide-b16-384"
EMBEDDING_DIM = 512
