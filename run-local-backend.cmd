@echo off
setlocal

if not exist "server\node_modules" (
  echo Server dependencies are missing. Run: cd server ^&^& npm install
  pause
  exit /b 1
)

echo Starting the NERA dedicated API at http://localhost:8080/api/v1 ...
echo Development OTP codes will be printed in this window.
cd server
npm.cmd start

echo.
echo The local backend stopped.
pause
