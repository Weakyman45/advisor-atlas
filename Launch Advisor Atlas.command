#!/bin/zsh

set -u

project_dir="${0:A:h}"
tracker_url="http://127.0.0.1:4173"

cd "$project_dir" || exit 1

echo "Starting Advisor Atlas at $tracker_url"
echo "Your updates stay in this browser on this Mac."
echo "Keep this window open while using the tracker; press Control-C to stop it."

python3 -m http.server 4173 --bind 127.0.0.1 --directory site &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM
sleep 1
open "$tracker_url"
wait "$server_pid"
