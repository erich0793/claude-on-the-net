// 保連脈衝與「保連音軌刷新」同週期 → 永遠同相 → 脈衝每次都被 keeperFreshing 擋掉（09/01 實測
// 2 小時 40 分鐘只送出 1 次），而且擋掉是完全靜默的。修法是直接接管＋看門狗指名擋路的旗標。
// ① keeperFreshing 剛被設起來的同一個 tick 呼叫脈衝，要照樣送出（接管）
// ② keeperFreshing 一直被設起來：脈衝仍按週期送出，而且不會因此出現「沒收到聲音」的假警報
// ③ 真的被擋（音訊重置卡住）：看門狗要示警，而且說得出是「音訊重置中」
const { openPage, setKeep, loadTone, log, since, pick, count } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__ps.html';
(async () => {
  const { browser, page, errors } = await openPage(PAGE);
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(25000);

  let sent = 0;
  for (let i = 0; i < 3; i++) {
    sent += await page.evaluate(() => { window.__stick(true); window.__keepPulse(); return window.__pulsing() ? 1 : 0; });
    await page.waitForTimeout(10000);
  }
  console.log('① keeperFreshing 設起來的同一個 tick 呼叫 keepPulse ×3 →送出', sent, '次');
  console.log('  ', sent === 3 ? '✅ 沒有被擋，三次都送出去了' : '❌');

  const b2 = await log(page); const n0 = await page.evaluate(() => window.__pulseN());
  await page.evaluate(() => { window.__stickTimer = setInterval(() => window.__stick(true), 50); });
  await page.waitForTimeout(85000);
  await page.evaluate(() => clearInterval(window.__stickTimer));
  const n1 = await page.evaluate(() => window.__pulseN());
  const warn2 = count(since(await log(page), b2), /沒有收到任何聲音/);
  console.log('② keeperFreshing 一直被設起來：脈衝仍送出', n1 - n0, '次｜警告', warn2, '行');
  console.log('  ', n1 - n0 >= 3 && warn2 === 0 ? '✅ 照常送出，也沒有假警報' : '❌');

  const b3 = await log(page);
  await page.evaluate(() => window.__stickReset(true));
  await page.waitForTimeout(85000);
  await page.evaluate(() => window.__stickReset(false));
  const w3 = pick(since(await log(page), b3), /沒有收到任何聲音/);
  console.log('③ resetting 卡住：有警告 =', !!w3, '｜有指名「音訊重置中」=', /音訊重置中/.test(w3));
  console.log('  ', w3 && /音訊重置中/.test(w3) ? '✅ 說得出是誰擋的' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
