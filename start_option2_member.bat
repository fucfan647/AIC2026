@echo off
chcp 65001 >nul
cd /d "%~dp0"
title [OPTION 2 - THÀNH VIÊN] AIC2026 Edge Client (Port 8081)

echo =====================================================================
echo  [OPTION 2] KHỞI CHẠY CLIENT THÀNH VIÊN (KẾT NỐI QUA SERVER LINUX)
echo =====================================================================
echo  - Đọc ảnh trực tiếp từ SSD máy cá nhân: 0ms, siêu tốc
echo  - Tìm kiếm AI gửi tới Server GPU (cổng 8036 hoặc qua Gateway 8080)
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

set "TEAM_HUB_URL=http://%SERVER_IP%:8080"
set "BACKEND_URL=http://%SERVER_IP%:8080"
set "HLS_SERVER_URL=http://%SERVER_IP%:8080"
set "TRANSLATOR_URL=http://127.0.0.1:8032"

:: 3. KẾT NỐI MODEL DỊCH QWEN (CỔNG 8032)
:: Đặt 1 để bật SSH tunnel kết nối model dịch (yêu cầu tài khoản SSH server).
:: Đặt 0 để TẮT hoàn toàn model dịch (vào web ngay lập tức, không hỏi mật khẩu SSH):
set "ENABLE_TRANSLATOR=0"

echo.
echo [1/4] Kiểm tra Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [LỖI] Chưa tìm thấy Python trên máy! Vui lòng cài Python 3.10+ và tích chọn 'Add Python to PATH'.
    pause
    exit /b 1
)

echo [2/4] Kiểm tra thư viện...
python -c "import fastapi, uvicorn, websockets, httpx" >nul 2>&1
if errorlevel 1 (
    echo [THÔNG BÁO] Đang cài đặt thư viện cần thiết...
    pip install fastapi uvicorn websockets httpx
)

echo [3/4] Kiểm tra kết nối tới Server Linux (%SERVER_IP%)...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri '%BACKEND_URL%/health' -TimeoutSec 3; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 (
    echo [CẢNH BÁO] Chưa kết nối được tới Backend tại %BACKEND_URL%!
    echo           - Kiểm tra máy tính đã kết nối đúng mạng LAN/WiFi với Server (%SERVER_IP%) chưa.
    echo           - Bạn vẫn có thể mở giao diện và kiểm tra lại.
) else (
    echo [OK] Đã kết nối thành công tới Server GPU AI!
)

if "%ENABLE_TRANSLATOR%"=="0" goto TRANSLATOR_DISABLED

echo [4/4] Kiểm tra kết nối model dịch...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8032/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto TRANSLATOR_TUNNEL_READY

echo [THÔNG BÁO] Đang mở SSH tunnel cổng 8032...
echo [THÔNG BÁO] Hãy nhập mật khẩu SSH trong cửa sổ Translator Tunnel vừa mở (hoặc đóng cửa sổ nếu không có tài khoản).
start "AIC2026 Translator Tunnel" cmd.exe /k "%~dp0start_translator_tunnel.bat"

set /a TRANSLATOR_WAIT_SECONDS=0
:WAIT_TRANSLATOR_TUNNEL
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8032/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto TRANSLATOR_TUNNEL_READY
set /a TRANSLATOR_WAIT_SECONDS+=1
if %TRANSLATOR_WAIT_SECONDS% LSS 5 goto WAIT_TRANSLATOR_TUNNEL
echo [CẢNH BÁO] Không thể kết nối model dịch sau 5 giây (có thể do từ chối quyền SSH hoặc server chưa bật).
echo [THÔNG BÁO] Hệ thống vẫn tiếp tục khởi chạy giao diện tìm kiếm bình thường...
goto TRANSLATOR_TUNNEL_DONE

:TRANSLATOR_DISABLED
echo [4/4] Model dịch: ĐÃ TẮT (Chạy chế độ tìm kiếm trực tiếp, không mở SSH tunnel).
goto TRANSLATOR_TUNNEL_DONE

:TRANSLATOR_TUNNEL_READY
echo [OK] Model dịch Qwen 3.5-4B đã kết nối qua http://127.0.0.1:8032

:TRANSLATOR_TUNNEL_DONE

echo.
echo =====================================================================
echo  HỆ THỐNG ĐANG KHỞI CHẠY...
echo  - Mở trình duyệt tại máy bạn: http://127.0.0.1:8081
echo  - Nhập tên của bạn ở góc trên giao diện và bắt đầu tìm kiếm!
echo =====================================================================
echo.

python "frontend\serve_frontend.py" --host 127.0.0.1 --port 8081 --backend-url %BACKEND_URL% --team-hub-url %TEAM_HUB_URL% --hls-server-url %HLS_SERVER_URL% --translator-url "%TRANSLATOR_URL%" --keyframes-dir "%KEYFRAMES_DIR%" --records-path "%RECORDS_PATH%" --asr-index "%ASR_INDEX%"

echo.
echo =====================================================================
echo [THÔNG BÁO] Hệ thống đã dừng lại. Mã thoát: %ERRORLEVEL%
echo =====================================================================
pause
