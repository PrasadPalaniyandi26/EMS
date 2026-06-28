#!/bin/bash
# EMS — Startup script for macOS / Linux
# Usage: bash start_all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================="
echo " EMS Startup Script (macOS / Linux)"
echo "======================================================="
echo ""

# --- Preflight checks ---

# Check Node is installed
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed. Please install it from https://nodejs.org"
  exit 1
fi

# Check .env exists
if [ ! -f "$SCRIPT_DIR/server/.env" ]; then
  echo "ERROR: server/.env not found. Please create it before starting."
  exit 1
fi

# Install server dependencies if missing
if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
  echo "Installing server dependencies..."
  cd "$SCRIPT_DIR/server" && npm install
fi

# Install client dependencies if missing
if [ ! -d "$SCRIPT_DIR/client-next/node_modules" ]; then
  echo "Installing client dependencies..."
  cd "$SCRIPT_DIR/client-next" && npm install
fi

echo ""
echo "[1/3] Stopping any existing processes on ports 5000 and 3000..."
for PORT in 5000 3000; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "  Killing PID $PID on port $PORT"
    kill -9 $PID 2>/dev/null
  fi
done
echo "Done."

# Trap Ctrl+C to kill both servers cleanly
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "[2/3] Starting NestJS backend (port 5000)..."
cd "$SCRIPT_DIR/server" && npm run start:dev &
BACKEND_PID=$!

# Wait for backend to be ready before starting frontend
echo "  Waiting for backend to be ready..."
for i in $(seq 1 60); do
  if curl -s http://localhost:5000/health &>/dev/null; then
    echo "  Backend is ready."
    break
  fi
  sleep 1
done

echo ""
echo "[3/3] Starting frontend (port 3000)..."
cd "$SCRIPT_DIR/client-next" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "======================================================="
echo " EMS is running!"
echo " Frontend: http://localhost:3000"
echo " Backend:  http://localhost:5000"
echo " API Docs: http://localhost:5000/api/docs"
echo "======================================================="
echo "Press Ctrl+C to stop both servers."
echo ""

wait
