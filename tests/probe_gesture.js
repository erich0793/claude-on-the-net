// v117：池裡最後一顆被擋（NotAllowedError）——追了一個月，答案在「那顆元素是在哪裡補出來的」。
//
// 「手動播放 → 播完自動開始偵測」：手動播放的手勢補滿 12 顆、自己用掉 1 顆；播完之後的
// 自動開始偵測是計時器呼叫 start()，它再補 1 顆——**沒有手勢**。靜音解鎖照樣成功（✓），
// 但 iOS 只認「第一次播放發生在手勢裡」的元素，之後真正出聲會被擋。池是先進先出，
// 那顆永遠排最後，所以每一次都是「剛好把池抽乾的那一顆」被擋（09/07 起 10 次）。
//
// 這支探針在 Chromium 上模擬 iOS 那條規則：元素第一次 play() 時，看當下是不是在使用者手勢裡；
// 之後沒有手勢的「有聲」播放，只有手勢裡播過的元素才放行。
// 「手勢」只認真正的輸入事件（isTrusted 的 pointerdown／click／keydown，以及選檔的 change），
// 並延伸 1 秒（WebKit 會把手勢延伸到 1 秒內的計時器）。
// **不能用 navigator.userActivation**：Playwright 的 page.evaluate 帶著 userGesture: true，
// 每呼叫一次都會給 Chromium 一個新的使用者啟動——第一版探針就是因為輪詢紀錄，
// 讓計時器補出來的那顆元素也被當成「在手勢裡」，對照組讀成沒有啞彈。
// ① 走一次真實流程（手動播放 1 分鐘 → 自己播完 → 自動開始偵測），看池裡有沒有啞彈
// ② 把池用到見底，看最後一顆會不會被擋——這就是真機上的那個簽名
const { openPage, loadTone, log, since, count, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__pl.html';
const IS_CTRL = /116/.test(PAGE);
const iosRule = () => {
  let gestureAt = -1e9;
  ['pointerdown', 'pointerup', 'click', 'keydown', 'change'].forEach(t => window.addEventListener(t, ev => {
    if (ev.isTrusted || t === 'change') gestureAt = performance.now();
  }, true));
  const inGesture = () => performance.now() - gestureAt < 1000;
  const blessed = new WeakMap();
  window.__blessed = el => blessed.get(el);
  const proto = HTMLMediaElement.prototype, realPlay = proto.play;
  proto.play = function () {
    const g = inGesture();
    if (!blessed.has(this)) blessed.set(this, g);           // 第一次播放決定它有沒有被「認可」
    if (!this.muted && !blessed.get(this)) {
      if (g) blessed.set(this, true);                        // 在手勢裡出聲也算認可
      else { const e = new Error('no gesture at first play'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    }
    return realPlay.call(this);
  };
};
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, iosRule]);
  await loadTone(page);
  await page.evaluate(() => { const k = document.getElementById('autoWatchCk'); if (!k.checked) k.click(); });
  const pool = () => page.evaluate(() => {
    const p = window.__pool().filter(e => !e._inUse);
    return { n: p.length, dud: p.filter(e => window.__blessed(e) === false).length };
  });

  // ① 真實流程：手動播放 1 分鐘，讓它自己播完，等自動開始偵測
  const b0 = await log(page);
  await page.click('#manualBtn'); await page.click('#manualOpts button[data-m="1"]');
  await page.waitForTimeout(1500);
  const p1 = await pool();
  for (let i = 0; i < 90 && !/開始監聽/.test(since(await log(page), b0)); i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(6000);
  const t0 = since(await log(page), b0);
  const autoStarted = /手動播放結束，依設定自動開始偵測/.test(t0) && /開始監聽/.test(t0);
  const p2 = await pool();
  console.log('① 手動播放剛按下：池', p1.n, '顆｜自動開始偵測 =', autoStarted, '｜之後池', p2.n, '顆，其中沒有手勢認可的 =', p2.dud,
    IS_CTRL ? (p2.dud ? '（對照組：自動開始偵測補了一顆啞彈）' : '⚠️ 對照組沒重現') : (p2.dud === 0 ? '✅ 沒有啞彈' : '❌'));
  const skip = pick(t0, /自動開始偵測：這一刻沒有使用者手勢/);
  if (!IS_CTRL) console.log('   紀錄有說明為什麼不補 =', !!skip, skip ? '✅' : '❌');

  // ② 把池用到見底（再多一次，確認換成熱身元素），看最後一顆會不會被擋
  const fire = async () => {
    await page.evaluate(() => window.__trigger('測試觸發', 'once'));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__stopAlert());
    await page.waitForTimeout(4500);
  };
  const b2 = await log(page);
  let guard = 0;
  while ((await pool()).n > 0 && guard++ < 8) await fire();
  await fire();
  const t2 = since(await log(page), b2);
  const blocked = count(t2, /播放被瀏覽器阻擋/);
  const lastPool = pick(t2.split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).reverse().join(''), /池餘 0/);
  console.log('② 池用到見底：被擋', blocked, '次', IS_CTRL ? (blocked ? '（對照組重現真機簽名：最後一顆被擋 → 熱身接手）' : '⚠️ 沒重現')
    : (blocked === 0 ? '✅ 最後一顆也照常出聲' : '❌'));
  if (lastPool) console.log('   ', lastPool.slice(0, 90));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
