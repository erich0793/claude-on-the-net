// v132：整頁被 iOS 暫停時，醒來要寫出「停了多久、從幾點到幾點」。
// 11/20 08:31 在背景播完一輪、深度重置放掉麥克風後，整頁被凍住到 18:28——10 小時一行紀錄都沒有，
// 醒來只寫「保連脈衝沒有被任何旗標擋住，是它自己沒跑」；11/19 11:07 那次還多寫「停擺約 30 秒」（實際 145 分鐘）。
// 做法：把 30 秒看門狗的回呼抓出來手動呼叫，中間把 Date.now 往後撥，等於「計時器兩拍之間隔了很久」——
// 同一個同步呼叫裡做完，保連脈衝插不進來，結果是確定的。
// ① 兩拍只隔 2.5 分鐘（背景降頻也可能慢一點）：不能寫
// ② 隔 10 分鐘、暫停前在背景：寫一行，帶分鐘數、起訖時間、「暫停前頁面在背景」
// ③ 同一拍的「音響已 N 分鐘沒有收到任何聲音」：要說是跟著整頁被暫停，不是「它自己沒跑」
// ④ 同一拍不能再補一行「偵測迴圈停擺約 30 秒」
// ⑤ 沒在監聽時隔很久、再開始監聽：不能寫
const { openPage, setKeep, loadTone, log, since, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const hooks = () => {
  const real = Date.now.bind(Date); let off = 0;
  Date.now = () => real() + off;
  window.__jump = ms => { off += ms; };
  const si = window.setInterval.bind(window);
  window.setInterval = (f, ms, ...a) => { if (ms === 30000 && /watchBeat\(\)/.test(String(f))) window.__watch = f; return si(f, ms, ...a); };
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => window.__vis === 'hidden', configurable: true });
  window.__setVis = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
};
const FROZE = /⚠️ 整個網頁被 iOS 暫停了約/;
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, hooks]);
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(4000);
  const hasWatch = await page.evaluate(() => typeof window.__watch === 'function');
  if (!hasWatch) { console.log('❌ 抓不到 30 秒看門狗的回呼'); await browser.close(); return; }

  // ① 只隔 2.5 分鐘。在背景做：前景的話「音響已 N 分鐘沒聲音」這一拍就會先寫掉（它每段只寫一次），③ 就看不到了
  await page.evaluate(() => window.__setVis('hidden')); await page.waitForTimeout(3000);
  let before = await log(page);
  await page.evaluate(() => { window.__watch(); window.__jump(150000); window.__watch(); });
  await page.waitForTimeout(500);
  let a = since(await log(page), before);
  console.log('① 兩拍隔 2.5 分鐘：', FROZE.test(a) ? '❌ 不該寫：' + pick(a, FROZE).slice(9, 60) : '✅ 沒寫');

  // ②③④ 在背景走一拍，再撥 10 分鐘、回到前景的同一瞬間走下一拍（11/20 18:28 的順序）
  await page.waitForTimeout(2000);
  before = await log(page);
  await page.evaluate(() => { window.__watch(); window.__jump(600000); window.__vis = 'visible'; window.__watch(); });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  a = since(await log(page), before);
  const f = pick(a, FROZE);
  console.log('② 隔 10 分鐘、暫停前在背景：', /⚠️ 整個網頁被 iOS 暫停了約 1[01] 分鐘（\d\d:\d\d → \d\d:\d\d，暫停前頁面在背景）——這段時間完全沒有在聽/.test(f)
    ? '✅ ' + f.slice(9, 75) : '❌ ' + (f || '沒寫').slice(0, 75));
  const q = pick(a, /音響已 \d+ 分鐘沒有收到任何聲音/);
  console.log('③ 同一拍的「音響已 N 分鐘沒有收到任何聲音」：', /保連脈衝跟著整個網頁被 iOS 暫停了 1[01] 分鐘/.test(q)
    ? '✅ ' + q.slice(9, 70) : '❌ ' + (q || '沒寫').slice(9, 80));
  const s = pick(a, /偵測迴圈停擺約/);
  console.log('④ 同一拍不補「偵測迴圈停擺約 30 秒」：', s ? '❌ ' + s.slice(9, 50) : '✅ 沒寫');

  // ⑤ 停止監聽 → 隔很久 → 再開始
  await page.click('#stopBtn'); await page.waitForTimeout(1500);
  before = await log(page);
  await page.evaluate(() => { window.__watch(); window.__jump(1800000); window.__watch(); });
  await page.click('#startBtn'); await page.waitForTimeout(4000);
  await page.evaluate(() => { window.__watch(); });
  await page.waitForTimeout(500);
  a = since(await log(page), before);
  console.log('⑤ 沒在監聽時隔 30 分鐘、再開始監聽：', FROZE.test(a) ? '❌ 不該寫：' + pick(a, FROZE).slice(9, 60) : '✅ 沒寫');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
