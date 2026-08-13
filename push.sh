#!/bin/bash
set -e

# Usage: ./push.sh "your commit message"

if [ -z "$1" ]; then
  echo "Error: Please provide a commit message."
  echo "Usage: ./push.sh \"your commit message\""
  exit 1
fi

github_token() {
  printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null \
    | awk -F= '/^password=/{print substr($0, index($0,"=")+1); exit}'
}

trigger_pages_deploy() {
  local token
  token="$(github_token)"
  if [ -z "$token" ]; then
    echo ">> Could not read GitHub credentials; live deploy will still run if main was pushed."
    return 0
  fi

  local status
  status="$(curl -sS -o /tmp/internal-app-dispatch.json -w '%{http_code}' -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    https://api.github.com/repos/kakaiking/Internal-App/actions/workflows/deploy.yml/dispatches \
    -d '{"ref":"main"}')"

  if [ "$status" = "204" ]; then
    echo ">> GitHub Pages deploy started."
  else
    echo ">> Push succeeded. If live does not update, re-run the deploy workflow in GitHub Actions."
  fi
}

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

echo ">> Updating live site from main..."
trigger_pages_deploy

echo ">> Done. Live: https://kakaiking.github.io/Internal-App/"
