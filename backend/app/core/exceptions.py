"""
==============================================================================
TỆP TIN: backend/app/core/exceptions.py
LỚP: BackendError, BadRequestError, NotFoundError, ServiceUnavailableError
MÔ TẢ:
    Định nghĩa hệ thống ngoại lệ tùy biến cho Back-end:
    - Đóng gói mã trạng thái HTTP (status_code) và thông điệp chi tiết (detail).
    - Giúp tầng Controller và Service xử lý và trả về phản hồi lỗi JSON đồng nhất.
==============================================================================
"""

from __future__ import annotations


class BackendError(Exception):
    """Ngoại lệ cơ sở cho các lỗi trong hệ thống Backend."""
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class BadRequestError(BackendError):
    """Lỗi yêu cầu không hợp lệ (HTTP 400)."""
    def __init__(self, detail: str = "bad request"):
        super().__init__(400, detail)


class NotFoundError(BackendError):
    """Lỗi tài nguyên không tìm thấy (HTTP 404)."""
    def __init__(self, detail: str = "not found"):
        super().__init__(404, detail)


class ServiceUnavailableError(BackendError):
    """Lỗi dịch vụ chưa sẵn sàng hoặc đang tải (HTTP 503)."""
    def __init__(self, detail: str = "service unavailable"):
        super().__init__(503, detail)
