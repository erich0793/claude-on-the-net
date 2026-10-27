// v122：「播放管線卡死就重載頁面」的 6 秒檢查，只能看它自己那一輪。
// 原本它只問「現在在播嗎」和「現在那一顆」：上一輪在 6 秒內結束、下一輪剛開始而還沒出聲，
// 它就把下一輪判成卡死，重載頁面——重載會沒收播放授權，之後的觸發都只剩嗶聲。
// 是 v122 讓「等麥克風」的那一輪晚一點播，探針第一次跑就整頁重載，才發現這個舊漏洞。
// 重現：第一輪播 2 秒就停掉，第二輪的 play() 被拖住 5 秒才回來（真機上 NotAllowedError
// 延遲重試、或等麥克風，都會讓下一輪晚出聲）。第一輪的檢查在它開播後 6 秒開火。
// ① 不可以重載頁面　② 第二輪最後要真的在播
const { openPage, loadTone, log, since, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
const hold = () => {
  window.__holdNext = 0;
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__holdNext > 0 && !this.muted) {
      window.__holdNext--; const el = this;
      return new Promise(r => setTimeout(r, 5000)).then(() => realPlay.call(el));
    }
    return realPlay.call(this);
  };
};
(async () => {
  const { fakeMic } = require('./_common');
  const { browser, page, errors } = await openPage(PAGE, [fakeMic, hold]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(5000);
  const before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', '1'));
  await page.waitForTimeout(2800);                       // 第一輪開播約 2 秒
  await page.evaluate(() => window.__stopAlert());
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__holdNext = 1; window.__trigger('測試觸發', '1'); });
  await page.waitForTimeout(9000);                       // 第一輪的 6 秒檢查早就開火過了
  const l = since(await log(page), before);
  const reload = pick(l, /播放管線卡死，重載頁面|📄 頁面載入/);
  console.log('① 上一輪的卡死檢查有沒有把下一輪判成卡死 =', reload ? '❌ 重載了：' + reload.slice(9, 50) : '✅ 沒有');
  const playing = await page.evaluate(() => { try { const e = window.__curEl(); return window.__alerting() && !e.paused && e.currentTime > 0.5; } catch (e) { return false; } });
  console.log('② 第二輪最後真的在播 =', playing ? '✅' : '❌');
  await page.evaluate(() => { try { window.__stopAlert(); } catch (e) {} });
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
