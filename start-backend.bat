@echo off
title SafeLink FastAPI Backend (Port 8000)
cd /d "%~dp0SafeLink\backend"
echo ========================================================
echo         Starting SafeLink Backend on 0.0.0.0:8000
echo ========================================================
echo.
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pause
