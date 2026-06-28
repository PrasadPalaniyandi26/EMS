@echo off
title EMS — Expense Management System
echo.
echo =======================================================
echo  EMS Unified Startup Script
echo =======================================================
echo.

:: --- Preflight checks ---

:: Check Node is installed
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Please install it from https://nodejs.org
  pause
  exit /b 1
)

:: Check server .env exists
if not exist "%~dp0server\.env" (
  echo ERROR: server\.env not found. Please create it before starting.
  pause
  exit /b 1
)

:: Install server dependencies if missing
if not exist "%~dp0server\node_modules" (
  echo Installing server dependencies...
  cd /d "%~dp0server" && npm install
)

:: Install client dependencies if missing
if not exist "%~dp0client-next\node_modules" (
  echo Installing client dependencies...
  cd /d "%~dp0client-next" && npm install
)

echo.
echo [1/3] Freeing ports 5000 and 3000...
call npx kill-port 5000 3000 >nul 2>&1
echo Done.

echo.
echo [2/3] Starting NestJS Backend (Port 5000)...
start "EMS Backend Server" cmd /k "cd /d "%~dp0server" && npm run start:dev"

echo.
echo [3/3] Clearing Next.js cache and starting Frontend (Port 3000)...
start "EMS Frontend Client" cmd /k "cd /d "%~dp0client-next" && if exist .next rmdir /s /q .next && npm run dev"

echo.
echo =======================================================
echo  Both servers launched in separate windows.
echo  Backend:  http://localhost:5000
echo  Frontend: http://localhost:3000
echo  Health:   http://localhost:5000/health
echo  API Docs: http://localhost:5000/api/docs
echo =======================================================
pause
