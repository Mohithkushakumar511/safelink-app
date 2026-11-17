@echo off
title SafeLink Expo Metro Bundler (10.210.7.232)
cd /d "%~dp0SafeLink\frontend"
echo ========================================================
echo   Starting SafeLink Expo Frontend on 10.210.7.232
echo ========================================================
echo.
set REACT_NATIVE_PACKAGER_HOSTNAME=10.210.7.232
npx expo start -c --lan
pause
