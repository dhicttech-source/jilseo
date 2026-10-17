#!/usr/bin/env bash
# 개발 앱을 완전히 종료하고 다시 띄운다. 로그: $1 (기본 /tmp/jilseo-dev.log)
set -u
cd "$(dirname "$0")/.."
LOG="${1:-/tmp/jilseo-dev.log}"
source "$HOME/.cargo/env"
pkill -TERM -f "target/debug/jilseo" 2>/dev/null || true
pkill -TERM -f "tauri dev" 2>/dev/null || true
sleep 2
: > "$LOG"
nohup npm run tauri dev > "$LOG" 2>&1 &
for i in $(seq 1 90); do grep -aq 'Running `target' "$LOG" && break; sleep 2; done
sleep 10
pgrep -f "target/debug/jilseo" >/dev/null && echo "app running" || { echo "app failed to start"; tail -20 "$LOG"; exit 1; }
