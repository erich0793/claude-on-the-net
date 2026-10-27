// v121：開始監聽要讓位給播放。播放時開著麥克風，iOS 會把聲音留在手機喇叭（鐵律 1）。
// 10/21 21:58:37 按停止 → 自動開始偵測（正在等麥克風）→ 21:58:39 又按手動播放 →
// 同一秒麥克風才回來、開始監聽：trigger 要關的麥克風那時還沒回來，它什麼都沒關到。
// ① 自動開始偵測正在等麥克風時按手動播放：麥克風回來的那一刻要放掉；播完才開始監聽
// ② 沒在監聽、手動播放中按「開始監聽」：播放期間根本不去要麥克風；播完自動開始監聽
// ③ 沒撞在一起（已在監聽、再手動播放）：照舊——播放時麥克風放掉
// v122 加嚴 ①：v121 是「麥克風一回來就放掉」，但 10/27 16:29:51 那次音樂先開始、麥克風 1 秒多後才回來，
//   中間那一下仍是在播放中開了麥克風（0.2 秒取樣抓不到）。現在量時間點：音樂的 play()
//   要在麥克風回來並放掉之後、再隔 0.7 秒以上；而且觸發那一行不可以把「正在路上」的請求標成 ⚠️
const { openPage, loadTone, log, since, pick } = require('./_common');
const PAGE = process.env.PAGE || 'http://127.0.0.1:8123/__mc.html';
// 麥克風要等多久才回來可以調；記下每一條拿到的串流，才量得出「播放時有沒有開著」
const mic = () => {
  window.__gumDelay = 0; window.__gumCalls = 0; const streams = [];
  navigator.mediaDevices.enumerateDevices = async () => [];
  let c = null, o = null;
  const make = () => { if (!c) { c = new AudioContext(); o = c.createOscillator(); o.start(); }
    const d = c.createMediaStreamDestination(); o.connect(d); streams.push(d.stream); return d.stream; };
  navigator.mediaDevices.getUserMedia = () => { window.__gumCalls++; const ms = window.__gumDelay;
    return new Promise(res => setTimeout(() => res(make()), ms)); };
  window.__micLive = () => streams.some(s => s.getAudioTracks().some(t => t.readyState === 'live'));
  window.__micArr = []; window.__micStop = []; window.__plays = [];
  const realStop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function () { if (this.readyState === 'live') window.__micStop.push(performance.now()); return realStop.call(this); };
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const ps = document.getElementById('player');
    if (!this.muted && ps && ps.src && this.src === ps.src && this !== ps) window.__plays.push(performance.now());
    return realPlay.call(this);
  };
  const realGum = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = c => realGum(c).then(s => { window.__micArr.push(performance.now()); return s; });
};
const untilLine = async (page, before, re, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(since(await log(page), before))) return true; await page.waitForTimeout(100); } return false; };
// 播放期間每 0.2 秒看一次：在播、而且麥克風開著＝違規
const watch = async (page, ms) => { let bad = 0, n = 0; const t = Date.now();
  while (Date.now() - t < ms) { if (await page.evaluate(() => window.__alerting() && window.__micLive())) bad++; n++; await page.waitForTimeout(200); }
  return { bad, n }; };
const manual = async (page, m) => { await page.click('#manualBtn'); await page.click('#manualOpts button[data-m="' + m + '"]'); };
const stopPlay = async page => { await page.click('#testBtn'); };

