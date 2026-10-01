# 產生 __dy.html：測「長時間播放剛結束，看門狗會不會喊『音響已 N 分鐘沒收到任何聲音』」。
# 脈衝縮成 20 秒（看門狗門檻 = 2.5 倍 = 50 秒）；看門狗檢查週期縮成 3 秒——
# 不縮的話，播完之後是「下一次脈衝」先到還是「看門狗」先到是一場賽跑（20 秒 vs 30 秒），
# 對照組不一定重現。真機上是 4 分鐘 vs 30 秒，看門狗幾乎必然先到。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
anchor = "  // minsOverride：手動播放時由選單當場指定；偵測觸發則沿用「觸發後播放時長」設定\n  function trigger(reason, minsOverride) {"
subs = [
    ('let PULSE_MS = +(localStorage.getItem("keepEvery") || 240000);', 'let PULSE_MS = 20000;'),
    ('const EVERY_OK = [120000, 240000, 480000];', 'const EVERY_OK = [20000];'),
    ('  const ALIVE_MIN = 10, WATCH_MS = 30000;', '  const ALIVE_MIN = 1, WATCH_MS = 3000;'),
    (anchor,
     '  window.__trigger = (r, m) => trigger(r, m);\n'
     '  window.__stopAlert = () => stopAlert(true);\n'
     '  window.__stickReset = v => { resetting = v; };\n'
     '  window.__pulseN = () => pulseN;\n'
     + anchor),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:60]
    assert src.count(a) == 1, "錨點不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
