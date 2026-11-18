@echo off
title SafeLink Expo Metro Bundler
cd /d "%~dp0SafeLink\frontend"

rem Auto-detect active Wi-Fi IPv4 address
set DETECTED_IP=
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress"') do (
    set DETECTED_IP=%%i
)

if not "%DETECTED_IP%"=="" (
    set REACT_NATIVE_PACKAGER_HOSTNAME=%DETECTED_IP%
    echo ========================================================
    echo   Auto-detected Wi-Fi IP: %DETECTED_IP%
    echo ========================================================
) else (
    set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.6
    echo ========================================================
    echo   Using fallback IP: 192.168.1.6
    echo ========================================================
)

echo Starting SafeLink Expo Frontend on %REACT_NATIVE_PACKAGER_HOSTNAME%...
echo.
npx expo start -c --lan
pause
