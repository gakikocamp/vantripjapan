#!/bin/bash
# 🚐 VanTripJapan Pinterest Tool — Launcher
# iCloudフォルダからはサーバー起動できないため、
# このスクリプトでファイルを/tmpにコピーして起動します。

PROJ_DIR="/Users/doko/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondGaki/VanTripJapan/pinterest-tool"
WORK_DIR="/tmp/pinterest-tool"

echo "  📦 Syncing files..."
mkdir -p "$WORK_DIR"

# Copy server files (not heavy media files)
cp "$PROJ_DIR/server.js" "$WORK_DIR/"
cp -r "$PROJ_DIR/templates" "$WORK_DIR/"

# Keep data in project dir (symlinks)
mkdir -p "$WORK_DIR/data"
[ ! -L "$WORK_DIR/input" ] && ln -sf "$PROJ_DIR/input" "$WORK_DIR/input"
[ ! -L "$WORK_DIR/output" ] && ln -sf "$PROJ_DIR/output" "$WORK_DIR/output"

# Load env from scripts
export GROQ_API_KEY=$(grep GROQ_API_KEY "$PROJ_DIR/../scripts/.env" 2>/dev/null | cut -d= -f2)
export AUTH_PASSWORD=$(grep AUTH_PASSWORD "$PROJ_DIR/../scripts/.env" 2>/dev/null | cut -d= -f2)
[ -z "$AUTH_PASSWORD" ] && export AUTH_PASSWORD="vantrip2026"

echo "  🚀 Starting Pinterest Studio..."
cd "$WORK_DIR"
node server.js
