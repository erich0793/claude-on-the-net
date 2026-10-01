# 產生 __rn.html：測「🔬 實驗結論能不能跟它摘要的 ⚠️ 原始痕跡一樣活得久」。LOG_MAX 縮成 20。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
subs = [
    ('const LOG_MAX = 800;', 'const LOG_MAX = 20;'),
    ('  function logEvent(msg) {', '  window.__log = m => logEvent(m);\n  function logEvent(msg) {'),
]
for a, b in subs:
    assert src.count(a) == 1, "錨點對不上或不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
