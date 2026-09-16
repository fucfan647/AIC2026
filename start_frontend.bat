@echo off
setlocal
cd /d "%~dp0frontend"

echo ============================================================
echo   Starting AIC2026 Frontend (FastAPI:8080)...
echo ============================================================

:: -------------------------------------------------------------------------
:: CAU HINH THU MUC KEYFRAMES TREN MAY LOCAL (O CUNG CA NHAN)
:: Dien duong dan thu muc chua keyframes tren may ban vao day.
:: Vi du: D:\keyframes_AIC_2026 hoac D:\Folder\AICHALLENGE2026\keyframes_AIC_2026
:: Neu de trong, he thong se tu tim cac o dia C:\, D:\, E:\ hoac tai tu Server ve.
:: -------------------------------------------------------------------------
set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"

:: Backend dang host tren Server GPU 156
set "BACKEND_URL=http://192.168.20.156:8036"
set "HLS_URL=http://192.168.20.156:8052"

python -u serve_frontend.py ^
  --host 0.0.0.0 ^
  --port 8080 ^
  --backend-url "%BACKEND_URL%" ^
  --hls-server-url "%HLS_URL%" ^
  --keyframes-dir "%KEYFRAMES_DIR%"

pause

