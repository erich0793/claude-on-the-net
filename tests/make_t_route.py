# 產生 __rt.html：測「播放被系統中途停掉（藍牙斷線）要一直掛在畫面上，直到有人碰畫面」。
# 池縮成 4 顆；暴露觸發／停止，以及「當下的警報元素」好讓探針模擬 iOS 自己把它 pause 掉。
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
     '  window.__sysPause = () => { lastGestureAt = 0; curEl().pause(); };\n'
     '  window.__userPause = () => { lastGestureAt = Date.now(); curEl().pause(); };\n'
     '  window.__noCool = () => { cooldownUntil = 0; };\n'
     + anchor),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:60]
    assert src.count(a) == 1, "錨點不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
