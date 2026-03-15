#!/bin/bash
# EMS — Full restart script for macOS / Linux (clears cache, kills old processes)
# Usage: bash start_all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================="
echo " EMS Unified Startup Script (macOS / Linux)"
echo "======================================================="
echo ""

echo "[1/3] Stopping any existing EMS processes on ports 5000 and 3000..."
# Kill only processes holding our ports, not all node processes
for PORT in 5000 3000; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "  Killing PID $PID on port $PORT"
    kill -9 $PID 2>/dev/null
  fi
done
echo "Done."

echo ""
echo "[2/3] Starting NestJS backend (port 5000)..."
cd "$SCRIPT_DIR/server" && npm run start:dev &
BACKEND_PID=$!

echo ""
echo "[3/3] Clearing Next.js cache and starting frontend (port 3000)..."
rm -rf "$SCRIPT_DIR/client-next/.next"
cd "$SCRIPT_DIR/client-next" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "======================================================="
echo " Both servers launched."
echo " Backend:  http://localhost:5000"
echo " Frontend: http://localhost:3000"
echo "======================================================="
echo "Press Ctrl+C to stop both servers."

wait
