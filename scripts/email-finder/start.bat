@echo off
rem Start the Kazi contact finder on this computer (Windows). Double-click it. The first time it installs what it needs.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org ^(version 20 or newer^), then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First time: installing ^(this takes a minute^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo The install failed.
    pause
    exit /b 1
  )
)
call npm start
echo The finder stopped.
pause
