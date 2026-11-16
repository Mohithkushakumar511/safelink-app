@echo off
echo ========================================================
echo               SAFELINK LAUNCHER
echo ========================================================
echo.
echo Choose an option to start:
echo [1] Start SafeLink FastAPI Backend (Port 8000)
echo [2] Start SafeLink Expo Frontend (Local Wi-Fi 192.168.91.232)
echo [3] Start SafeLink Expo Frontend (Tunnel Mode - works on any Wi-Fi/Mobile Data)
echo [4] Exit
echo.
set /p choice=Enter choice (1-4): 

if "%choice%"=="1" (
    echo Starting FastAPI backend...
    cd SafeLink\backend
    python -m pip install -r requirements.txt
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else if "%choice%"=="2" (
    echo Starting Expo frontend on Wi-Fi IP 192.168.91.232...
    cd SafeLink\frontend
    set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.91.232
    npx expo start -c --lan
) else if "%choice%"=="3" (
    echo Starting Expo frontend in Tunnel mode...
    cd SafeLink\frontend
    npx expo start -c --tunnel
) else (
    echo Exiting.
)
pause
