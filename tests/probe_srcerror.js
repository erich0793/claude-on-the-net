// v104：來源壞掉時改重建音源，不要重載頁面——重載會沒收手勢授權，之後全部只剩嗶聲
//（09/05 20:07 實測：error3 → 換了三顆元素都一樣 → 6 秒看門狗重載頁面 → 34 分鐘、10 次觸發全是嗶聲）。
// 模擬：播放「成功開始」，但元素靜靜地不動、帶著 error3；只有換成新的網址才恢復正常。
// ① 要偵測到「沒有在前進」，並且走「重建音源」
// ② 不可以重載頁面
// ③ 重建之後真的在播，而且沒有掉到嗶聲
const { openPage, loadTone, log, since, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__sr.html';
// 壞掉的是**來源**，不是某一顆元素：所有指向同一個網址的元素都一樣壞，換新網址（重建音源）才會好。
// 第一版只弄壞一顆元素，對照組（v103）換下一顆就救回來了——那不是 09/05 的病，探針不具鑑別力。
const breaker = () => {
  window.__breakOn = false; window.__brokenSrc = '';
  const proto = HTMLMediaElement.prototype, realPlay = proto.play;
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  proto.play = function () {
    const el = this, cur = srcDesc.get.call(el);
    if (window.__breakOn && !el.muted && (!window.__brokenSrc || cur === window.__brokenSrc)) {
      window.__brokenSrc = cur;
      Object.defineProperty(el, 'paused', { configurable: true, get: () => true });
      Object.defineProperty(el, 'currentTime', { configurable: true, get: () => 0, set() {} });
      Object.defineProperty(el, 'error', { configurable: true, get: () => ({ code: 3, message: 'test decode error' }) });
      Object.defineProperty(el, 'src', { configurable: true, get() { return srcDesc.get.call(el); }, set(v) {
        delete el.paused; delete el.currentTime; delete el.error; delete el.src; srcDesc.set.call(el, v);
      } });
      return Promise.resolve();
    }
    return realPlay.call(this);
  };
};
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, breaker]);
  let navs = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(6000);
  const before = await log(page); const nav0 = navs;
  await page.evaluate(() => { window.__breakOn = true; window.__trigger('測試觸發', '3'); });
  await page.waitForTimeout(15000);
  const t = since(await log(page), before);
  const detected = /播放沒有真的在前進/.test(t), rebuilt = /來源本身壞了（error3）/.test(t);
  console.log('① 偵測到不前進 =', detected, '｜有走「重建音源」=', rebuilt);
  const reloaded = navs > nav0 || /重載頁面恢復/.test(t);
  console.log('② 有沒有重載頁面 =', reloaded, reloaded ? '❌' : '✅ 改用重建音源，沒有動用重載');
  const st = await page.evaluate(async () => { const el = window.__curEl(); const a = el.currentTime; await new Promise(r => setTimeout(r, 1500)); return { a, b: el.currentTime, paused: el.paused }; });
  const playing = !st.paused && st.b !== st.a;
  const beeped = /改以嗶聲警示/.test(t);
  console.log('③ 重建後仍在播放 =', playing, '｜有沒有掉到嗶聲 =', beeped, playing && !beeped ? '✅ 救回來了' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
