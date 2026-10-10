// v112：「每小時上限」那一行原本寫「看上面幾行的『明顯%』就分得出來」——
// 但診斷行是**第一批**被裁掉的，而上限那行帶 🔧 屬於最後一批。
// 09/18 那份 800 筆的紀錄：8 行上限訊息全在，0 行診斷。
// 它叫你去看的東西，每一次都已經被刪掉了。
//
// ① 上限那一行要自己帶著數字（中位數／最高／最大峰值）
// ② 診斷行全被裁掉之後，那些數字仍然查得到 ← 這才是重點
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__dg.html';
const IS_CTRL = /111/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
  // 造一個「安靜的房間裡每 5 幀有一聲」的訊號：背景約 -80dB，那一聲 -6dB。
  // 全程都在 ±1 以內，所以不會順便觸發 v111 的爆表欄位，兩件事不會混在一起。
  let n = 0;
  AnalyserNode.prototype.getFloatTimeDomainData = function (arr) {
    arr.fill(1e-4);
    if (++n % 5 === 0) arr.fill(0.5);
  };
};
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.grantPermissions(['microphone']); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn'); await page.waitForTimeout(20000); // 3 行診斷 ＋ 上限那一行

  const t1 = await log(page);
  const capLine = t1.split('\n').find(l => /診斷已達每小時上限/.test(l)) || '';
  const diagN1 = t1.split('\n').filter(l => /診斷：/.test(l)).length;
  const hasNums = /中位數 \d+%/.test(capLine) && /最高 \d+%/.test(capLine) && /最大峰值 -?\d+dB/.test(capLine);
  console.log('① 上限那一行出現了 =', !!capLine, '｜當下還看得到的診斷行 =', diagN1);
  console.log('   自己帶著數字 =', hasNums,
    IS_CTRL ? (hasNums ? '⚠️ 對照組不該有' : '（v111 對照組：只叫你「看上面幾行」）') : (hasNums ? '✅' : '❌'));
  if (capLine) console.log('   ', capLine.trim().slice(0, 170));

  // ② 真正的考驗：把紀錄灌爆，讓診斷行被裁光，再看那些數字還在不在
  // 填充行要用**非重要**的那一種（「警報結束」不在 IMPORTANT_RE 裡）。
  // 先前用 🔊 灌 25 行，結果把 12 行的紀錄整個推爆、連保底都動用了，
  // 連上限那一行自己都被裁掉——那是探針灌太兇，不是產品的行為。
  // 用非重要行就只會依序吃掉「診斷」與填充本身，重要行永遠輪不到。
  await page.evaluate(() => { for (let i = 1; i <= 20; i++) window.__log('警報結束，回到監聽（填充 #' + i + '）'); });
  const t2 = await log(page);
  const diagN2 = t2.split('\n').filter(l => /診斷：/.test(l)).length;
  const capAfter = t2.split('\n').find(l => /診斷已達每小時上限/.test(l)) || '';
  const numsAfter = /中位數 \d+%/.test(capAfter) && /最大峰值 -?\d+dB/.test(capAfter);
  console.log('② 灌爆紀錄後，診斷行剩 =', diagN2, '行（應為 0，它是最先被裁的一層）');
  console.log('   上限那一行還在 =', !!capAfter, '｜數字還查得到 =', numsAfter,
    IS_CTRL ? (capAfter ? '（對照組：訊息還在，但它指的東西沒了——這正是缺陷）' : '')
            : (diagN2 === 0 && numsAfter ? '✅ 訊息比它指的資料活得久，而且自帶證據' : '❌'));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
