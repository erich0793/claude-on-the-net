// v121：頁面在背景時的心跳示警不能每分鐘一行。
// 10/13 01:55→03:44 頁面在背景 110 分鐘，寫了 108 行 ⚠️（佔整份紀錄 14%），而 ⚠️ 是最後才裁的一層。
// 而且 iOS 把背景計時器夾在 1Hz，每分鐘 60 幀就是背景的正常值——門檻也訂在 60，
// 於是「幾乎停擺」「被降頻」兩種說法交錯出現，實際上一模一樣。
// （測試副本：背景迴圈間隔可調、心跳視窗縮成 6 秒；1000ms＝模擬 iOS 的 1Hz）
// ① 1Hz 背景 11 個視窗：只寫第 1 個和第 10 個（第 10 個要說出已經在背景多久）
// ② 1Hz 不該被叫成「幾乎停擺」
// ③ 真的停擺（3 秒一幀）：等級變了要當場寫出來
// ④ 回到前景後再進背景：重新從第 1 個開始寫
const { openPage, setKeep, loadTone, log, since, entries } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__bg.html';
const vis = () => {
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => window.__vis === 'hidden', configurable: true });
  window.__setVis = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
};
const bgLines = t => entries(t).filter(l => /背景偵測(被降頻|幾乎停擺)/.test(l)).reverse();
(async () => {
  const { fakeMic } = require('./_common');
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, vis]);
  await setKeep(page, false); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);

  let before = await log(page);
  await page.evaluate(() => { window.__bgMs = 1000; window.__setVis('hidden'); });
  await page.waitForTimeout(80000); // 約 11 個 7 秒的視窗
  let a = bgLines(since(await log(page), before));
  console.log('① 1Hz 背景約 80 秒（約 11 個視窗），⚠️ 行數 =', a.length, a.length >= 2 && a.length <= 3 ? '✅ 已節流' : '❌ 洗版');
  a.forEach(l => console.log('    ', l.slice(9, 100)));
  const said = a.length >= 2 && /已連續在背景/.test(a[a.length - 1]);
  console.log('   第 10 個視窗說出已經在背景多久 =', said ? '✅' : '❌');
  console.log('② 1Hz 有沒有被叫成「幾乎停擺」=', a.some(l => /幾乎停擺/.test(l)) ? '❌ 有' : '✅ 沒有');

  before = await log(page);
  await page.evaluate(() => { window.__bgMs = 3000; });
  await page.waitForTimeout(25000);
  a = bgLines(since(await log(page), before));
  const stall = a.find(l => /幾乎停擺/.test(l));
  console.log('③ 真的停擺（3 秒一幀）：', stall ? '✅ 當場寫出 ' + stall.slice(9, 70) : '❌ 沒寫');

  await page.evaluate(() => { window.__bgMs = 1000; window.__setVis('visible'); });
  await page.waitForTimeout(3000);
  before = await log(page);
  await page.evaluate(() => { window.__setVis('hidden'); });
  await page.waitForTimeout(9000);
  a = bgLines(since(await log(page), before));
  console.log('④ 回到前景後再進背景：第一個視窗照寫 =', a.length >= 1 ? '✅' : '❌', a[0] ? a[0].slice(9, 70) : '');
  await page.evaluate(() => { window.__setVis('visible'); });
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
