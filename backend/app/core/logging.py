"""
==============================================================================
TỆP TIN: backend/app/core/logging.py
MÔ TẢ:
    Quản lý định dạng nhật ký (Console Logging) và màu sắc hiển thị ANSI:
    - Cung cấp hàm uvicorn_log() chuẩn hóa định dạng log giống Uvicorn/FastAPI.
    - Hỗ trợ màu sắc trực quan (INFO, WARNING, ERROR) trên cả Linux và Windows.
==============================================================================
"""

from __future__ import annotations

import os
import sys

# Enable ANSI colors on Windows console
os.system("")

C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_GREEN = "\033[32m"
C_CYAN = "\033[36m"
C_YELLOW = "\033[33m"
C_RED = "\033[31m"


def uvicorn_log(level: str, message: str) -> None:
    """Ghi log ra stdout với tiền tố mức độ log được định dạng màu sắc."""
    if level == "INFO":
        level_tag = f"{C_GREEN}INFO{C_RESET}:    "
    elif level == "WARNING":
        level_tag = f"{C_YELLOW}WARNING{C_RESET}: "
    else:
        level_tag = f"{C_RED}ERROR{C_RESET}:   "
    sys.stdout.write(f"{level_tag} {message}\n")
    sys.stdout.flush()
