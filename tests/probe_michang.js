// v119：播完音樂後拿不回麥克風時，把系統當下的狀態記下來。
// 10/10 早上三次警報結束後的深度重置全都拿不回麥克風（08:12→09:40 整整 88 分鐘、
// 09:44→09:52 8 分鐘、11:12 又開始），11:09 那次還從手機播出來。09/09 晚上也發生過，
// 兩次都查不出原因——紀錄裡只有「逾時」兩個字。這支探針檢查新加的證據有沒有寫出來：
// ⓪ 頁面載入那一行帶著 Safari 版本（兩次之間有沒有更新系統，是第一個要排除的變因）
// ① 重建失敗、重連失敗那幾行帶著狀態：引擎狀態、還掛著幾個請求（卡住時這個數字會一路往上加）
// ② 麥克風拿不回來時，保連脈衝那一行不可以再寫「麥克風例行離線約 6 秒」（那是舊數字）
// ③ 掛著的請求後來一起回來：接回那一行要說出「逾時後才回應 N 個」
// ④ 掛著的請求永遠不回來：接回那一行要說出還掛著幾個，下一次觸發的那一行也要標出來
// ⑤ 都回來之後，觸發那一行就不再多寫任何字
const { openPage, setKeep, loadTone, log, since, entries, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15';
// iOS 的樣子：麥克風拿不到時 getUserMedia 不失敗，只懸著。懸著的請求先收起來，之後可以一起放回來
const mic = () => {
  window.__micDown = false; window.__parked = [];
  navigator.mediaDevices.enumerateDevices = async () => [];
  let c = null, o = null;
  const make = () => {
    if (!c) { c = new AudioContext(); o = c.createOscillator(); o.start(); }
    const d = c.createMediaStreamDestination(); o.connect(d); return d.stream;
  };
  navigator.mediaDevices.getUserMedia = () => {
    if (window.__micDown) return new Promise(res => window.__parked.push(res));
    return Promise.resolve(make());
  };
  window.__flush = () => { const n = window.__parked.length; window.__parked.splice(0).forEach(res => res(make())); return n; };
};
const until = async (page, fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(500); } return false; };
const fails = t => entries(t).filter(l => /麥克風中斷且無法自動恢復/.test(l)).reverse(); // 舊到新
// 等「before 之後」出現某一行。要在這邊比對增量，不能在頁面裡看最上面幾行——
// 上一段的「已接回」還在最上面時會直接誤判成功（第一版就這樣讓 ④ 讀到空字串）
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(500); } return false; };

(async () => {
  const { browser, page, errors } = await openPage(PAGE, [mic], { userAgent: UA });
  const load = pick(await log(page), /📄 頁面載入/);
  console.log('⓪ 頁面載入：', load.slice(9, 60), /Safari 26\.0\.1/.test(load) ? '✅ 帶著 Safari 版本' : '❌ 沒有 Safari 版本');
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn');
  await until(page, () => window.__pulseN() >= 1, 30000);
  await page.waitForTimeout(7000); // 讓這一次脈衝收尾、麥克風接回

  // ①② 警報播完 → 深度重置 → 請求懸著
  let before = await log(page);
  await page.evaluate(() => { window.__micDown = true; window.__trigger('測試觸發', 'once'); });
  await until(page, () => (document.getElementById('logBox').innerText.match(/麥克風中斷且無法自動恢復/g) || []).length >= 3 && !window.__recovering(), 60000);
  await page.waitForTimeout(12000); // 退避期間讓保連脈衝送出去
  let a = since(await log(page), before);
  const rf = pick(a, /音訊重建失敗/);
  console.log('① 重建失敗那一行：', rf.slice(9, 120));
  console.log('   帶著引擎狀態與掛著的請求數 =', /引擎 \w+/.test(rf) && /未回應請求 1/.test(rf) ? '✅' : '❌');
  const nums = fails(a).map(l => +((/未回應請求 (\d+)/.exec(l) || [])[1] || 0));
  const grows = nums.length >= 3 && nums.every((n, i) => i === 0 || n > nums[i - 1]) && nums[0] >= 2;
  console.log('   重連失敗那幾行的「未回應請求」=', nums.join(' → ') || '（沒有數字）', grows ? '✅ 一路往上加，看得出請求在累積' : '❌');
  const pl = entries(a).filter(l => /保連脈衝 #\d+ 已送出/.test(l));
  const honest = pl.length && pl.every(l => /仍拿不回來/.test(l) && !/例行離線/.test(l));
  console.log('② 斷線期間的保連脈衝那一行 =', pl.length ? pl[0].slice(9, 100) : '（這段沒有被記錄的脈衝）', honest ? '✅ 沒有再寫舊的「例行離線」' : '❌');

  // ③ 懸著的請求一起回來
  before = await log(page);
  const flushed = await page.evaluate(() => { window.__micDown = false; return window.__flush(); });
  await untilLine(page, before, /麥克風已接回/, 60000);
  const back = pick(since(await log(page), before), /麥克風已接回/);
  console.log('③ 懸著的 ' + flushed + ' 個請求一起回來後，接回那一行：', back.slice(9, 160));
  const okBack = new RegExp('逾時後才回應 ' + flushed + ' 個（成功 ' + flushed).test(back) && /未回應請求 0/.test(back);
  console.log('   說出「逾時後才回應 ' + flushed + ' 個」而且已經沒有掛著的 =', okBack ? '✅' : '❌');

  // ④ 懸著的請求永遠不回來
  await page.waitForTimeout(12000);
  before = await log(page);
  await page.evaluate(() => { window.__micDown = true; window.__killMic(); });
  await until(page, () => window.__parked.length >= 3 && !window.__recovering(), 60000);
  const stuck = await page.evaluate(() => { window.__micDown = false; return window.__parked.length; });
  await untilLine(page, before, /麥克風已接回/, 60000);
  const back2 = pick(since(await log(page), before), /麥克風已接回/);
  console.log('④ ' + stuck + ' 個請求永遠不回來，接回那一行：', back2.slice(9, 160));
  console.log('   說出還掛著 ' + stuck + ' 個 =', new RegExp('未回應請求 ' + stuck).test(back2) ? '✅' : '❌');
  await page.waitForTimeout(4000);
  before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await page.waitForTimeout(1500);
  const trig = pick(since(await log(page), before), /🔊 觸發播放/);
  console.log('   接著觸發：', trig.slice(9, 160));
  console.log('   觸發那一行標出「麥克風還有 ' + stuck + ' 個請求沒回應」=', new RegExp('麥克風還有 ' + stuck + ' 個請求沒回應').test(trig) ? '✅' : '❌');

  // ⑤ 都回來之後
  await page.waitForTimeout(12000); // 警報結束、深度重置、接回
  await page.evaluate(() => window.__flush());
  await page.waitForTimeout(3000);
  before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await page.waitForTimeout(1500);
  const trig2 = pick(since(await log(page), before), /🔊 觸發播放/);
  console.log('⑤ 都回來之後觸發：', trig2.slice(9, 120), trig2 && !/⚠️/.test(trig2) ? '✅ 沒有多寫任何字' : '❌');
  await page.waitForTimeout(8000);
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
