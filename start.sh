#!/bin/bash
# EMS — Start script for macOS / Linux
# Usage: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "╔══════════════════════════════════════════════╗"
echo "║   Expense Management System — Starting...   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check for port conflicts
check_port() {
  if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Warning: port $1 is already in use. Kill the process or change the port."
    return 1
  fi
  return 0
}

check_port 5000
check_port 3000

echo "[1/2] Starting NestJS backend (port 5000)..."
cd "$SCRIPT_DIR/server" && npm run start:dev &
BACKEND_PID=$!

echo "[2/2] Starting Next.js frontend (port 3000)..."
cd "$SCRIPT_DIR/client-next" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "Both servers starting in background."
echo "  Backend:  http://localhost:5000"
echo "  Frontend: http://localhost:3000"
echo "  Health:   http://localhost:5000/health"
echo ""
echo "PIDs — Backend: $BACKEND_PID  Frontend: $FRONTEND_PID"
echo "To stop: kill $BACKEND_PID $FRONTEND_PID  (or Ctrl+C)"

wait
