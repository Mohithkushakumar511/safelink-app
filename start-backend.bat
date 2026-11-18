@echo off
title SafeLink FastAPI Backend (Port 8001)
cd /d "%~dp0SafeLink\backend"

rem Auto-detect active Wi-Fi IPv4 address
set DETECTED_IP=
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress"') do (
    set DETECTED_IP=%%i
)

echo ========================================================
echo         SAFELINK BACKEND SERVER (FastAPI)
echo ========================================================
if not "%DETECTED_IP%"=="" (
    echo   Active Wi-Fi LAN IP : %DETECTED_IP%
    echo   API Health Check    : http://%DETECTED_IP%:8001/health
) else (
    echo   Active Wi-Fi LAN IP : 192.168.1.6
    echo   API Health Check    : http://192.168.1.6:8001/health
)
echo ========================================================
echo.
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
pause
