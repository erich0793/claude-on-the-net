// 「沉默的機制查不出失效」的延伸：連「它是好的」也要留下證據。
// 每 6 小時一行 🔧 保連狀態（測試版縮成 25 秒）。
// ① 保連開著：寫出送了幾次、是否正常
// ② 保連關掉：明說「未開啟」，不能寫成「送出 0 次」讓人以為是故障
const { openPage, setKeep, loadTone, log, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__ps.html';
(async () => {
  let errs = [];
  for (const on of [true, false]) {
    const { browser, page, errors } = await openPage(PAGE);
    await setKeep(page, on); await loadTone(page);
    await page.click('#startBtn'); await page.waitForTimeout(62000);
    const l = pick(await log(page), /🔧 保連狀態/);
    if (on) {
      console.log('① 保連開著：', l.slice(0, 80));
      console.log('  ', /送出 [1-9]\d* 次脈衝（正常）/.test(l) ? '✅ 留下了可查證的數字' : '❌');
    } else {
      console.log('② 保連關掉：', l.slice(0, 80));
      console.log('  ', /未開啟/.test(l) ? '✅ 明說沒開' : '❌');
    }
    errs = errs.concat(errors); await browser.close();
  }
  console.log('errors:', errs.length ? errs.join('\n') : '（無）');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
