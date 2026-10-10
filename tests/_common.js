// 探針共用：假麥克風、開頁、讀紀錄、取「某次之後新增的那段紀錄」。
// 紀錄是新到舊排的，所以增量＝「新紀錄裡，上一份開頭之前的那一段」。
// innerText 不保證每筆之間有換行，切行一律用時間戳。
const { chromium } = require('playwright-core');
const fakeMic = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
};
async function openPage(url, initScripts = [fakeMic], ctxOpts = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(ctxOpts);
  for (const s of initScripts) await ctx.addInitScript(s);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  return { browser, page, errors };
}
async function setKeep(page, on) {
  await page.evaluate(v => { const k = document.getElementById('keepCk'); if (k.checked !== v) k.click(); }, on);
}
async function loadTone(page) {
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
}
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);
// 沒有新紀錄時 indexOf 會是 0，那時增量是空的——第一版寫成 k > 0，沒有新東西時反而回傳整份紀錄，
// 「應該沒有警告」的檢查就會讀到舊的警告（watchbase 的對照組就這樣把①的那一行又讀了一次）。
const since = (after, before) => { if (!before) return after; const k = after.indexOf(before.slice(0, 60)); return k >= 0 ? after.slice(0, k) : after; };
const entries = t => t.split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).map(s => s.trim()).filter(Boolean);
const pick = (t, re) => entries(t).find(l => re.test(l)) || '';
const count = (t, re) => entries(t).filter(l => re.test(l)).length;
module.exports = { chromium, fakeMic, openPage, setKeep, loadTone, log, since, entries, pick, count };
