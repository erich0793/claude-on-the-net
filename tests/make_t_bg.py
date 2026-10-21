# 產生 __bg.html：測「頁面在背景時，每分鐘一行 ⚠️ 的背景心跳」有沒有節流。
# iOS 把背景頁面的計時器夾在 1Hz——這裡把背景迴圈的間隔改成可調（預設照舊 66ms），
# 探針設成 1000ms 模擬 iOS；心跳視窗從 60 秒縮成 6 秒，十個視窗一分鐘就跑完。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
subs = [
    ('loopTimer = setTimeout(loop, 66);', 'loopTimer = setTimeout(loop, window.__bgMs || 66);'),
    ('if (now - bgT0 > 60000) {', 'if (now - bgT0 > 6000) {'),
]
for a, b in subs:
    assert src.count(a) == 1, "錨點對不上或不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
