@echo off
echo =======================================================
echo EMS Unified Startup Script
echo =======================================================

echo.
echo [1/3] Killing existing Node.js processes to clear ports...
taskkill /F /IM node.exe >nul 2>&1
echo Processes killed.

echo.
echo [2/3] Starting NestJS Backend (Port 5000)...
start "EMS Backend Server" cmd /k "cd /d %~dp0server && npm run start:dev"

echo.
echo [3/3] Clearing Next.js cache and starting Frontend (Port 3000)...
start "EMS Frontend Client" cmd /k "cd /d %~dp0client-next && if exist .next rmdir /s /q .next && npm run dev"

echo.
echo =======================================================
echo Both servers launched in separate windows.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:3000
echo =======================================================
pause
