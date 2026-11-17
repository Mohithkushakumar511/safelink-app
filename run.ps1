Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "              SAFELINK POWERSHELL RUNNER               " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Choose an option to launch:"
Write-Host "1: Start FastAPI Backend (0.0.0.0:8000)"
Write-Host "2: Start Expo React Native Frontend (Local Wi-Fi 10.210.7.232)"
Write-Host "3: Start Expo React Native Frontend (Tunnel Mode)"
Write-Host "4: Exit"
Write-Host ""

$choice = Read-Host "Select (1-4)"

switch ($choice) {
    "1" {
        Set-Location "SafeLink\backend"
        python -m pip install -r requirements.txt
        python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    }
    "2" {
        Set-Location "SafeLink\frontend"
        $env:REACT_NATIVE_PACKAGER_HOSTNAME = "10.210.7.232"
        npx expo start -c --lan
    }
    "3" {
        Set-Location "SafeLink\frontend"
        npx expo start -c --tunnel
    }
    Default {
        Write-Host "Exited."
    }
}
