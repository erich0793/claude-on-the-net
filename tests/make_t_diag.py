# 產生 __dg.html：測「每小時上限那一行能不能自己帶著數字活下來」。
# 上限縮成 3 行、診斷視窗縮成 2 秒（原本 10 秒）、LOG_MAX 縮成 20 讓淘汰馬上發生。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
subs = [
    ('const DIAG_PER_HOUR = 10;', 'const DIAG_PER_HOUR = 3;'),
    ('const LOG_MAX = 800;', 'const LOG_MAX = 20;'),
    ('if (now - stat.t0 > 10000) {', 'if (now - stat.t0 > 2000) {'),
    ('  function logEvent(msg) {',
     '  window.__log = m => logEvent(m);\n'
     '  function logEvent(msg) {'),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:60]
    assert src.count(a) == 1, "錨點不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
