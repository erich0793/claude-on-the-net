// v129：播放到一半停了，紀錄要分得出是怎麼停的。
// 11/12 10:18:34 手動播放（10 分鐘）在 10:23:12 停了，紀錄寫「手動停止播放」（停之前 2 秒內有人碰了畫面），
// 使用者卻說是自己停的：藍牙沒斷，再按一次播放又從喇叭出來。舊紀錄裡「按了停止鍵」、
// 「剛好碰了畫面、同時被系統停掉」、「早就沒聲音了才去按停止」三種長得一模一樣。
// ① 按「⏹ 停止播放」：寫明是按了停止鍵、播了多久
// ② 碰了畫面別的地方、2 秒內被系統停掉：寫成 🔬「手動停止播放？」並說明不是按停止鍵、頁面在前景還是背景
// ③ 沒有手勢就被停掉：照舊寫「播放被系統中斷」，並帶上播了多久
// ④ 播到一半時間不走了（沒暫停、沒有聲音）：寫「播放到一半停住了」；恢復了也寫；停住時去按停止，那一行要說出停之前已經沒在前進
// ⑤ 沒在監聽、手動播放中進出背景：要記
const { openPage, loadTone, log, since, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const vis = () => {
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => window.__vis === 'hidden', configurable: true });
  window.__setVis = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
};
const manual = async (page, m) => { await page.click('#manualBtn'); await page.click('#manualOpts button[data-m="' + m + '"]'); await page.waitForTimeout(2500); };
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(500); } return false; };
const playing = p => p.evaluate(() => window.__alerting());
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, vis]);
  await loadTone(page);

  // ① 按停止鍵
  let before = await log(page);
  await manual(page, '1');
  const p1 = await playing(page);
  await page.click('#testBtn'); await page.waitForTimeout(800);
  let l = pick(since(await log(page), before), /手動停止播放/);
  console.log('① 按「⏹ 停止播放」（有在播 =', p1 + '）：', /按了「⏹ 停止播放」，播了 0 分 0\d 秒/.test(l) ? '✅ ' + l.slice(9, 60) : '❌ ' + (l || '沒有').slice(0, 60));
  await page.waitForTimeout(1500);

  // ② 碰了畫面別的地方，2 秒內被系統停掉
  before = await log(page);
  await manual(page, '1');
  await page.click('#statusText');
  await page.evaluate(() => window.__curEl().pause());
  await page.waitForTimeout(800);
  l = pick(since(await log(page), before), /手動停止播放/);
  console.log('② 碰了別的地方、剛好被停掉：', /🔬 手動停止播放？（[\d.]+ 秒前有人碰了畫面，但不是按「⏹ 停止播放」/.test(l) && /頁面在前景/.test(l) ? '✅ ' + l.slice(9, 70) : '❌ ' + (l || '沒有').slice(0, 70));
  await page.waitForTimeout(1500);

  // ③ 沒有手勢就被停掉
  before = await log(page);
  await manual(page, '1');
  await page.waitForTimeout(2500); // 讓剛才選時長的那一下超過 2 秒
  await page.evaluate(() => window.__curEl().pause());
  await page.waitForTimeout(800);
  l = pick(since(await log(page), before), /播放被系統中斷/);
  console.log('③ 沒有手勢就被停掉：', /播放被系統中斷（沒有手勢.*播了 0 分 0\d 秒，頁面在前景/.test(l) ? '✅ ' + l.slice(9, 50) : '❌ ' + (l || '沒有').slice(0, 70));
  await page.waitForTimeout(1500);

  // ④ 播到一半時間不走了
  before = await log(page);
  await manual(page, '1');
  await page.waitForTimeout(9000); // 過了開頭 10 秒（起播檢查的範圍）
  await page.evaluate(() => { const e = window.__curEl(); const v = e.currentTime;
    Object.defineProperty(e, 'currentTime', { get: () => v, set: () => {}, configurable: true }); });
  const stuck = await untilLine(page, before, /播放到一半停住了/, 25000);
  const sl = pick(since(await log(page), before), /播放到一半停住了/);
  console.log('④ 播到一半時間不走了：', stuck ? '✅ ' + sl.slice(9, 70) : '❌ 沒寫');
  await page.evaluate(() => { delete window.__curEl().currentTime; });
  const back = await untilLine(page, before, /播放恢復前進了/, 15000);
  console.log('   恢復前進也寫 =', back ? '✅' : '❌');
  await page.evaluate(() => { const e = window.__curEl(); const v = e.currentTime;
    Object.defineProperty(e, 'currentTime', { get: () => v, set: () => {}, configurable: true }); });
  const before4 = await log(page);
  await untilLine(page, before4, /播放到一半停住了/, 25000);
  await page.click('#testBtn'); await page.waitForTimeout(800);
  l = pick(since(await log(page), before4), /手動停止播放/);
  console.log('   停住時按停止：那一行說出停之前已經沒在前進 =', /停之前已約 \d+ 秒沒有前進/.test(l) ? '✅ ' + l.slice(9, 80) : '❌ ' + (l || '沒有').slice(0, 80));
  await page.waitForTimeout(1500);

  // ⑤ 沒在監聽、手動播放中進出背景
  before = await log(page);
  await manual(page, '1');
  await page.evaluate(() => window.__setVis('hidden')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__setVis('visible')); await page.waitForTimeout(300);
  const a5 = since(await log(page), before);
  console.log('⑤ 手動播放中進出背景：', /進入背景（手動播放中，沒有在監聽）/.test(a5) && /回到前景（手動播放中，沒有在監聽）/.test(a5) ? '✅' : '❌');
  await page.click('#testBtn'); await page.waitForTimeout(800);
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
