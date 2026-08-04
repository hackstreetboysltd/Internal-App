# start.sh
#!/bin/bash

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}🚀 Starting Local Server (Static Mode)...\${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "${YELLOW}Since the app is now fully static and serverless, we are simply serving the HTML files.${NC}\n"

# Generate env-config.js from .env if it exists
if [ -f .env ]; then
    echo "Generating env-config.js from .env..."
    echo "window.ENV = {" > env-config.js
    while IFS= read -r line || [ -n "$line" ]; do
        # Strip carriage return
        line=$(echo "$line" | tr -d '\r')
        # Skip comments and empty lines
        if [[ ! "$line" =~ ^# ]] && [[ ! -z "$line" ]]; then
            key=$(echo "$line" | cut -d'=' -f1 | xargs)
            val=$(echo "$line" | cut -d'=' -f2- | xargs)
            # Remove enclosing quotes from value if present
            val="${val%\"}"
            val="${val#\"}"
            val="${val%\'}"
            val="${val#\'}"
            echo "  $key: \"$val\"," >> env-config.js
        fi
    done < .env
    echo "};" >> env-config.js
    echo "env-config.js generated successfully."
else
    echo "Warning: .env file not found. env-config.js was not generated."
fi

# Try using npx (Node) first, fallback to Python
if command -v npx &> /dev/null
then
    echo "Using Node (http-server)..."
    echo "Serving on http://localhost:3000 and opening browser..."
    # -c-1 disables caching, -a localhost forces localhost binding, -o opens browser
    npx http-server -c-1 -p 3000 -a localhost -o
elif command -v python3 &> /dev/null
then
    echo "npx not found. Using Python 3 server..."
    echo "Serving on http://localhost:3000 and opening browser..."
    xdg-open http://localhost:3000 2>/dev/null &
    python3 -m http.server 3000 --bind localhost
else
    echo -e "\033[1;31mError: You need Node.js (npx) or Python 3 installed to run a local server.\033[0m"
    exit 1
fi
