@echo off
chcp 65001 >nul
title [OPTION 1 - TEAM LEAD] AIC2026 Master Hub (Port 8080)

echo =====================================================================
echo  [OPTION 1] KHỞI CHẠY MASTER HUB TẠI MÁY ĐỘI TRƯỞNG (HOST)
echo =====================================================================
echo  - Cổng phục vụ: 8080 (Mở rộng cho toàn mạng LAN: 0.0.0.0)
echo  - Lưu file nộp bài: Thư mục frontend\submission\ tại máy này
echo  - Quản lý khay ghim & WebSocket đồng bộ cả đội
echo =====================================================================

:: 1. CẤU HÌNH ĐƯỜNG DẪN ẢNH SSD TRÊN MÁY ĐỘI TRƯỞNG
:: Chỉnh sửa đường dẫn dưới đây tới thư mục chứa ảnh synthetic_frames_webp trên SSD của bạn:
set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"

:: 2. ĐỊA CHỈ SERVER GPU (Chạy AI Search trên Linux Server)
:: Thay <IP_SERVER_GPU> bằng IP thực tế của Server (ví dụ: 192.168.1.50):
set "BACKEND_URL=http://127.0.0.1:8036"

:: 3. HLS SERVER (Nếu có stream video)
set "HLS_SERVER_URL=http://127.0.0.1:8052"

echo.
echo [1/3] Kiểm tra Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [LỖI] Chưa tìm thấy Python trên máy! Vui lòng cài Python 3.10+ và tích chọn 'Add Python to PATH'.
    pause
    exit /b 1
)

echo [2/3] Kiểm tra thư viện...
python -c "import fastapi, uvicorn, websockets, httpx" >nul 2>&1
if errorlevel 1 (
    echo [THÔNG BÁO] Đang cài đặt thư viện cần thiết...
    pip install fastapi uvicorn websockets httpx
)

echo.
echo =====================================================================
echo  HƯỚNG DẪN DÀNH CHO ĐỘI TRƯỞNG:
echo  1. Mở Command Prompt (cmd), gõ `ipconfig` để lấy IP LAN của bạn (ví dụ 192.168.1.15).
echo  2. Gửi IP này cho các thành viên để họ điền vào file `start_option1_member.bat`.
echo  3. Mở trình duyệt tại máy bạn: http://127.0.0.1:8080
echo =====================================================================
echo.

python frontend\serve_frontend.py --host 0.0.0.0 --port 8080 --backend-url %BACKEND_URL% --hls-server-url %HLS_SERVER_URL% --keyframes-dir "%KEYFRAMES_DIR%"

pause
