@echo off
setlocal

set "TEMP=%LOCALAPPDATA%\Temp"
set "TMP=%LOCALAPPDATA%\Temp"

if not exist "functions\.secret.local" (
  echo Missing functions\.secret.local
  echo Add GEMINI_API_KEY before starting the local backend.
  pause
  exit /b 1
)

echo Starting the NERA local AI backend...
echo Keep this window open while using the app.
firebase.cmd emulators:start --only functions --project fashion-app-9d056

echo.
echo The local backend stopped.
pause
