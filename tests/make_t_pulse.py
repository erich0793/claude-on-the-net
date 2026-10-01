# 產生 __ps.html：測「保連脈衝靜默停擺／與保鮮脈衝同相碰撞」專用。
# 脈衝間隔縮成 20 秒（看門狗門檻＝2.5 倍＝50 秒），並暴露把 keeperFreshing
# 卡住的開關。EVERY_OK 白名單也要一起改，否則儲存值驗證會把測試值打回預設。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
subs = [
    ('let PULSE_MS = +(localStorage.getItem("keepEvery") || 240000);', 'let PULSE_MS = 20000;'),
    ('const EVERY_OK = [120000, 240000, 480000];', 'const EVERY_OK = [20000];'),
    ('Date.now() - lastPulseReport > 21600000', 'Date.now() - lastPulseReport > 25000'),
    ('"過去 6 小時送出 "', '"過去 6 小時送出 "'),
    ('  let pulseSkipped = false;',
     '  window.__stick = v => { keeperFreshing = v; };\n'
     '  window.__keepPulse = () => keepPulse();\n'
     '  window.__stickReset = v => { resetting = v; };\n'
     '  window.__pulseN = () => pulseN;\n'
     '  window.__pulsing = () => pulsing;\n'
     '  let pulseSkipped = false;'),
]
for a, b in subs:
    assert a in src, "錨點對不上：" + a[:50]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
