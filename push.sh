#!/bin/bash
set -e

# Usage: ./push.sh "your commit message"

if [ -z "$1" ]; then
  echo "Error: Please provide a commit message."
  echo "Usage: ./push.sh \"your commit message\""
  exit 1
fi

LIVE_URL="${APP_URL:-https://hackstreetboysltd-internal-app.vercel.app/Internal-App/}"

echo ">> Adding files..."
git add .

if git diff --cached --quiet; then
  echo ">> No file changes to commit."
else
  echo ">> Committing..."
  git commit -m "$1"
fi

echo ">> Pushing to origin main..."
git push origin main

echo ">> Vercel will auto-deploy from main (usually ~1–2 min)."
echo ">> Done. Live: ${LIVE_URL}"
