@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_backend.ps1"
echo.
echo =====================================================================
echo [THONG BAO] Cua so giu nguyen de xem log va loi (neu co).
echo =====================================================================
pause
