@echo off
chcp 65001 >nul
title [OPTION 1 - THÀNH VIÊN] AIC2026 Edge Client (Port 8081)

echo =====================================================================
echo  [OPTION 1] KHỞI CHẠY CLIENT THÀNH VIÊN (KẾT NỐI QUA MÁY ĐỘI TRƯỞNG)
echo =====================================================================
echo  - Đọc ảnh trực tiếp từ SSD máy cá nhân: 0ms, siêu tốc
echo  - Tìm kiếm AI gửi tới Server GPU
echo  - Đồng bộ khay ghim & nộp bài gửi về máy Đội trưởng
echo =====================================================================

:: 1. CẤU HÌNH ĐƯỜNG DẪN ẢNH SSD TRÊN MÁY BẠN
:: Thay đổi đường dẫn tới thư mục ảnh synthetic_frames_webp trên SSD của bạn:
set "KEYFRAMES_DIR=F:\AI\AIC2026\data\synthetic_frames"

:: 2. ĐỊA CHỈ MÁY ĐỘI TRƯỞNG (Team Hub)
:: Thay <IP_MAY_DOI_TRUONG> bằng IP máy Đội trưởng trong mạng LAN (ví dụ: 192.168.1.15):
set "TEAM_HUB_URL=http://%SERVER_IP%:8080"

:: 3. ĐỊA CHỈ SERVER GPU (Chạy AI Search)
:: Thay <IP_SERVER_GPU> bằng IP của Server AI (ví dụ: 192.168.1.50):
set "BACKEND_URL=http://%SERVER_IP%:8080"

:: 4. HLS SERVER (Nếu có stream video)
set "HLS_SERVER_URL=http://%SERVER_IP%:8080"

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
echo  HỆ THỐNG ĐANG KHỞI CHẠY...
echo  - Mở trình duyệt tại máy bạn: http://127.0.0.1:8081
echo  - Nhập tên của bạn ở góc trên giao diện và bắt đầu tìm kiếm!
echo =====================================================================
echo.

python frontend\serve_frontend.py --host 127.0.0.1 --port 8081 --backend-url %BACKEND_URL% --team-hub-url %TEAM_HUB_URL% --hls-server-url %HLS_SERVER_URL% --keyframes-dir "%KEYFRAMES_DIR%"

pause
