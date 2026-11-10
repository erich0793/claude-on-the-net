// v128：保連脈衝時（麥克風關著）順便量一下輸出取樣率，寫進紀錄——喇叭大約幾點斷的。
// 11/10 兩次紅框，使用者當場回報藍牙都顯示「未連線」（喇叭自己斷的）。可是重建只發生在播完音樂之後，
// 斷線時刻只框得出兩次警報之間（66、111 分鐘的空窗），分不出是自動關機還是播到一半斷的。
// 同一版：回答紅框之後要說清楚「不用再按別的、不要按停止」——使用者兩次回答完都按了停止（以為要按才會回報），
// 11/11 00:11 那一次半夜就停止監聽了。
// ① 喇叭一直在（44100）：脈衝照跑，不寫 🔬
// ② 兩次警報之間變成 48000：下一次脈衝就寫一行（說出前一次是 44100、距上次音樂多久）；紅框照舊不掛（只寫紀錄）
// ③ 變回 44100：下一次脈衝寫「可能接回來了」
// ④ 重建時是 48000（紅框掛上）之後，脈衝量到的也是 48000：不重複寫
// ⑤ 脈衝照常把麥克風拿回來
// ⑥ 回答紅框：說出「已經寫進紀錄」「不要按停止」
const { openPage, setKeep, loadTone, log, since, entries, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const rate = () => {
  window.__rate = 44100;
  const Orig = window.AudioContext;
  window.AudioContext = function (opts) { return new Orig(Object.assign({}, opts || {}, { sampleRate: window.__rate })); };
  window.AudioContext.prototype = Orig.prototype;
};
const pl = t => entries(t).filter(l => /🔬 保連脈衝時量到的輸出取樣率/.test(l)).reverse();
const until = async (page, fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(300); } return false; };
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(300); } return false; };
const pulses = async (page, k) => { const n0 = await page.evaluate(() => window.__pulseN());
  const t = Date.now(); while (Date.now() - t < 40000 && (await page.evaluate(() => window.__pulseN())) < n0 + k) await page.waitForTimeout(500);
  await page.waitForTimeout(6500); }; // 等最後一次脈衝收尾（量測在收尾時）
const banner = p => p.evaluate(() => { const e = document.getElementById('rateWarn'); return e ? { shown: !e.hidden, text: e.innerText.replace(/\s+/g, ' ') } : { shown: false, text: '' }; });
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, rate]);
  await setKeep(page, true); await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(3000);
  // 先有一次重建，讓網頁知道「喇叭是 44100」
  let before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await untilLine(page, before, /音訊已重建，恢復監聽/, 20000); await page.waitForTimeout(500);

  before = await log(page);
  await pulses(page, 2);
  let a = since(await log(page), before);
  console.log('① 一直是 44100（2 次脈衝）：🔬 脈衝行 =', pl(a).length, pl(a).length === 0 ? '✅ 不寫' : '❌');

  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await pulses(page, 1);
  a = since(await log(page), before);
  let p = pl(a), b = await banner(page);
  console.log('② 兩次警報之間變成 48000：', p.length === 1 && /48000Hz（前一次量到 44100Hz，距上次音樂/.test(p[0]) && /斷線/.test(p[0]) ? '✅ ' + p[0].slice(9, 70) : '❌ ' + (p[0] || '沒寫').slice(0, 70));
  console.log('   紅框照舊不掛（只寫紀錄）=', !b.shown ? '✅' : '❌');

  before = await log(page);
  await page.evaluate(() => { window.__rate = 44100; });
  await pulses(page, 1);
  p = pl(since(await log(page), before));
  console.log('③ 變回 44100：', p.length === 1 && /44100Hz（前一次量到 48000Hz/.test(p[0]) && /接回來/.test(p[0]) ? '✅ ' + p[0].slice(9, 60) : '❌ ' + (p[0] || '沒寫').slice(0, 60));

  // ④ 重建時是 48000 → 紅框；之後脈衝也是 48000：不重複寫
  await page.evaluate(() => { window.__rate = 48000; });
  before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await untilLine(page, before, /音訊已重建，恢復監聽/, 20000); await page.waitForTimeout(500);
  b = await banner(page);
  before = await log(page);
  await pulses(page, 2);
  p = pl(since(await log(page), before));
  console.log('④ 重建 48000：紅框 =', b.shown ? '✅' : '❌', '｜之後脈衝也是 48000：不重複寫 =', p.length === 0 ? '✅' : '❌ ' + p.length + ' 行');

  // ⑤ 脈衝照常把麥克風拿回來
  const n5 = await page.evaluate(() => window.__pulseN());
  const live = await page.evaluate(() => !window.__recovering() && window.__running());
  console.log('⑤ 脈衝照跑（#' + n5 + '）、麥克風拿回來、仍在監聽 =', n5 >= 6 && live ? '✅' : '❌');

  // ⑥ 回答紅框
  if (await page.$('#rateWarn [data-bt="off"]')) await page.click('#rateWarn [data-bt="off"]');
  await page.waitForTimeout(300);
  b = await banner(page);
  console.log('⑥ 回答之後：說出「已經寫進紀錄」=', /已經寫進紀錄/.test(b.text) ? '✅' : '❌', '｜說出「不要按「停止」」=', /不要按「停止」/.test(b.text) ? '✅' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
