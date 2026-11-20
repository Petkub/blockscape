#!/bin/bash
# Double-click to start the Blockscape server. Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed to run the server. Install it from https://nodejs.org and try again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
node server.js "$@"
