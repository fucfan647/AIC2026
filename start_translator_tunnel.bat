@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AIC2026 HPLT Model + Tunnel (Port 8031)

echo Dang ket noi server, khoi dong model HPLT neu can va mo tunnel 8031...
echo Ban chi can nhap mat khau SSH mot lan trong cua so nay.
echo Giu cua so nay mo trong khi su dung tinh nang dich query.
echo.

ssh -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 8031:127.0.0.1:8031 nghiadq@192.168.20.156 "cd /GuestShare_NAS/WorkingSpace/Personal/nghiadq/auto_dich_test/method_hplt_vi_en/api_service_float32 && if ! ss -ltn 2>/dev/null | grep -q '127.0.0.1:8031'; then screen -S hplt_api -X quit >/dev/null 2>&1 || true; screen -dmS hplt_api ./run_service.sh; fi; until curl -fsS http://127.0.0.1:8031/health >/dev/null 2>&1; do sleep 2; done; echo HPLT_MODEL_READY; exec sleep infinity"

echo.
echo Tunnel translator da dong.
pause