(async () => {
  const { browser, page, errors } = await openPage(PAGE, [mic]);
  await loadTone(page);
  await page.evaluate(() => { const k = document.getElementById('autoWatchCk'); if (!k.checked) k.click(); });

  // ① 自動開始偵測正在等麥克風（2 秒才回來）時按手動播放
  await page.evaluate(() => { window.__gumDelay = 2000; });
  let before = await log(page);
  await manual(page, 'once');
  await untilLine(page, before, /自動開始偵測：這一刻沒有使用者手勢/, 15000); // start() 已經在等麥克風
  const b1 = await log(page);
  await manual(page, '1');
  const w1 = await watch(page, 4000);
  const l1 = since(await log(page), b1);
  const y1 = pick(l1, /開始監聽讓位給剛開始的播放/);
  console.log('① 等麥克風時按手動播放：播放中麥克風開著 =', w1.bad + '/' + w1.n, w1.bad === 0 ? '✅ 沒有' : '❌ 開著（聲音會被留在手機）');
  console.log('   讓位那一行：', y1 ? '✅ ' + y1.slice(9, 60) : '❌ 沒有');
  console.log('   播放中有沒有已經開始監聽 =', /　開始監聽（/.test(l1) ? '❌ 有（麥克風在播放時打開了）' : '✅ 沒有');
  const tm = await page.evaluate(() => ({ arr: window.__micArr.slice(-1)[0], stop: window.__micStop.slice(-1)[0], play: window.__plays.slice(-1)[0] }));
  const gap = tm.play - tm.stop;
  console.log('   時間點：麥克風回來 ' + Math.round(tm.arr) + '、放掉 ' + Math.round(tm.stop) + '、音樂 play() ' + Math.round(tm.play) + ' 毫秒 →',
    tm.play > tm.arr && gap >= 700 ? '✅ 放掉之後隔 ' + Math.round(gap) + ' 毫秒才播' : '❌ 音樂比麥克風先開始（重疊）');
  const trig1 = pick(l1, /🔊 觸發播放（手動播放/);
  console.log('   觸發那一行：', /請求沒回應/.test(trig1) ? '❌ 把正在路上的請求標成 ⚠️' : '✅ 沒有多寫', trig1.slice(9, 60));
  await page.evaluate(() => { window.__gumDelay = 0; });
  const b1b = await log(page);
  await stopPlay(page);
  const ok1 = await untilLine(page, b1b, /　開始監聽（/, 8000);
  await page.waitForTimeout(500);
  console.log('   播完之後：開始監聽 =', ok1 ? '✅' : '❌ 沒有接上', '｜麥克風開著 =', await page.evaluate(() => window.__micLive()) ? '✅' : '❌');

  // ② 沒在監聽、手動播放中按「開始監聽」
  await page.click('#stopBtn'); await page.waitForTimeout(1000);
  await page.evaluate(() => { const k = document.getElementById('autoWatchCk'); if (k.checked) k.click(); });
  const b2 = await log(page);
  await manual(page, '1'); await page.waitForTimeout(1200);
  const g0 = await page.evaluate(() => window.__gumCalls);
  const startEnabled = await page.evaluate(() => !document.getElementById('startBtn').disabled);
  if (startEnabled) await page.click('#startBtn');
  const w2 = await watch(page, 3000);
  const g1 = await page.evaluate(() => window.__gumCalls);
  const l2 = since(await log(page), b2);
  console.log('② 手動播放中按「開始監聽」（按鈕可按 =', startEnabled + '）：播放中麥克風開著 =', w2.bad + '/' + w2.n, w2.bad === 0 ? '✅ 沒有' : '❌ 開著');
  console.log('   播放中有沒有去要麥克風 =', g1 - g0, '次', g1 === g0 ? '✅' : '❌', '｜讓位那一行 =', /開始監聽讓位給剛開始的播放/.test(l2) ? '✅' : '❌');
  const b2b = await log(page);
  await stopPlay(page);
  const ok2 = await untilLine(page, b2b, /　開始監聽（/, 8000);
  const cont = pick(since(await log(page), b2b), /接續剛才讓位的開始監聽/);
  console.log('   播完之後：開始監聽 =', ok2 ? '✅' : '❌', '｜紀錄 =', cont ? '✅ ' + cont.slice(9, 40) : '❌ 沒有「接續剛才讓位的開始監聽」');

  // ③ 已在監聽、再手動播放：照舊
  await page.waitForTimeout(4000);
  const b3 = await log(page);
  await manual(page, 'once');
  const w3 = await watch(page, 2500);
  const l3 = since(await log(page), b3);
  console.log('③ 已在監聽時手動播放：播放中麥克風開著 =', w3.bad + '/' + w3.n, w3.bad === 0 ? '✅ 沒有' : '❌',
    '｜沒有多出讓位那一行 =', /讓位/.test(l3) ? '❌' : '✅');
  await page.waitForTimeout(6000);
  console.log('errors:', errors.length ? errors.join('\n') : '（無）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
