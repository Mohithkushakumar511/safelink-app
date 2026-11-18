@echo off
echo ========================================================
echo               SAFELINK LAUNCHER
echo ========================================================
echo.
echo Choose an option to start:
echo [1] Start SafeLink FastAPI Backend (Port 8000)
echo [2] Start SafeLink Expo Frontend (Auto Wi-Fi LAN)
echo [3] Start SafeLink Expo Frontend (Tunnel Mode - works on any Wi-Fi/Mobile Data)
echo [4] Exit
echo.
set /p choice=Enter choice (1-4): 

if "%choice%"=="1" (
    echo Starting FastAPI backend...
    cd "%~dp0SafeLink\backend"
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else if "%choice%"=="2" (
    cd "%~dp0SafeLink\frontend"
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress"') do (
        set REACT_NATIVE_PACKAGER_HOSTNAME=%%i
    )
    if "%REACT_NATIVE_PACKAGER_HOSTNAME%"=="" set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.6
    echo Starting Expo frontend on %REACT_NATIVE_PACKAGER_HOSTNAME%...
    npx expo start -c --lan
) else if "%choice%"=="3" (
    echo Starting Expo frontend in Tunnel mode...
    cd SafeLink\frontend
    npx expo start -c --tunnel
) else (
    echo Exiting.
)
pause
