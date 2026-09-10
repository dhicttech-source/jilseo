#!/usr/bin/env bash
# tauri build가 만든 dmg에 '처음 실행하는 법.txt'를 동봉한다.
# 사용: scripts/finish-dmg.sh [dmg 경로]  (생략 시 최신 dmg 자동 탐색)
set -euo pipefail
cd "$(dirname "$0")/.."
DMG="${1:-$(ls -t src-tauri/target/release/bundle/dmg/*.dmg | head -1)}"
GUIDE="dmg/처음 실행하는 법.txt"
OUT="${DMG%.dmg}-guide.dmg"
RW="$(mktemp -d)/rw.dmg"
MNT="$(mktemp -d)"

echo "source: $DMG"
hdiutil convert "$DMG" -format UDRW -o "$RW" >/dev/null
hdiutil attach "$RW" -mountpoint "$MNT" -nobrowse >/dev/null
cp "$GUIDE" "$MNT/"
hdiutil detach "$MNT" >/dev/null
rm -f "$OUT"
hdiutil convert "$RW" -format UDZO -o "$OUT" >/dev/null
rm -f "$RW"
echo "done: $OUT"
