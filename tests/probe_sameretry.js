// v109：NotAllowedError 時先別換元素。
//
// 三次實測，形狀一模一樣——被擋的都是剛好把池抽乾的那一顆處女元素：
//   09/07 12:25  新元素#16，池餘 0 → NotAllowedError → ↻ 元素#1 熱身
//   09/10 11:22  新元素#16，池餘 0 → NotAllowedError → ↻ 元素#1 熱身
//   09/11 05:45  新元素#42，池餘 0 → NotAllowedError → ↻ 元素#3 熱身
// 使用者回報：「藍牙沒斷 但從手機播放」。藍牙沒斷就排除了「音響睡著」，
// 剩下的只有路由——而處女元素是唯一能把路由搶回音響的東西。
// 也就是說：**換元素這個動作本身就是路由跑掉的原因**，不該在第一次被拒就丟掉它。
//
// ① 短暫被拒：延遲重試同一顆要成功，而且不可以掉到熱身元素
// ② 那顆元素真的壞掉：仍然要退回原本的鏈、照樣出聲（退避不能變成拒絕服務）
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__pl.html';
const IS_CTRL = /108/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
  // 只擋非靜音的播放：保連／保鮮那些靜音小動作不是這次要測的東西
  window.__blockN = 0;
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__blockN > 0 && !this.muted) {
      window.__blockN--;
      const e = new Error('blocked'); e.name = 'NotAllowedError';
      return Promise.reject(e);
    }
    return realPlay.call(this);
  };
};
const log = p => p.evaluate(() => document.getElementById('logBox').innerText);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn'); await page.waitForTimeout(6000);

  const fire = async () => {
    await page.evaluate(() => window.__trigger('測試觸發', 'once'));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__stopAlert());
    await page.waitForTimeout(4500);
  };
  const drainTo1 = async () => { while (await page.evaluate(() => window.__poolOK()) > 1) await fire(); };

  // ① 短暫被拒一次：池剩最後一顆，被擋之後應該救回同一顆
  await drainTo1();
  await page.evaluate(() => { document.getElementById('logBox').innerHTML = ''; window.__blockN = 1; });
  await fire();
  const t1 = await log(page);
  const blocked = /播放被瀏覽器阻擋（NotAllowedError/.test(t1);
  const sameRetry = /同一顆元素延遲 400ms 再試/.test(t1);
  const saved = /同一顆元素延遲重試後成功/.test(t1);
  const fellToWarm = /這一次改由熱身元素播放/.test(t1);
  console.log('① 重現「最後一顆處女元素被擋」=', blocked,
    IS_CTRL ? (blocked ? '（對照組重現了，本次測試具鑑別力）' : '⚠️ 對照組沒重現，不具鑑別力') : '');
  console.log('   有延遲重試同一顆 =', sameRetry, '｜救回來了 =', saved, '｜掉到熱身元素 =', fellToWarm,
    IS_CTRL ? '（v108 對照組：一被擋就換熱身元素，路由就是在這裡跑掉的）'
            : (saved && !fellToWarm ? '✅ 保住處女元素，沒有動用熱身' : '❌'));
  console.log('   紀錄：', t1.split('\n').filter(l => /阻擋|重試|熱身|成功/.test(l)).slice(0, 4).map(s => s.trim()).join('\n         '));

  // ② 那顆元素真的壞掉（連擋 3 次）：仍然要退回原本的鏈、照樣出聲
  await page.mouse.click(10, 10); await page.waitForTimeout(6000); // 碰畫面補滿池
  await drainTo1();
  await page.evaluate(() => { document.getElementById('logBox').innerHTML = ''; window.__blockN = 3; });
  await fire();
  const t2 = await log(page);
  const fellBack = /這一次改由熱身元素播放/.test(t2) || /改用下一顆元素重試/.test(t2);
  const beeped = /改以嗶聲警示/.test(t2);
  console.log('② 那顆元素連擋 3 次 → 有退回原本的鏈 =', fellBack, '｜有沒有掉到嗶聲 =', beeped,
    IS_CTRL ? '（對照組）' : (fellBack && !beeped ? '✅ 照樣出聲，只是慢了 1.6 秒' : '❌'));
  console.log('   紀錄：', t2.split('\n').filter(l => /阻擋|重試|熱身|嗶聲/.test(l)).slice(0, 5).map(s => s.trim()).join('\n         '));
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
