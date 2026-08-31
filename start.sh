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

# Collect unique PIDs listening on a TCP port (LISTEN only).
pids_on_port() {
    local port=$1
    local found=""

    if command -v ss &> /dev/null; then
        # ss is reliable on Fedora/Linux; parse users:(("cmd",pid=1234,fd=N))
        found=$(ss -H -ltnp "sport = :${port}" 2>/dev/null \
            | grep -oE 'pid=[0-9]+' \
            | cut -d= -f2 \
            || true)
    fi

    if [ -z "$found" ] && command -v lsof &> /dev/null; then
        found=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
        if [ -z "$found" ]; then
            found=$(lsof -nP -i:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
        fi
    fi

    if [ -z "$found" ] && ! command -v ss &> /dev/null \
        && ! command -v lsof &> /dev/null; then
        echo -e "${YELLOW}Warning: ss/lsof not found — cannot check port $port.${NC}" >&2
        return 0
    fi

    printf '%s\n' "$found" | awk 'NF && !seen[$0]++'
}

port_is_bound() {
    local port=$1
    if command -v ss &> /dev/null; then
        ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .
        return $?
    fi
    # Bash /dev/tcp: connect succeeds only if something is accepting.
    (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1 \
        || (echo >/dev/tcp/::1/"$port") >/dev/null 2>&1
}

ensure_port_free() {
    local port=$1
    local pids pid_list attempt

    pids=$(pids_on_port "$port")
    if [ -z "$pids" ] && ! port_is_bound "$port"; then
        echo "Port $port is free."
        return 0
    fi

    if [ -z "$pids" ] && port_is_bound "$port"; then
        echo -e "${YELLOW}Port $port is bound but no PID found yet — retrying detection...${NC}"
        sleep 0.3
        pids=$(pids_on_port "$port")
    fi

    if [ -z "$pids" ]; then
        if port_is_bound "$port"; then
            echo -e "${RED}Error: port $port is in use but the owning process could not be identified (try: sudo ss -ltnp 'sport = :${port}').${NC}"
            exit 1
        fi
        echo "Port $port is free."
        return 0
    fi

    pid_list=$(echo "$pids" | xargs)
    echo -e "${YELLOW}Port $port in use (PID(s): $pid_list). Stopping...${NC}"

    # TERM first, then KILL; also signal process groups when possible.
    for pid in $pid_list; do
        kill "$pid" 2>/dev/null || true
        kill -- "-$pid" 2>/dev/null || true
    done

    for attempt in 1 2 3 4 5; do
        sleep 0.4
        if ! port_is_bound "$port"; then
            break
        fi
        pids=$(pids_on_port "$port")
    done

    pids=$(pids_on_port "$port")
    if port_is_bound "$port"; then
        pid_list=$(echo "$pids" | xargs)
        echo -e "${YELLOW}Force-killing remaining PID(s) on port $port: ${pid_list:-unknown}${NC}"
        for pid in $pid_list; do
            kill -9 "$pid" 2>/dev/null || true
            kill -9 -- "-$pid" 2>/dev/null || true
        done
        # fuser -k as a last resort when PIDs were hidden from ss/lsof
        if command -v fuser &> /dev/null; then
            fuser -k -9 "${port}/tcp" >/dev/null 2>&1 || true
        fi
        sleep 0.5
    fi

    pids=$(pids_on_port "$port")
    if port_is_bound "$port"; then
        pid_list=$(echo "$pids" | xargs)
        echo -e "${RED}Error: could not free port $port (still listening${pid_list:+ on PID(s): $pid_list}).${NC}"
        echo "Try: ss -ltnp 'sport = :${port}'"
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

env_has_key() {
    local file="$1" key="$2"
    [ -f "$file" ] && grep -qE "^${key}=" "$file"
}

env_get() {
    local file="$1" key="$2" line
    [ -f "$file" ] || return 1
    line=$(grep -E "^${key}=" "$file" | tail -n1) || return 1
    [ -n "$line" ] || return 1
    strip_quotes "${line#*=}"
}

# Append key=value to .env.local only when the key is missing.
env_local_set_if_missing() {
    local key="$1" val="$2"
    [ -n "$key" ] || return 0
    [ -n "$val" ] || return 0
    if env_has_key .env.local "$key"; then
        return 0
    fi
    printf '%s=%s\n' "$key" "$val" >> .env.local
    echo "Added ${key} to .env.local"
}

# Vercel Production/Preview secrets are type=sensitive and cannot be pulled
# locally (CLI writes [SENSITIVE] / omits them). Local dev uses Docker instead.
vercel_linked() {
    command -v vercel >/dev/null 2>&1 && [ -f .vercel/project.json ]
}

seed_env_local_from_legacy_env() {
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
                GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_REDIRECT_URI|GOOGLE_HD|DATABASE_URL|REDIS_URL|SESSION_SECRET)
                    echo "${key}=${val}"
                    ;;
            esac
        done < .env
    } > .env.local
    echo ".env.local created."
}

# Fill gaps so Next.js gets Redis/Postgres/session vars (public keys stay untouched).
ensure_env_local() {
    local key val added=0

    if [ ! -f .env.local ]; then
        if [ -f .env ]; then
            seed_env_local_from_legacy_env
        elif [ -f .env.example ]; then
            echo "Generating .env.local from .env.example..."
            grep -v $'\r' .env.example > .env.local
            echo ".env.local created."
        else
            echo -e "${YELLOW}Warning: no .env or .env.local — copy .env.example to .env.local and fill required keys.${NC}"
            return 0
        fi
    fi

    if [ -f .env.local ]; then
        grep -viE '^[A-Za-z0-9_]+=(\[SENSITIVE\]|"\[SENSITIVE\]")$' .env.local > .env.local.tmp \
            && mv .env.local.tmp .env.local
    fi

    if [ -f .env.example ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            line=$(echo "$line" | tr -d '\r')
            [[ "$line" =~ ^# ]] && continue
            [[ -z "$line" ]] && continue
            key=$(echo "$line" | cut -d'=' -f1 | xargs)
            val=$(strip_quotes "$(echo "$line" | cut -d'=' -f2- | xargs)")
            [ -n "$key" ] && [ -n "$val" ] || continue
            if ! env_has_key .env.local "$key"; then
                printf '%s=%s\n' "$key" "$val" >> .env.local
                echo "Added ${key} to .env.local"
                added=1
            fi
        done < .env.example
    fi

    if [ -f .env ]; then
        for key in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI GOOGLE_HD \
                   DATABASE_URL REDIS_URL SESSION_SECRET EMAILJS_SERVICE_ID EMAILJS_TEMPLATE_ID \
                   EMAILJS_PUBLIC_KEY; do
            val=$(env_get .env "$key" || true)
            env_local_set_if_missing "$key" "$val"
        done
    fi

    val=$(env_get .env.local SESSION_SECRET || true)
    if [ -z "$val" ] || [ "$val" = "change-me-to-a-long-random-string" ]; then
        val=$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')
        if env_has_key .env.local SESSION_SECRET; then
            awk -v secret="$val" '
                BEGIN { done=0 }
                /^SESSION_SECRET=/ && !done { print "SESSION_SECRET=" secret; done=1; next }
                { print }
            ' .env.local > .env.local.tmp && mv .env.local.tmp .env.local
            echo "Replaced placeholder SESSION_SECRET in .env.local"
        else
            printf 'SESSION_SECRET=%s\n' "$val" >> .env.local
            echo "Added SESSION_SECRET to .env.local"
        fi
    fi

    if ! env_has_key .env.local GOOGLE_CLIENT_SECRET && ! env_has_key .env GOOGLE_CLIENT_SECRET; then
        echo -e "${YELLOW}Warning: GOOGLE_CLIENT_SECRET is not set — add it to .env.local from Google Cloud Console.${NC}"
    fi

    if vercel_linked; then
        if needs_local_postgres "$(env_get .env.local DATABASE_URL 2>/dev/null || true)" \
            || needs_local_redis "$(env_get .env.local REDIS_URL 2>/dev/null || true)"; then
            echo -e "${YELLOW}Vercel Production secrets are Sensitive — the CLI cannot read REDIS_URL / DATABASE_URL.${NC}"
            echo "Local dev uses Docker Postgres + Redis. To use Neon/Upstash locally, paste those URLs into .env.local from the Neon and Upstash dashboards."
        fi
    fi
}

needs_local_postgres() {
    local url="$1"
    case "$url" in
        *neon.tech*|*supabase.co*) return 1 ;;
        *localhost*|*127.0.0.1*) return 0 ;;
        "") return 0 ;;
        *) return 1 ;;
    esac
}

