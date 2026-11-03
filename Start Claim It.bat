@echo off
REM Double-click to run Raptors Claim It on this computer. Close this window to stop it.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages the first time...
  call npm.cmd install
)
if not exist .env (
  echo No .env file found. Copy .env.example to .env and fill it in first.
  pause
  exit /b
)
echo.
echo Raptors Claim It is starting. Open http://localhost:3000
echo Leave this window open while you use it. Close it to stop.
echo.
start "" http://localhost:3000
call npm.cmd run local
pause
