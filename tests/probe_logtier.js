// v110：紀錄分層淘汰（LOG_MAX 縮成 40）。灌 12 次完整的警報週期，每一層都有：
// 診斷、例行脈衝、短聲、觸發、收尾。
// ① 收尾的骨架行（警報結束／音訊已重建）留得下來，而且最後一次警報的收尾一定在
// ② 短聲有保留額度：最近的留著，從最舊的開始裁
// ③ 🔊 觸發一行都不能少
const { openPage, log, entries, count } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__lg.html';
(async () => {
  const { browser, page, errors } = await openPage(PAGE, []);
  await page.evaluate(() => {
    const L = window.__log;
    L('保持連線：每 4 分鐘向音響發送 5 秒保連訊號（45Hz）'); L('開始監聽（哭泣＋哀叫，靈敏度 53%）'); L('元素池已備妥：解鎖 12/12');
    for (let i = 1; i <= 12; i++) {
      L('保連脈衝 #' + i + ' 已送出（前景，等待 800ms）');
      L('診斷：峰值 -50dB（背景 -70）｜測試 #' + i);
      L('偵測到短聲（0.2 秒，25 秒內第 1 聲｜#' + i + 'a）');
      L('偵測到短聲（0.3 秒，25 秒內第 2 聲｜#' + i + 'b）');
      L('🔊 觸發播放（短聲達標，新元素#' + i + '）');
      L('警報結束，回到監聽'); L('深度音訊重置：釋放全部音訊資源 3 秒'); L('音訊已重建，恢復監聽（取樣率 48000Hz｜#' + i + '）');
    }
  });
  const t = await log(page); const es = entries(t);
  const c = re => count(t, re);
  console.log('總筆數 =', es.length, '（LOG_MAX=40）');
  console.log('  偵測到短聲 =', c(/偵測到短聲/), '｜🔊觸發 =', c(/🔊 觸發播放/), '｜警報結束 =', c(/警報結束/), '｜音訊已重建 =', c(/音訊已重建/),
    '｜診斷 =', c(/診斷：/), '｜保連脈衝 =', c(/保連脈衝 #/));
  console.log('① 骨架行留得下來 =', c(/警報結束/) > 0 && c(/音訊已重建/) > 0, c(/警報結束/) > 0 && c(/音訊已重建/) > 0 ? '✅' : '❌');
  console.log('   最後一次警報的「音訊已重建」還在 =', /音訊已重建[^）]*#12）/.test(t), /音訊已重建[^）]*#12）/.test(t) ? '✅' : '❌');
  const recent = /#12b）/.test(t), oldest = /#1a）/.test(t);
  console.log('② 近期短聲仍留得住 =', recent, '｜最舊的已被裁 =', !oldest, recent && !oldest && c(/偵測到短聲/) > 0 ? '✅' : '❌');
  console.log('③ 🔊 觸發行一行都沒少 =', c(/🔊 觸發播放/) === 12, c(/🔊 觸發播放/) === 12 ? '✅' : '❌');
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
