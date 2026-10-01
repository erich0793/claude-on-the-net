// v108：麥克風長時間拿不回來（iOS 的 getUserMedia 不會失敗，只會一直懸著）。
// 09/09 實測：重連迴圈每 12 秒裡有 10 秒鎖著 recovering → 保連脈衝幾乎必然撞上被擋 →
// 整晚「音響沒收到聲音」；同時紀錄被重連失敗洗版；接回來時還被寫成「播放期間離線」。
// 斷線 90 秒（逾時 3 秒、脈衝 10 秒一次）：
// ① 失敗訊息要節流（前 3 次＋每 10 次），但嘗試本身不能停
// ② recovering 不可以獨佔：保連脈衝在斷線期間仍送得出去
// ③ 接回來要有一行講出真實長度，而且不能說成「播放期間離線」
const { openPage, setKeep, loadTone, log, since, count, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const mic = () => {
  window.__micDown = false; window.__gumCalls = 0;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    window.__gumCalls++;
    if (window.__micDown) return new Promise(() => {}); // iOS：不失敗，只懸著
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
};
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [mic]);
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(15000);
  console.log('斷線 90 秒（逾時已縮成 3 秒，脈衝 10 秒一次）');
  const before = await log(page);
  const p0 = await page.evaluate(() => window.__pulseN());
  const g0 = await page.evaluate(() => { window.__micDown = true; window.__killMic(); return window.__gumCalls; });
  let busy = 0, samples = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) { busy += await page.evaluate(() => window.__recovering() ? 1 : 0); samples++; await page.waitForTimeout(200); }
  const tries = await page.evaluate(() => window.__gumCalls) - g0;
  const pulses = await page.evaluate(() => window.__pulseN()) - p0;
  const mid = since(await log(page), before);
  const failLines = count(mid, /麥克風中斷且無法自動恢復/);
  console.log('① 失敗訊息行數 =', failLines, failLines <= 5 ? '✅ 已節流' : '❌ 洗版', '｜實際嘗試次數 =', tries, tries >= 6 ? '' : '❌ 嘗試太少');
  const occ = Math.round(busy / samples * 100);
  console.log('② recovering 佔用率 =', occ + '%', '｜這段期間送出的保連脈衝 =', pulses, occ < 60 && pulses >= 3 ? '✅ 讓出了空檔' : '❌');
  await page.evaluate(() => { window.__micDown = false; });
  await page.waitForTimeout(75000); // 退避期最長 60 秒，再加一次逾時
  const end = since(await log(page), before);
  const back = pick(end, /麥克風已接回/);
  const lied = /播放期間離線/.test(end);
  console.log('③ 麥克風接回 =', !!back, '｜有留下「已接回」那一行 =', /先前連續 \d+ 次重連失敗/.test(back), '｜有沒有謊稱是播放期間離線 =', lied,
    back && !lied ? '✅' : '❌');
  if (back) console.log('   ', back.slice(0, 100));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
