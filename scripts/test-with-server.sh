#!/bin/bash
# Script to run tests with server automatically started/restarted

set -e

# Source .env file if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Find the first free port starting from TEST_PORT (required).
# This allows multiple agents to share a base port but avoid collisions by
# walking upwards until a free port is found.
find_available_port() {
    local base_port=$1
    local max_port=${2:-65535}

    for ((port=base_port; port<=max_port; port++)); do
        # /dev/tcp is a bash built-in: connection succeeds if something is listening
        if ! (echo > /dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then
            echo "$port"
            return 0
        fi
    done

    return 1
}

if [ -z "$TEST_PORT" ]; then
    echo "Error: TEST_PORT is not set. Please set it in your environment or .env file."
    exit 1
fi

TEST_PORT="$(find_available_port "$TEST_PORT" "${TEST_PORT_MAX:-65535}")" || {
    echo "Error: could not find an available port starting from TEST_PORT=${TEST_PORT} up to ${TEST_PORT_MAX:-65535}"
    exit 1
}

echo "Using test port ${TEST_PORT}"

# Start the server in the background with NODE_ENV=test to bypass rate limiting
echo "Starting server on port ${TEST_PORT}..."
NODE_ENV=test PORT=${TEST_PORT} SITE_DEPLOYMENT_PATH=http://localhost:${TEST_PORT} pnpm exec tsx src/app.ts > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
}

trap cleanup EXIT

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:${TEST_PORT} > /dev/null 2>&1; then
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
# If arguments are provided, pass them to playwright test
if [ $# -gt 0 ]; then
    HEADLESS_BROWSER=1 SITE_DEPLOYMENT_PATH=http://localhost:${TEST_PORT} playwright test "$@"
else
    HEADLESS_BROWSER=1 SITE_DEPLOYMENT_PATH=http://localhost:${TEST_PORT} playwright test
fi

