#!/bin/bash
# Same folder and port on every run, so the browser keeps its classroom data.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${TT_CLASSROOM_PORT:-4188}"
fail() {
  printf '\n오류: %s\n' "$1" >&2
  if [ -t 0 ]; then read -r -p 'Enter를 누르면 종료합니다...' _ || true; fi
  exit 1
}
command -v node >/dev/null 2>&1 || fail 'Node.js 20 이상이 필요합니다.'
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT/seating/"
  echo "이미 실행 중입니다: http://127.0.0.1:$PORT/seating/"
  exit 0
fi
node "$HERE/server.mjs" "$HERE/.." "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
kill -0 "$SERVER_PID" 2>/dev/null || fail '로컬 서버를 시작하지 못했습니다.'
open "http://127.0.0.1:$PORT/seating/"
echo "주소: http://127.0.0.1:$PORT/seating/"
echo '가상 학생 자료로만 시험하세요. 끝나면 이 창에서 Ctrl+C를 누르세요.'
wait "$SERVER_PID"
