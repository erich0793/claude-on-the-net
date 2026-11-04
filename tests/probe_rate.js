// v122：深度重置時的取樣率變了，要寫一行 🔬。v123：換成 48000 時掛到畫面上。
// 那一刻麥克風是關的，新引擎的取樣率應是「當下輸出裝置」的硬體取樣率。10/22～10/27 的 74 次重建裡
// 73 次是 44100，只有 10/27 14:46:40 是 48000——使用者事後確認：從那一輪起喇叭和手機都完全沒聲音，
// 一直到 16:30 重新整理網頁才好。（用包一層的 AudioContext 控制取樣率）
// ① 同一次監聽裡一直是 44100：不寫、不掛
// ② 變成 48000：寫一行，並掛上紅框（說出從幾變成幾）；之後的警報要算進去
// ③ 變回 44100：寫一行，紅框自動收起
// ④ 紅框裡的「🔈 重新取得喇叭」按得到（按它不會把紅框收掉），重建之後回到 44100 就自動收起
// v126：紅框要掛到聲音回到喇叭為止。11/04 19:47:06 使用者第一次碰畫面紅框就消失了（連同 v125 要他按的那顆按鈕），
// 之後重新整理三次，網頁就忘了聲音不在喇叭；11/01～11/02 整次監聽 51 次重建都是 48000（前一晚就是了），一次提示都沒有。
// ⑤ 碰畫面其他地方：紅框留著，只記一次「已有人看到」（碰第二下不再記）
// ⑥ 停止再開始監聽：記憶接續——開始監聽後先不掛（還沒重建過），第一次重建仍是 48000 就掛回來；之後換回 44100 自動收起
// ⑦ 重新整理網頁：一樣接續；「✓ 聲音是從喇叭出來的」收起紅框，之後 48000 不再示警，48000→44100 只寫紀錄不示警
// ⑧ 上一次監聽最後是 44100、這一次第一次重建就是 48000：也要示警（以前沒有東西可比）
// ⑨ 重新整理之後第一次重建就回到 44100：自動收起，紀錄說出中間重新整理過
const { openPage, loadTone, log, since, entries, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const rate = () => {
  window.__rate = 44100;
  const Orig = window.AudioContext;
  window.AudioContext = function (opts) { return new Orig(Object.assign({}, opts || {}, { sampleRate: window.__rate })); };
  window.AudioContext.prototype = Orig.prototype;
};
const notes = t => entries(t).filter(l => /🔬 這次重建的取樣率/.test(l)).reverse();
const banner = p => p.evaluate(() => { const e = document.getElementById('rateWarn');
  return e ? { shown: !e.hidden, text: e.innerText.replace(/\s+/g, ' ') } : { shown: false, text: '（畫面上沒有這塊提示）', missing: true }; });
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(300); } return false; };
const alertOnce = async page => { const b = await log(page); await page.evaluate(() => window.__trigger('測試觸發', 'once')); await untilLine(page, b, /音訊已重建，恢復監聽/, 20000); await page.waitForTimeout(500); };
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, rate]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  let before = await log(page);
  await alertOnce(page); await alertOnce(page);
  let n = notes(since(await log(page), before)), b = await banner(page);
  console.log('① 一直是 44100（2 次重建）：🔬 行數 =', n.length, '｜紅框 =', b.shown, n.length === 0 && !b.shown ? '✅ 不寫不掛' : '❌');

  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  n = notes(since(await log(page), before)); b = await banner(page);
  console.log('② 變成 48000：', n.length === 1 && /48000Hz，前 2 次都是 44100Hz/.test(n[0]) ? '✅ ' + n[0].slice(9, 50) : '❌ ' + (n[0] || '沒寫').slice(0, 50));
  console.log('   紅框 =', b.shown && /裝置換了/.test(b.text) && /44100 變成 48000/.test(b.text) ? '✅ ' + b.text.slice(0, 44) : '❌ ' + b.text.slice(0, 44));
  // v125：10/31 那次是「改從手機出來」，舊說明只寫「還是沒聲音就按」——有聲音時照字面讀不知道該不該按。
  // 分岔點是藍牙設定裡那台喇叭「已連線／未連線」，兩種都要說到
  console.log('   處置先看藍牙設定（「未連線」「已連線」分開說）=', /設定 → 藍牙/.test(b.text) && /未連線/.test(b.text) && /已連線/.test(b.text) ? '✅' : '❌');
  await alertOnce(page);
  b = await banner(page);
  console.log('   接著又一次警報：紅框算進去 =', /之後已有 1 次警報/.test(b.text) ? '✅' : '❌ ' + b.text.slice(0, 80));

  before = await log(page);
  await page.evaluate(() => { window.__rate = 44100; });
  await alertOnce(page);
  n = notes(since(await log(page), before)); b = await banner(page);
  const back = pick(since(await log(page), before), /輸出裝置換回來了/);
  console.log('③ 變回 44100：🔬', n.length === 1 ? '✅' : '❌', '｜紅框自動收起 =', !b.shown && !b.missing ? '✅' : '❌', '｜紀錄', back ? '✅ ' + back.slice(9, 50) : '❌');

  // ④ 紅框裡的按鈕
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  await page.waitForTimeout(2500);
  b = await banner(page);
  before = await log(page);
  await page.evaluate(() => { window.__rate = 44100; });
  const hasBtn = !!(await page.$('#rateWarn [data-respeak]'));
  if (hasBtn) await page.click('#rateWarn [data-respeak]');
  const stillUp = (await banner(page)).shown;
  const re = await untilLine(page, before, /已重新取得喇叭/, 8000);
  await untilLine(page, before, /音訊已重建，恢復監聽/, 15000); await page.waitForTimeout(500);
  const b4 = await banner(page);
  console.log('④ 紅框裡有「重新取得喇叭」=', hasBtn ? '✅' : '❌', '｜按下去紅框沒有被收掉 =', b.shown && stillUp ? '✅' : '❌',
    '｜真的重新取得了 =', re ? '✅' : '❌', '｜回到 44100 後自動收起 =', !b4.shown && !b4.missing ? '✅' : '❌');

  // ⑤ 碰畫面其他地方：不收起
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  await page.waitForTimeout(2500);
  // 用整份紀錄前後相減：點左上角會切換分頁，紀錄區被藏起來時 innerText 沒有換行，since() 會對不上
  const seenAll = async () => entries(await log(page)).filter(l => /已有人看到「聲音送去的裝置換了」提示/.test(l));
  const s0 = (await seenAll()).length;
  await page.mouse.click(5, 5); await page.waitForTimeout(500);
  await page.mouse.click(5, 5); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  const b5 = await banner(page), seenN = await seenAll();
  console.log('⑤ 碰畫面其他地方兩下：紅框留著 =', b5.shown ? '✅' : '❌ 收起來了', '｜「已有人看到」只記一次 =', seenN.length - s0 === 1 ? '✅ ' + seenN[0].slice(9, 60) : '❌ ' + (seenN.length - s0) + ' 行');
  const okBtn = !!(await page.$('#rateWarn [data-rateok]'));
  console.log('   紅框裡有「✓ 聲音是從喇叭出來的」=', okBtn ? '✅' : '❌');

  // ⑥ 停止再開始監聽：接續
  await page.click('#stopBtn'); await page.waitForTimeout(1500);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  const b6a = await banner(page);
  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  let a6 = since(await log(page), before), b6 = await banner(page);
  const still6 = pick(a6, /之後第一次重建，取樣率仍是 48000Hz/);
  console.log('⑥ 重新開始監聽：還沒重建時先不掛 =', !b6a.shown ? '✅' : '❌', '｜第一次重建仍是 48000：紀錄', still6 ? '✅ ' + still6.slice(9, 60) : '❌ 沒有',
    '｜紅框掛回來 =', b6.shown ? '✅' : '❌');
  before = await log(page);
  await page.evaluate(() => { window.__rate = 44100; });
  await alertOnce(page);
  b6 = await banner(page);
  console.log('   接著回到 44100：自動收起 =', !b6.shown && !b6.missing ? '✅' : '❌', '｜紀錄 =', /輸出裝置換回來了/.test(since(await log(page), before)) ? '✅' : '❌');

  // ⑦ 重新整理網頁：接續；然後按「✓ 聲音是從喇叭出來的」
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  const t7 = (await banner(page)).text.slice(0, 14);
  await page.reload(); await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  const b7a = await banner(page);
  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  let b7 = await banner(page);
  console.log('⑦ 重新整理之後：還沒重建時先不掛 =', !b7a.shown ? '✅' : '❌', '｜第一次重建仍是 48000：紅框掛回來 =', b7.shown ? '✅' : '❌',
    '｜時刻沿用重新整理之前的 =', b7.text.slice(0, 14) === t7 ? '✅ ' + t7 : '❌ ' + b7.text.slice(0, 14) + ' ≠ ' + t7);
  before = await log(page);
  if (await page.$('#rateWarn [data-rateok]')) await page.click('#rateWarn [data-rateok]');
  await page.waitForTimeout(500);
  b7 = await banner(page);
  const ok7 = pick(since(await log(page), before), /你確認聲音是從喇叭出來的/);
  console.log('   按「✓ 聲音是從喇叭出來的」：收起 =', !b7.shown && !b7.missing ? '✅' : '❌', '｜紀錄', ok7 ? '✅ ' + ok7.slice(9, 50) : '❌');
  before = await log(page);
  await alertOnce(page);                                         // 仍是 48000
  await page.evaluate(() => { window.__rate = 44100; });
  await alertOnce(page);                                         // 48000 → 44100
  const a7 = since(await log(page), before); b7 = await banner(page);
  console.log('   之後 48000 不再示警、48000→44100 只寫紀錄 =', !b7.shown && notes(a7).length === 1 ? '✅' : '❌ 🔬 ' + notes(a7).length + ' 行、紅框 ' + b7.shown);

  // ⑧ 上一次監聽最後是 44100，這一次第一次重建就是 48000
  await page.click('#stopBtn'); await page.waitForTimeout(1500);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  before = await log(page);
  await page.evaluate(() => { window.__rate = 48000; });
  await alertOnce(page);
  const n8 = notes(since(await log(page), before)), b8 = await banner(page);
  console.log('⑧ 跨監聽 44100→48000：🔬', n8.length === 1 && /之前最後是 44100Hz/.test(n8[0]) ? '✅ ' + n8[0].slice(9, 60) : '❌ ' + (n8[0] || '沒有').slice(0, 60),
    '｜紅框 =', b8.shown ? '✅' : '❌');

  // ⑨ 重新整理之後第一次重建就回到 44100
  await page.reload(); await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  before = await log(page);
  await alertOnce(page);                                         // 重新整理後 __rate 是 44100
  const back9 = pick(since(await log(page), before), /輸出裝置換回來了/), b9 = await banner(page);
  console.log('⑨ 重新整理後回到 44100：自動收起 =', !b9.shown && !b9.missing ? '✅' : '❌', '｜紀錄說出中間重新整理過 =',
    /中間重新整理或重新開始過監聽/.test(back9) ? '✅' : '❌ ' + (back9 || '沒有').slice(0, 60));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
