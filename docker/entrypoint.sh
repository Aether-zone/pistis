#!/bin/sh
#
# Runs the api and the web app in one container.
#
# Two containers is the better shape; this exists for a single-container
# deployment where that is not on offer. The rules it has to get right are the
# ones a process manager would normally handle:
#
#   - if either process exits, the container exits, so an orchestrator sees an
#     unhealthy container rather than one serving half the application;
#   - SIGTERM reaches both children, so a deployment stops them cleanly.
#
# Plain POSIX sh, and a poll rather than `wait -n`: that builtin needs bash 4.3+
# and Debian's /bin/sh is dash, so the convenient version would fail in exactly
# the place it could not be tested.
set -eu

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
APP_ROOT="${APP_ROOT:-/app}"

# The web app reaches the api over this container's own loopback.
export PISTIS_API_URL="${PISTIS_API_URL:-http://127.0.0.1:${API_PORT}}"
export OAUTH_ISSUER="${OAUTH_ISSUER:-http://127.0.0.1:${API_PORT}}"

api_pid=''
web_pid=''
stopping=''

stop_children() {
    stopping='yes'
    [ -n "$api_pid" ] && kill -TERM "$api_pid" 2>/dev/null || true
    [ -n "$web_pid" ] && kill -TERM "$web_pid" 2>/dev/null || true
}

trap 'stop_children' TERM INT

cd "$APP_ROOT/api"
PORT="$API_PORT" node main.js &
api_pid=$!

cd "$APP_ROOT/web"
PORT="$WEB_PORT" HOSTNAME=0.0.0.0 node web/server.js &
web_pid=$!

# Poll both children. `kill -0` asks whether the process is still there without
# signalling it.
while true; do
    if ! kill -0 "$api_pid" 2>/dev/null; then
        wait "$api_pid" 2>/dev/null && status=0 || status=$?
        [ -n "$stopping" ] || echo "pistis: the api exited ($status); stopping." >&2
        stop_children
        wait "$web_pid" 2>/dev/null || true
        exit "$status"
    fi

    if ! kill -0 "$web_pid" 2>/dev/null; then
        wait "$web_pid" 2>/dev/null && status=0 || status=$?
        [ -n "$stopping" ] || echo "pistis: the web app exited ($status); stopping." >&2
        stop_children
        wait "$api_pid" 2>/dev/null || true
        exit "$status"
    fi

    sleep 1
done
