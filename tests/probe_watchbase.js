// v105：看門狗的起算點必須跟被監控的東西同一個生命週期。
// 09/06 實測：停止監聽 → 手動播 30 分鐘 → 重新開始監聽 → 7 秒後喊「音響已 36 分鐘沒有收到任何聲音」，
// 因為起算點是**上一段**監聽最後一次脈衝。
// ① 停掉超過門檻再重新開始：開頭不可以有假警報
// ② 修掉假警報不能把真警報一起修掉：脈衝真的卡住時仍要示警並指名旗標
const { openPage, setKeep, loadTone, log, since, pick } = require('./_common');
// 用 __dy 頁（脈衝 20 秒、看門狗 3 秒一輪）：看門狗 30 秒一輪的話，重新開始之後是「新的脈衝」
// 還是「看門狗」先到是一場賽跑，對照組（v104）不一定重現。真機上是 4 分鐘對 30 秒，看門狗幾乎必然先到。
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__dy.html';
(async () => {
  const { browser, page, errors } = await openPage(PAGE);
  await setKeep(page, true); await loadTone(page);
  console.log('保持連線已勾選 =', await page.evaluate(() => document.getElementById('keepCk').checked));
  await page.click('#startBtn'); await page.waitForTimeout(25000);
  console.log('第一段監聽有留下起算點 =', (await page.evaluate(() => window.__pulseN())) >= 1);
  await page.click('#stopBtn'); await page.waitForTimeout(65000); // 門檻是 2.5×20 秒＝50 秒
  const b1 = await log(page);
  await page.click('#startBtn'); await page.waitForTimeout(10000); // 看門狗 3 秒一輪，已跑過好幾輪；下一次脈衝還沒到
  const w1 = pick(since(await log(page), b1), /沒有收到任何聲音/);
  console.log('① 重新開始監聽後開頭有沒有假警報 =', !!w1, w1 ? '❌ ' + w1.slice(0, 80) : '✅ 沒有假警報');

  const b2 = await log(page);
  await page.evaluate(() => window.__stickReset(true));
  await page.waitForTimeout(62000);
  await page.evaluate(() => window.__stickReset(false));
  const w2 = pick(since(await log(page), b2), /沒有收到任何聲音/);
  console.log('② 真的卡住時仍會示警 =', !!w2, '｜有指名旗標 =', /音訊重置中/.test(w2), w2 && /音訊重置中/.test(w2) ? '✅' : '❌');
  if (w2) console.log('   ', w2.slice(0, 110));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
