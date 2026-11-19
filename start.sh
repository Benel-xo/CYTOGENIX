#!/usr/bin/env bash
set -Eeuo pipefail

echo "Starting CYTOGENIX FastAPI backend..."

cd /app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Starting CYTOGENIX Next.js frontend..."

cd /app/frontend
npm start -- --hostname 0.0.0.0 --port "${PORT:-10000}" &
FRONTEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait -n "$BACKEND_PID" "$FRONTEND_PID"
