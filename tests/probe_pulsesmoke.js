// 保連與保鮮兩條脈衝都要真的會跑（煙霧測試）。
// ① 保連開著：4 個週期內至少送出 2 次
// ② 保連關掉：無聲保鮮脈衝仍然要跑（它刻意延後半個週期起跑，不能因此根本不跑）
const { openPage, setKeep, loadTone, log, count } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__ps.html';
(async () => {
  let errs = [];
  {
    const { browser, page, errors } = await openPage(PAGE);
    await setKeep(page, true); await loadTone(page);
    await page.click('#startBtn'); await page.waitForTimeout(3000);
    const n0 = await page.evaluate(() => window.__pulseN());
    await page.waitForTimeout(80000);
    const n = await page.evaluate(() => window.__pulseN()) - n0;
    console.log('① 保連開著：脈衝送出', n, '次（4 個週期內應 >=2）', n >= 2 ? '✅' : '❌');
    errs = errs.concat(errors); await browser.close();
  }
  {
    const { browser, page, errors } = await openPage(PAGE);
    await setKeep(page, false); await loadTone(page);
    await page.click('#startBtn'); await page.waitForTimeout(75000);
    const n = count(await log(page), /🫧 保鮮脈衝/);
    console.log('② 保連關閉：保鮮脈衝出現', n, '行', n >= 2 ? '✅ 延後起跑仍然會跑' : '❌');
    errs = errs.concat(errors); await browser.close();
  }
  console.log('errors:', errs.length ? errs.join('\n') : '（無）');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
