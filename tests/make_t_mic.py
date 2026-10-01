# 產生 __mc.html：測「麥克風長時間拿不回來」時重連迴圈的行為。
# 逾時縮成 3 秒（原本 10 秒）、保連脈衝縮成 10 秒；暴露重連旗標、脈衝計數，以及把麥克風「拔掉」的開關。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
anchor = "  // minsOverride：手動播放時由選單當場指定；偵測觸發則沿用「觸發後播放時長」設定\n  function trigger(reason, minsOverride) {"
subs = [
    ('rej(new Error("麥克風逾時")); }, ms || 10000))', 'rej(new Error("麥克風逾時")); }, ms || 3000))'),
    ('let PULSE_MS = +(localStorage.getItem("keepEvery") || 240000);', 'let PULSE_MS = 10000;'),
    ('const EVERY_OK = [120000, 240000, 480000];', 'const EVERY_OK = [10000];'),
    (anchor,
     '  window.__recovering = () => recovering;\n'
     '  window.__pulseN = () => pulseN;\n'
     '  window.__killMic = () => { if (stream) stream.getTracks().forEach(t => t.stop()); };\n'
     + anchor),
]
for a, b in subs:
    assert src.count(a) == 1, "錨點對不上或不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
