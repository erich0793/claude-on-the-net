# 回歸測試（探針）

這個資料夾是開發用的，跟網站本身無關。每一支 `probe_*.js` 都對應一次**真機上發生過的故障**，
檔頭註解寫著那次故障的日期與紀錄原文。

```bash
tests/run.sh                    # 對目前的 index.html 跑全部（約 25 分鐘）
tests/run.sh old.html           # 對別的版本跑：git show <commit>:index.html > old.html
tests/run.sh index.html route   # 只跑名字含 route 的探針
```

需要 Playwright 與 `/opt/pw-browsers/chromium`。`make_t_*.py` 會從 index.html 產生
`__*.html` 測試副本（縮短計時器、暴露測試鉤子），寫在 repo 根目錄，跑完自動刪除。

**鐵律：新增探針時，先拿「修正之前的版本」跑一次，確認它會失敗。**
不會失敗的探針沒有鑑別力——這個資料夾裡有好幾支第一版都是對照組讀成 false，
問題全出在探針自己（時機賽跑、只弄壞一顆元素、快照拍錯時間），而不是產品。

這些探針原本只放在暫存區，10/01 容器被回收時全部遺失，大半是重寫的。所以它們放在這裡。
