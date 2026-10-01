// v115：藍牙斷線（播放被系統中途停掉）是只有使用者修得好的故障，卻只寫在紀錄裡。
// 09/25 08:11:47 系統停掉播放 → 狀態列寫了一句 → 40 秒後下一次警報就把它蓋掉 →
// 之後 5 次警報全從手機出來 → 使用者 09:18 才發現，畫面上 67 分鐘一個字都沒有。
//
// ① 系統中途停掉之後，畫面上要出現提示
// ② 之後再觸發兩次，提示要**還在**，而且數得出「之後已有 2 次警報」
// ③ 碰一下畫面 → 提示消失，紀錄留下「掛了多久、期間幾次」
// ④ 使用者自己按停止（有手勢）不可以出現這塊提示
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__rt.html';
const IS_CTRL = /114/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
};
const banner = p => p.evaluate(() => {
  const e = document.getElementById('routeWarn');
  return e ? { exists: true, shown: !e.hidden, text: e.innerText } : { exists: false, shown: false, text: '' };
});
const status = p => p.evaluate(() => (document.getElementById('statusSub') || document.getElementById('status') || {}).innerText || '');
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn'); await page.waitForTimeout(6000);

  const fire = async () => {
    await page.evaluate(() => { window.__noCool(); window.__trigger('測試觸發', 'once'); });
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__stopAlert());
    await page.waitForTimeout(4500);
  };

  // ① 系統中途停掉（模擬藍牙斷線）
  // 必須用會循環的時長：測試音檔只有 2 秒，'once' 在 3 秒時早就自己播完了，
  // alertPaused 看到 ended 會直接略過——第一版探針兩組都讀到 false 就是這個原因
  await page.evaluate(() => window.__trigger('測試觸發', '1'));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__sysPause());
  await page.waitForTimeout(1500);
  const b1 = await banner(page);
  const loggedIt = /播放被系統中斷（沒有手勢/.test(await log(page));
  console.log('① 紀錄寫了「播放被系統中斷」=', loggedIt, IS_CTRL ? (loggedIt ? '（對照組重現了，本次具鑑別力）' : '⚠️ 沒重現') : '');
  console.log('   畫面上有提示 =', b1.shown, IS_CTRL ? '（v114 對照組：沒有這塊提示）' : (b1.shown ? '✅' : '❌'));
  if (b1.shown) console.log('    ', b1.text.replace(/\s+/g, ' ').slice(0, 110));

  // ② 再觸發兩次——真機上 40 秒後的下一次警報就把狀態列蓋掉了
  await page.waitForTimeout(4000);
  await fire(); await fire();
  const b2 = await banner(page);
  const st2 = await status(page);
  console.log('② 再播 2 次之後：狀態列還提到中斷 =', /系統中斷/.test(st2), '（真機上就是這裡消失的）');
  console.log('   畫面提示還在 =', b2.shown, '｜數得出次數 =', /之後已有 2 次警報/.test(b2.text),
    IS_CTRL ? '（對照組：畫面上已經什麼都沒有）' : (b2.shown && /之後已有 2 次警報/.test(b2.text) ? '✅' : '❌'));

  // ③ 碰一下畫面 → 消失，並留下紀錄
  await page.mouse.click(5, 5); await page.waitForTimeout(800);
  const b3 = await banner(page);
  const ack = ((await log(page)).match(/🔧 已有人看到「播放被系統中斷」提示[^\n]*?）/) || [''])[0];
  if (!IS_CTRL) {
    console.log('③ 碰畫面後提示消失 =', !b3.shown, '｜紀錄留下持續時間與次數 =', /期間 2 次警報/.test(ack), (!b3.shown && /期間 2 次警報/.test(ack)) ? '✅' : '❌');
    if (ack) console.log('    ', ack.slice(0, 90));
  }

  // ④ 使用者自己停止（2 秒內有手勢）：不可以跳出這塊提示
  await page.evaluate(() => { window.__noCool(); window.__trigger('測試觸發', '1'); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__userPause());
  await page.waitForTimeout(1000);
  const b4 = await banner(page);
  const manualLogged = /手動停止播放/.test(await log(page));
  if (!IS_CTRL) console.log('④ 使用者自己停止：紀錄寫「手動停止」=', manualLogged, '｜誤跳提示 =', b4.shown,
    manualLogged && !b4.shown ? '✅ 沒有誤報' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
