// v130：把引擎回報的輸出延遲也記下來（只寫紀錄）。11/13 喇叭整天是 48000，22:36～23:46 之間斷線，
// 手機也是 48000——取樣率沒變，網頁完全看不到，使用者手動播放才發現從手機出來。
// ① 第一次量到：寫一行（帶數值與取樣率）② 沒變：不重複寫 ③ 取樣率不變、延遲變了：寫一行，說出前一次的數值
const { openPage, setKeep, loadTone, log, since, entries, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const lat = () => {
  window.__lat = 0.17;
  Object.defineProperty(AudioContext.prototype, 'outputLatency', { get: () => window.__lat, configurable: true });
};
const ll = t => entries(t).filter(l => /量到的輸出延遲/.test(l)).reverse();
const pulses = async (page, k) => { const n0 = await page.evaluate(() => window.__pulseN());
  const t = Date.now(); while (Date.now() - t < 40000 && (await page.evaluate(() => window.__pulseN())) < n0 + k) await page.waitForTimeout(500);
  await page.waitForTimeout(6500); };
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, lat]);
  await setKeep(page, true); await loadTone(page);
  let before = await log(page);
  await page.click('#startBtn'); await page.waitForTimeout(3000);
  await pulses(page, 1);
  let a = ll(since(await log(page), before));
  console.log('① 第一次量到：', a.length === 1 && /輸出 170ms/.test(a[0]) && /取樣率 \d+Hz/.test(a[0]) ? '✅ ' + a[0].slice(9, 70) : '❌ ' + a.length + ' 行 ' + (a[0] || '').slice(0, 60));
  before = await log(page);
  await pulses(page, 2);
  a = ll(since(await log(page), before));
  console.log('② 沒變（2 次脈衝）：', a.length === 0 ? '✅ 不重複寫' : '❌ ' + a.length + ' 行');
  before = await log(page);
  await page.evaluate(() => { window.__lat = 0.012; });
  await pulses(page, 1);
  a = ll(since(await log(page), before));
  console.log('③ 取樣率不變、延遲變小：', a.length === 1 && /輸出 12ms/.test(a[0]) && /前一次 .*輸出 170ms/.test(a[0]) ? '✅ ' + a[0].slice(9, 80) : '❌ ' + a.length + ' 行 ' + (a[0] || '').slice(0, 60));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
