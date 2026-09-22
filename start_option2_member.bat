@echo off
chcp 65001 >nul
cd /d "%~dp0"
title [OPTION 2 - THÀNH VIÊN] AIC2026 Edge Client (Port 8081)

echo =====================================================================
echo  [OPTION 2] KHỞI CHẠY CLIENT THÀNH VIÊN (KẾT NỐI QUA SERVER LINUX)
echo =====================================================================
echo  - Đọc ảnh trực tiếp từ SSD máy cá nhân: 0ms, siêu tốc
echo  - Tìm kiếm AI gửi tới Server GPU (cổng 8036)
echo  - Đồng bộ khay ghim & nộp bài tập trung về Server Linux (cổng 8080)
echo =====================================================================

:: 1. CẤU HÌNH ĐƯỜNG DẪN ẢNH SSD TRÊN MÁY BẠN
:: Thay đổi đường dẫn tới thư mục keyframe trên SSD của bạn:
set "KEYFRAMES_DIR=C:\uit\aic2026_resources\synthetic_frames\synthetic_frames"
set "RECORDS_PATH=C:\uit\aic2026_resources\aic_resource\01_records_db\backend\artifacts\current_index\records.sqlite"
set "ASR_INDEX=C:\uit\aic2026_resources\aic_resource\10_asr_index\backend\artifacts\asr_index\asr.sqlite"

:: 2. ĐỊA CHỈ SERVER LINUX (Vừa làm Team Hub cổng 8080, vừa làm GPU AI cổng 8036)
:: Thay <IP_SERVER_LINUX> bằng IP thực tế của Server (ví dụ: 192.168.1.50):
set "SERVER_IP=192.168.20.156"

set "TEAM_HUB_URL=http://192.168.20.156:8080"
set "BACKEND_URL=http://192.168.20.156:8080"
set "HLS_SERVER_URL=http://192.168.20.156:8080"
set "TRANSLATOR_URL=http://127.0.0.1:8031"

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

echo [3/3] Kiểm tra kết nối model dịch...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8031/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto TRANSLATOR_TUNNEL_READY

echo [THÔNG BÁO] Đang mở model HPLT trên server và SSH tunnel cổng 8031...
echo [THÔNG BÁO] Hãy nhập mật khẩu SSH trong cửa sổ HPLT Model + Tunnel vừa mở.
start "AIC2026 Translator Tunnel" cmd.exe /k ""%~dp0start_translator_tunnel.bat""

set /a TRANSLATOR_WAIT_SECONDS=0
:WAIT_TRANSLATOR_TUNNEL
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8031/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto TRANSLATOR_TUNNEL_READY
set /a TRANSLATOR_WAIT_SECONDS+=1
if %TRANSLATOR_WAIT_SECONDS% LSS 60 goto WAIT_TRANSLATOR_TUNNEL
echo [CẢNH BÁO] Model HPLT chưa sẵn sàng sau 60 giây. Frontend vẫn khởi chạy nhưng tính năng dịch sẽ chưa dùng được.
goto TRANSLATOR_TUNNEL_DONE

:TRANSLATOR_TUNNEL_READY
echo [OK] Model dịch đã kết nối qua http://127.0.0.1:8031

:TRANSLATOR_TUNNEL_DONE

echo.
echo =====================================================================
echo  HỆ THỐNG ĐANG KHỞI CHẠY...
echo  - Mở trình duyệt tại máy bạn: http://127.0.0.1:8081
echo  - Nhập tên của bạn ở góc trên giao diện và bắt đầu tìm kiếm!
echo =====================================================================
echo.

python frontend\serve_frontend.py --host 127.0.0.1 --port 8081 --backend-url %BACKEND_URL% --team-hub-url %TEAM_HUB_URL% --hls-server-url %HLS_SERVER_URL% --keyframes-dir "%KEYFRAMES_DIR%" --records-path "%RECORDS_PATH%" --asr-index "%ASR_INDEX%"

pause
