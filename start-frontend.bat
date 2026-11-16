@echo off
title SafeLink Expo Metro Bundler (192.168.91.232)
cd /d "%~dp0SafeLink\frontend"
echo ========================================================
echo   Starting SafeLink Expo Frontend on 192.168.91.232
echo ========================================================
echo.
set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.91.232
npx expo start -c --lan
pause
