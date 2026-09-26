@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
cd /d "%~dp0"
title [OPTION 2 - THÀNH VIÊN] AIC2026 Edge Client (Port 8081)
if /I "%~1"=="tunnel" goto RUN_SERVER_TUNNELS

echo =====================================================================
echo  [OPTION 2] KHỞI CHẠY CLIENT THÀNH VIÊN (KẾT NỐI QUA SERVER LINUX)
echo =====================================================================
echo  - Đọc ảnh trực tiếp từ SSD máy cá nhân: 0ms, siêu tốc
echo  - Tìm kiếm AI gửi tới Server GPU (cổng 8036)
echo  - Đồng bộ khay ghim ^& nộp bài tập trung về Server Linux (cổng 8080)
echo =====================================================================

:: 1. CẤU HÌNH ĐƯỜNG DẪN ẢNH SSD TRÊN MÁY BẠN
:: Thay đổi đường dẫn tới thư mục keyframe trên SSD của bạn:
set "KEYFRAMES_DIR=C:\uit\aic2026_resources\synthetic_frames\synthetic_frames\synthetic_frames"
set "LOCAL_INDEX_DIR=C:\uit\aic2026_resources\local_indexes"
set "RECORDS_PATH=%LOCAL_INDEX_DIR%\records.sqlite"
set "OCR_INDEX=%LOCAL_INDEX_DIR%\paddle_ocr.sqlite"
set "ASR_INDEX=%LOCAL_INDEX_DIR%\asr.sqlite"

:: 2. ĐỊA CHỈ SERVER LINUX (Vừa làm Team Hub cổng 8080, vừa làm GPU AI cổng 8036)
:: Thay <IP_SERVER_LINUX> bằng IP thực tế của Server (ví dụ: 192.168.1.50):
set "SERVER_IP=192.168.20.156"
set "SSH_USER=nghiadq"

set "TEAM_HUB_URL=http://127.0.0.1:8080"
set "BACKEND_URL=http://127.0.0.1:8036"
set "HLS_SERVER_URL=http://127.0.0.1:8052"
set "TRANSLATOR_URL=http://127.0.0.1:8031"

echo.
echo [1/4] Kiểm tra tài nguyên local...
if not exist "%KEYFRAMES_DIR%" (
    echo [LỖI] Không tìm thấy KEYFRAMES_DIR: %KEYFRAMES_DIR%
    pause
    exit /b 1
)
if not exist "%RECORDS_PATH%" (
    echo [LỖI] Không tìm thấy RECORDS_PATH: %RECORDS_PATH%
    pause
    exit /b 1
)
if not exist "%ASR_INDEX%" (
    echo [LỖI] Không tìm thấy ASR_INDEX: %ASR_INDEX%
    pause
    exit /b 1
)
if not exist "%OCR_INDEX%" (
    echo [LỖI] Không tìm thấy OCR_INDEX: %OCR_INDEX%
    pause
    exit /b 1
)

echo [2/4] Kiểm tra Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [LỖI] Chưa tìm thấy Python trên máy! Vui lòng cài Python 3.10+ và tích chọn 'Add Python to PATH'.
    pause
    exit /b 1
)

echo [3/4] Kiểm tra thư viện...
python -c "import fastapi, uvicorn, websockets, httpx" >nul 2>&1
if errorlevel 1 (
    echo [THÔNG BÁO] Đang cài đặt thư viện cần thiết...
    pip install fastapi uvicorn websockets httpx
)

echo [4/4] Kiểm tra SSH tunnel backend, HLS và model dịch...
set "SSH_FORWARD_ARGS="

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 set "SSH_FORWARD_ARGS=!SSH_FORWARD_ARGS! -L 8080:127.0.0.1:8080"

powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8031/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 set "SSH_FORWARD_ARGS=!SSH_FORWARD_ARGS! -L 8031:127.0.0.1:8031"

powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8036/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 set "SSH_FORWARD_ARGS=!SSH_FORWARD_ARGS! -L 8036:127.0.0.1:8036"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8052 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 set "SSH_FORWARD_ARGS=!SSH_FORWARD_ARGS! -L 8052:127.0.0.1:8052"

if not defined SSH_FORWARD_ARGS goto ALL_TUNNELS_READY

echo [THÔNG BÁO] Đang mở các SSH tunnel còn thiếu: !SSH_FORWARD_ARGS!
echo [THÔNG BÁO] Hãy nhập mật khẩu SSH một lần trong cửa sổ Server Tunnels vừa mở.
start "AIC2026 Server Tunnels" cmd.exe /k ""%~f0" tunnel"

set /a TUNNEL_WAIT_SECONDS=0
:WAIT_ALL_TUNNELS
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto TUNNELS_NOT_READY
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8036/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 goto TUNNELS_NOT_READY
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8031/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 goto TUNNELS_NOT_READY
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8052 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto TUNNELS_NOT_READY
goto ALL_TUNNELS_READY

:TUNNELS_NOT_READY
set /a TUNNEL_WAIT_SECONDS+=1
if !TUNNEL_WAIT_SECONDS! LSS 180 goto WAIT_ALL_TUNNELS
echo [LỖI] Tunnel hoặc dịch vụ server chưa sẵn sàng sau 180 giây.
echo Hãy kiểm tra mật khẩu SSH và các tiến trình backend/HLS trên server.
pause
exit /b 1

:ALL_TUNNELS_READY
echo [OK] Team Hub: %TEAM_HUB_URL%
echo [OK] Backend: %BACKEND_URL%
echo [OK] HLS: %HLS_SERVER_URL%
echo [OK] Model dịch: %TRANSLATOR_URL%

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 goto START_FRONTEND
echo [THÔNG BÁO] Frontend đã chạy sẵn tại http://127.0.0.1:8081
start "" http://127.0.0.1:8081
exit /b 0

:START_FRONTEND

echo.
echo =====================================================================
echo  HỆ THỐNG ĐANG KHỞI CHẠY...
echo  - Mở trình duyệt tại máy bạn: http://127.0.0.1:8081
echo  - Nhập tên của bạn ở góc trên giao diện và bắt đầu tìm kiếm!
echo =====================================================================
echo.

start "AIC2026 Browser" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8081'"
python frontend\serve_frontend.py --host 127.0.0.1 --port 8081 --backend-url %BACKEND_URL% --team-hub-url %TEAM_HUB_URL% --hls-server-url %HLS_SERVER_URL% --keyframes-dir "%KEYFRAMES_DIR%" --records-path "%RECORDS_PATH%" --ocr-index "%OCR_INDEX%" --asr-index "%ASR_INDEX%"

pause
exit /b %errorlevel%

:RUN_SERVER_TUNNELS
setlocal DisableDelayedExpansion
title AIC2026 Server Tunnels (8080, 8031, 8036, 8052)
if not defined SERVER_IP set "SERVER_IP=192.168.20.156"
if not defined SSH_USER set "SSH_USER=nghiadq"
if not defined SSH_FORWARD_ARGS set "SSH_FORWARD_ARGS=-L 8080:127.0.0.1:8080 -L 8031:127.0.0.1:8031 -L 8036:127.0.0.1:8036 -L 8052:127.0.0.1:8052"

echo Dang ket noi server va mo cac tunnel con thieu...
echo %SSH_FORWARD_ARGS%
echo Ban chi can nhap mat khau SSH mot lan trong cua so nay.
echo Giu cua so nay mo trong khi su dung system.
echo Lenh nay chi tao tunnel, khong khoi dong hay thay doi dich vu tren server.
echo.

ssh -N -T -c aes128-gcm@openssh.com -o TCPKeepAlive=yes -o Compression=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 %SSH_FORWARD_ARGS% %SSH_USER%@%SERVER_IP%

echo.
echo Tunnel server da dong.
pause
exit /b
