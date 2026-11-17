@echo off
title SafeLink Expo Metro Bundler (Tunnel Mode)
cd /d "%~dp0SafeLink\frontend"
echo ========================================================
echo   Starting SafeLink Expo Frontend in Tunnel Mode
echo   (Bypasses College / Office / Mobile Wi-Fi Isolation)
echo ========================================================
echo.
npx expo start -c --tunnel
pause
