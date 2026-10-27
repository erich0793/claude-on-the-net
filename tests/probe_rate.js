// v122：深度重置時的取樣率變了，要寫一行 🔬。
// 那一刻麥克風是關的，新引擎的取樣率應是「當下輸出裝置」的硬體取樣率。10/22～10/27 的 74 次重建裡
// 73 次是 44100，只有 10/27 14:46:40 是 48000——那一輪警報結束 2 分半後使用者按了停止監聽。
// 如果 44100＝這台喇叭、48000＝手機，這是網頁第一次能自己看出聲音改從手機出來。還沒證實，先只寫紀錄。
// （用包一層的 AudioContext 控制取樣率）
// ① 同一次監聽裡一直是 44100：不寫
// ② 變成 48000：寫一行，說出前面維持了幾次
// ③ 變回 44100：也寫（重新連上）
// ④ 停止再開始監聽：重新起算，第一次重建不跟上一次監聽比
const { openPage, loadTone, log, since, entries, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const rate = () => {
  window.__rate = 44100;
  const Orig = window.AudioContext;
  window.AudioContext = function (opts) { return new Orig(Object.assign({}, opts || {}, { sampleRate: window.__rate })); };
  window.AudioContext.prototype = Orig.prototype;
};
const notes = t => entries(t).filter(l => /🔬 這次重建的取樣率/.test(l)).reverse();
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(300); } return false; };
const alertOnce = async page => { const b = await log(page); await page.evaluate(() => window.__trigger('測試觸發', 'once')); await untilLine(page, b, /音訊已重建，恢復監聽/, 20000); await page.waitForTimeout(500); };
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, rate]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  let before = await log(page);
  await alertOnce(page); await alertOnce(page);
  let n = notes(since(await log(page), before));
  console.log('① 一直是 44100（2 次重建）：🔬 行數 =', n.length, n.length === 0 ? '✅ 不寫' : '❌');

  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  n = notes(since(await log(page), before));
  console.log('② 變成 48000：', n.length === 1 && /48000Hz，前 2 次都是 44100Hz/.test(n[0]) ? '✅ ' + n[0].slice(9, 60) : '❌ ' + (n[0] || '沒寫').slice(0, 60));

  before = await log(page);
  await page.evaluate(() => { window.__rate = 44100; });
  await alertOnce(page);
  n = notes(since(await log(page), before));
  console.log('③ 變回 44100：', n.length === 1 && /44100Hz，前 1 次都是 48000Hz/.test(n[0]) ? '✅ ' + n[0].slice(9, 60) : '❌ ' + (n[0] || '沒寫').slice(0, 60));

  await page.click('#stopBtn'); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__rate = 48000; });
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  before = await log(page);
  await alertOnce(page);
  n = notes(since(await log(page), before));
  console.log('④ 重新開始監聽後第一次重建（48000，上一次監聽是 44100）：🔬 行數 =', n.length, n.length === 0 ? '✅ 重新起算' : '❌ 跨監聽比較');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
