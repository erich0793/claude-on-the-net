// v116：長時間播放剛結束，看門狗喊「音響已 N 分鐘沒有收到任何聲音」——那是假警報。
// lastRealAudioAt 只在播放**開始**時記一次，於是一段 30 分鐘的手動播放一結束，
// 算出來的「安靜時間」就是 30 分鐘。真機：09/25 13:08（播 10 分鐘）、09/27 13:43（播 30 分鐘），
// 兩次都在播完的那一刻喊，而且同一行還寫著「保連脈衝最近一次被『播放中』擋住」——自相矛盾。
//
// ① 播一段超過門檻（50 秒）的音樂，結束後不可以喊「沒收到任何聲音」
// ② 真的沒聲音的時候（播放被擋到只剩嗶聲）仍然要算安靜——由 probe_watchbase 守著另一半
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__dy.html';
const IS_CTRL = /115/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
};
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);
const pick = (t, re) => (t.split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).find(l => re.test(l)) || '').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.evaluate(() => { const k = document.getElementById('keepCk'); if (!k.checked) k.click(); });
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn');
  await page.waitForTimeout(25000);  // 讓第一次脈衝跑掉

  // ① 播 70 秒（門檻是 50 秒）——測試音檔 2 秒，用會循環的時長。
  // 選 3 分鐘、70 秒時自己停：第一版用 '1'，警報在 60 秒自己結束、看門狗幾秒內就喊了，
  // 而「之前」的快照是 70 秒才拍——假警報落在快照裡、被當成舊紀錄扣掉，對照組讀成 false。
  // 快照要在觸發**之前**拍。
  const before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', '3'));
  await page.waitForTimeout(70000);
  await page.evaluate(() => window.__stopAlert());
  await page.waitForTimeout(12000);  // 看門狗 3 秒一輪，足夠跑好幾輪；下一次脈衝可能還沒到
  const after = await log(page);
  const k = after.indexOf(before.slice(0, 60));
  const fresh = k >= 0 ? after.slice(0, k) : after;
  const warn = pick(fresh, /沒有收到任何聲音/);
  console.log('① 播了 70 秒、剛播完：有沒有喊「沒收到任何聲音」=', !!warn,
    IS_CTRL ? (warn ? '（對照組重現了真機的假警報）' : '⚠️ 對照組沒重現，不具鑑別力')
            : (warn ? '❌ 還在喊' : '✅ 沒有假警報'));
  if (warn) console.log('    ', warn.slice(0, 120));

  // ② 另一半：音響**真的**沒聲音時仍然要喊。把保連脈衝卡在「音訊重置中」，等超過門檻
  //（播完那一刻起算 50 秒）——修好假警報不能順便把真警報也修掉。
  const before2 = await log(page);
  await page.evaluate(() => window.__stickReset(true));
  await page.waitForTimeout(62000);
  await page.evaluate(() => window.__stickReset(false));
  const after2 = await log(page);
  const k2 = after2.indexOf(before2.slice(0, 60));
  const warn2 = pick(k2 >= 0 ? after2.slice(0, k2) : after2, /沒有收到任何聲音/);
  console.log('② 脈衝真的被卡住 60 秒：仍然會喊 =', !!warn2, '｜有指名「音訊重置中」=', /音訊重置中/.test(warn2),
    IS_CTRL ? ''
            : (warn2 && /音訊重置中/.test(warn2) ? '✅ 真警報照樣會響' : '❌'));
  if (warn2) console.log('    ', warn2.slice(0, 120));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
