#!/bin/bash
# 🚐 VanTripJapan Pinterest Local Cron Tool
# Runs auto-generator and auto-poster locally on Mac Studio 24/7.

# Path to the project directory
PROJ_DIR="/Users/gakipro/Library/Mobile Documents/com~apple~CloudDocs/開発用/SecondGaki/VanTripJapan/pinterest-tool"

cd "$PROJ_DIR"

# Load environment variables from local .env
if [ -f .env ]; then
  # Read .env line by line to handle potential spaces/quotes gracefully
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ ! "$line" =~ ^# ]] && [[ "$line" =~ = ]]; then
      key=$(echo "$line" | cut -d= -f1 | tr -d ' ')
      val=$(echo "$line" | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      # Remove wrapping quotes if present
      val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
      export "$key=$val"
    fi
  done < .env
fi

echo "=== [$(date)] Starting Pinterest Daily Job ==="

# 1. Run Auto-Generator to find new articles and generate pins
echo "🤖 Running Auto-Generator..."
node auto-generator.js

# 2. Run Auto-Poster to publish approved pins to Pinterest
echo "🚀 Running Auto-Poster..."
node auto-post.js

# 3. Commit and push queue updates to GitHub to sync repositories
echo "📦 Syncing post queue with GitHub..."
git add data/post-queue.json output/
if ! git diff --cached --quiet; then
  git commit -m "🤖 Local Cron: Auto-posted and updated queue [skip ci]"
  git push origin main
  echo "✅ GitHub sync complete."
else
  echo "No changes to sync."
fi

echo "=== Job Completed ==="
