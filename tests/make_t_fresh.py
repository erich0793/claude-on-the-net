# 產生 __fr.html：測「被擋紀錄裡『熱身元素多久沒刷新』這個數字誠不誠實」。
# 池縮成 4 顆、保連脈衝縮成 20 秒（讓 rider 很快就刷新熱身元素），
# 並且**不動** freshPulse 的早退條件——那正是要重現的情境：
# rider 正常運作 → 無聲保鮮整個跳過 → lastFreshOK 永遠停在 0／很久以前。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
anchor = "  // minsOverride：手動播放時由選單當場指定；偵測觸發則沿用「觸發後播放時長」設定\n  function trigger(reason, minsOverride) {"
subs = [
    ('  const POOL_N = 12;', '  const POOL_N = 4;'),
    ('let PULSE_MS = +(localStorage.getItem("keepEvery") || 240000);', 'let PULSE_MS = 20000;'),
    ('const EVERY_OK = [120000, 240000, 480000];', 'const EVERY_OK = [20000];'),
    (anchor,
     '  window.__trigger = (r, m) => trigger(r, m);\n'
     '  window.__stopAlert = () => stopAlert(true);\n'
     '  window.__poolOK = () => elPool.filter(e => e._unlockOK && !e._inUse).length;\n'
     '  window.__warmOK = () => lastWarmOK;\n'
     '  window.__freshOK = () => lastFreshOK;\n'
     + anchor),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:60]
    assert src.count(a) == 1, "錨點不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
