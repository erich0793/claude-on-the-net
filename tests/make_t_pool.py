# 產生 __pl.html：測「元素池見底要出現在畫面上，而且熱身元素接手時要說得出來」。
# 池縮成 4 顆（真機 12 顆要觸發 12 次才見底，測試不必付這個時間）。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
anchor = "  // minsOverride：手動播放時由選單當場指定；偵測觸發則沿用「觸發後播放時長」設定\n  function trigger(reason, minsOverride) {"
subs = [
    ('  const POOL_N = 12;', '  const POOL_N = 4;'),
    (anchor,
     '  window.__trigger = (r, m) => trigger(r, m);\n'
     '  window.__stopAlert = () => stopAlert(true);\n'
     '  window.__poolOK = () => elPool.filter(e => e._unlockOK && !e._inUse).length;\n'
     '  window.__killWarm = () => { warmEls.forEach(w => { w._unlockOK = false; }); };\n'
     '  window.__paintPool = () => paintPool();\n'
     '  window.__pool = () => elPool.slice();\n'
     '  window.__curEl = () => curEl();\n'
     + anchor),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
