#!/usr/bin/env bash
# Supabase Free 프로젝트 일시정지 방지: 하루 1회 REST 호출 (지시문 §5). launchd가 실행.
set -u
ENV="$HOME/Library/Application Support/jilseo/keepalive.env"
[ -f "$ENV" ] || { echo "no env"; exit 0; }
# shellcheck disable=SC1090
source "$ENV"
LOG="$HOME/Library/Application Support/jilseo/keepalive.log"
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/comparisons?select=id&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY")
echo "$(date '+%Y-%m-%d %H:%M:%S') http=$CODE" >> "$LOG"
tail -n 60 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
