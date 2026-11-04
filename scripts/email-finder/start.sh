#!/usr/bin/env bash
# Start the Kazi contact finder on this computer (macOS or Linux). Double-click it, or run ./start.sh. The first time it installs what it needs.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (version 20 or newer), then run this again."
  read -r -p "Press Enter to close." _
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First time: installing (this takes a minute)..."
  npm install --no-audit --no-fund || { read -r -p "The install failed. Press Enter to close." _; exit 1; }
fi
npm start
read -r -p "The finder stopped. Press Enter to close." _
