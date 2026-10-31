// v124：開始監聽時麥克風逾時，要自己再要——不能一次逾時就把按鈕交還、整頁停著不聽。
// 10/29 18:58:38 打開網頁、18:58:45 按開始監聽、18:58:55 逾時（那時連讀權限都還沒回來，
// 18:59:02 才讀到「允許」）。沒有人再按，網頁就這樣 38 分鐘沒在聽，19:37 重新整理才開始。
// 10/03 05:31、10/23 15:02 也是同一個樣子，全在頁面載入後幾秒內。
// ① 第一個請求掛著（Safari 剛打開還在忙）：自己再要一次就開始聽，不寫「無法開啟麥克風」
//    那個掛著的請求晚一點回來：要被放掉，只留監聽用的那一條
// ② 掛著三個：一路再要到第 4 次，紀錄寫三行重試、成功那行說出第幾次
// ③ 重試期間「停止」按得到；按下去就不再要，晚到的麥克風也被放掉、不會變成監聽
// ④ 重試時頁面在背景：不在背景空要，回到前景自動接著開始監聽
// ⑤ 重試期間按了手動播放：讓位，播完才開始監聽（播放中不開麥克風）
// ⑥ 被拒絕（不是逾時）：照舊立刻交還按鈕，不重試
const { openPage, setKeep, loadTone, log, since, entries, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const mic = () => {
  window.__hang = 0; window.__deny = false; window.__gumCalls = 0; window.__parked = [];
  const streams = [];
  navigator.mediaDevices.enumerateDevices = async () => [];
  let c = null, o = null;
  const make = () => { if (!c) { c = new AudioContext(); o = c.createOscillator(); o.start(); }
    const d = c.createMediaStreamDestination(); o.connect(d); streams.push(d.stream); return d.stream; };
  navigator.mediaDevices.getUserMedia = () => {
    window.__gumCalls++;
    if (window.__deny) return Promise.reject(new DOMException('拒絕', 'NotAllowedError'));
    if (window.__hang !== 0) { if (window.__hang > 0) window.__hang--; return new Promise(res => window.__parked.push(res)); } // -1＝全部掛著
    return Promise.resolve(make());
  };
  window.__flush = () => { const n = window.__parked.length; window.__parked.splice(0).forEach(res => res(make())); return n; };
  window.__live = () => streams.filter(s => s.getAudioTracks().some(t => t.readyState === 'live')).length;
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => window.__vis === 'hidden', configurable: true });
  window.__setVis = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
};
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(250); } return false; };
const until = async (page, fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(250); } return false; };
const ui = p => p.evaluate(() => ({ start: !document.getElementById('startBtn').disabled, stop: !document.getElementById('stopBtn').disabled,
  status: document.getElementById('statusText').innerText.replace(/\s+/g, ' '), running: window.__running(), live: window.__live(), calls: window.__gumCalls }));
const retries = t => entries(t).filter(l => /開始監聽：麥克風 \d+ 秒沒有回應/.test(l)).reverse();
const stopIfRunning = async page => { if ((await ui(page)).stop) { await page.click('#stopBtn'); await page.waitForTimeout(1200); } };

