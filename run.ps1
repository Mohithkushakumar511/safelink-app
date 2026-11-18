Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "              SAFELINK POWERSHELL RUNNER               " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Choose an option to launch:"
Write-Host "1: Start FastAPI Backend (0.0.0.0:8001)"
Write-Host "2: Start Expo React Native Frontend (Auto Wi-Fi LAN)"
Write-Host "3: Start Expo React Native Frontend (Tunnel Mode)"
Write-Host "4: Exit"
Write-Host ""

$choice = Read-Host "Select (1-4)"

switch ($choice) {
    "1" {
        Set-Location "SafeLink\backend"
        python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
    }
    "2" {
        Set-Location "SafeLink\frontend"
        $detectedIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress
        if ($detectedIp) {
            $env:REACT_NATIVE_PACKAGER_HOSTNAME = $detectedIp
            Write-Host "Auto-detected Wi-Fi IP: $detectedIp" -ForegroundColor Green
        } else {
            $env:REACT_NATIVE_PACKAGER_HOSTNAME = "192.168.1.6"
        }
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
