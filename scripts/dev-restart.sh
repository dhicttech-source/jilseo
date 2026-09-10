#!/usr/bin/env bash
# 개발 앱을 완전히 종료하고 다시 띄운다. 로그: $1 (기본 /private/tmp/claude-501/-Users-choeingyu-Library-Application-Support-Claude-scratch-workspaces-22264161-cfb7-48d7-8ef4-07a72f8d5dd3-fc7217ec-704f-4c25-b4ae-0f80636aa861-scratch-2026-09-10-cf035f/bd9776b3-d9bc-49ed-9143-a0d08e6e02df/scratchpad/devapp.log)
set -u
cd "$(dirname "$0")/.."
LOG="${1:-/private/tmp/claude-501/-Users-choeingyu-Library-Application-Support-Claude-scratch-workspaces-22264161-cfb7-48d7-8ef4-07a72f8d5dd3-fc7217ec-704f-4c25-b4ae-0f80636aa861-scratch-2026-09-10-cf035f/bd9776b3-d9bc-49ed-9143-a0d08e6e02df/scratchpad/devapp.log}"
source "$HOME/.cargo/env"
pkill -TERM -f "target/debug/jilseo" 2>/dev/null || true
pkill -TERM -f "tauri dev" 2>/dev/null || true
sleep 2
: > "$LOG"
nohup npm run tauri dev > "$LOG" 2>&1 &
for i in $(seq 1 90); do grep -aq 'Running `target' "$LOG" && break; sleep 2; done
sleep 10
pgrep -f "target/debug/jilseo" >/dev/null && echo "app running" || { echo "app failed to start"; tail -20 "$LOG"; exit 1; }