(async () => {
  const { browser, page, errors } = await openPage(PAGE, [mic]);
  await setKeep(page, false); await loadTone(page);

  // ① 第一個請求掛著
  let before = await log(page);
  await page.evaluate(() => { window.__hang = 1; });
  await page.click('#startBtn');
  await until(page, () => window.__running(), 12000);
  await page.waitForTimeout(500);
  let a = since(await log(page), before), s = await ui(page);
  const fail1 = pick(a, /無法開啟麥克風/), r1 = retries(a), ok1 = pick(a, /才拿到麥克風/);
  console.log('① 第一個請求掛著：自己開始監聽 =', s.running ? '✅' : '❌ 沒有（' + s.status.slice(0, 30) + '）',
    '｜沒寫「無法開啟麥克風」=', fail1 ? '❌ ' + fail1.slice(9, 40) : '✅');
  console.log('   重試那一行：', r1.length === 1 && /3 秒沒有回應，2 秒後自動再要一次（第 2 次）/.test(r1[0]) ? '✅ ' + r1[0].slice(9, 70) : '❌ ' + (r1[0] || '沒有').slice(0, 70));
  console.log('   成功那一行：', /第 2 次才拿到麥克風/.test(ok1) ? '✅ ' + ok1.slice(9, 60) : '❌ ' + (ok1 || '沒有').slice(0, 60));
  const flushed = await page.evaluate(() => window.__flush());
  await page.waitForTimeout(800);
  s = await ui(page);
  console.log('   掛著的 ' + flushed + ' 個晚到之後：開著的麥克風 =', s.live, s.live === 1 && s.running ? '✅ 只剩監聽用的那一條' : '❌');
  await stopIfRunning(page);

  // ② 掛著三個
  before = await log(page);
  await page.evaluate(() => { window.__hang = 3; });
  await page.click('#startBtn');
  await until(page, () => window.__running(), 30000);
  await page.waitForTimeout(500);
  a = since(await log(page), before); s = await ui(page);
  const r2 = retries(a), ok2 = pick(a, /才拿到麥克風/);
  console.log('② 掛著三個：開始監聽 =', s.running ? '✅' : '❌', '｜重試行數 =', r2.length, r2.length === 3 ? '✅' : '❌',
    '｜成功那一行說第 4 次 =', /第 4 次才拿到麥克風/.test(ok2) ? '✅' : '❌ ' + (ok2 || '沒有').slice(0, 50));
  await page.evaluate(() => window.__flush()); await page.waitForTimeout(500);
  await stopIfRunning(page);

  // ③ 重試期間按停止
  before = await log(page);
  await page.evaluate(() => { window.__hang = -1; });
  await page.click('#startBtn');
  await untilLine(page, before, /開始監聽：麥克風 \d+ 秒沒有回應/, 8000);
  s = await ui(page);
  console.log('③ 重試期間：「停止」按得到 =', s.stop ? '✅' : '❌', '｜畫面說「還沒開始聽」=', /還沒開始聽/.test(s.status) ? '✅' : '❌ ' + s.status.slice(0, 40));
  if (s.stop) await page.click('#stopBtn');
  await page.waitForTimeout(300);
  const c0 = (await ui(page)).calls;
  await page.waitForTimeout(8000);
  s = await ui(page);
  a = since(await log(page), before);
  const cancel = pick(a, /這次開始監聽取消/);
  console.log('   按下停止：紀錄', cancel ? '✅ ' + cancel.slice(9, 40) : '❌ 沒有', '｜之後 8 秒又要了', s.calls - c0, '次', s.calls === c0 ? '✅' : '❌',
    '｜按鈕交還 =', s.start && !s.stop ? '✅' : '❌');
  await page.evaluate(() => { window.__hang = 0; window.__flush(); });
  await page.waitForTimeout(1000);
  s = await ui(page);
  console.log('   晚到的麥克風：開著的 =', s.live, '｜開始監聽了 =', s.running, s.live === 0 && !s.running ? '✅ 都被放掉' : '❌');

  // ④ 重試時頁面在背景
  before = await log(page);
  await page.evaluate(() => { window.__hang = -1; });
  await page.click('#startBtn');
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__setVis('hidden'));
  await page.waitForTimeout(3500); // 第一次逾時落在背景
  const c1 = (await ui(page)).calls;
  await page.waitForTimeout(6000);
  s = await ui(page);
  a = since(await log(page), before);
  const bg = pick(a, /⏸ 開始監聽：/);
  console.log('④ 背景：', bg ? '✅ ' + bg.slice(9, 70) : '❌ 沒有那一行', '｜背景期間又要了', s.calls - c1, '次', s.calls === c1 ? '✅' : '❌');
  await page.evaluate(() => { window.__hang = 0; window.__flush(); });
  const b4 = await log(page);
  await page.evaluate(() => window.__setVis('visible'));
  await until(page, () => window.__running(), 8000);
  s = await ui(page);
  console.log('   回到前景：自動開始監聽 =', s.running ? '✅' : '❌', '｜紀錄 =', /回到前景，接續自動開始偵測/.test(since(await log(page), b4)) ? '✅' : '❌');
  await stopIfRunning(page);

  // ⑤ 重試期間按了手動播放
  before = await log(page);
  await page.evaluate(() => { window.__hang = -1; });
  await page.click('#startBtn');
  await untilLine(page, before, /開始監聽：麥克風 \d+ 秒沒有回應/, 8000);
  await page.click('#manualBtn'); await page.click('#manualOpts button[data-m="1"]');
  await page.waitForTimeout(1500);
  let bad = 0;
  for (let i = 0; i < 10; i++) { if (await page.evaluate(() => window.__alerting() && window.__live() > 0)) bad++; await page.waitForTimeout(200); }
  s = await ui(page);
  a = since(await log(page), before);
  console.log('⑤ 重試中手動播放：讓位 =', /開始監聽讓位給剛開始的播放/.test(a) ? '✅' : '❌', '｜播放中開著麥克風 =', bad, bad === 0 ? '✅' : '❌',
    '｜播放中「停止」關著 =', !s.stop ? '✅' : '❌');
  await page.evaluate(() => { window.__hang = 0; window.__flush(); });
  const b5 = await log(page);
  await page.click('#testBtn');
  await until(page, () => window.__running(), 8000);
  console.log('   播完：接著開始監聽 =', (await ui(page)).running && /接續剛才讓位的開始監聽/.test(since(await log(page), b5)) ? '✅' : '❌');
  await stopIfRunning(page);

  // ⑥ 被拒絕：不重試
  before = await log(page);
  const c6 = (await ui(page)).calls;
  await page.evaluate(() => { window.__deny = true; });
  await page.click('#startBtn');
  await page.waitForTimeout(4000);
  s = await ui(page);
  a = since(await log(page), before);
  console.log('⑥ 被拒絕：', /無法開啟麥克風（NotAllowedError）/.test(a) ? '✅ 照舊寫無法開啟' : '❌', '｜重試行數 =', retries(a).length,
    retries(a).length === 0 && s.calls - c6 === 1 ? '✅ 沒有重試' : '❌', '｜按鈕交還 =', s.start && !s.stop ? '✅' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
