// v118：音檔音量。使用者想要「按一下就讓播放音量有上限」。
// iOS 不讓網頁改 iPhone 音量，偵測觸發的播放又沒有手勢可以開 Web Audio 增益——
// 唯一對每一種播放都有效的辦法，是把音檔本身縮小。這支探針檢查：
// ① 調成 50%：存起來的檔、正在用的檔，樣本峰值都減半；長度、取樣率、聲道數不變；檔名記下「音量 50%」
//    已解鎖的池元素一起換成新檔（少了這步，輪到它們時播的是舊的、比較大聲的檔）
// ② 播放中調 25%：正在播的那一顆不換（換了會當場斷掉），畫面要說「下一次播放起生效」
// ③ 25% 是相對原始音量（峰值 0.25），不是在 50% 上再打折（0.125）
// ④ 重新整理後畫面還記得是 25%
// ⑤ 調回 100%：峰值回到原始
// ⑥ 剪短 1 秒並同時調 50%：長度 1 秒、峰值減半；接著觸發時「播放前檢查」不可以抓到舊檔
//    （⑥ 的換源部分是 v117 剪短音檔就有的老毛病：池元素還指著舊檔，輪到時才由播放前檢查就地修正）
const { openPage, loadTone, log, since, pick, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__pl.html';
const ORIG = 8000; // tests/tone.wav：2 秒 440Hz、8kHz、單聲道 PCM16、振幅 8000

// 讀 IndexedDB 裡存的那一份，和播放器現在用的那一份，解析 WAV 量峰值
const files = p => p.evaluate(async () => {
  const parse = buf => {
    const dv = new DataView(buf), tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    let o = 12, sr = 0, chs = 0, bits = 0, off = -1, len = 0;
    while (o + 8 <= buf.byteLength) {
      const id = tag(o), n = dv.getUint32(o + 4, true);
      if (id === 'fmt ') { chs = dv.getUint16(o + 10, true); sr = dv.getUint32(o + 12, true); bits = dv.getUint16(o + 22, true); }
      if (id === 'data') { off = o + 8; len = Math.min(n, buf.byteLength - off); break; }
      o += 8 + n + (n & 1);
    }
    let peak = 0;
    for (let i = off; i + 1 < off + len; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)));
    return { sr, chs, bits, frames: len / 2 / (chs || 1), secs: +(len / 2 / (chs || 1) / (sr || 1)).toFixed(2), peak };
  };
  const db = await new Promise((res, rej) => { const r = indexedDB.open('babycry', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const rec = await new Promise((res, rej) => { const q = db.transaction('files').objectStore('files').get('alert'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const live = await (await fetch(document.getElementById('player').src)).arrayBuffer();
  return { name: rec.name, disk: parse(await rec.blob.arrayBuffer()), live: parse(live) };
});
// 已換上真音檔的池元素裡，有幾顆還指著別的檔
const stale = p => p.evaluate(() => { const ps = document.getElementById('player').src;
  const real = window.__pool().filter(e => e._real); return { real: real.length, stale: real.filter(e => e.src !== ps).length }; });
const status = p => p.evaluate(() => document.getElementById('trimStatus').innerText);
const ui = p => p.evaluate(() => ({ now: (document.getElementById('volNow') || {}).innerText || '', sel: (document.getElementById('fileVol') || {}).value || '' }));
const near = (v, want, tol) => Math.abs(v - want) <= tol;
const until = async (p, fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.waitForTimeout(200); } return false; };

(async () => {
  const { browser, page, errors } = await openPage(PAGE, [fakeMic]);
  await loadTone(page);
  await page.click('#startBtn'); await page.waitForTimeout(6000);
  await page.evaluate(() => { document.getElementById('trimBox').open = true; });
  const hasVol = !!(await page.$('#volBtn'));
  const setVol = async pct => {
    const before = await status(page);
    await page.selectOption('#fileVol', String(pct)); await page.click('#volBtn');
    await until(page, async () => { const s = await status(page); return s !== before && !/處理中/.test(s); });
  };
  const s0 = await files(page);
  console.log('原始：', s0.disk.secs + ' 秒', s0.disk.sr + 'Hz', s0.disk.chs + ' 聲道', '峰值 ' + s0.disk.peak, s0.disk.peak === ORIG ? '' : '❌ 測試音檔不對');
  if (!hasVol) console.log('①～⑤ 畫面上沒有「🔉 只調音量」按鈕 ❌（這一版還沒有音檔音量功能）');

  if (hasVol) {
    // ① 50%
    let before = await log(page);
    await setVol(50);
    const f1 = await files(page), p1 = await stale(page), u1 = await ui(page);
    const ok1 = near(f1.disk.peak, ORIG / 2, 2) && near(f1.live.peak, ORIG / 2, 2);
    const keep1 = f1.disk.frames === s0.disk.frames && f1.disk.sr === s0.disk.sr && f1.disk.chs === s0.disk.chs && f1.disk.bits === 16;
    console.log('① 50%：存檔峰值', f1.disk.peak, '｜播放器用的峰值', f1.live.peak, ok1 ? '✅ 減半' : '❌');
    console.log('   長度／取樣率／聲道', f1.disk.secs + ' 秒', f1.disk.sr + 'Hz', f1.disk.chs + ' 聲道', keep1 ? '✅ 原封不動' : '❌');
    console.log('   檔名「' + f1.name + '」', /音量 50%/.test(f1.name) ? '✅' : '❌', '｜畫面「' + u1.now + '」', /目前 50%/.test(u1.now) ? '✅' : '❌');
    console.log('   池元素（已換真檔 ' + p1.real + ' 顆）還指著舊檔的 =', p1.stale, p1.real && !p1.stale ? '✅' : '❌');
    const l1 = pick(since(await log(page), before), /🔉 音檔音量改為 50%/);
    console.log('   紀錄', l1 ? '✅ ' + l1.slice(0, 50) : '❌ 沒有「🔉 音檔音量改為 50%」');

    // ② 播放中調 25%
    before = await log(page);
    await page.evaluate(() => window.__trigger('測試觸發', '1'));
    await page.waitForTimeout(2500);
    const playing = await page.evaluate(() => { const e = window.__curEl(); window.__playingSrc = e.src; return { paused: e.paused, src: e.src }; });
    const chk = pick(since(await log(page), before), /播放前檢查異常/);
    console.log('② 調完之後觸發：', chk ? '❌ ' + chk.slice(0, 60) : '✅ 播放前檢查沒有抓到舊檔', '｜正在播 =', !playing.paused);
    await setVol(25);
    const st2 = await status(page);
    const still = await page.evaluate(() => { const e = window.__curEl(); return { paused: e.paused, same: e.src === window.__playingSrc }; });
    console.log('   播放中改 25%：正在播的那一顆', still.same && !still.paused ? '✅ 沒被換掉、繼續播' : '❌ 被打斷（paused=' + still.paused + '，換檔=' + !still.same + '）');
    console.log('   畫面「' + st2 + '」', /下一次播放起生效/.test(st2) ? '✅' : '❌');
    await page.evaluate(() => window.__stopAlert()); await page.waitForTimeout(4500);

    // ③ 25% 相對原始
    const f3 = await files(page);
    console.log('③ 25%：存檔峰值', f3.disk.peak, near(f3.disk.peak, ORIG / 4, 2) ? '✅ 是原始的 1/4' : near(f3.disk.peak, ORIG / 8, 2) ? '❌ 在 50% 上又打折成 1/8' : '❌', '｜檔名「' + f3.name + '」', /音量 25%/.test(f3.name) && !/音量 50%/.test(f3.name) ? '✅' : '❌');

    // ④ 重新整理
    await page.reload(); await page.waitForTimeout(2500);
    await page.evaluate(() => { document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }); document.getElementById('trimBox').open = true; });
    const u4 = await ui(page);
    console.log('④ 重新整理後：畫面「' + u4.now + '」選單 =', u4.sel, /目前 25%/.test(u4.now) && u4.sel === '25' ? '✅ 還記得' : '❌');
    await page.click('#startBtn'); await page.waitForTimeout(6000);

    // ⑤ 調回 100%
    await setVol(100);
    const f5 = await files(page), u5 = await ui(page);
    console.log('⑤ 100%：存檔峰值', f5.disk.peak, near(f5.disk.peak, ORIG, 4) ? '✅ 回到原始' : '❌', '｜檔名「' + f5.name + '」', /音量/.test(f5.name) ? '❌ 還掛著音量標記' : '✅', '｜畫面「' + u5.now + '」', /原始音量/.test(u5.now) ? '✅' : '❌');
  }

  // ⑥ 剪短 1 秒，同時調 50%（沒有音量功能的版本就只是剪短）
  let before = await log(page);
  await page.fill('#trimStart', '0'); await page.fill('#trimLen', '1');
  if (hasVol) await page.selectOption('#fileVol', '50');
  const b6 = await status(page);
  await page.click('#trimBtn');
  await until(page, async () => { const s = await status(page); return s !== b6 && !/處理中/.test(s); });
  const f6 = await files(page), p6 = await stale(page);
  const r6 = f6.disk.peak / ORIG;
  console.log('⑥ 剪短 1 秒＋50%：長度', f6.disk.secs + ' 秒', near(f6.disk.secs, 1, 0.02) ? '✅' : '❌', '｜峰值是原始的', r6.toFixed(2), r6 > 0.45 && r6 < 0.55 ? '✅' : '❌', '｜檔名「' + f6.name + '」', /1秒剪輯｜音量 50%/.test(f6.name) ? '✅' : '❌');
  const l6 = pick(since(await log(page), before), /🔉 剪短音檔並把音量改為 50%/);
  console.log('   紀錄', l6 ? '✅ ' + l6.slice(0, 50) : '❌ 沒有「🔉 剪短音檔並把音量改為 50%」');
  console.log('   剪完：池元素（已換真檔 ' + p6.real + ' 顆）還指著舊檔的 =', p6.stale, p6.real && !p6.stale ? '✅' : '❌');
  before = await log(page);
  await page.evaluate(() => window.__trigger('測試觸發', 'once'));
  await page.waitForTimeout(2500);
  const chk6 = pick(since(await log(page), before), /播放前檢查異常/);
  console.log('   剪完之後觸發：', chk6 ? '❌ ' + chk6.slice(0, 70) : '✅ 播放前檢查沒有抓到舊檔');
  await page.evaluate(() => window.__stopAlert());
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
