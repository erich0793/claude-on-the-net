#!/usr/bin/env bash
# 回歸測試：用 make_t_*.py 從 index.html 產生測試副本（縮短計時器、暴露測試鉤子），
# 再用 Playwright 逐支跑 probe_*.js。任何一行出現 ❌、FATAL 或 PAGEERROR 就算失敗。
#
#   tests/run.sh                    跑全部，對象是目前的 index.html
#   tests/run.sh old.html           對別的版本跑（例如 git show <commit>:index.html > old.html）
#   tests/run.sh index.html route   只跑名字含 route 的探針
#
# 鐵律：新增一支探針時，一定要先拿「修正之前的版本」跑一次，確認它會失敗。
# 不會失敗的探針沒有鑑別力，只是在浪費時間。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"
SRC="${1:-$ROOT/index.html}"; ONLY="${2:-}"
export NODE_PATH="${NODE_PATH:-$(npm root -g)/playwright/node_modules}"
curl -s -o /dev/null http://127.0.0.1:8123/ || { (cd "$ROOT" && setsid nohup python3 -m http.server 8123 >/dev/null 2>&1 < /dev/null &); sleep 2; }
# 探針 → 它用的測試副本
PROBES="pulsephase:ps pulsesmoke:ps keephealth:ps srcerror:sr watchbase:dy dry:dy micstorm:mc
pool:pl sameretry:pl verdict:pl freshtag:fr route:rt logtier:lg clip:dg capdata:dg retain:rn"
declare -A GEN=([ps]=pulse [sr]=src [dy]=dry [mc]=mic [pl]=pool [fr]=fresh [rt]=route [lg]=log [dg]=diag [rn]=retain)
for k in "${!GEN[@]}"; do python3 "$HERE/make_t_${GEN[$k]}.py" "$SRC" "__$k.html" >/dev/null || { echo "產生 __$k.html 失敗"; exit 2; }; done
OUT="$(mktemp)"; fail=0
for pair in $PROBES; do
  name="${pair%%:*}"; page="${pair##*:}"
  [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]] && continue
  echo "=== probe_$name.js ===" | tee -a "$OUT"
  PAGE="http://127.0.0.1:8123/__$page.html" node "$HERE/probe_$name.js" 2>&1 | tee -a "$OUT"
done
rm -f "$ROOT"/__*.html
bad=$(grep -cE "❌|FATAL|PAGEERROR" "$OUT"); rm -f "$OUT"
if [ "$bad" -eq 0 ]; then echo "=== 全部通過 ==="; else echo "=== 失敗 $bad 處 ==="; exit 1; fi
