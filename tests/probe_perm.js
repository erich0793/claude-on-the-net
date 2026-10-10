// v120：麥克風權限是「詢問」時要掛在畫面上。
// 10/10 使用者發現網站設定的麥克風是「詢問」——那天早上三次警報播完後都拿不回麥克風
// （88 分鐘、8 分鐘、又開始），兩次都是突然接回，像是有人去按了跳出視窗的「允許」。
// 使用說明早就寫著「麥克風 → 允許（必要！）」，但畫面上什麼都沒有。
// ① 載入時讀到「詢問」：紅框提示＋一行 ⚠️
// ② 開始監聽後讀成「允許」（按了跳出視窗的允許，是暫時的）：提示要留著，而且說明這是暫時的
// ③ 碰一下提示：消失
// ④ 早上那一幕：權限又變回「詢問」、警報播完拿不回麥克風——提示重新出現；
//    失敗那一行帶「權限 詢問」；畫面上的說明要叫人按「允許」
// ⑤ 有人按了允許：接回那一行帶「權限 允許」
// ⑥ 設定本來就是「允許」：沒有提示、沒有 ⚠️（不能每天誤報）
// ⑦ 讀不到權限（不支援這個 API）：什麼都不顯示，也不能出錯
const { openPage, setKeep, loadTone, log, since, pick } = require('./_common');
const BASE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
// 用網址參數決定假的權限狀態：prompt／granted／none（沒有這個 API）
const fake = () => {
  const mode = (/[?&]perm=(\w+)/.exec(location.search) || [])[1] || 'prompt';
  if (mode === 'none') Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
  else {
    let state = mode;
    const ps = new EventTarget();
    Object.defineProperty(ps, 'state', { get: () => state });
    window.__setPerm = s => { state = s; const ev = new Event('change'); ps.dispatchEvent(ev); if (typeof ps.onchange === 'function') ps.onchange(ev); };
    Object.defineProperty(navigator, 'permissions', { value: { query: async d => { if (!d || d.name !== 'microphone') throw new TypeError('unsupported'); return ps; } }, configurable: true });
  }
  // iOS 的樣子：等人按允許的時候，getUserMedia 不失敗、只懸著
  window.__micDown = false; window.__parked = [];
  navigator.mediaDevices.enumerateDevices = async () => [];
  let c = null, o = null;
  const make = () => { if (!c) { c = new AudioContext(); o = c.createOscillator(); o.start(); } const d = c.createMediaStreamDestination(); o.connect(d); return d.stream; };
  navigator.mediaDevices.getUserMedia = () => window.__micDown ? new Promise(res => window.__parked.push(res)) : Promise.resolve(make());
  window.__flush = () => { const n = window.__parked.length; window.__parked.splice(0).forEach(res => res(make())); return n; };
};
const banner = p => p.evaluate(() => { const e = document.getElementById('permWarn');
  return e ? { shown: !e.hidden, text: e.innerText.replace(/\s+/g, ' ') } : { shown: false, text: '（畫面上沒有這塊提示）' }; });
const sub = p => p.evaluate(() => document.getElementById('statusSub').innerText);
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(500); } return false; };

(async () => {
  // ①～⑤ 設定是「詢問」
  let { browser, page, errors } = await openPage(BASE + '?perm=prompt', [fake]);
  let b = await banner(page), l = await log(page);
  const w1 = pick(l, /麥克風權限：詢問（頁面載入）/);
  console.log('① 載入時讀到「詢問」：紅框 =', b.shown && /詢問/.test(b.text) ? '✅ ' + b.text.slice(0, 40) : '❌ ' + b.text.slice(0, 40),
    '｜紀錄 =', /⚠️/.test(w1) ? '✅' : '❌ 沒有那一行');

  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  let before = await log(page);
  await page.evaluate(() => window.__setPerm('granted')); // 按了跳出視窗的允許：暫時讀成允許
  await page.waitForTimeout(500);
  b = await banner(page);
  const g = pick(since(await log(page), before), /麥克風權限：允許/);
  console.log('② 暫時讀成「允許」：紅框還在 =', b.shown && /暫時/.test(b.text) ? '✅ 而且說明這是暫時的' : '❌', '｜紀錄 =', /暫時/.test(g) ? '✅ ' + g.slice(9, 60) : '❌ ' + g.slice(9, 60));

  await page.click('#permWarn').catch(() => {});
  await page.waitForTimeout(300);
  b = await banner(page);
  console.log('③ 碰一下提示：', !b.shown && !/沒有這塊/.test(b.text) ? '✅ 消失了' : '❌');

  before = await log(page);
  await page.evaluate(() => { window.__setPerm('prompt'); window.__micDown = true; window.__trigger('測試觸發', 'once'); });
  await untilLine(page, before, /音訊重建失敗/, 30000);
  b = await banner(page);
  const f = pick(since(await log(page), before), /音訊重建失敗/);
  console.log('④ 權限變回「詢問」、播完拿不回麥克風：紅框重新出現 =', b.shown ? '✅' : '❌');
  console.log('   失敗那一行：', f.slice(9, 110), /權限 詢問/.test(f) ? '✅' : '❌');
  // 重試期間每 0.5 秒看一次畫面，說明不可以有空白的時候
  await untilLine(page, before, /麥克風中斷且無法自動恢復/, 30000);
  let blank = 0, seen = '';
  for (let i = 0; i < 16; i++) { const t = await sub(page); if (!/按「允許」/.test(t)) blank++; else seen = t; await page.waitForTimeout(500); }
  console.log('   重試期間畫面的說明：', seen.slice(0, 40), blank === 0 && seen ? '✅ 一直叫人去按允許' : '❌ 有 ' + blank + '/16 次沒有');

  before = await log(page);
  await page.evaluate(() => { window.__setPerm('granted'); window.__micDown = false; window.__flush(); });
  await untilLine(page, before, /麥克風已接回/, 30000);
  const back = pick(since(await log(page), before), /麥克風已接回/);
  console.log('⑤ 有人按了允許：', back.slice(9, 70) + '…', /權限 允許/.test(back) ? '✅ 帶著「權限 允許」' : '❌');
  const err1 = errors.slice();
  await browser.close();

  // ⑥ 設定本來就是「允許」
  ({ browser, page, errors } = await openPage(BASE + '?perm=granted', [fake]));
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  b = await banner(page); l = await log(page);
  const ok6 = !b.shown && /🔧 麥克風權限：允許（頁面載入）/.test(l) && !/⚠️ 麥克風權限/.test(l);
  console.log('⑥ 設定是「允許」：紅框 =', b.shown, '｜紀錄只有一行 🔧、沒有 ⚠️ =', ok6 ? '✅' : '❌');
  const err2 = errors.slice();
  await browser.close();

  // ⑦ 讀不到權限
  ({ browser, page, errors } = await openPage(BASE + '?perm=none', [fake]));
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  b = await banner(page); l = await log(page);
  const ok7 = !b.shown && !/麥克風權限/.test(l) && /開始監聽/.test(l);
  console.log('⑦ 讀不到權限：紅框 =', b.shown, '｜沒有權限那一行、照常開始監聽 =', ok7 ? '✅' : '❌');
  const all = err1.concat(err2, errors);
  console.log('errors:', all.length ? all.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
