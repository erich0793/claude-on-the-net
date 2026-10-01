// v116：🔬 實驗結論不在 IMPORTANT_RE 裡，於是比它摘要的那幾行 ⚠️ **更早**被裁掉。
// 10/01 真機紀錄：09/26 兩次被擋的 ⚠️ 全在，兩行 🔬 都沒了。
// 用非重要的填充行灌爆紀錄（只會吃掉第四層），看 🔬 與 ⚠️ 誰留得下來。
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__rn.html';
const IS_CTRL = /115/.test(PAGE);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__log('⚠️ 播放被瀏覽器阻擋（NotAllowedError｜元素#64 測試）');
    window.__log('🔬 實驗結論：同一顆元素連擋 3 次（元素#64 測試），幾乎同一瞬間改用 元素#65 卻一次就成功');
    for (let i = 1; i <= 30; i++) window.__log('警報結束，回到監聽（填充 #' + i + '）');
  });
  const t = await page.evaluate(() => document.getElementById('logBox').innerText);
  const warnKept = /播放被瀏覽器阻擋（NotAllowedError｜元素#64/.test(t);
  const verdictKept = /🔬 實驗結論/.test(t);
  console.log('灌爆紀錄後：原始痕跡 ⚠️ 還在 =', warnKept, '｜結論 🔬 還在 =', verdictKept,
    IS_CTRL ? (warnKept && !verdictKept ? '（對照組重現：結論比原始痕跡先消失）' : '⚠️ 沒重現')
            : (warnKept && verdictKept ? '✅ 結論跟原始痕跡活得一樣久' : '❌'));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
