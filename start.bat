@echo off
title EMS — Expense Management System
echo.
echo ╔══════════════════════════════════════════════╗
echo ║   Expense Management System — Starting...   ║
echo ╚══════════════════════════════════════════════╝
echo.

:: Start backend (NestJS uses start:dev for watch mode)
echo [1/2] Starting backend server...
start "EMS Backend" cmd /k "cd /d %~dp0server && npm run start:dev"

:: Start frontend (Next.js)
echo [2/2] Starting frontend dev server...
start "EMS Frontend" cmd /k "cd /d %~dp0client-next && npm run dev"

echo.
echo Both servers are starting!
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:3000
echo   Health:   http://localhost:5000/api/health
echo.
