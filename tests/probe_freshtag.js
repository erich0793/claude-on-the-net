// v114：「播放被瀏覽器阻擋」那一行裡的「距上次保鮮」是個會騙人的數字。
//
// 熱身元素有兩條刷新路徑：
//   ① 保連脈衝順帶（rider）→ 更新 lastWarmOK
//   ② 無聲保鮮脈衝          → 更新 lastFreshOK
// ② 刻意在 ① 正常時整個跳過。所以保連開著、一切正常的情況下，
// lastFreshOK 會永遠停在 0 或很久以前——而被擋紀錄只印 lastFreshOK。
//
// 09/24 07:50 真機紀錄：「距上次保鮮 41039 秒」（11.4 小時），
// 但同一份紀錄裡 #320／#330 兩則保連脈衝就寫著「順帶熱身#3／#1」，
// 熱身元素其實每 4 分鐘都被刷新過。這一行是診斷路由問題最重要的一行。
//
// ① rider 確實在刷新熱身元素（lastWarmOK 有在動、lastFreshOK 沒動）
// ② 被擋那一行要說出**真正的**刷新時間，而且指名是哪一條路徑
const { chromium } = require('playwright-core');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__fr.html';
const IS_CTRL = /113/.test(PAGE);
const prep = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.enumerateDevices = async () => [];
  navigator.mediaDevices.getUserMedia = async () => {
    const c = new AudioContext(), d = c.createMediaStreamDestination();
    const o = c.createOscillator(); o.connect(d); o.start();
    return d.stream;
  };
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
const pick = (t, re) => (t.split(/(?=\d\d\/\d\d \d\d:\d\d:\d\d)/).find(l => re.test(l)) || '').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(); await ctx.addInitScript(prep);
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(PAGE); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.pane').forEach(x => { x.hidden = false; }));
  await page.evaluate(() => { const k = document.getElementById('keepCk'); if (!k.checked) k.click(); });
  await page.setInputFiles('#fileInput', __dirname + '/tone.wav');
  await page.waitForTimeout(2000);
  await page.click('#startBtn');
  await page.waitForTimeout(50000); // 讓保連脈衝（20 秒一次）帶著 rider 跑兩輪以上

  // ① rider 在刷新、無聲保鮮沒在跑——這正是真機上「一切正常」的樣子
  const st = await page.evaluate(() => ({ warm: window.__warmOK(), fresh: window.__freshOK(), now: Date.now() }));
  const warmAge = st.warm ? Math.round((st.now - st.warm) / 1000) : -1;
  console.log('① rider 刷新過熱身元素 =', !!st.warm, '（' + warmAge + ' 秒前）｜無聲保鮮跑過 =', !!st.fresh,
    (st.warm && !st.fresh) ? '✅ 重現真機情境：只有 rider 在照顧熱身元素' : '⚠️ 沒重現，不具鑑別力');

  // ② 讓一次播放被擋，看那一行怎麼說
  const before = await log(page);
  await page.evaluate(() => { window.__blockN = 1; window.__trigger('測試觸發', 'once'); });
  await page.waitForTimeout(5000);
  const after = await log(page);
  const k = after.indexOf(before.slice(0, 60));
  const fresh = k >= 0 ? after.slice(0, k) : after;
  const line = pick(fresh, /播放被瀏覽器阻擋/);
  const saysNever = /尚無保鮮紀錄/.test(line);
  const m = line.match(/距上次刷新 (\d+) 秒（(保連順帶|無聲保鮮)）/);
  console.log('② 被擋那一行：', line.slice(0, 165));
  if (IS_CTRL) {
    console.log('   對照組說法 =', saysNever ? '「尚無保鮮紀錄」（不實：rider 剛刷新過 ' + warmAge + ' 秒）'
      : (/距上次保鮮 (\d+) 秒/.test(line) ? '「距上次保鮮 ' + line.match(/距上次保鮮 (\d+) 秒/)[1] + ' 秒」（只看得到沒在跑的那條路徑）' : '（沒讀到）'));
  } else {
    const ok = !!m && Math.abs(+m[1] - warmAge) <= 30 && m[2] === '保連順帶';
    console.log('   說出真正的刷新時間並指名路徑 =', ok,
      ok ? '✅ ' + m[1] + ' 秒（保連順帶），與 rider 實際時戳 ' + warmAge + ' 秒相符' : '❌');
  }
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
