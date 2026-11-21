// v133：播放被系統從中途停掉（多半是藍牙喇叭斷線）時，1 秒後自動接著播（改從手機出來）。
// 11/20 08:23 播了 8 秒就被停掉（沒有手勢、頁面在前景、使用者確認沒有鬧鐘也沒有電話），
// 舊做法整輪就此結束，寶寶 5 分鐘後再哭才又播。使用者選擇「斷線後馬上改用手機繼續播」。
// ① 沒有手勢被停掉：寫「1 秒後自動接著播」，接著真的在播、寫「🔧 已自動接著播」，紅框寫「已自動改用手機接著播」
// ② 等著接的那 1 秒按鈕要是「⏹ 停止播放」，按下去就停掉這一輪，不能去播試聽檔、也不能再接
// ③ 接的時候被瀏覽器擋下：寫「自動接著播沒有成功」並結束這一輪
// ④ 接了但元素沒動：同樣寫沒有成功並結束
// ⑤ 一輪最多接 2 次：第 3 次被停就真的結束
// ⑥ 有人碰了畫面（2 秒內）才被停：照舊當成手動停止，不接
const { openPage, loadTone, log, since, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const alerting = p => p.evaluate(() => window.__alerting());
const fire = async page => { await page.evaluate(() => window.__trigger('測試觸發', '1')); await page.waitForTimeout(4000); };
const sysPause = p => p.evaluate(() => window.__curEl().pause());
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);

  // ①
  let before = await log(page);
  await fire(page);
  await sysPause(page);
  await page.waitForTimeout(4800);
  let a = since(await log(page), before);
  const l1 = pick(a, /播放被系統中斷/), ok1 = pick(a, /🔧 已自動接著播/);
  const playing1 = await page.evaluate(() => window.__alerting() && !window.__curEl().paused);
  const box = await page.evaluate(() => { const e = document.getElementById('routeWarn'); return e && !e.hidden ? e.innerText : ''; });
  console.log('① 沒有手勢被停掉：寫「1 秒後自動接著播」=', /1 秒後自動接著播，聲音會改從手機出來/.test(l1) ? '✅' : '❌ ' + (l1 || '沒有').slice(9, 80));
  console.log('   真的接著在播 =', playing1 && /已自動接著播（第 1 次），播放有在前進/.test(ok1) ? '✅ ' + ok1.slice(9, 60) : '❌ 播放中=' + playing1 + ' ' + (ok1 || '沒寫').slice(0, 60));
  console.log('   紅框寫「已自動改用手機接著播」=', /已自動改用手機接著播/.test(box) ? '✅' : '❌ ' + box.replace(/\s+/g, ' ').slice(0, 60));

  // ② 等著接的那 1 秒按停止
  await page.waitForTimeout(12000); // 離上一次接超過 15 秒，這一次才會再接
  before = await log(page);
  await sysPause(page);
  const btn = await page.evaluate(() => document.getElementById('testBtn').textContent);
  await page.click('#testBtn');
  await page.waitForTimeout(4500);
  a = since(await log(page), before);
  const st2 = pick(a, /手動停止播放/);
  const testPlaying = await page.evaluate(() => !document.getElementById('player').paused);
  console.log('② 等著接時按鈕是「⏹ 停止播放」=', /停止播放/.test(btn) ? '✅' : '❌ ' + btn);
  console.log('   按下去就停掉、不播試聽檔、不再接 =', /當時音樂是暫停的/.test(st2) && !(await alerting(page)) && !testPlaying && !/已自動接著播/.test(a)
    ? '✅' : '❌ ' + (st2 || '沒寫').slice(9, 60) + ' 警報中=' + (await alerting(page)) + ' 試聽在播=' + testPlaying);

  // ③ 接的時候被擋
  await page.waitForTimeout(1500);
  before = await log(page);
  await fire(page);
  await page.evaluate(() => { const e = window.__curEl(); e.play = () => Promise.reject(new DOMException('x', 'NotAllowedError')); e.pause(); });
  await page.waitForTimeout(2000);
  a = since(await log(page), before);
  const f3 = pick(a, /自動接著播沒有成功/);
  console.log('③ 接的時候被擋：', /自動接著播沒有成功（被瀏覽器阻擋：NotAllowedError）/.test(f3) && !(await alerting(page)) ? '✅ ' + f3.slice(9, 60) : '❌ ' + (f3 || '沒寫').slice(0, 70));

  // ④ 接了但沒動
  await page.waitForTimeout(1500);
  before = await log(page);
  await fire(page);
  await page.evaluate(() => { const e = window.__curEl(); e.play = () => Promise.resolve(); e.pause(); });
  await page.waitForTimeout(5000);
  a = since(await log(page), before);
  const f4 = pick(a, /自動接著播沒有成功/);
  console.log('④ 接了但元素沒動：', /自動接著播沒有成功（元素又停住了）/.test(f4) && !(await alerting(page)) ? '✅' : '❌ ' + (f4 || '沒寫').slice(0, 70));

  // ⑤ 一輪最多接 2 次
  await page.waitForTimeout(1500);
  before = await log(page);
  await fire(page);
  await sysPause(page); await page.waitForTimeout(16000);
  await sysPause(page); await page.waitForTimeout(16000);
  const mid = since(await log(page), before);
  await sysPause(page); await page.waitForTimeout(1000);
  a = since(await log(page), before);
  const third = pick(a, /播放被系統中斷/);
  console.log('⑤ 第 2 次也接（標出第 2 次）=', /1 秒後自動接著播（這一輪第 2 次）/.test(mid) && /已自動接著播（第 2 次）/.test(mid) ? '✅' : '❌');
  console.log('   第 3 次就真的結束 =', /剛才已自動接著播過 2 次，這次不再接/.test(third) && !(await alerting(page)) ? '✅' : '❌ ' + (third || '').slice(9, 80));

  // ⑥ 有人碰了畫面才被停
  await page.waitForTimeout(1500);
  before = await log(page);
  await fire(page);
  await page.click('#statusText');
  await sysPause(page);
  await page.waitForTimeout(2500);
  a = since(await log(page), before);
  console.log('⑥ 碰了畫面才被停：當成手動停止、不接 =', /手動停止播放？/.test(a) && !/自動接著播/.test(a) && !(await alerting(page)) ? '✅' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
