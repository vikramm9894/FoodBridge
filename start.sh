#!/bin/bash
cd "$(dirname "$0")"
echo "Starting FoodBridge..."
(sleep 1; (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || (command -v open >/dev/null && open http://localhost:3000)) >/dev/null 2>&1 &
node server.js
