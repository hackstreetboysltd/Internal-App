#!/bin/bash

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT=3000
APP_URL="http://localhost:${PORT}/Internal-App/login/"
REQUIRED_PORTS=("$PORT")

pids_on_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -ti tcp:"$port" 2>/dev/null
        return
    fi
    if command -v fuser &> /dev/null; then
        fuser -n tcp "$port" 2>/dev/null | tr -cs '0-9' '\n' | grep -E '^[0-9]+$' || true
        return
    fi
    echo -e "${YELLOW}Warning: lsof/fuser not found — cannot check port $port.${NC}" >&2
}

ensure_port_free() {
    local port=$1
    local pids pid_list

    pids=$(pids_on_port "$port")
    if [ -z "$pids" ]; then
        echo "Port $port is free."
        return 0
    fi

    pid_list=$(echo "$pids" | xargs)
    echo -e "${YELLOW}Port $port in use (PID(s): $pid_list). Stopping...${NC}"

    kill $pid_list 2>/dev/null || true
    sleep 1

    pids=$(pids_on_port "$port")
    if [ -n "$pids" ]; then
        pid_list=$(echo "$pids" | xargs)
        kill -9 $pid_list 2>/dev/null || true
        sleep 0.5
    fi

    pids=$(pids_on_port "$port")
    if [ -n "$pids" ]; then
        echo -e "${RED}Error: could not free port $port (still in use).${NC}"
        exit 1
    fi

    echo -e "${GREEN}Port $port is now free.${NC}"
}

ensure_ports_free() {
    local port
    for port in "${REQUIRED_PORTS[@]}"; do
        ensure_port_free "$port"
    done
}

echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}Starting Next.js dev server...${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "${YELLOW}Portal:${NC} ${APP_URL}"
echo ""

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: Node.js and npm are required. Install Node 22+ and retry.${NC}"
    exit 1
fi

strip_quotes() {
    local val="$1"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    printf '%s' "$val"
}

# Next reads .env.local; seed it from .env on first run.
if [ -f .env ] && [ ! -f .env.local ]; then
    echo "Generating .env.local from .env..."
    {
        echo "# Local Next.js env — gitignored. Generated from .env by start.sh"
        while IFS= read -r line || [ -n "$line" ]; do
            line=$(echo "$line" | tr -d '\r')
            [[ "$line" =~ ^# ]] && continue
            [[ -z "$line" ]] && continue
            key=$(echo "$line" | cut -d'=' -f1 | xargs)
            val=$(strip_quotes "$(echo "$line" | cut -d'=' -f2- | xargs)")
            case "$key" in
                NEXT_PUBLIC_*)
                    echo "${key}=${val}"
                    ;;
                FIREBASE_*|EMAILJS_*|PORTAL_URL)
                    echo "NEXT_PUBLIC_${key}=${val}"
                    ;;
            esac
        done < .env
    } > .env.local
    echo ".env.local created."
elif [ ! -f .env.local ] && [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: no .env or .env.local — copy .env.example to .env.local and fill NEXT_PUBLIC_* keys.${NC}"
fi

if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
fi

if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
    echo "Starting Postgres + Redis..."
    docker compose up -d
    echo "Waiting for Postgres..."
    for i in $(seq 1 30); do
        if docker compose exec -T postgres pg_isready -U portal -d portal >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    echo "Running database migrations..."
    DATABASE_URL="${DATABASE_URL:-postgresql://portal:portal@localhost:5432/portal}" npm run migrate
else
    echo -e "${YELLOW}Docker not found — start Postgres/Redis yourself, then run npm run migrate.${NC}"
fi

ensure_ports_free

server_ready() {
    curl -sf -o /dev/null --max-time 1 "$APP_URL" 2>/dev/null \
        || curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/Internal-App/" 2>/dev/null \
        || { echo >/dev/tcp/127.0.0.1/"$PORT"; } 2>/dev/null
}

open_browser_now() {
    local url="$APP_URL"
    echo -e "${GREEN}Opening browser → ${url}${NC}"
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url" >/dev/null 2>&1 &
    elif command -v gio &> /dev/null; then
        gio open "$url" >/dev/null 2>&1 &
    elif command -v sensible-browser &> /dev/null; then
        sensible-browser "$url" >/dev/null 2>&1 &
    elif command -v open &> /dev/null; then
        open "$url" >/dev/null 2>&1 &
    elif command -v python3 &> /dev/null; then
        python3 -m webbrowser "$url" >/dev/null 2>&1 &
    else
        echo -e "${YELLOW}No browser launcher found. Open manually: ${url}${NC}"
        return 1
    fi
}

launch_browser_when_ready() {
    local attempt=0
    local max_attempts=120

    echo "Waiting for dev server..."
    while [ "$attempt" -lt "$max_attempts" ]; do
        if server_ready; then
            open_browser_now
            return 0
        fi
        sleep 0.5
        attempt=$((attempt + 1))
    done

    echo -e "${YELLOW}Dev server slow to respond — opening browser anyway.${NC}"
    open_browser_now
}

trap 'kill $(jobs -pr) 2>/dev/null || true' EXIT INT TERM

launch_browser_when_ready &
npm run dev -- -p "$PORT" -H localhost
