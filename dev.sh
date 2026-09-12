#!/bin/sh
#
# Serves the api and the web app together, for local development.
#
# The two halves are separate pnpm projects on separate ports, and wiring them
# up by hand is the most common way a working tree looks broken: both default
# to 3000, so one always has to move, and the web app has to be told where the
# api actually landed. This script owns both numbers, so they cannot disagree.
#
# Ctrl-C stops both. If either exits on its own the other is stopped too, so
# you are never left with half an application serving and no sign of it.
#
#   ./dev.sh                      api on 3001, web on 3002
#   API_PORT=4001 ./dev.sh        move the api; the web app follows
#
# Everything else the api reads — the signing key, the OAuth lifetimes, the dev
# seed — stays in api/.env. This script deliberately sets none of it.
set -eu

cd "$(dirname "$0")"

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3002}"

# The web app calls the api from the server, so it needs the port chosen above.
# A real environment variable beats web/.env.local, which is what makes the two
# agree without anyone editing a file; an exported value still wins over both.
export PISTIS_API_URL="${PISTIS_API_URL:-http://localhost:${API_PORT}}"

# `nc` and `lsof` are both common but neither is guaranteed. With neither, skip
# the check rather than refuse to start: it is a courtesy, not a gate.
port_in_use() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    elif command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$1" >/dev/null 2>&1
    else
        return 1
    fi
}

for port in "$API_PORT" "$WEB_PORT"; do
    if port_in_use "$port"; then
        echo "pistis: port $port is already in use." >&2
        echo "  Stop whatever holds it, or set API_PORT/WEB_PORT." >&2
        exit 1
    fi
done

# Job control, so each child leads its own process group. `pnpm` spawns the
# real server as a grandchild, and signalling only the wrapper leaves that
# holding the port.
set -m

api_pid=''
web_pid=''
stopping=''

stop_pid() {
    [ -n "$1" ] || return 0
    kill -TERM "-$1" 2>/dev/null || kill -TERM "$1" 2>/dev/null || true
}

stop_children() {
    stopping='yes'
    stop_pid "$api_pid"
    stop_pid "$web_pid"
}

trap 'stop_children' TERM INT

echo "pistis: api    http://localhost:${API_PORT}"
echo "pistis: web    http://localhost:${WEB_PORT}"
echo

PORT="$API_PORT" pnpm start:server &
api_pid=$!

PORT="$WEB_PORT" pnpm start:web &
web_pid=$!

# Poll both children. `kill -0` asks whether a process is still there without
# signalling it; `wait -n` would be neater but needs bash 4.3+, and this has to
# run under whatever /bin/sh is.
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
