@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AIC2026 Translator Model + Tunnel (Port 8032 / 8031)

echo Dang ket noi server, mo tunnel translator 8032 va 8031...
echo Ban chi can nhap mat khau SSH mot lan trong cua so nay.
echo Giu cua so nay mo trong khi su dung tinh nang dich query.
echo.

ssh -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 8032:127.0.0.1:8032 -L 8031:127.0.0.1:8031 nghiadq@192.168.20.156 "exec sleep infinity"

echo.
echo Tunnel translator da dong.
pause
