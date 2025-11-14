#!/bin/bash
# Script to run tests with server automatically started/restarted

set -e

# Kill any existing server processes
echo "Stopping any existing server processes..."
pkill -f "tsx src/app.ts" || true
sleep 1

# Start the server in the background with NODE_ENV=test to bypass rate limiting
echo "Starting server on port 3000..."
NODE_ENV=test PORT=3000 SITE_DEPLOYMENT_PATH=http://localhost:3000 pnpm exec tsx src/app.ts > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    pkill -f "tsx src/app.ts" || true
}

trap cleanup EXIT

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Server failed to start after 30 seconds"
        cat /tmp/server.log
        exit 1
    fi
    sleep 1
done

# Run tests
echo "Running tests..."
SITE_DEPLOYMENT_PATH=http://localhost:3000 pnpm test

