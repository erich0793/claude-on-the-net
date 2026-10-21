// v121：「播放前檢查異常｜元素是靜音狀態」不該把正在解鎖的元素當成異常。
// 打開網頁後第一下就按手動播放：那一下才是第一個手勢，池裡的元素全是剛生出來、
// 靜音解鎖還沒跑完的——靜音就是解鎖的做法。09/19 起這樣寫了 13 次 ⚠️
// （全部是「元素#4 解鎖✗ 齡0分 rs=0｜元素是靜音狀態」），每一次都正常出聲。
// ① 重新整理後第一下就手動播放：不寫 ⚠️，元素已解除靜音、真的在播
// ② 真的不該靜音的元素（早就解鎖好了）被靜音：照樣寫 ⚠️（不能把真的異常一起吞掉）
const { openPage, loadTone, log, since, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
(async () => {
  const { browser, page, errors } = await openPage(PAGE);
  await loadTone(page);               // 存進本機，重新整理後會自動載入（不經手勢，所以池是空的）
  await page.reload(); await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  let before = await log(page);
  await page.click('#manualBtn'); await page.click('#manualOpts button[data-m="1"]');
  await page.waitForTimeout(2500);
  const l1 = since(await log(page), before);
  const w1 = pick(l1, /播放前檢查異常/), t1 = pick(l1, /🔊 觸發播放（手動播放/);
  const st = await page.evaluate(() => { const e = window.__curEl(); return { muted: e.muted, paused: e.paused, t: e.currentTime }; });
  console.log('① 重新整理後第一下手動播放：', t1.slice(9, 50));
  console.log('   ⚠️ 播放前檢查異常 =', w1 ? '❌ ' + w1.slice(9, 70) : '✅ 沒有');
  console.log('   元素已解除靜音、真的在播 =', !st.muted && !st.paused && st.t > 0.3 ? '✅' : '❌ ' + JSON.stringify(st));
  await page.click('#testBtn'); await page.waitForTimeout(3000);

  // ② 已經解鎖好的元素被靜音：要照樣示警
  await page.waitForTimeout(2000);
  const ready = await page.evaluate(() => { const e = window.__pool().find(x => x._unlockOK); if (e) e.muted = true; return !!e; });
  before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await page.waitForTimeout(1500);
  const w2 = pick(since(await log(page), before), /播放前檢查異常/);
  console.log('② 早就解鎖好、卻被靜音的元素（找到 =', ready + '）：', w2 ? '✅ 照樣示警 ' + w2.slice(9, 60) : '❌ 被吞掉了');
  await page.waitForTimeout(3000);
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
