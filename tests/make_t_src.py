# 產生 __sr.html：測「來源壞掉（error3）時改重建音源，不要重載頁面」。
# 只暴露觸發／停止／當下的警報元素；壞掉的狀態由探針在 play() 上模擬。
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 測試副本寫在 repo 根目錄（.gitignore 已排除 __*.html）
src_path, out = sys.argv[1], sys.argv[2]
src = io.open(src_path, encoding="utf-8").read()
anchor = "  // minsOverride：手動播放時由選單當場指定；偵測觸發則沿用「觸發後播放時長」設定\n  function trigger(reason, minsOverride) {"
subs = [
    (anchor,
     '  window.__trigger = (r, m) => trigger(r, m);\n'
     '  window.__stopAlert = () => stopAlert(true);\n'
     '  window.__curEl = () => curEl();\n'
     + anchor),
]
for a, b in subs:
    assert src.count(a) == 1, "錨點對不上或不唯一：" + a[:60]
    src = src.replace(a, b)
io.open(root + "/" + out, "w", encoding="utf-8").write(src)
print(out, "已產生")
