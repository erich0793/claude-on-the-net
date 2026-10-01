// v106／v107：元素池見底要出現在畫面上，而且說法要誠實（顏色是分級，不是強調）。
// ① 池剩 3：黃框提示「只剩 3 顆」
// ② 處女元素被擋、熱身元素接手：紀錄要說出路由可能改變
// ③ 池歸零：「已用完」＋「多半還是從音響出來」，黃框（退化，不是故障）
// ③之二 連熱身元素都失去授權：轉成「可能只會發出嗶聲」，紅框
// ④ 碰一下畫面：池補滿、提示消失
const { openPage, loadTone, log, since, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__pl.html';
const blocker = () => {
  window.__blockN = 0;
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__blockN > 0 && !this.muted) { window.__blockN--; const e = new Error('blocked'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    return realPlay.call(this);
  };
};
const banner = p => p.evaluate(() => { const e = document.getElementById('poolWarn');
  return { shown: !e.hidden, text: e.innerText.replace(/\s+/g, ' '), border: getComputedStyle(e).borderTopColor }; });
(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, blocker]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(6000);
  const fire = async () => {
    await page.evaluate(() => window.__trigger('測試觸發', 'once'));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__stopAlert());
    await page.waitForTimeout(4500);
  };
  const drainTo = async n => { while (await page.evaluate(() => window.__poolOK()) > n) await fire(); };
  console.log('池備妥 =', await page.evaluate(() => window.__poolOK()), '｜開頭提示顯示 =', (await banner(page)).shown);

  await drainTo(3);
  const b1 = await banner(page);
  console.log('① 池剩 3 時的畫面提示 =', b1.shown && /只剩 3 顆/.test(b1.text), b1.shown && /只剩 3 顆/.test(b1.text) ? '✅' : '❌', b1.text.slice(0, 40));

  await drainTo(1);
  const before = await log(page);
  await page.evaluate(() => { window.__blockN = 3; });
  await fire();
  const l2 = pick(since(await log(page), before), /這一次改由熱身元素播放/);
  console.log('② 重現「處女元素被擋→熱身接手」=', !!l2, '｜紀錄有說出路由可能改變 =', /路由/.test(l2), l2 && /路由/.test(l2) ? '✅' : '❌');

  const b3 = await banner(page);
  const honest = /已用完/.test(b3.text) && /多半還是從音響出來/.test(b3.text);
  console.log('③ 池歸零時的提示 =', b3.shown, '｜說法誠實（不誇大）=', honest, honest ? '✅' : '❌');
  console.log('   框線 =', b3.border, b3.border === 'rgb(255, 200, 87)' ? '✅ 黃（退化，不是故障）' : '❌');

  await page.evaluate(() => { window.__killWarm(); window.__paintPool(); });
  const b4 = await banner(page);
  const dead = /全部用盡/.test(b4.text) && /嗶聲/.test(b4.text);
  console.log('③之二 熱身元素也失去授權 →', dead ? '✅ 轉為「可能只剩嗶聲」' : '❌', '｜框線 =', b4.border, b4.border === 'rgb(255, 92, 114)' ? '✅ 紅' : '❌');

  await page.mouse.click(5, 5); await page.waitForTimeout(6000);
  const n5 = await page.evaluate(() => window.__poolOK()); const b5 = await banner(page);
  console.log('④ 碰畫面補滿後，池 =', n5, '｜提示還在 =', b5.shown, n5 === 4 && !b5.shown ? '✅ 已消失' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