needs_local_redis() {
    local url="$1"
    case "$url" in
        redis://localhost*|redis://127.0.0.1*) return 0 ;;
        "") return 0 ;;
        *) return 1 ;;
    esac
}

ensure_env_local

# Prefer IPv4 for Neon/Upstash before migrate and dev server (see package.json dev script).
DNS_NODE_OPTS="--dns-result-order=ipv4first --no-network-family-autoselection"
case " ${NODE_OPTIONS:-} " in
    *" --dns-result-order=ipv4first "*) ;;
    *)
        export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }${DNS_NODE_OPTS}"
        ;;
esac
case " ${NODE_OPTIONS:-} " in
    *" --no-network-family-autoselection "*) ;;
    *)
        export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--no-network-family-autoselection"
        ;;
esac

if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
fi

DB_URL="${DATABASE_URL:-$(env_get .env.local DATABASE_URL 2>/dev/null || true)}"
REDIS_URL_VAL="${REDIS_URL:-$(env_get .env.local REDIS_URL 2>/dev/null || true)}"

if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
    DOCKER_SERVICES=""
    if needs_local_postgres "$DB_URL"; then
        DOCKER_SERVICES="postgres"
    fi
    if needs_local_redis "$REDIS_URL_VAL"; then
        DOCKER_SERVICES="${DOCKER_SERVICES:+$DOCKER_SERVICES }redis"
    fi

    if [ -n "$DOCKER_SERVICES" ]; then
        echo "Starting local Docker: ${DOCKER_SERVICES}..."
        docker compose up -d $DOCKER_SERVICES
        if needs_local_postgres "$DB_URL"; then
            echo "Waiting for Postgres..."
            for i in $(seq 1 30); do
                if docker compose exec -T postgres pg_isready -U portal -d portal >/dev/null 2>&1; then
                    break
                fi
                sleep 1
            done
        fi
    else
        echo "Using remote Postgres/Redis from .env.local — skipping Docker."
    fi

    echo "Running database migrations..."
    DATABASE_URL="${DB_URL:-postgresql://portal:portal@localhost:5433/portal}" npm run migrate
    echo "Verifying database + Redis connectivity..."
    npm run verify:local || echo -e "${YELLOW}Warning: verify:local failed — check DATABASE_URL / REDIS_URL and network.${NC}"
else
    echo -e "${YELLOW}Docker not found — start Postgres/Redis yourself, then run npm run migrate.${NC}"
fi

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

# Free the app port immediately before bind (after Docker/migrate work).
ensure_ports_free

launch_browser_when_ready &
npm run dev -- -p "$PORT" -H localhost
