// v111：診斷行的峰值出現正的 dB（物理上不可能）時，要自己標出「訊號爆表 N 幀」——
// 否則它跟「算式寫錯」長得一模一樣。
// ① 灌超過滿刻度的訊號：每一行正 dB 的診斷都要帶標記
// ② 不爆表的訊號：有診斷行，但一行都不能多出標記
const { openPage, loadTone, log, entries, fakeMic } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__dg.html';
const signal = amp => new Function(`let n = 0;
  AnalyserNode.prototype.getFloatTimeDomainData = function (arr) { arr.fill(1e-4); if (++n % 5 === 0) arr.fill(${amp}); };`);
(async () => {
  let errs = [];
  for (const [amp, label] of [[0.5, '②'], [10, '①']]) {
    const { browser, page, errors } = await openPage(PAGE, [fakeMic, signal(amp)]);
    await loadTone(page);
    await page.click('#startBtn'); await page.waitForTimeout(20000);
    const diag = entries(await log(page)).filter(l => /診斷：/.test(l));
    const tagged = diag.filter(l => /訊號爆表 \d+ 幀/.test(l));
    if (label === '②') {
      console.log('② 沒爆表時的診斷行 =', diag.length, '行｜有沒有多出「訊號爆表」=', tagged.length > 0, diag.length > 0 && !tagged.length ? '✅ 乾淨' : '❌');
    } else {
      const pos = diag.filter(l => /峰值 \d+dB/.test(l));
      console.log('① 出現物理上不可能的正 dB 峰值 =', pos.length, '行');
      console.log('   其中有標示「訊號爆表 N 幀」=', pos.filter(l => /訊號爆表 \d+ 幀/.test(l)).length, '行',
        pos.length && pos.every(l => /訊號爆表 \d+ 幀/.test(l)) ? '✅ 每一行都自己解釋了' : '❌');
      if (pos[0]) console.log('   範例：', pos[0].slice(0, 150));
    }
    errs = errs.concat(errors); await browser.close();
  }
  console.log('errors:', errs.length ? errs.join('\n') : '（無）');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
