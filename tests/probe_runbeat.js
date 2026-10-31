// v124：上一次監聽是怎麼結束的。10/29～10/30 有三次沒有「停止監聽」就斷了，下一行已是幾個小時後的
// 「頁面載入」——是關了分頁、iOS 收掉、還是手機重開機，紀錄分不出來，連幾點斷的都不知道。
// ① 監聽中重新整理（網頁收得到關閉通知）：打開時寫一行，說出最後確認還在聽的時刻、「有收到關閉通知」
// ② 監聽中分頁被硬生生收掉（收不到關閉通知）：打開時寫一行「沒有收到關閉通知」
// ③ 有按停止：打開時不寫
const { openPage, loadTone, log, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const re = /上一次監聽沒有按「停止」就結束了/;
(async () => {
  const { browser, page, errors } = await openPage(PAGE);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(3000);
  const hm = await page.evaluate(() => { const d = new Date(); return (d.getMonth() + 1) + '/' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
  await page.reload(); await page.waitForTimeout(2000);
  const l1 = pick(await log(page), re);
  console.log('① 監聽中重新整理：', l1 ? l1.slice(9, 90) : '（沒有那一行）');
  console.log('   說出最後確認還在聽的時刻 =', l1.indexOf(hm) >= 0 ? '✅ ' + hm : '❌', '｜有收到關閉通知 =', /有收到關閉通知/.test(l1) ? '✅' : '❌');

  // ② 硬生生收掉：讓渲染程序當掉（收不到 pagehide），再用同一個瀏覽器開新分頁
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.click('#startBtn'); await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await Promise.race([cdp.send('Page.crash').catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  await new Promise(r => setTimeout(r, 500)); // 分頁已經當掉，不能再用 page.waitForTimeout
  const p2 = await page.context().newPage();
  await p2.goto(PAGE); await p2.waitForTimeout(2000);
  const l2 = pick(await log(p2), re);
  console.log('② 被收掉：', l2 ? l2.slice(9, 90) : '（沒有那一行）', /沒有收到關閉通知/.test(l2) ? '✅' : '❌');

  // ③ 有按停止
  await p2.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await p2.click('#startBtn'); await p2.waitForTimeout(3000);
  await p2.click('#stopBtn'); await p2.waitForTimeout(1500);
  await p2.reload(); await p2.waitForTimeout(2000);
  const top = (await log(p2)).split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).slice(0, 6).join(' ');
  console.log('③ 按了停止再打開：', re.test(top) ? '❌ 還是寫了' : '✅ 不寫');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
