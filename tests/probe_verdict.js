// v113：v109 那個實驗（延遲重試同一顆）09/19 20:50 終於送回第一筆資料，
// 而紀錄沒有把答案說出來——我得把六行 ⚠️／↻ 手工排成時間軸才看得出
// 「同一顆連擋 3 次、換一顆立刻成功 ⇒ 擋的是元素、不是時刻」。
//
// 順帶修掉 v109 那一行的判斷式：原本只看 `sameTry && 不是熱身`，
// 池裡還有貨的時候，鏈上的**下一顆處女元素**也滿足這兩個條件，
// 於是會印出「同一顆元素延遲重試後成功」——而成功的根本是另一顆。
//
// ① 池已空（重現 09/19 那一次）：熱身元素接手成功 → 要有 🔬 實驗結論
// ② 池還有貨：下一顆處女元素接手成功 → 對照組會印出**不實**的「同一顆…成功」，
//    實驗組要改印 🔬 實驗結論，而且不可以再宣稱是同一顆
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__pl.html';
const IS_CTRL = /112/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
  // 只擋非靜音的播放：保連／保鮮那些靜音小動作不是這次要測的東西
  window.__blockN = 0;
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__blockN > 0 && !this.muted) {
      window.__blockN--;
      const e = new Error('blocked'); e.name = 'NotAllowedError';
      return Promise.reject(e);
    }
    return realPlay.call(this);
  };
};
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);
// 清 innerHTML 沒有用：logEvent 會把整個 logArr 重畫一次，舊行馬上回來。
// 第一版就是這樣讀到一個假的 false（②「接手的是下一顆處女元素」讀到了①留下的
// 「改由熱身元素播放」）。改成拿「這次之後新增的那一段」：紀錄是新到舊排的，
// 新的一定在最前面，所以切到上一份的開頭為止就是增量。
const newPart = (after, before) => {
  const k = before ? after.indexOf(before.slice(0, 60)) : -1;
  return k >= 0 ? after.slice(0, k) : after;
};
// innerText 有時不會在每筆之間給換行，不能靠 split('\n') 切行——用時間戳當分隔
const pick = (t, re) => (t.split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).find(l => re.test(l)) || '').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.grantPermissions(['microphone']); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn'); await page.waitForTimeout(6000);

  const fire = async () => {
    await page.evaluate(() => window.__trigger('測試觸發', 'once'));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__stopAlert());
    await page.waitForTimeout(4500);
  };
  const drainTo = async n => { while (await page.evaluate(() => window.__poolOK()) > n) await fire(); };

  // ① 重現 09/19 20:50：池抽乾、那一顆連擋 3 次、熱身元素接手
  await drainTo(1);
  const b1 = await log(page);
  await page.evaluate(() => { window.__blockN = 3; });
  await fire();
  const t1 = newPart(await log(page), b1);
  const warmTook = /這一次改由熱身元素播放/.test(t1);
  const v1 = pick(t1, /🔬 實驗結論/);
  console.log('① 重現「連擋 3 次 → 熱身元素接手」=', warmTook,
    IS_CTRL ? (warmTook ? '（對照組重現了，本次測試具鑑別力）' : '⚠️ 對照組沒重現，不具鑑別力') : '');
  console.log('   有寫出實驗結論 =', !!v1,
    IS_CTRL ? (v1 ? '⚠️ 對照組不該有' : '（v112 對照組：答案要自己把六行排成時間軸）')
            : (v1 && /那一顆元素/.test(v1) && /熱身/.test(v1) ? '✅' : '❌'));
  if (v1) console.log('   ', v1.slice(0, 190));

  // ② 池裡還有貨：下一顆**處女**元素接手成功
  await page.mouse.click(10, 10); await page.waitForTimeout(6000); // 碰畫面補滿池
  await drainTo(2);
  const b2 = await log(page);
  await page.evaluate(() => { window.__blockN = 3; });
  await fire();
  const t2 = newPart(await log(page), b2);
  const nextVirgin = /改用下一顆元素重試（元素#\d+ 解鎖/.test(t2) && !/這一次改由熱身元素播放/.test(t2);
  const falseSame = /同一顆元素延遲重試後成功/.test(t2);
  const v2 = pick(t2, /🔬 實驗結論/);
  console.log('② 接手的是下一顆處女元素 =', nextVirgin);
  console.log('   印出「同一顆…延遲重試後成功」=', falseSame,
    IS_CTRL ? '（對照組：不實——成功的是另一顆元素）' : (falseSame ? '❌ 還在說謊' : '✅ 不再誤稱同一顆'));
  console.log('   改印實驗結論 =', !!v2,
    IS_CTRL ? '' : (v2 && /同樣是處女元素/.test(v2) ? '✅ 而且說得出接手的也是處女元素' : '❌'));
  if (v2) console.log('   ', v2.slice(0, 190));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
