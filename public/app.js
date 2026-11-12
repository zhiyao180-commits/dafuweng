// 大富翁 · 世界银行 —— 浏览器端
const { BOARD, GROUPS, LAYOUT, CHANCE, CHEST, RULES, COLORS, TOKENS, fmt, incomePerSec, EMOTES } = GameData;
const N = BOARD.length, BW = LAYOUT.w, BH = LAYOUT.h;
const OUT = 2 * BW + 2 * BH + 4, W2 = LAYOUT.w2, H2 = LAYOUT.h2; // 外圈格数；内圈尺寸
const flying = {};
const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const socket = io();
let token = localStorage.getItem('dfw_token');
if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); localStorage.setItem('dfw_token', token); }
let S = null, myId = null, skew = 0, uPx = 8;
const fxQueue = []; let fxBusy = false;
const animPos = {};
// 玩家面板上显示的余额（跟着动画走）。只有数字需要滚动时才启动逐帧刷新，平时不占用 CPU/GPU（省电）
let moneyRAF = 0;
const kickMoney = () => { if (!moneyRAF) moneyRAF = requestAnimationFrame(moneyTick); };
const shown = new Proxy({}, { set(o, k, v) { o[k] = v; kickMoney(); return true; } }), disp = {};
let localView = null;             // 本地弹窗：deed / market / help
let stateModalKey = '', cardKey = '', dangerOn = false;

// ================= 音效（WebAudio 合成，无需素材） =================
const Snd = {
  ctx: null, muted: localStorage.getItem('dfw_mute') === '1',
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, d, type = 'sine', v = 0.12, at = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, at = 0, v = 0.25, f = 1800) {
    const c = this.ctx; if (!c || this.muted) return;
    const b = c.createBuffer(1, c.sampleRate * d, c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.2; g.gain.value = v;
    s.connect(bp).connect(g).connect(c.destination); s.start(c.currentTime + at);
  },
  beep() { this.tone(2000, 0.08, 'square', 0.05); this.tone(2000, 0.08, 'square', 0.05, 0.12); },
  plus() { this.tone(1320, 0.12, 'sine', 0.12); this.tone(1760, 0.22, 'sine', 0.12, 0.1); },
  minus() { this.tone(660, 0.12, 'triangle', 0.12); this.tone(440, 0.2, 'triangle', 0.1, 0.1); },
  key() { this.tone(1500, 0.03, 'square', 0.03); },
  step() { this.tone(560 + Math.random() * 60, 0.05, 'triangle', 0.06); },
  dice() { for (let i = 0; i < 9; i++) this.noise(0.05, i * 0.07 + Math.random() * 0.03, 0.35 - i * 0.03, 1400 + Math.random() * 1600); },
  card() { this.noise(0.25, 0, 0.18, 3000); },
  flip() { this.noise(0.18, 0, 0.2, 2200); this.tone(880, 0.25, 'sine', 0.07, 0.15); this.tone(1320, 0.35, 'sine', 0.07, 0.3); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.12, i * 0.13)); },
  bad() { this.tone(200, 0.25, 'sawtooth', 0.05); },
  swoosh() { this.noise(0.2, 0, 0.15, 800); },
  buy() { this.tone(1568, 0.09, 'sine', 0.1); this.tone(2093, 0.3, 'sine', 0.1, 0.09); this.noise(0.08, 0, 0.12, 5000); },
  build() { this.noise(0.08, 0, 0.3, 500); this.tone(392, 0.15, 'triangle', 0.1, 0.05); },
  turn() { this.tone(784, 0.15, 'sine', 0.09); this.tone(1046, 0.3, 'sine', 0.09, 0.12); },
  alarm() { for (let i = 0; i < 3; i++) { this.tone(880, 0.16, 'square', 0.05, i * 0.36); this.tone(660, 0.16, 'square', 0.05, i * 0.36 + 0.18); } },
  jail() { this.tone(180, 0.4, 'sawtooth', 0.06); this.noise(0.3, 0.1, 0.2, 300); },
  // 滑音：频率从 f1 平滑滑到 f2（蓄力、火箭、惊叫等）
  sweep(f1, f2, d, type = 'sine', v = 0.1, at = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setValueAtTime(v, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  },
  chord(fs, d, type = 'sine', v = 0.05, at = 0) { fs.forEach((f) => this.tone(f, d, type, v, at)); },
};
// ---- 音频解锁：手机、平板、Safari 必须在“点击/触摸/按键”里开启声音；iPhone 的静音键也会静掉网页音效，这里切到“播放”模式 ----
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let silentEl = null;
function silentWavURL() {
  const n = 4000, b = new ArrayBuffer(44 + n), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function unlockAudio() {
  Snd.init(); const c = Snd.ctx; if (!c) return;
  const sessionOk = !isIOS || (navigator.audioSession && navigator.audioSession.type === 'playback') || silentEl;
  if (c.state === 'running' && sessionOk) return;
  if (c.state !== 'running') { const r = c.resume(); if (r && r.catch) r.catch(() => {}); }
  try { const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0); } catch (_) {}
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
  if (isIOS && !navigator.audioSession && !silentEl) { silentEl = new Audio(silentWavURL()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); const r = silentEl.play(); if (r && r.catch) r.catch(() => { silentEl = null; }); }
  setTimeout(updateSoundHint, 300);
}
['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (silentEl) silentEl.pause(); return; }
  if (Snd.ctx && Snd.ctx.state !== 'running') { const r = Snd.ctx.resume(); if (r && r.catch) r.catch(() => {}); }
  if (silentEl) { const r = silentEl.play(); if (r && r.catch) r.catch(() => {}); }
});
// 还没开启声音时，屏幕底部提示“点一下开启音效”
function updateSoundHint() {
  const need = !Snd.muted && S && S.phase !== 'lobby' && !$('#game').hidden && (!Snd.ctx || Snd.ctx.state !== 'running');
  let el = $('#soundHint');
  if (!need) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'soundHint'; el.innerHTML = '🔈 点一下这里开启游戏音效'; document.body.appendChild(el); el.onclick = () => { unlockAudio(); Snd.plus(); }; }
}
setInterval(updateSoundHint, 1500);

// ================= 通用 =================
const me = () => S && S.players.find((p) => p.id === myId);
const pById = (id) => S && S.players.find((p) => p.id === id);
const curP = () => S && S.players[S.turn];
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }
function act(type, args = {}, cb) {
  Snd.init();
  socket.emit('act', { type, ...args }, (r) => { if (r && !r.ok) { toast(r.error); Snd.bad(); } if (cb) cb(r); });
}
const avatar = (p) => `<div class="avatar" style="background-color:${p.color}">${p.icon}</div>`;
// 立体棋子：玩家颜色的亮面圆头 + 收腰 + 底座，头部嵌着自己选的图案
let pawnSeq = 0;
function pawnSVG(c, icon, cls = '') {
  const u = 'pw' + (pawnSeq++).toString(36), L = (k) => `color-mix(in srgb, ${c} ${k}%, white)`, D = (k) => `color-mix(in srgb, ${c} ${k}%, black)`;
  const st = (fb, css) => `stop-color="${fb}" style="stop-color:${css}"`;
  return `<svg viewBox="0 0 60 74" class="pawn ${cls}" aria-hidden="true"><defs>
    <radialGradient id="h${u}" cx="36%" cy="28%" r="75%"><stop offset="0" ${st(c, L(30))}/><stop offset=".5" ${st(c, c)}/><stop offset="1" ${st(c, D(55))}/></radialGradient>
    <linearGradient id="b${u}" x1="0" x2="1"><stop offset="0" ${st(c, D(55))}/><stop offset=".38" ${st(c, L(62))}/><stop offset=".7" ${st(c, c)}/><stop offset="1" ${st(c, D(48))}/></linearGradient>
    <linearGradient id="t${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" ${st(c, L(45))}/><stop offset="1" ${st(c, c)}/></linearGradient></defs>
    <ellipse cx="30" cy="69" rx="24" ry="4.5" fill="rgba(0,0,0,.26)"/>
    <path d="M6 61v5a24 7 0 0 0 48 0v-5z" fill="url(#b${u})"/><ellipse cx="30" cy="61" rx="24" ry="7" fill="url(#t${u})"/>
    <path d="M19 61c1.6-6 5.2-9 6-14h10c.8 5 4.4 8 6 14z" fill="url(#b${u})"/>
    <ellipse cx="30" cy="47" rx="9" ry="2.6" fill="${c}" style="fill:${L(40)}"/>
    <circle cx="30" cy="25" r="21" fill="url(#h${u})"/>
    <circle cx="30" cy="25" r="15.5" fill="rgba(255,255,255,.93)"/><circle cx="30" cy="25" r="15.5" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
    <text x="30" y="32.2" text-anchor="middle" font-size="19">${icon}</text>
    <ellipse cx="21" cy="11.5" rx="7" ry="3.6" fill="#fff" opacity=".55" transform="rotate(-28 21 11.5)"/></svg>`;
}
const sqColor = (i) => { const sq = BOARD[i]; return sq.type === 'prop' ? GROUPS[sq.group].color : sq.type === 'rail' ? '#5B6470' : '#8E8E93'; };
const railIcon = (sq) => (sq.kind === 'port' ? '⚓️' : '✈️');
const sqIcon = (i) => { const sq = BOARD[i]; return sq.type === 'prop' ? landmark(sq.name) : `<span class="emo">${sq.type === 'rail' ? railIcon(sq) : sq.icon}</span>`; };
const groupLocked = (i) => { const sq = BOARD[i]; return sq.type === 'prop' && Object.keys(S.props).some((k) => BOARD[k].group === sq.group && S.props[k].houses > 0); };
const INF = () => (S && S.infl) || 1;
const fmtI = (x) => fmt(Math.round(x * INF()));
const PINF = () => (S && S.pinfl) || 1;
const NICE = (x) => { if (x < 100) return Math.round(x); const m = Math.pow(10, Math.floor(Math.log10(x)) - 2); return Math.round(x / m) * m; };
const fmtP = (x) => fmt(NICE(x * PINF()));
const priceOf = (i) => NICE((S.props[i].fore ? BOARD[i].price / 2 : BOARD[i].price) * PINF());
const WNAME = { card: '💳 银行卡', phone: '📱 手机钱包', cash: '💵 现金' };
const inDanger = (p) => !p.bankrupt && S.phase === 'play' && (p.money < 0 || (S.pending && S.pending.kind === 'pay' && S.pending.payer === p.id && !S.pending.cancelTo && p.money < S.pending.amount));

// 主题 / 静音
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('dfw_theme', t); $('#btnTheme').textContent = t === 'dark' ? '☀️' : '🌙'; }
applyTheme(localStorage.getItem('dfw_theme') || 'light');
const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
// 省电模式：关闭所有装饰性循环动画和毛玻璃，适合旧电脑或想让电脑更凉快时
function applyEco() { if (localStorage.getItem('dfw_eco') === null && (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/.test(navigator.userAgent))) localStorage.setItem('dfw_eco', '1'); const on = localStorage.getItem('dfw_eco') === '1'; document.documentElement.classList.toggle('eco', on); const b = $('#btnEco'); if (b) { b.classList.toggle('on', on); b.title = on ? '省电模式：已开启（点击关闭）' : '省电模式：已关闭（点击开启）'; } }
function toggleEco() { localStorage.setItem('dfw_eco', localStorage.getItem('dfw_eco') === '1' ? '0' : '1'); applyEco(); toast(localStorage.getItem('dfw_eco') === '1' ? '🍃 省电模式已开启：关闭装饰动画和毛玻璃效果' : '省电模式已关闭'); }
function toggleMute() { Snd.muted = !Snd.muted; localStorage.setItem('dfw_mute', Snd.muted ? '1' : '0'); $('#btnMute').textContent = Snd.muted ? '🔇' : '🔊'; toast(Snd.muted ? '已静音' : '声音已打开'); }
$('#btnMute').textContent = Snd.muted ? '🔇' : '🔊';
$('#btnEco').onclick = toggleEco; applyEco(); $('#btnTheme').onclick = toggleTheme; $('#btnMute').onclick = toggleMute; $('#btnHelp').onclick = () => openLocal({ type: 'help' });

// ================= 片头动画 =================
(function intro() {
  const box = $('#intro'), scenes = [...box.querySelectorAll('.scene')];
  $('#inCity').innerHTML = ['巴黎', '吉隆坡', '纽约', '北京', '悉尼', '伦敦', '上海', '开罗'].map((n, i) => `<span style="--i:${i}">${landmark(n)}</span>`).join('');
  $('#inPpl').innerHTML = TOKENS.slice(0, 8).map((t, i) => `<span style="--i:${i};background:${COLORS[i]}">${t}</span>`).join('');
  $('#lobbyBg').innerHTML = ['巴黎', '东京', '纽约', '北京', '罗马', '迪拜', '伦敦', '悉尼', '上海', '吉隆坡'].map((n, i) => `<i style="--i:${i};left:${(i * 37 + 5) % 96}%;color:${Object.values(GROUPS)[i].color}">${landmark(n)}</i>`).join('');
  let k = -1, timer;
  const end = () => { clearTimeout(timer); box.classList.add('gone'); setTimeout(() => box.remove(), 700); };
  const next = () => { if (++k >= scenes.length) return end(); scenes.forEach((s, i) => s.classList.toggle('on', i === k)); timer = setTimeout(next, +scenes[k].dataset.ms); };
  $('#introSkip').onclick = end;
  if (localStorage.getItem('dfw_room')) end(); else next();   // 断线重连时不再播放
})();

// ================= 大厅 =================
$('#nameInput').value = localStorage.getItem('dfw_name') || '';
$('#passInput').value = localStorage.getItem('dfw_pass') || '';
let chosenSize = +(localStorage.getItem('dfw_size') || 4);
function drawSizePick() { $('#sizePick').innerHTML = [2, 3, 4, 5, 6, 7, 8].map((n) => `<button data-n="${n}" class="${n === chosenSize ? 'on' : ''}">${n}</button>`).join(''); }
drawSizePick();
$('#sizePick').onclick = (e) => { const b = e.target.closest('button'); if (b) { chosenSize = +b.dataset.n; localStorage.setItem('dfw_size', chosenSize); drawSizePick(); } };
$('#sizeEdit').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) act('size', { n: +b.dataset.n }); };
function enter(res) {
  if (res.wait) return showJoinWait(res);
  if (!res.ok) { $('#lobbyErr').textContent = res.error; return; }
  myId = res.id; localStorage.setItem('dfw_room', res.code);
}
// 游戏已开局：申请加入，等待房主批准
function showJoinWait(res) {
  let w = $('#joinWait');
  if (!w) { w = document.createElement('div'); w.id = 'joinWait'; document.body.appendChild(w); }
  w.innerHTML = `<div class="jw-box"><div class="jw-spin"></div><h3>已向房主发出加入申请</h3><p>房间 <b>${esc(res.code)}</b> 的游戏已经开始<br>房主批准后您会自动进入游戏（2 分钟内有效）</p><button class="btn" id="jwCancel">取消申请</button></div>`;
  w.hidden = false; $('#jwCancel').onclick = () => { socket.emit('cancelJoin'); w.hidden = true; };
}
socket.on('joinOk', (r) => { const w = $('#joinWait'); if (w) w.hidden = true; myId = r.id; localStorage.setItem('dfw_room', r.code); Snd.win(); toast('房主已批准，欢迎加入！'); });
socket.on('joinDenied', (r) => { const w = $('#joinWait'); if (w) w.hidden = true; $('#lobbyErr').textContent = r.msg; Snd.bad(); });
socket.on('joinReq', (r) => { Snd.turn(); if (navigator.vibrate) navigator.vibrate([120, 60, 120]); toast(`🙋 ${r.name} 申请加入游戏`); });
// 房主看到的加入申请卡片
function renderJoinReqs() {
  const m = me(), list = (S && S.phase === 'play' && m && m.host && S.joinReqs) || [];
  let box = $('#joinReqs');
  if (!list.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'joinReqs'; document.body.appendChild(box); }
  const h = list.map((r) => `<div class="jr"><div class="jr-i">🙋</div><div class="jr-t"><b>${esc(r.name)}</b> 申请中途加入<small>批准后获得按通胀调整的起始资金，排在最后一位行动</small></div><button class="btn sm" data-approve="${r.rid}" data-ok="">拒绝</button><button class="btn sm primary" data-approve="${r.rid}" data-ok="1">批准</button></div>`).join('');
  if (box._h !== h) { box._h = h; box.innerHTML = h; }
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-approve]'); if (b) act('approve', { rid: b.dataset.approve, ok: !!b.dataset.ok }, (r) => r.ok && toast(b.dataset.ok ? '已批准加入' : '已拒绝')); });
$('#createBtn').onclick = () => {
  const name = $('#nameInput').value.trim(); if (!name) return ($('#lobbyErr').textContent = '请先填写名字');
  localStorage.setItem('dfw_name', name); Snd.init();
  localStorage.setItem('dfw_pass', $('#passInput').value);
  socket.emit('create', { name, token, size: chosenSize, password: $('#passInput').value }, enter);
};
$('#joinBtn').onclick = () => {
  const name = $('#nameInput').value.trim(); if (!name) return ($('#lobbyErr').textContent = '请先填写名字');
  localStorage.setItem('dfw_name', name); Snd.init();
  socket.emit('join', { code: $('#codeInput').value, name, token }, enter);
};
$('#codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('#joinBtn').click());
$('#startBtn').onclick = () => act('start');
const params = new URLSearchParams(location.search);
if (params.get('room')) $('#codeInput').value = params.get('room');

socket.on('connect', () => {
  const room = localStorage.getItem('dfw_room');
  if (room) socket.emit('join', { code: room, token, name: localStorage.getItem('dfw_name') || '玩家' }, (r) => {
    if (r.ok) myId = r.id; else if (r.wait) showJoinWait(r); else localStorage.removeItem('dfw_room');
  });
});

const seenSeat = new Set();
function renderLobby() {
  $('#entry').hidden = true; $('#room').hidden = false; document.querySelector('.lobby-card').classList.add('room-on');
  $('#roomCode').textContent = S.code;
  const m = me(), host = m && m.host, n = S.players.length, max = S.maxPlayers;
  // 舞台：自己的棋子放在转台上
  if (m) { const k = m.color + m.icon, st = $('#myPawn'); if (st._k !== k) { const first = !st._k; st._k = k; st.innerHTML = pawnSVG(m.color, m.icon, 'big'); if (!first) { st.animate([{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(180deg) scale(1.15)', offset: 0.5 }, { transform: 'rotateY(360deg) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.3,.7,.3,1)' }); Snd.plus(); } } $('#myName').innerHTML = `${esc(m.name)}${host ? ' <span class="crown">👑 房主</span>' : ''}`; $('.stage3d').style.setProperty('--pc', m.color); }
  // 座位
  const seats = S.players.map((p) => { const fresh = !seenSeat.has(p.id); seenSeat.add(p.id); return `<div class="seat ${p.id === myId ? 'me' : ''} ${fresh ? 'fresh' : ''}" style="--pc:${p.color}"><div class="seat-glow"></div>${pawnSVG(p.color, p.icon, 'mini')}<div class="seat-n">${esc(p.name)}</div><div class="seat-t">${p.host ? '👑 房主' : p.id === myId ? '我' : '已就位'}</div>${host && !p.host ? `<button class="lp-kick" data-kick="${p.id}" title="移出">✕</button>` : ''}</div>`; }).join('')
    + Array.from({ length: Math.max(0, max - n) }, (_, k) => `<div class="seat empty"><div class="seat-hole"><span>${n + k + 1}</span></div><div class="seat-n">等待加入…</div></div>`).join('');
  const lp = $('#lobbyPlayers'); if (lp._h !== seats) { lp._h = seats; lp.innerHTML = seats; lp.querySelectorAll('.seat.fresh').forEach((x) => setTimeout(() => x.classList.remove('fresh'), 900)); }
  $('#colorPick').innerHTML = COLORS.map((c) => { const taken = S.players.some((p) => p.color === c && p.id !== myId); return `<button data-color="${c}" class="${m && m.color === c ? 'on' : ''} ${taken ? 'taken' : ''}" style="--c:${c}" title="${taken ? '已被选择' : ''}"></button>`; }).join('');
  const ic = TOKENS.map((c) => { const taken = S.players.some((p) => p.icon === c && p.id !== myId); return `<button data-icon="${c}" class="${m && m.icon === c ? 'on' : ''} ${taken ? 'taken' : ''}">${pawnSVG(m ? m.color : '#888', c, 'pick')}</button>`; }).join('');
  const ip = $('#iconPick'), ik = (m ? m.color + m.icon : '') + S.players.map((p) => p.icon).join(); if (ip._k !== ik) { ip._k = ik; ip.innerHTML = ic; }
  $('#sizeText').innerHTML = `<b>${n}</b> / ${max} 人已就位`;
  $('#sizeEdit').hidden = !host;
  if (host) $('#sizeEdit').innerHTML = [2, 3, 4, 5, 6, 7, 8].map((k) => `<button data-n="${k}" class="${k === max ? 'on' : ''}" ${k < n ? 'disabled' : ''}>${k}人</button>`).join('');
  $('#startBtn').hidden = !host; $('#waitHost').hidden = host;
  $('#startBtn').disabled = n < 2;
  $('#startBtn').textContent = n < 2 ? '至少需要 2 人' : n < max ? `人数未满，直接开始（${n} 人）` : `开始游戏（${n} 人）`;
}
$('#copyCode').onclick = () => { const url = location.origin + '/?room=' + (S && S.code); (navigator.clipboard ? navigator.clipboard.writeText(`来玩大富翁·世界银行！房间号 ${S && S.code}，打开 ${url} 即可加入`) : Promise.reject()).then(() => toast('邀请链接已复制，发给朋友即可'), () => toast('房间号：' + (S && S.code))); };
$('#colorPick').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('taken')) act('look', { color: b.dataset.color }); };
$('#iconPick').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('taken')) act('look', { icon: b.dataset.icon }); };

// ================= 棋盘 =================
function ringPos(j, W, H, r0, c0) {
  const a = W + 1, b = W + H + 2, c = 2 * W + H + 3;
  if (j <= a) return [r0 + H + 1, c0 + W + 1 - j, j === 0 || j === a ? 'corner' : 'side-b'];
  if (j <= b) return [r0 + H + 1 - (j - a), c0, j === b ? 'corner' : 'side-l'];
  if (j <= c) return [r0, c0 + (j - b), j === c ? 'corner' : 'side-t'];
  return [r0 + (j - c), c0 + W + 1, 'side-r'];
}
const cellInfo = (i) => (i < OUT ? ringPos(i, BW, BH, 1, 1) : ringPos(i - OUT, W2, H2, 3, 3));
const gridPos = (i) => cellInfo(i);
const sideOf = (i) => cellInfo(i)[2];
function cellInner(i) {
  const sq = BOARD[i];
  const ci = (icon, name, sub, en) => `<div class="ci">${icon}<div class="ctx"><div class="cname">${name}</div>${en ? `<div class="cen">${en}</div>` : ''}${sub ? `<div class="cprice">${sub}</div>` : ''}</div></div>`;
  switch (sq.type) {
    case 'prop': return `<div class="bar"></div><div class="ci"><div class="lm">${landmark(sq.name)}</div><div class="ctx"><div class="cname">${sq.name}</div>${sq.en ? `<div class="cen">${sq.en}</div>` : ''}<div class="cprice">${fmt(sq.price)}</div></div></div>`;
    case 'rail': return ci(`<div class="sicon">${SPECIAL_ICON[sq.kind === 'port' ? 'port' : 'air']}</div>`, sq.short.trim(), fmt(sq.price), sq.en);
    case 'hub': return ci(`<div class="sicon">${SPECIAL_ICON.hub}</div>`, sq.name, '经过 +' + fmt(RULES.goSalary));
    case 'util': return ci(`<div class="cicon">${sq.icon}</div>`, sq.name, fmt(sq.price));
    case 'chance': return ci(`<div class="sicon">${SPECIAL_ICON.chance}</div>`, '机会');
    case 'chest': return ci(`<div class="sicon">${SPECIAL_ICON.chest}</div>`, '命运');
    case 'tax': return ci(`<div class="sicon">${SPECIAL_ICON.tax}</div>`, sq.name, '付 ' + fmt(sq.amount));
    case 'bonus': return ci(`<div class="sicon">${SPECIAL_ICON.bank}</div>`, sq.name, '+' + fmt(sq.amount));
    case 'go': return ci(`<div class="sicon">${SPECIAL_ICON.go}</div>`, '起点', '经过 +' + fmt(RULES.goSalary));
    case 'jail': return ci(`<div class="sicon">${SPECIAL_ICON.jail}</div>`, '监狱', '路过探监');
    case 'parking': return i < OUT ? ci(`<div class="sicon">${SPECIAL_ICON.parking}</div>`, sq.name, '免费休息') : `<div class="scene">${SPECIAL_ICON.resort}</div>` + ci('', sq.name, '度假休息');
    case 'gotojail': return ci(`<div class="sicon">${SPECIAL_ICON.police}</div>`, sq.name, i < OUT ? '直接入狱' : '入狱');
    case 'stock': return ci(`<div class="sicon">${SPECIAL_ICON.stock}</div>`, '股票', '翻倍或亏半');
    case 'wheel': return ci(`<div class="sicon">${SPECIAL_ICON.wheel}</div>`, '幸运转盘');
    case 'portal': return ci(`<div class="sicon">${SPECIAL_ICON.portal}</div>`, '传送门', '任选一格');
    case 'force': return ci(`<div class="sicon">${SPECIAL_ICON.force}</div>`, '强制拍卖');
  }
}
function buildBoard() {
  const b = $('#board');
  b.style.gridTemplateColumns = `1.5fr repeat(${BW}, 1fr) 1.5fr`;
  b.style.gridTemplateRows = `1.5fr repeat(${BH}, 1fr) 1.5fr`;
  $('#center').style.gridColumn = `4 / ${BW}`; $('#center').style.gridRow = `4 / ${BH}`;
  const lane = document.createElement('div'); lane.id = 'lane'; lane.style.gridColumn = `2 / ${BW + 2}`; lane.style.gridRow = `2 / ${BH + 2}`; b.appendChild(lane);
  BOARD.forEach((sq, i) => {
    const [r, c, side] = gridPos(i), inner = i >= OUT;
    const d = document.createElement('div');
    d.className = `cell ${side === 'corner' ? (inner ? 'corner2' : 'corner') : side} ${inner ? 'inner' : ''} ${sq.type}${sq.type === 'rail' ? ' ' + (sq.kind === 'port' ? 'port' : 'air') : ''}${sq.type === 'parking' && inner ? ' resort' : ''}${['rail', 'chance', 'chest', 'jail', 'parking', 'wheel', 'portal', 'go', 'gotojail', 'stock', 'force', 'bonus', 'hub', 'tax'].includes(sq.type) ? ' special' : ''}`;
    d.style.gridRow = r; d.style.gridColumn = c; d.dataset.pos = i; d.id = 'cell' + i;
    if (sq.type === 'prop') d.style.setProperty('--tint', GROUPS[sq.group].color);
    d.title = sq.type === 'prop' ? `${sq.name} ${sq.en} · ${sq.mark}` : sq.name;
    d.innerHTML = cellInner(i) + '<div class="houses"></div>';
    b.appendChild(d);
  });
  b.onclick = (e) => { const c = e.target.closest('.cell'); if (!c || !S) return; const pd = S.pending; if (pd && pd.kind === 'portal' && pd.pid === myId && !fxBusy) return act('portal', { pos: +c.dataset.pos }); if (S.props[+c.dataset.pos]) openLocal({ type: 'deed', pos: +c.dataset.pos }); };
  $('#title').innerHTML = [...'大富翁'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
}
buildBoard();

function updateBoard() {
  for (const [i, st] of Object.entries(S.props)) {
    const cell = $('#cell' + i);
    cell.classList.toggle('mortgaged', st.mortgaged);
    cell.classList.toggle('owned', !!st.owner);
    const fore = !!st.fore && !st.owner; cell.classList.toggle('fore', fore);
    const pr = cell.querySelector('.cprice'), pt = (fore ? '法拍 ' : '') + fmt(priceOf(i)); if (pr && pr.textContent !== pt) pr.textContent = pt;
    let o = cell.querySelector('.owner');
    if (st.owner) { cell.style.setProperty('--own', pById(st.owner).color); if (!o) { o = document.createElement('div'); o.className = 'owner'; cell.appendChild(o); } const ic = pById(st.owner).icon; if (o.textContent !== ic) o.textContent = ic; }
    else if (o) o.remove();
    const h = cell.querySelector('.houses');
    if (+h.dataset.n !== st.houses) { h.dataset.n = st.houses; h.innerHTML = st.houses === 5 ? '<div class="hotel"></div>' : '<div class="house"></div>'.repeat(st.houses); }
  }
}

// ---------- 棋子：走在格子内侧的小路上 ----------
const tokenEls = {};
function lanePoint(pos) {
  const c = $('#cell' + pos), L = c.offsetLeft, T = c.offsetTop, W = c.offsetWidth, H = c.offsetHeight;
  const [r, col, side] = cellInfo(pos), inner = pos >= OUT, d = 2.4 * uPx;
  if (side === 'corner') {
    if (!inner) { const left = col === 1, top = r === 1; return { x: (left ? L + W : L) + (left ? -d : d), y: (top ? T + H : T) + (top ? -d : d), corner: true }; }
    const left = col === 3, top = r === 3; return { x: (left ? L : L + W) + (left ? -d : d), y: (top ? T : T + H) + (top ? -d : d), corner: true };
  }
  if (side === 'side-b') return { x: L + W / 2, y: inner ? T + H + d : T - d, ax: [1, 0], len: W };
  if (side === 'side-l') return { x: inner ? L - d : L + W + d, y: T + H / 2, ax: [0, 1], len: H };
  if (side === 'side-t') return { x: L + W / 2, y: inner ? T - d : T + H + d, ax: [1, 0], len: W };
  return { x: inner ? L + W + d : L - d, y: T + H / 2, ax: [0, 1], len: H };
}
const displayPos = (p) => (animPos[p.id] !== undefined ? animPos[p.id] : p.pos);
function placeTokens() {
  if (!S || S.phase === 'lobby') return;
  const groups = {};
  S.players.forEach((p) => { if (!p.bankrupt && !flying[p.id]) (groups[displayPos(p)] = groups[displayPos(p)] || []).push(p); });
  for (const p of S.players) {
    let el = tokenEls[p.id];
    if (!el) { el = document.createElement('div'); el.className = 'token'; $('#tokens').appendChild(el); tokenEls[p.id] = el; }
    const look = p.color + p.icon; if (el._look !== look) { el._look = look; el.innerHTML = pawnSVG(p.color, p.icon); }
    el.classList.toggle('gone', p.bankrupt);
    el.classList.toggle('cur', S.phase === 'play' && curP().id === p.id);
    el.classList.toggle('fly', !!flying[p.id]);
    if (p.bankrupt) continue;
    const pos = displayPos(p);
    let x, y, sc;
    if (flying[p.id]) { const c = $('#cell' + pos); x = c.offsetLeft + c.offsetWidth / 2; y = c.offsetTop + c.offsetHeight / 2; sc = 1.55; } // 移动时走在格子上，放大像靠近屏幕
    else {
      const pt = lanePoint(pos), list = groups[pos], k = list.indexOf(p), n = list.length;
      sc = n === 1 ? 1.35 : n <= 3 ? 1 : 0.82;      // 独占一格时头像更大，多人同格时一起缩小
      x = pt.x; y = pt.y;
      if (pt.corner) { const cols = Math.min(n, 3), g = 2.1 * uPx * Math.max(sc, 0.9), row = Math.floor(k / cols), inRow = Math.min(cols, n - row * cols); x += ((k % cols) - (inRow - 1) / 2) * g; y += (row - (Math.ceil(n / cols) - 1) / 2) * g; }
      else { const g = Math.min(2.5 * uPx * sc, (pt.len - 1.2 * uPx) / n), a = (k - (n - 1) / 2) * g; x += pt.ax[0] * a; y += pt.ax[1] * a; }
    }
    el.style.transform = `translate(${x}px, ${y}px) scale(${sc})`; // 缩放必须写在同一个 transform 里，否则位置会被一起放大
  }
}
// 轨道：沿着行走路线流动的虚线，指示前进方向（外圈 → 内圈 → 回到起点）
function drawTrack() {
  if (!S || S.phase === 'lobby' || !$('#cell0').offsetWidth) return;
  const pts = []; for (let i = 0; i < N; i++) { const p = lanePoint(i); pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`); }
  $('#trackPath').setAttribute('d', 'M' + pts.join('L') + 'Z');
}

// ---------- 骰子 ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_TF = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const spin = [[0, 0], [0, 0]];
for (const k of [0, 1]) {
  $('#die' + k).innerHTML = [1, 2, 3, 4, 5, 6].map((v) => `<div class="face f${v}" style="transform:${FACE_TF[v]} translateZ(calc(var(--u) * 3.2))">${PIPS[v].map((n) => `<div class="pip" style="grid-area:${Math.ceil(n / 3)}/${((n - 1) % 3) + 1}"></div>`).join('')}</div>`).join('');
}
function setDie(k, v, animate) {
  const d = $('#die' + k);
  if (animate) { spin[k][0] += 2 + Math.floor(Math.random() * 2); spin[k][1] += 2 + Math.floor(Math.random() * 2); d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce'); }
  else d.style.transition = 'none';
  const [x, y] = SHOW[v];
  d.style.transform = `rotateX(${x + spin[k][0] * 360}deg) rotateY(${y + spin[k][1] * 360}deg)`;
  if (!animate) { void d.offsetWidth; d.style.transition = ''; }
}

// ---------- 余额显示（数字滚动 + 飘字） ----------
function syncShown() { if (S) for (const p of S.players) shown[p.id] = p.money; }
function moneyTick() {
  moneyRAF = 0; let busy = false;
  for (const pid in shown) {
    const d = disp[pid] === undefined ? shown[pid] : disp[pid], diff = shown[pid] - d;
    if (d === shown[pid] && disp[pid] !== undefined) continue;
    disp[pid] = Math.abs(diff) < 6 ? shown[pid] : d + diff * 0.16;
    if (disp[pid] !== shown[pid]) busy = true;
    const el = document.querySelector(`.mn[data-pid="${pid}"]`);
    if (el) { el.textContent = fmt(Math.round(disp[pid] / 10) * 10); el.classList.toggle('neg', disp[pid] < 0); }
  }
  if (busy) kickMoney();
}
function floatMoney(pid, amt) {
  const card = document.querySelector(`.pl[data-pid="${pid}"]`); if (!card) return;
  const r = card.getBoundingClientRect(), d = document.createElement('div');
  d.className = 'float ' + (amt > 0 ? 'plus' : 'minus'); d.textContent = (amt > 0 ? '+' : '−') + fmt(Math.abs(amt));
  d.style.left = r.left + r.width * 0.55 + 'px'; d.style.top = r.top + 6 + 'px';
  $('#floats').appendChild(d);
  d.animate([{ transform: 'translateY(8px) scale(.6)', opacity: 0 }, { transform: 'translateY(0) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translateY(-34px) scale(1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' }).onfinish = () => d.remove();
}
function moneyMove(pid, amt) { if (shown[pid] === undefined) return; shown[pid] += amt; floatMoney(pid, amt); }

// ---------- 刷卡机 ----------
function cardHTML(p) {
  const n = (p.id.charCodeAt(1) * 7919 + p.id.charCodeAt(2) * 31) % 10000;
  return `<div class="bk">WORLD BANK</div><div class="chip"></div><div class="num">•••• •••• ${String(n).padStart(4, '0')}</div><div class="nm">${esc(p.name)}</div><div class="ic">${p.icon}</div>`;
}
const cardBg = (p) => `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))`;
function posScreen(label, amount, cls = '') { $('#posLabel').textContent = label; const a = $('#posAmount'); a.className = 'pos-amount'; void a.offsetWidth; a.textContent = amount; a.className = 'pos-amount ' + cls; }
function pressKey(sym) { const k = [...document.querySelectorAll('.pos-keys i')].find((i) => i.textContent === sym); if (k) { k.classList.add('press'); Snd.key(); setTimeout(() => k.classList.remove('press'), 160); } }
function posShake() { const p = $('#pos'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
let curAmt = 0;
// 金额越大，喷出的钞票越多：10M 约 13 张，100M 约 25 张，1B 约 38 张，10B 以上 50–70 张
const cashCount = (a) => Math.round(Math.min(70, 6 + 14 * Math.log10(1 + (a || 0) / 5000)));
function billEl(x, y) { const d = document.createElement('div'); d.className = 'flybill'; d.innerHTML = '<b>100</b><i></i><b>100</b>'; d.style.left = x + 'px'; d.style.top = y + 'px'; $('#floats').appendChild(d); return d; }
function sprayCash(r, n) {
  const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, H = innerHeight;
  for (let i = 0; i < n; i++) {
    const d = billEl(x0, y0), ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 700 + Math.random() * 900, vx = Math.cos(ang) * v * 0.9, vy = Math.sin(ang) * v - 200;
    const dur = 2.2 + Math.random() * 1.2, g = 900, sw = 40 + Math.random() * 60, fr = [];
    for (let k = 0; k <= 12; k++) {
      const tt = (k / 12) * dur, drag = 1 - Math.exp(-tt * 1.6), x = (vx / 1.6) * drag + Math.sin(tt * 5 + i) * sw * (tt / dur), y = (vy / 1.6) * drag + 0.5 * g * tt * tt * 0.55;
      fr.push({ transform: `translate(-50%,-50%) translate(${x}px, ${Math.min(y, H)}px) perspective(500px) rotateX(${tt * (300 + i * 23)}deg) rotateZ(${(i % 2 ? 1 : -1) * tt * 120}deg) scale(${k === 0 ? 0.3 : 1})`, opacity: k > 10 ? (12 - k) / 2 : 1 });
    }
    d.animate(fr, { duration: dur * 1000, delay: i * 22, easing: 'linear', fill: 'backwards' }).onfinish = () => d.remove();
  }
}
function suckCash(r, n) {
  const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const sx = (Math.random() - 0.5) * innerWidth * 0.9, sy = innerHeight * (0.35 + Math.random() * 0.4), d = billEl(x1, y1);
    d.animate([{ transform: `translate(-50%,-50%) translate(${sx}px, ${sy}px) perspective(500px) rotateX(60deg) rotateZ(${sx / 8}deg)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) translate(0,0) perspective(500px) rotateX(0) scale(.35,.1)', opacity: 0.6 }], { duration: 700, delay: i * 45, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'backwards' }).onfinish = () => d.remove();
  }
}
function posGlow() { const p = $('#pos'); p.classList.remove('okglow'); void p.offsetWidth; p.classList.add('okglow'); setTimeout(() => p.classList.remove('okglow'), 1100); }
async function cardIn(p, T, ins) {
  const c = $('#posCard'); c.innerHTML = cardHTML(p); c.style.background = cardBg(p);
  c.className = 'bank-card in-slot' + (ins ? ' ins' : ''); void c.offsetWidth; c.classList.add('show');
  await wait(260 * T); Snd.swoosh(); c.classList.add('inserted'); await wait(420 * T); posShake();
}
async function cardOut(T) { const c = $('#posCard'); c.classList.remove('inserted'); await wait(330 * T); c.classList.remove('show'); await wait(200 * T); }
async function payVisual(p, dir, T, done) {
  const m = (dir === 'in' ? p.recv || p.pay : p.pay) || 'card', pos = $('#pos');
  if (m === 'phone') {
    const ph = $('#posPhone'), scr = ph.firstElementChild; ph.className = 'pphone'; ph.style.setProperty('--pc', p.color);
    if (dir === 'out') {
      // 付款：手机贴近刷卡机顶部的感应区，屏幕显示待付金额 → 感应成功
      scr.innerHTML = `<small>WB Pay · ${esc(p.name)}</small><b>-${fmt(curAmt)}</b><em>请靠近感应区</em>`;
      void ph.offsetWidth; ph.classList.add('show'); Snd.swoosh();
      await wait(450 * T); pos.classList.add('nfc'); Snd.tone(1800, 0.09, 'sine', 0.08); Snd.tone(2400, 0.16, 'sine', 0.08, 0.1);
      ph.classList.add('ok'); scr.innerHTML = `<small>WB Pay</small><i>✓</i><em>支付成功</em>`; posGlow(); done();
      await wait(800 * T); ph.className = 'pphone'; pos.classList.remove('nfc'); await wait(260 * T);
    } else {
      // 收款：手机不碰刷卡机，直接弹出到账通知
      scr.innerHTML = `<small>${esc(p.name)} 的手机钱包</small><div class="pnote"><b>WB Pay 收款到账</b><span>+${fmt(curAmt)}</span></div>`;
      void ph.offsetWidth; ph.classList.add('recv'); Snd.swoosh(); await wait(380 * T);
      ph.classList.add('noted'); Snd.tone(1568, 0.12, 'sine', 0.09); Snd.tone(2093, 0.2, 'sine', 0.09, 0.12); done();
      await wait(1000 * T); ph.className = 'pphone'; await wait(260 * T);
    }
  } else if (m === 'cash') {
    const atm = $('#atm'), scr = atm.querySelector('.atm-s');
    scr.innerHTML = `<b>${p.icon} ${esc(p.name)}</b><br>${dir === 'out' ? '现金存入中…' : '正在出钞…'}`;
    atm.classList.add('show'); Snd.swoosh(); await wait(560 * T);
    const n = cashCount(curAmt), slot = atm.querySelector('.atm-slot').getBoundingClientRect();
    if (dir === 'in') { atm.classList.add('spray'); sprayCash(slot, n); }
    else suckCash(slot, Math.max(6, Math.round(n * 0.5)));
    for (let i = 0; i < Math.min(n, 24); i++) setTimeout(() => Snd.noise(0.04, 0, 0.16, 2400 + Math.random() * 800), i * 34);
    await wait((dir === 'in' ? 650 : 900) * T); scr.innerHTML = '交易成功 ✓'; atm.classList.remove('spray'); done(); Snd.plus(); await wait(900 * T);
    atm.classList.remove('show'); await wait(380 * T);
  } else if (dir === 'in') {
    // 收款到银行卡：卡片浮现在刷卡机旁，显示入账金额，不需要刷卡
    const c = $('#posCard'); c.innerHTML = cardHTML(p) + `<div class="cr">+${fmt(curAmt)} 已入账</div>`; c.style.background = cardBg(p);
    pos.classList.add('crediting'); c.className = 'bank-card in-slot credit'; void c.offsetWidth; c.classList.add('show'); Snd.swoosh(); await wait(420 * T);
    c.classList.add('done'); posGlow(); done(); await wait(900 * T); c.className = 'bank-card in-slot credit'; await wait(300 * T); pos.classList.remove('crediting');
  } else { await cardIn(p, T, false); posGlow(); done(); await wait(620 * T); await cardOut(T); }
}
function showMini(ids) { $('#posMini').innerHTML = ids.map((id, i) => { const p = pById(id); return p ? `<div class="avatar" style="background:${p.color};animation-delay:${i * 60}ms">${p.icon}</div>` : ''; }).join(''); }
function posDone() { const led = $('#posLed'); led.className = 'pos-led ok'; const rc = $('#receipt'); rc.innerHTML = `WORLD BANK<br><b>${esc($('#posAmount').textContent)}</b><br>交易成功 ✓<br>· · · · · ·`; rc.classList.add('print'); Snd.noise(0.35, 0, 0.12, 4200); setTimeout(() => rc.classList.remove('print'), 1900); clearTimeout(posDone.t); posDone.t = setTimeout(() => { posScreen('WORLD BANK', 'READY'); led.className = 'pos-led'; $('#posMini').innerHTML = ''; }, 2200); }
async function posAnim(f) {
  curAmt = f.amount;
  const T = fxQueue.length > 2 ? 0.4 : 0.75;
  $('#posLed').className = 'pos-led busy';
  const from = f.from && pById(f.from), to = f.to && pById(f.to);
  if (from) { posScreen(f.label, '…'); await payVisual(from, 'out', T, () => { pressKey('−'); posScreen(`${from.name} 支付 · ${f.label}`, '−' + fmt(f.amount), 'neg'); Snd.beep(); Snd.minus(); moneyMove(from.id, -f.amount); }); }
  else posScreen(`银行支付 · ${f.label}`, fmt(f.amount));
  if (to) await payVisual(to, 'in', T, () => { pressKey('+'); posScreen(`${to.name} 收款 · ${f.label}`, '+' + fmt(f.amount), 'pos-plus'); Snd.beep(); Snd.plus(); moneyMove(to.id, f.amount); if (to.id === myId) celebrate(f.amount); });
  else if (from) { posScreen('已付给银行', '✓'); await wait(250 * T); }
  posDone();
}
// 一个人付给多个人（或多个人付给一个人）：合并成一次，多张卡同时到账
async function posMulti(f) {
  curAmt = f.each * (f.tos || f.froms).length;
  const T = fxQueue.length > 2 ? 0.45 : 0.8, ids = f.tos || f.froms, n = ids.length, total = f.each * n;
  $('#posLed').className = 'pos-led busy';
  if (f.tos) {
    const from = pById(f.from);
    await payVisual(from, 'out', T, () => { posScreen(`${from.name} 一次付给 ${n} 人`, '−' + fmt(total), 'neg'); Snd.beep(); Snd.minus(); moneyMove(from.id, -total); });
    showMini(ids); posScreen(`${n} 人同时到账 · ${f.label}`, `+${fmt(f.each)} ×${n}`, 'pos-plus'); Snd.plus(); posShake();
    for (const id of ids) { moneyMove(id, f.each); if (id === myId) celebrate(f.each); }
    await wait(1100 * T);
  } else {
    const to = pById(f.to);
    showMini(ids); posScreen(`${n} 人同时付款 · ${f.label}`, `−${fmt(f.each)} ×${n}`, 'neg'); Snd.minus(); posShake();
    for (const id of ids) moneyMove(id, -f.each);
    await wait(1000 * T);
    await payVisual(to, 'in', T, () => { posScreen(`${to.name} 一次收款`, '+' + fmt(total), 'pos-plus'); Snd.beep(); Snd.plus(); moneyMove(to.id, total); if (to.id === myId) celebrate(total); });
  }
  posDone();
}
// 进账庆祝：金额越大越夸张（三档）
function celebrate(a) {
  const tier = a >= 300000 ? 3 : a >= 100000 ? 2 : a >= 20000 ? 1 : 0; if (!tier) return;
  const src = $('#pos').getBoundingClientRect(), card = document.querySelector(`.pl[data-pid="${myId}"]`), dst = (card || $('#pos')).getBoundingClientRect();
  const sx = src.left + src.width / 2, sy = src.top + src.height / 3, n = [0, 8, 18, 32][tier];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'coin'; d.textContent = tier === 3 && i % 3 === 0 ? '💰' : '🪙'; d.style.left = sx + 'px'; d.style.top = sy + 'px'; $('#floats').appendChild(d);
    const mx = (Math.random() - 0.5) * 320, my = -80 - Math.random() * 200, dx = dst.left + dst.width / 2 - sx, dy = dst.top + dst.height / 2 - sy;
    d.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: `translate(${mx}px, ${my}px) scale(1.25) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px, ${dy}px) scale(.5) rotate(720deg)`, opacity: 0.9 }], { duration: 1100 + Math.random() * 500, delay: i * 35, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'backwards' }).onfinish = () => d.remove();
    setTimeout(() => Snd.tone(1800 + Math.random() * 900, 0.06, 'sine', 0.05), i * 35 + 500);
  }
  if (tier >= 2) {
    const b = $('#bigwin'); b.innerHTML = `<small>${tier === 3 ? '💰 巨额进账' : '进账'}</small>+${fmt(a)}`; b.className = 'bigwin t' + tier; void b.offsetWidth; b.classList.add('show'); Snd.win();
    clearTimeout(celebrate.t); celebrate.t = setTimeout(() => (b.className = 'bigwin'), tier === 3 ? 2600 : 1700);
  } else Snd.buy();
  if (tier === 3) confetti();
}

// ---------- 拖卡付款 ----------
function renderDock() {
  const dock = $('#cardDock'), m = me(), pd = S.pending;
  const show = !fxBusy && S.phase === 'play' && m && !m.bankrupt && pd && pd.kind === 'pay' && pd.payer === myId;
  const key = show ? `${pd.amount}|${pd.reason}|${m.money >= pd.amount}|${m.pay}` : '';
  if (dock.dataset.key === key) return;
  dock.dataset.key = key;
  if (!show) { dock.innerHTML = ''; return; }
  const enough = m.money >= pd.amount;
  const pm = m.pay || 'card', verb = pm === 'card' ? '把银行卡拖进刷卡机' : pm === 'phone' ? '把手机拖到刷卡机上（或直接点手机）' : '把现金拖进刷卡机（或直接点现金）';
  const item = pm === 'card' ? `<div class="bank-card" id="myCard" style="background:${cardBg(m)}">${cardHTML(m)}</div>` : pm === 'phone' ? `<div class="dock-phone" id="myCard" style="--pc:${m.color}">${m.icon}<small>闪付</small></div>` : `<div class="dock-cash" id="myCard"><i>$</i><i>$</i><i>$</i></div>`;
  dock.innerHTML = `${item}<div class="dock-hint">${enough ? `${verb}，支付 ${fmt(pd.amount)}` : `余额不足 ${fmt(pd.amount)}，先卖房或抵押`}</div>`;
  const card = $('#myCard'), posEl = $('#pos');
  let sx, sy, moved = false, dragging = false;
  const over = (e) => { const r = posEl.getBoundingClientRect(); return e.clientX > r.left - 20 && e.clientX < r.right + 20 && e.clientY > r.top - 40 && e.clientY < r.bottom; };
  card.onpointerdown = (e) => { Snd.init(); dragging = true; moved = false; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.classList.add('dragging'); };
  card.onpointermove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.03}deg)`; posEl.classList.toggle('drop-ok', over(e));
  };
  card.onpointerup = (e) => {
    if (!dragging) return; dragging = false; card.classList.remove('dragging'); posEl.classList.remove('drop-ok');
    if (!moved || over(e)) { dock.innerHTML = ''; dock.dataset.key = 'sent'; act('swipe'); }
    else { card.style.transition = 'transform .25s'; card.style.transform = ''; setTimeout(() => (card.style.transition = ''), 260); }
  };
}

// ================= 动画队列 =================
socket.on('fx', (list) => {
  for (const f of list) {
    if ((f.type === 'move' || f.type === 'jump' || f.type === 'tp') && animPos[f.pid] === undefined) { const p = pById(f.pid); if (p) animPos[f.pid] = p.pos; }
    if (f.type === 'betres') { if (f.pid === myId && window.showBetResult) showBetResult(f); continue; } // 竞猜结算不排队，立即弹出
    fxQueue.push(f);
  }
  runFx();
});
async function runFx() {
  if (fxBusy) return; fxBusy = true; renderAll();
  while (fxQueue.length) { const f = fxQueue.shift(); try { await playFx(f); } catch (e) { console.error(e); } }
  fxBusy = false;
  for (const k in animPos) delete animPos[k];
  syncShown(); renderAll();
}
async function banner(html, { color, ms = 850, big } = {}) {
  const b = $('#banner'); b.innerHTML = html; b.style.setProperty('--c', color || 'var(--line)');
  b.className = 'banner show' + (big ? ' big' : ''); await wait(fxQueue.length > 3 ? ms * 0.5 : ms); b.className = 'banner' + (big ? ' big' : ''); await wait(160);
}
function ripple(pos, color) { const c = $('#cell' + pos), r = document.createElement('div'); r.className = 'ripple'; r.style.setProperty('--c', color); c.appendChild(r); setTimeout(() => r.remove(), 950); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
const dotOf = (pid) => { const p = pById(pid); return p ? `<span class="dot" style="background:${p.color}"></span>` : ''; };
async function playFx(f) {
  const p = f.pid && pById(f.pid);
  if (f.type === 'dice') {
    const sum = $('#diceSum'); sum.className = 'dice-sum';
    Snd.dice(); setDie(0, f.dice[0], true); setDie(1, f.dice[1], true);
    $('#status').innerHTML = `${dotOf(f.pid)}${esc(p ? p.name : '')} 掷骰子…`;
    await wait(1150);
    const dbl = f.dice[0] === f.dice[1];
    sum.textContent = (dbl ? '双数 ' : '') + (f.dice[0] + f.dice[1]); sum.className = 'dice-sum show' + (dbl ? ' dbl' : '');
    if (dbl) Snd.plus();
    $('#status').innerHTML = `${dotOf(f.pid)}${esc(p ? p.name : '')} 掷出 ${f.dice[0]} + ${f.dice[1]} = ${f.dice[0] + f.dice[1]}${dbl ? ' · 双数！' : ''}`;
    await wait(380);
  } else if (f.type === 'move') {
    const dir = f.steps > 0 ? 1 : -1, el = tokenEls[f.pid];
    const dt = fxQueue.length > 3 ? 90 : Math.abs(f.steps) > 14 ? 110 : 230;
    let pos = animPos[f.pid] !== undefined ? animPos[f.pid] : f.from;
    flying[f.pid] = true; placeTokens(); await wait(180);
    for (let s = 0; s < Math.abs(f.steps); s++) {
      pos = (pos + dir + N) % N; animPos[f.pid] = pos; placeTokens(); Snd.step();
      if (el) { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
      if ((BOARD[pos].type === 'go' || BOARD[pos].type === 'hub') && dir > 0 && p) ripple(pos, p.color);
      await wait(dt);
    }
    if (p) ripple(pos, p.color); Snd.noise(0.12, 0, 0.35, 180); Snd.tone(140, 0.12, 'sine', 0.12);
    await wait(260); flying[f.pid] = false; placeTokens(); await wait(200);
  } else if (f.type === 'jump') {
    Snd.jail(); await banner(`🚔 ${esc(p ? p.name : '')} 被送进监狱`, { color: '#E5383B', ms: 900 });
    animPos[f.pid] = f.to; placeTokens(); if (p) ripple(f.to, '#E5383B'); await wait(400);
  } else if (f.type === 'pos') {
    await posAnim(f);
  } else if (f.type === 'posmulti') {
    await posMulti(f);
  } else if (f.type === 'buy') {
    Snd.buy(); ripple(f.pos, p.color);
    await banner(`${avatar(p)}${esc(p.name)} 买下 ${sqIcon(f.pos)}<b>${BOARD[f.pos].name}</b>`, { color: sqColor(f.pos), ms: 1000 });
  } else if (f.type === 'build') {
    Snd.build(); ripple(f.pos, sqColor(f.pos));
    await banner(`${f.level === 5 ? '🏨' : '🏠'} ${BOARD[f.pos].name} ${f.level === 5 ? '升级为酒店' : '建起第 ' + f.level + ' 栋房屋'}`, { color: sqColor(f.pos), ms: 650 });
  } else if (f.type === 'turn') {
    $('#diceSum').className = 'dice-sum';
    if (f.pid === myId) { Snd.turn(); await banner(`${avatar(p)} 现在是您的回合`, { color: p.color, big: true, ms: 1300 }); }
    else if (p) { $('#status').innerHTML = `${dotOf(p.id)}轮到 ${esc(p.name)}`; await wait(150); }
  } else if (f.type === 'set') {
    const g = GROUPS[f.group];
    if (f.pid === myId) { Snd.win(); await banner(`🎉 您已集齐${g.name}地产，现可开始建房`, { color: g.color, big: true, ms: 2200 }); }
    else await banner(`${avatar(p)}${esc(p.name)} 集齐了${g.name}地产`, { color: g.color, ms: 900 });
  } else if (f.type === 'rich') {
    Snd.win(); confetti();
    await banner(`👑 ${esc(p.name)} ${f.rank === 1 ? '成为首富，率先胜出！' : '以第 ' + f.rank + ' 名胜出'}　其余玩家继续对战`, { color: '#E2A100', big: true, ms: 3000 });
  } else if (f.type === 'tp') {
    Snd.swoosh(); const el = tokenEls[f.pid]; if (el) el.animate([{ opacity: 1 }, { opacity: 0 }], 300);
    await banner(`🌀 ${esc(p.name)} 传送到 ${BOARD[f.to].name}`, { color: '#8E5BD6', ms: 700 });
    animPos[f.pid] = f.to; placeTokens(); ripple(f.to, '#8E5BD6'); await wait(350);
  } else if (f.type === 'stockroll') {
    Snd.dice(); await banner(`📈 ${esc(p.name)} 押 ${fmt(f.stake)} 炒股…`, { ms: 900 });
    f.win ? Snd.win() : Snd.bad();
    await banner(`🎲 ${f.d} 点：${f.win ? '大涨，赚 ' + fmt(f.stake) : '下跌，亏 ' + fmt(Math.floor(f.stake / 2))}`, { color: f.win ? '#2DA44E' : '#E5383B', big: true, ms: 1300 });
  } else if (f.type === 'stage') {
    Snd.alarm(); await banner(`📈 通货膨胀 · 第 ${f.stage + 1} 阶段　地价 ×${Math.round((f.pinfl || f.infl) * 100) / 100} · 租金 ×${Math.round(f.infl * 100) / 100} · 地产税 ${Math.round((f.taxRate || 0.04) * 1000) / 10}%`, { color: '#E2A100', big: true, ms: 2000 });
  } else if (f.type === 'boost') {
    Snd.win(); await banner('🚀 进程加速器已启动，请查看右上角的个人任务', { color: '#0A6FE0', big: true, ms: 2000 });
  } else if (f.type === 'task') {
    Snd.win(); if (f.pid === myId) confetti(); await banner(`✅ ${esc(p.name)} 完成任务，奖励 ${fmt(f.reward)}`, { color: '#2DA44E', big: f.pid === myId, ms: 1400 });
  } else if (f.type === 'xchg') {
    curAmt = f.amount;
    posScreen(`${p.name} 银行兑换`, fmt(f.amount)); Snd.beep(); await payVisual({ ...p, pay: f.from }, 'out', 0.6, () => {}); await payVisual({ ...p, recv: f.to }, 'in', 0.6, () => {}); posDone();
  } else if (f.type === 'news') {
    const a = GameData.ASSETS.find((x) => x.id === f.id);
    window.lastNews = { id: f.id, text: `${a.name}${f.pct > 0 ? '暴涨 +' : '暴跌 '}${f.pct}%`, up: f.pct > 0, t: Date.now() };
    Snd.tone(f.pct > 0 ? 1320 : 520, 0.12, 'sine', 0.025);
    if (window.onMarket) onMarket();
  } else if (f.type === 'joined') {
    const p = pById(f.pid); if (p) { Snd.plus(); await banner(`🙋 ${esc(p.name)} 中途加入了游戏`, { color: p.color, ms: 1100 }); }
  } else if (f.type === 'deal') {
    Snd.buy(); await banner(`🤝 ${esc(pById(f.from).name)} 和 ${esc(pById(f.to).name)} 成交`, { ms: 900 });
  } else if (f.type === 'bid') {
    Snd.tone(1200, 0.08, 'sine', 0.1); const a = $('#auPrice'); if (a) { a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); }
  } else if (f.type === 'bankrupt') {
    Snd.bad(); await banner(`💥 ${esc(p ? p.name : '')} 破产了`, { color: '#E5383B', big: true, ms: 1300 });
  }
}

// ================= 侧栏 =================
function renderPlayers() {
  $('#players').innerHTML = S.players.map((p, i) => {
    const v = disp[p.id] === undefined ? (shown[p.id] === undefined ? p.money : shown[p.id]) : disp[p.id], dg = !fxBusy && inDanger(p);
    return `<div class="pl ${i === S.turn && S.phase === 'play' ? 'cur' : ''} ${p.won ? 'won' : p.bankrupt ? 'dead' : ''} ${dg ? 'danger' : ''}" data-pid="${p.id}">
      ${avatar(p)}
      <div class="who">
        <div class="nm">${esc(p.name)}${S.rich.includes(p.id) ? `<span class="badge crown">👑${S.rich.indexOf(p.id) + 1}</span>` : ''}${p.id === myId ? '<span class="badge">我</span>' : ''}${p.auto && !p.bankrupt ? '<span class="badge auto" title="托管中：系统代为操作">🤖托管</span>' : ''}${dg ? '<span class="badge warn">濒临破产</span>' : ''}${p.inJail ? '<span class="badge jail">监狱</span>' : ''}${!p.connected && !p.bankrupt ? '<span class="badge off">离线</span>' : ''}</div>
        ${p.won ? `<div class="wonTag">👑 第 ${p.won} 名 · 已胜出</div>` : p.bankrupt ? '<div class="mn">已破产</div>' : `<div class="mn ${v < 0 ? 'neg' : ''}" data-pid="${p.id}">${fmt(Math.round(v / 10) * 10)}</div>`}${p.bankrupt ? '' : `<div class="wt" data-pid="${p.id}">总资产 ${fmt(p.worth)}</div>`}${S.tasks[p.id] && !p.bankrupt ? `<div class="tk ${S.tasks[p.id].done ? 'done' : ''}">${S.tasks[p.id].done ? '✅' : '🎯'} ${S.tasks[p.id].text}${S.tasks[p.id].done ? '' : `（${S.tasks[p.id].have}/${S.tasks[p.id].need}）奖 ${fmt(S.tasks[p.id].reward)}`}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// 房主破产或胜出后，仍然可以管理这局游戏
function hostPanel(m) {
  if (!m.host || S.phase !== 'play') return '';
  const cur = curP(), others = S.players.filter((p) => !p.bankrupt && p.id !== m.id);
  return `<div class="host-panel"><div class="fg-title"><span>👑 房主管理</span><small>破产 / 胜出后依然有效</small></div>
    <div class="act-row tools-row"><button class="btn sm boost" data-act="boost" data-confirm="启动进程加速器？\n· 立刻通货膨胀一级（租金、工资、收益 ×1.5）\n· 每个人领到一个新任务，完成有奖励">🚀 加速器</button>${cur && !cur.connected ? '<button class="btn sm" data-act="skip">跳过掉线玩家</button>' : ''}<button class="btn sm danger" data-act="endGame" data-confirm="确定现在结束游戏，按总资产排名吗？">结束并结算</button></div>
    ${others.length ? `<div class="hp-kick">${others.map((p) => `<button class="chip-k" data-kick="${p.id}" title="将 ${esc(p.name)} 移出房间">${avatar(p)}${esc(p.name)}${p.connected ? '' : ' · 离线'}<b>移出</b></button>`).join('')}</div>` : ''}</div>`;
}
function renderActions() {
  const el = $('#actions'), m = me(), cur = curP(), pd = S.pending;
  if (!m) { el.innerHTML = '<div class="act-sub">观战模式</div>'; return; }
  const myTurn = cur.id === myId, K = (k) => `<kbd>${k}</kbd>`;
  let h = '';
  if (S.phase === 'end') h = `<div class="act-title">游戏结束</div>`;
  else if (m.won) h = `<div class="act-title">👑 您已以第 ${m.won} 名胜出</div><div class="act-sub">其余玩家仍在对战，您可继续观战</div>` + hostPanel(m);
  else if (m.bankrupt) h = `<div class="act-title">您已破产</div><div class="act-sub">可以继续观战</div>` + hostPanel(m);
  else if (fxBusy) h = `<div class="act-title">${myTurn ? '您的回合' : esc(cur.name) + ' 的回合'}</div><div class="act-sub">…</div>`;
  else if (pd && pd.kind === 'pay' && pd.payer === myId) {
    const to = pd.to === 'each' ? '每位玩家' : pd.to ? pById(pd.to).name : '银行';
    h = `<div class="act-title">需支付 ${fmt(pd.amount)}</div><div class="act-sub">${esc(pd.reason)} → ${esc(to)}</div>`;
    if (m.money >= pd.amount) h += `<div class="act-sub">👉 把棋盘中间的银行卡拖进刷卡机</div><button class="btn primary wide" data-act="swipe">刷卡支付${K('空格')}</button>`;
    else h += `<div class="act-sub" style="color:var(--red)">余额不足，尚缺 ${fmt(pd.amount - m.money)}。点「我的地产」卖房、抵押，或到交易所卖地</div>`;
    const row = [];
    if (pd.cancelTo) row.push(`<button class="btn" data-act="cancelBuy">取消购买</button>`);
    if (m.money < pd.amount) row.push(`<button class="btn danger" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`);
    if (row.length) h += `<div class="act-row">${row.join('')}</div>`;
  } else if (pd && pd.pid === myId && pd.kind === 'stock') {
    h = `<div class="act-title">📈 股票交易所</div><div class="act-sub">押一部分现金，掷一颗骰子：4–6 点翻倍（赚到押注同样多的钱），1–3 点亏掉押注的一半</div>
      <div class="act-row">${[10, 25, 50].map((x) => `<button class="btn primary" data-stock="${x}">押 ${x}%<br><small>${fmt(Math.floor(m.money * x / 100))}</small></button>`).join('')}</div><button class="btn wide" data-stock="0">放弃</button>`;
  } else if (pd && pd.pid === myId && pd.kind === 'portal') {
    h = `<div class="act-title">🌀 传送门</div><div class="act-sub">👉 直接点击地图上任意一格，飞过去（会触发那一格的效果）</div>`;
  } else if (pd && pd.pid === myId && pd.kind === 'force') {
    h = `<div class="act-title">🔨 强制拍卖</div><div class="act-sub">选别人的一块没盖房的地，全场重新拍卖，成交价归原主人</div><div class="act-row"><button class="btn primary" data-local="force">选一块地</button><button class="btn" data-force="skip">放弃</button></div>`;
  } else if (myTurn && pd && pd.kind === 'buy') {
    const sq = BOARD[pd.pos];
    h = `<div class="act-title">要买下 ${sq.name} 吗？</div><div class="act-sub">${S.props[pd.pos].fore ? '法拍房半价 ' : '价格 '}${fmt(priceOf(pd.pos))} · 您有 ${fmt(m.money)}</div>
         <div class="act-row"><button class="btn primary" data-act="buy">购买${K('B')}</button><button class="btn" data-act="auction">拍卖${K('A')}</button></div>`;
  } else if (myTurn && !pd) {
    if (m.money < 0) h = `<div class="act-title" style="color:var(--red)">您欠款 ${fmt(-m.money)}</div><div class="act-sub">先卖房、抵押或卖地，否则只能破产</div><button class="btn danger wide" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`;
    else if (m.inJail && !S.rolled) {
      h = `<div class="act-title">您在监狱里（第 ${m.jailTurns + 1} 次尝试）</div><div class="act-sub">掷出双数即可出狱，或缴纳保释金</div>
        <button class="btn primary big wide" data-act="roll">🎲 掷骰子${K('空格')}</button>
        <div class="act-row"><button class="btn" data-act="payJail">保释金 ${fmt(RULES.jailFine)}${K('J')}</button>${m.goojf.length ? `<button class="btn green" data-act="useCard">出狱卡${K('U')}</button>` : ''}</div>`;
    } else if (!S.rolled || S.canRollAgain) h = `<div class="act-title">${S.canRollAgain ? '掷出双数，请再次掷骰' : '请掷骰'}</div><button class="btn primary big wide" data-act="roll">🎲 掷骰子${K('空格')}</button>`;
    else h = `<div class="act-title">本回合操作已完成</div><div class="act-sub">即将自动轮到下一位玩家</div>`;
  } else {
    let what = '操作中…';
    if (pd && pd.kind === 'pay') what = `正在支付 ${fmt(pd.amount)}（${esc(pd.reason)}）`;
    else if (pd && pd.kind === 'buy') what = `考虑是否购买 ${BOARD[pd.pos].name}`;
    else if (pd && pd.kind === 'card') what = '正在看卡片';
    else if (pd && pd.kind === 'auction') what = '拍卖进行中';
    h = `<div class="act-title">${esc(cur.name)} 的回合</div><div class="act-sub">${what}</div>`;
    if (m.money < 0) h += `<div class="act-sub" style="color:var(--red)">您欠款 ${fmt(-m.money)}，请卖房/抵押</div><button class="btn danger wide" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`;
    if (!cur.connected && m.host) h += `<div class="act-row"><button class="btn" data-act="skip">跳过这一回合</button><button class="btn danger" data-kick="${cur.id}">移出房间</button></div>`;
  }
  const mine = S.trades.find((t) => t.from === myId);
  if (mine && S.phase === 'play') h += `<div class="act-sub">⏳ 等待 ${esc(pById(mine.to).name)} 回复报价 <button class="btn sm" data-act="respond" data-id="${mine.id}" data-accept="">撤回</button></div>`;
  if (S.phase === 'play' && !m.bankrupt) h += `<div class="act-row"><button class="btn market wide" data-local="market">🏛 地产交易所${K('T')}</button></div><div class="fin-group"><div class="fg-title"><span>金融中心</span><small>随时可操作 · 快捷键 F / G / L</small></div><div class="fg-row"><button class="fg-btn stock" data-fin="stock" title="快捷键 F"><i>📈</i><b>股票</b></button><button class="fg-btn bet ${m.bet ? 'live' : ''}" data-fin="bet" title="快捷键 G"><i>🎯</i><b>涨跌竞猜</b></button><button class="fg-btn loan ${m.loan > 0 ? 'live' : ''}" data-fin="loan" title="快捷键 L"><i>🏦</i><b>银行贷款</b></button></div></div><div class="act-row tools-row"><button class="btn sm" data-local="send">💬 互动 / 转账</button>${m.host ? `<button class="btn sm boost" data-act="boost" data-confirm="启动进程加速器？\n· 立刻通货膨胀一级（租金、工资、收益 ×1.5）\n· 每个人领到一个新任务，完成有奖励">🚀 加速器</button><button class="btn sm" data-act="endGame" data-confirm="确定现在结束游戏，按总资产排名吗？">结束结算</button>` : ''}</div>${window.toolsRow ? toolsRow(m) : ''}`;
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
}

function renderAssets() {
  const m = me(); if (!m) return;
  const list = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === myId);
  const st = (i) => S.props[i];
  $('#assets').innerHTML = `<div class="panel-title"><span>持有地产（${list.length}）· 点击可建房或抵押</span><span>总资产 ${fmt(m.worth)}</span></div>` +
    (list.length ? `<div class="chips">${list.map((i) => `<div class="chip-p ${st(i).mortgaged ? 'mort' : ''}" data-deed="${i}"><i style="background:${sqColor(i)}"></i>${BOARD[i].name}${st(i).houses ? `<small>${st(i).houses === 5 ? '🏨' : '🏠' + st(i).houses}</small>` : ''}</div>`).join('')}</div>` : '<div class="act-sub" style="margin:0">暂无地产。抵达无主地产时可购入</div>') +
    (m.goojf.length ? `<div class="act-sub" style="margin-top:8px">🎟️ 出狱许可证 × ${m.goojf.length}</div>` : '') +
    (m.w ? `<div class="wallets"><span>💳 ${fmt(m.w.card)}</span><span>📱 ${fmt(m.w.phone)}</span><span>💵 ${fmt(m.w.cash)}</span><button class="btn sm" data-local="bank">🏦 去银行兑换</button></div>` : '');
}

let logKey = '';
function renderLog() { const last = S.log[S.log.length - 1], k = last ? last.t + last.msg : ''; if (k === logKey) return; logKey = k; $('#log').innerHTML = S.log.slice().reverse().map((l) => `<div>${esc(l.msg)}</div>`).join(''); }

function renderStatus() {
  if (fxBusy) return;
  const cur = curP(), pd = S.pending;
  let s = `${dotOf(cur.id)}轮到 ${esc(cur.name)}`;
  if (pd && pd.kind === 'pay') s = `${dotOf(pd.payer)}${esc(pById(pd.payer).name)} 需支付 ${fmt(pd.amount)}`;
  if (pd && pd.kind === 'auction' && S.auction) s = `🔨 拍卖中：${BOARD[S.auction.pos].name}`;
  if (S.phase === 'end') s = `🏆 ${esc(pById(S.winner).name)} 获胜`;
  $('#status').innerHTML = s;
}

// ---------- 濒临破产：全屏红色警告 ----------
function renderDanger() {
  const m = me(), should = !!m && inDanger(m);
  if (should && !dangerOn && !fxBusy) { dangerOn = true; $('#danger').hidden = false; Snd.alarm(); }
  else if (!should && dangerOn) { dangerOn = false; $('#danger').hidden = true; }
}

// ================= 机会 / 命运牌 / 幸运转盘 =================
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function csSpark(stage, txt, x, y, kf, dur) { const d = document.createElement('div'); d.className = 'cs-p'; d.textContent = txt; d.style.left = x + 'px'; d.style.top = y + 'px'; stage.appendChild(d); d.animate(kf, dur).onfinish = () => d.remove(); return d; }
function wheelSVG(list) {
  const n = list.length, seg = 360 / n, R = 150, cols = ['#EF4444', '#F59E0B', '#FACC15', '#22C55E', '#14B8A6', '#0EA5E9', '#3B82F6', '#8B5CF6', '#D946EF', '#EC4899', '#F97316', '#84CC16'];
  const P = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`; };
  const segs = list.map((w, k) => `<path d="M0 0L${P(k * seg, R)}A${R} ${R} 0 0 1 ${P((k + 1) * seg, R)}z" fill="${cols[k % cols.length]}" class="wh-seg" data-k="${k}"/>`).join('');
  const labels = list.map((w, k) => `<g transform="rotate(${(k + 0.5) * seg})"><text y="-104" text-anchor="middle">${w.s || ''}</text></g>`).join('');
  const bulbs = Array.from({ length: 22 }, (_, i) => `<circle cx="${(158 * Math.cos((i / 22) * Math.PI * 2)).toFixed(1)}" cy="${(158 * Math.sin((i / 22) * Math.PI * 2)).toFixed(1)}" r="4.2" class="${i % 2 ? 'b1' : 'b2'}"/>`).join('');
  return `<div class="wheel-wrap"><svg viewBox="-180 -192 360 380"><circle r="170" fill="#3B0A2E" opacity=".55"/><g class="wh-rot">${segs}<g class="wh-lbl">${labels}</g><g stroke="#fff" stroke-width="1.5" opacity=".6">${list.map((w, k) => `<path d="M0 0L${P(k * seg, R)}"/>`).join('')}</g></g>
    <circle r="158" fill="none" stroke="url(#gGold)" stroke-width="14"/><circle r="151" fill="none" stroke="#7A4A00" stroke-width="1.5" opacity=".5"/><g class="wh-bulbs">${bulbs}</g>
    <circle r="27" fill="url(#gGold)" stroke="#fff" stroke-width="3"/><text y="7" text-anchor="middle" class="wh-hub">转</text>
    <g class="wh-ptr"><path d="M-17 -190h34l-17 34z" fill="#E11D48" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><circle cy="-183" r="5" fill="#fff"/></g></svg></div>`;
}
function renderCard() {
  const pd = S.pending, stage = $('#cardStage');
  const want = S.phase === 'play' && pd && pd.kind === 'card' ? 'c' + pd.seq : '';
  if (!want) { if (cardKey) { cardKey = ''; stage.hidden = true; stage.innerHTML = ''; stage.className = 'card-stage'; } return; }
  if (want === cardKey || fxBusy) return;
  cardKey = want;
  const key = cardKey, alive = () => cardKey === key, at = (ms, fn) => setTimeout(() => alive() && fn(), ms);
  const dk = pd.deck, chance = dk === 'chance', wheel = dk === 'wheel', list = chance ? CHANCE : dk === 'chest' ? CHEST : GameData.WHEEL, card = list[pd.id], who = pById(pd.pid);
  const c = chance ? '#F07A1E' : dk === 'chest' ? '#2453D6' : '#C026D3', name = chance ? '机会' : dk === 'chest' ? '命运' : '幸运转盘', en = chance ? 'CHANCE' : dk === 'chest' ? 'DESTINY' : 'LUCKY WHEEL';
  const f = card.fx, good = (f.t === 'money' && f.amt > 0) || (f.t === 'each' && f.amt > 0) || f.t === 'goojf', bad = (f.t === 'money' && f.amt < 0) || (f.t === 'each' && f.amt < 0) || f.t === 'jail' || f.t === 'repairs' || f.t === 'proptax';
  const mood = good ? 'good' : bad ? 'bad' : 'plain', text = pd.text || card.text, am = (f.t === 'money' || f.t === 'each') && text.match(/([\d.]+)([KMB])/);
  const stampTxt = good ? pick(['好运降临', '意外之财', '鸿运当头']) : bad ? pick(['厄运当头', '破财消灾', '天有不测']) : pick(['命运转折', '风云突变', '峰回路转']);
  stage.innerHTML = `<div class="cs-burst ${mood}"></div>${wheel ? wheelSVG(list) : ''}
    <div class="bigcard ${mood}-m" style="--c:${c}"><div class="bigcard-in">
      <div class="bigface bigback"><div class="emb">${SPECIAL_ICON[chance ? 'chance' : dk === 'chest' ? 'chest' : 'wheel']}</div><div class="bk-t"><div class="nm">${name}</div><small>WORLD BANK · ${en}</small></div><i class="foil"></i></div>
      <div class="bigface bigfront"><div class="kind">${name} · ${en}</div><div class="txt">${esc(text)}</div>${am ? `<div class="amt ${f.amt > 0 ? 'gain' : 'loss'}" data-v="${am[1]}" data-u="${am[2]}">${f.amt > 0 ? '+' : '−'}0${am[2]}</div>` : ''}<div class="stamp">${stampTxt}</div></div>
    </div></div>
    <div class="cs-flash"></div>
    <div class="stage-foot">${esc(who.name)} 抽到的${wheel ? '转盘结果' : name + '牌'}${pd.pid === myId ? `<br><button class="btn primary big" data-act="card">确认<kbd>空格</kbd></button>` : ''}</div>`;
  stage.className = 'card-stage ' + dk; stage.hidden = false;
  const big = stage.querySelector('.bigcard'), inner = stage.querySelector('.bigcard-in'), foot = stage.querySelector('.stage-foot');
  const cr = $('#cell' + who.pos).getBoundingClientRect(), br = big.getBoundingClientRect();
  const dx = cr.left + cr.width / 2 - (br.left + br.width / 2), dy = cr.top + cr.height / 2 - (br.top + br.height / 2), sc = Math.max(0.08, cr.width / br.width);
  const cx = br.left + br.width / 2, cy = br.top + br.height / 2;

  // 蓄力：光点从四周汇聚到牌上
  const charge = (t0) => {
    at(t0, () => { big.classList.add('charge'); Snd.sweep(180, 1500, 0.75, 'sawtooth', 0.025); Snd.sweep(360, 3000, 0.75, 'sine', 0.03); });
    for (let i = 0; i < 22; i++) at(t0 + i * 28, () => { const a = Math.random() * Math.PI * 2, r = 280 + Math.random() * 260; csSpark(stage, pick(['✦', '✧', '·', '✦']), cx + Math.cos(a) * r, cy + Math.sin(a) * r, [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translate(calc(-50% + ${-Math.cos(a) * r}px), calc(-50% + ${-Math.sin(a) * r}px)) scale(1.4)`, opacity: 0.9 }], 520); });
  };
  // 翻牌 + 揭晓
  const flip = (t0) => {
    at(t0, () => { big.classList.remove('charge'); Snd.flip(); inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(95deg) scale(1.12)', offset: 0.45 }, { transform: 'rotateY(-12deg) scale(1.04)', offset: 0.8 }, { transform: 'rotateY(0)' }], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }); });
    at(t0 + 300, () => { stage.querySelector('.cs-flash').animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' }); stage.querySelector('.cs-burst').classList.add('on'); });
    at(t0 + 700, () => reveal());
    at(t0 + 1250, () => foot.classList.add('show'));
  };
  const reveal = () => {
    big.classList.add('revealed'); stage.classList.add(mood);
    if (good) { Snd.win(); [1568, 2093, 2637, 3136].forEach((q, i) => Snd.tone(q, 0.18, 'sine', 0.05, 0.3 + i * 0.07)); confetti(); }
    else if (bad) { Snd.noise(0.6, 0, 0.6, 180); Snd.tone(70, 0.7, 'sine', 0.25); Snd.sweep(500, 90, 0.7, 'sawtooth', 0.05); const g = $('#game'); if (g) g.animate([0, 1, 2, 3, 4, 5, 6].map((i) => ({ translate: i === 6 ? '0 0' : `${(i % 2 ? 1 : -1) * (12 - i * 2)}px ${(i % 3 - 1) * 4}px` })), 520); }
    else { Snd.chord([784, 988, 1175], 0.6, 'sine', 0.05); }
    at(180, () => Snd.noise(0.12, 0, 0.6, 600)); // 盖章声
    const r = big.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    for (let i = 0; i < (good ? 34 : 22); i++) { const a = Math.random() * Math.PI * 2, rr = 200 + Math.random() * 280; csSpark(stage, good ? pick(['🪙', '🪙', '✨', '💰']) : bad ? pick(['💥', '💢', '☁️', '⚡️']) : pick(['✨', '💫', '⭐']), x0, y0, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * rr}px), calc(-50% + ${Math.sin(a) * rr + (good ? 90 : 30)}px)) scale(1.4) rotate(${Math.random() * 540}deg)`, opacity: 0 }], 1000 + Math.random() * 700); }
    const amt = stage.querySelector('.amt');
    if (amt) { const v = +amt.dataset.v, u = amt.dataset.u, dec = (amt.dataset.v.split('.')[1] || '').length, sign = amt.textContent[0], t0 = performance.now(); const tick = (t) => { const k = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - k, 3); amt.textContent = sign + (v * e).toFixed(dec) + u; if (k < 1 && alive()) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  };

  if (!wheel) {
    Snd.card(); Snd.sweep(500, 1100, 0.6, 'sine', 0.03);
    big.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotateX(70deg) rotateZ(-50deg)`, opacity: 0.3, filter: 'blur(4px) brightness(2)' },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 140}px) scale(.75) rotateX(25deg) rotateZ(190deg)`, opacity: 1, filter: 'blur(1.5px) brightness(1.4)', offset: 0.5 },
      { transform: 'translate(0, -4%) scale(1.1) rotateX(-10deg) rotateZ(352deg)', filter: 'blur(0) brightness(1.1)', offset: 0.82 },
      { transform: 'rotateZ(360deg)', opacity: 1, filter: 'none' },
    ], { duration: 950, easing: 'cubic-bezier(.25,.7,.25,1)', fill: 'backwards' });
    at(950, () => { Snd.tone(80, 0.3, 'sine', 0.22); Snd.noise(0.15, 0, 0.3, 400); big.classList.add('landed'); const rg = document.createElement('div'); rg.className = 'cs-ring'; stage.appendChild(rg); rg.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 }], 700).onfinish = () => rg.remove(); });
    charge(1100); flip(1850);
    return;
  }
  // 幸运转盘：真的转一圈，停在结果上，再弹出结果卡
  const wrap = stage.querySelector('.wheel-wrap'), rot = stage.querySelector('.wh-rot'), ptr = stage.querySelector('.wh-ptr'), wr = wrap.getBoundingClientRect();
  big.style.opacity = '0';
  Snd.card();
  wrap.animate([{ transform: `translate(${cr.left + cr.width / 2 - (wr.left + wr.width / 2)}px, ${cr.top + cr.height / 2 - (wr.top + wr.height / 2)}px) scale(${Math.max(0.06, cr.width / wr.width)}) rotate(-200deg)`, opacity: 0.4 }, { transform: 'scale(1.05) rotate(10deg)', opacity: 1, offset: 0.8 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
  const n = list.length, seg = 360 / n, target = 360 * 6 + (360 - (pd.id + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6, DUR = 2700;
  at(650, () => {
    const t0 = performance.now(); let last = -1;
    const step = (t) => {
      if (!alive()) return;
      const k = Math.min(1, (t - t0) / DUR), a = target * (1 - Math.pow(1 - k, 4)), idx = Math.floor(a / seg);
      rot.setAttribute('transform', `rotate(${a.toFixed(2)})`);
      if (idx !== last) { last = idx; Snd.tone(1700 + Math.random() * 200, 0.025, 'square', 0.035); ptr.animate([{ transform: 'rotate(-16deg)' }, { transform: 'rotate(0)' }], { duration: 140, easing: 'ease-out' }); }
      if (k < 1) requestAnimationFrame(step);
      else {
        const s = stage.querySelector(`.wh-seg[data-k="${pd.id}"]`); if (s) s.classList.add('win');
        Snd.chord([659, 880, 1046], 0.5, 'triangle', 0.05); wrap.classList.add('done');
        at(650, () => {
          wrap.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.55) translateY(-30%)', opacity: 0.18 }], { duration: 450, easing: 'ease-in', fill: 'forwards' });
          big.style.opacity = ''; Snd.swoosh();
          big.animate([{ transform: 'scale(.1) rotateZ(-30deg)', opacity: 0 }, { transform: 'scale(1.12) rotateZ(4deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
          charge(420); flip(1000);
        });
      }
    };
    requestAnimationFrame(step);
  });
}

// ================= 弹窗 =================
function deedHTML(i) {
  const sq = BOARD[i], st = S.props[i], owner = st.owner && pById(st.owner);
  const head = (c) => `<div class="deed-head" style="background:${c}">${sq.type === 'prop' ? landmark(sq.name) : ''}<small>${sq.type === 'prop' ? sq.mark + ' · ' + sq.en : sq.type === 'rail' ? (sq.kind === 'port' ? '港 口' : '机 场') : '公 用 事 业'}</small><b>${sq.name}</b></div>`;
  let rows = '';
  if (sq.type === 'prop') {
    const full = owner && Object.keys(S.props).every((k) => BOARD[k].group !== sq.group || S.props[k].owner === st.owner);
    const lv = st.houses;
    rows = [['租金', sq.rent[0], lv === 0 && !full], ['集齐同色（无房）', sq.rent[0] * 2, lv === 0 && full], ['1 栋房屋', sq.rent[1], lv === 1], ['2 栋房屋', sq.rent[2], lv === 2], ['3 栋房屋', sq.rent[3], lv === 3], ['4 栋房屋', sq.rent[4], lv === 4], ['酒店', sq.rent[5], lv === 5]]
      .map(([a, b, on]) => `<tr class="${on && owner ? 'on' : ''}"><td>${a}</td><td>${fmtI(b)}</td></tr>`).join('');
    return `<div class="deed">${head(GROUPS[sq.group].color)}<table>${rows}</table><div class="foot">房屋基础造价 ${fmtP(GROUPS[sq.group].house)}（越往上盖越贵，下一栋 <b>${fmt(S.buildCost[i] || 0)}</b>）<br>${(() => { const h = S.props[i].houses; if (h >= 5) return '🏨 已建成酒店<br>'; const gain = (incomePerSec(i, h + 1) - incomePerSec(i, h)) * INF(), c = S.buildCost[i] || 0, mins = gain > 0 ? c / gain / 60 : 0; return `🧮 回本计算：下一${h === 4 ? '座酒店' : '栋房'}每秒多赚 <b>+${fmt(Math.round(gain))}</b>，约 <b>${mins < 1 ? '不到 1' : Math.round(mins)} 分钟</b>回本（不含租金）<br>`; })()}💰 每栋房屋每秒收益 +${fmtI(incomePerSec(i, 1))}（酒店每秒 +${fmtI(incomePerSec(i, 5))}）<br>抵押值 ${fmtP(sq.price / 2)} · 现价 ${fmtP(sq.price)}</div></div>`;
  }
  if (sq.type === 'rail') rows = RULES.railRent.map((v, n) => `<tr><td>拥有 ${n + 1} 个机场/港口</td><td>${fmtI(v)}</td></tr>`).join('');
  else rows = RULES.utilMult.map((v, n) => `<tr><td>拥有 ${n + 1} 家</td><td>点数 × ${fmtI(v)}</td></tr>`).join('');
  return `<div class="deed">${head(sq.type === 'rail' ? '#3A4250' : '#8E8E93')}<table>${rows}</table><div class="foot">抵押值 ${fmtP(sq.price / 2)} · 现价 ${fmtP(sq.price)}</div></div>`;
}

function openLocal(v) { localView = v; $('#localBox').dataset.v = ''; renderLocal(); }
function closeLocal() { localView = null; $('#local').hidden = true; }
$('#local').onclick = (e) => { if (e.target.id === 'local') closeLocal(); };

function renderLocal() {
  if (!localView) { $('#local').hidden = true; return; }
  const box = $('#localBox'), m = me();
  box.classList.toggle('market', localView.type === 'market' || localView.type === 'force');
  if (localView.type === 'deed') {
    const i = localView.pos, sq = BOARD[i], st = S.props[i], owner = st.owner && pById(st.owner);
    let h = deedHTML(i);
    h += `<p class="muted" style="text-align:center;margin:12px 0 0">${owner ? `主人：${esc(owner.name)}${st.mortgaged ? '（已抵押）' : ''}` : '属于银行（走到这格才能买）'}</p>`;
    if (owner && m && owner.id === myId && S.phase === 'play' && !m.bankrupt) {
      const btns = [];
      if (sq.type === 'prop' && st.houses < 5 && !st.mortgaged) btns.push(`<button class="btn primary" data-act="build" data-pos="${i}">${st.houses === 4 ? '建酒店' : '建第 ' + (st.houses + 1) + ' 栋'} ${fmt(S.buildCost[i] || 0)}</button>`);
      if (sq.type === 'prop' && st.houses > 0) btns.push(`<button class="btn" data-act="sell" data-pos="${i}">卖房 +${fmtP(GROUPS[sq.group].house / 2)}</button>`);
      if (!st.mortgaged && st.houses === 0) btns.push(`<button class="btn" data-act="mortgage" data-pos="${i}">抵押 +${fmtP(sq.price / 2)}</button>`);
      if (st.mortgaged) btns.push(`<button class="btn green" data-act="unmortgage" data-pos="${i}">赎回 ${fmt(Math.ceil(sq.price * PINF() / 2 * 1.1 / 10) * 10)}</button>`);
      h += `<div class="act-row">${btns.join('')}</div><div class="act-row"><button class="btn" data-sellto="${i}">卖给其他玩家…</button></div>`;
    } else if (owner && m && !m.bankrupt && S.phase === 'play') h += `<div class="act-row"><button class="btn primary" data-buyfrom="${i}">向 ${esc(owner.name)} 出价购买</button></div>`;
    h += `<div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    box.innerHTML = h;
  } else if (localView.type === 'send') {
    const v = localView, others = S.players.filter((p) => p.id !== myId && !p.bankrupt);
    if (!v.to || !others.some((p) => p.id === v.to)) v.to = others[0] && others[0].id;
    box.innerHTML = `<h3>💬 互动</h3><div class="muted">选一个人</div>
      <div class="who-pick">${others.map((p) => `<button data-sendto="${p.id}" class="${p.id === v.to ? 'on' : ''}">${avatar(p)}${esc(p.name)}</button>`).join('')}</div>
      ${m.host && v.to ? `<div class="act-row" style="margin-top:8px"><button class="btn danger sm" data-kick="${v.to}">👑 房主权限：移出该玩家${pById(v.to) && !pById(v.to).connected ? '（已掉线）' : ''}</button></div>` : ''}
      <div class="muted" style="margin-top:12px">发送文字（20 字以内，全体玩家可见）</div>
      <div class="say-row"><input id="sayText" maxlength="20" placeholder="说点什么…"><button class="btn primary" id="sayGo">发送</button></div>
      <div class="muted" style="margin-top:12px">发送表情（全体玩家可见）</div>
      <div class="emo-grid">${EMOTES.map((e) => `<button data-emote="${e}"><span>${e}</span><small>${(window.EMO_LABEL || {})[e] || ''}</small></button>`).join('')}</div>
      <div class="xfer"><span>💸 转账</span><div class="mk-price"><input id="sendAmt" type="number" min="0" step="1" placeholder="金额" value="${v.amount ? v.amount / 1000 : ''}"><span>M</span></div><button class="btn sm" id="sendGo">转出</button></div>
      <div class="mk-eq" id="sendEq">${v.amount ? '= ' + fmt(v.amount) + ' · ' : ''}您的现金 ${fmt(m.money)}</div>
      <div class="act-row"><button class="btn wide" data-close>关闭</button></div>`;
    const st_ = $('#sayText'); st_.onkeydown = (e) => { if (e.key === 'Enter') $('#sayGo').click(); };
    $('#sayGo').onclick = () => { const t = st_.value.trim().slice(0, 20); if (!t) return toast('请输入文字'); socket.emit('emote', { to: v.to, text: t }); closeLocal(); };
    const inp = $('#sendAmt'); inp.oninput = () => { v.amount = Math.max(0, Math.round((+inp.value || 0) * 1000)); $('#sendEq').textContent = `${v.amount ? '= ' + fmt(v.amount) + ' · ' : ''}您的现金 ${fmt(m.money)}`; };
    inp.onkeydown = (e) => { if (e.key === 'Enter') $('#sendGo').click(); };
    $('#sendGo').onclick = () => { if (!v.amount) return toast('请先输入金额'); act('send', { to: v.to, amount: v.amount }, (r) => { if (r.ok) { toast('转账成功'); closeLocal(); } }); };
  } else if (localView.type === 'bank') {
    const v = localView, ks = ['card', 'phone', 'cash']; v.from = v.from || 'card'; v.to = v.to && v.to !== v.from ? v.to : ks.find((k) => k !== v.from);
    const row = (key) => `<div class="who-pick">${ks.map((k) => `<button data-bank="${key}:${k}" class="${v[key] === k ? 'on' : ''}">${WNAME[k]} ${fmt(m.w[k])}</button>`).join('')}</div>`;
    box.innerHTML = `<h3>🏦 银行兑换</h3><div class="muted">把钱从一个钱包换到另一个钱包（总数不变，没有手续费）</div>
      <div class="muted" style="margin-top:10px">从</div>${row('from')}<div class="muted">换成</div>${row('to')}
      <div class="mk-price"><input id="bankAmt" type="number" min="0" step="1" placeholder="金额" value="${v.amount ? v.amount / 1000 : ''}"><span>M</span></div>
      <div class="mk-quick"><button data-bankall>全部 ${fmt(m.w[v.from])}</button></div>
      <div class="act-row"><button class="btn" data-close>关闭</button><button class="btn primary" id="bankGo">确认兑换</button></div>`;
    const inp = $('#bankAmt'); inp.oninput = () => { v.amount = Math.max(0, Math.round((+inp.value || 0) * 1000)); };
    $('#bankGo').onclick = () => { if (!v.amount) return toast('请先输入金额'); act('wallet', { from: v.from, to: v.to, amount: v.amount }, (r) => { if (r.ok) closeLocal(); }); };
  } else if (localView.type === 'force') {
    const list = Object.keys(S.props).map(Number).filter((i) => { const st = S.props[i]; return st.owner && st.owner !== myId && !st.mortgaged && !groupLocked(i); });
    box.innerHTML = `<h3>🔨 强制拍卖：选一块地</h3><div class="muted">全场重新拍卖这块地，成交价归原主人；没人出价就保持不变</div>
      <div class="mk-grid" style="margin-top:12px;max-height:60vh">${list.map((i) => { const o = pById(S.props[i].owner); return `<div class="tile" data-forcepos="${i}" style="--tint:${sqColor(i)}">${sqIcon(i)}<div class="tn">${BOARD[i].name}</div><div class="tp">标价 ${fmt(BOARD[i].price)}</div><span class="own">${avatar(o)}${esc(o.name)}</span></div>`; }).join('') || '<div class="mk-empty">没有可以拍卖的地</div>'}</div>
      <div class="act-row"><button class="btn wide" data-close>返回</button></div>`;
  } else if (window.renderExtra && renderExtra(localView, box, m)) {
  } else if (localView.type === 'help') {
    const rows = [['空格 / 回车', '掷骰子 · 结束回合 · 刷卡支付 · 确认卡片'], ['B', '购买踩到的地产'], ['A', '拍卖踩到的地产'], ['1 2 3 4 5', '拍卖时加价（从小到大五档）'], ['T', '打开地产交易所'], ['F', '股票交易'], ['G', '涨跌竞猜'], ['L', '银行贷款'], ['Y / X', '接受 / 拒绝别人的报价'], ['J', '在监狱里缴保释金'], ['U', '使用出狱许可证'], ['N', '夜间模式（护眼）'], ['M', '静音 / 打开声音'], ['H', '打开这张快捷键表'], ['Esc', '关闭弹窗']];
    box.innerHTML = `<h3>⌨️ 键盘快捷键</h3><div class="keys">${rows.map(([k, d]) => `<div>${k.split(' ').map((x) => (x === '/' ? '/' : `<kbd>${x}</kbd>`)).join(' ')}</div><div>${d}</div>`).join('')}</div><div class="act-row"><button class="btn wide" data-close>确定</button></div>`;
  } else if (localView.type === 'market') {
    if (box.dataset.v !== 'market') {
      box.dataset.v = 'market';
      box.innerHTML = `<div class="mk-head"><div><h3>🏛 地产交易所</h3><div class="muted">① 点一块地　② 输入价格　③ 发送报价，对方同意就成交</div></div>
        <div class="mk-tabs" id="mkTabs"></div></div>
        <div class="mk-body"><div class="mk-grid" id="mkGrid"></div><div class="mk-detail" id="mkDetail"></div></div>
        <div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
      marketDetail();
    }
    marketGrid();
  }
  $('#local').hidden = false;
}

// ---------- 地产交易所 ----------
function marketGrid() {
  const v = localView, tabs = [['all', '全部'], ['others', '别人的'], ['mine', '我的'], ['bank', '银行的']];
  const list = Object.keys(S.props).map(Number).filter((i) => { const o = S.props[i].owner; return v.tab === 'all' || (v.tab === 'mine' && o === myId) || (v.tab === 'bank' && !o) || (v.tab === 'others' && o && o !== myId); });
  const html = list.map((i) => {
    const st = S.props[i], o = st.owner && pById(st.owner);
    const own = !o ? '<span class="own bank">🏦 银行</span>' : o.id === myId ? `<span class="own me">${avatar(o)}我的</span>` : `<span class="own">${avatar(o)}${esc(o.name)}</span>`;
    return `<div class="tile ${v.sel === i ? 'on' : ''} ${!o ? 'dim' : ''}" data-tile="${i}" style="--tint:${sqColor(i)}">${sqIcon(i)}<div class="tn">${BOARD[i].name}${st.houses ? (st.houses === 5 ? ' 🏨' : ' 🏠' + st.houses) : ''}</div><div class="tp">标价 ${fmt(priceOf(i))}${st.mortgaged ? ' · 已抵押' : ''}</div>${own}</div>`;
  }).join('') || '<div class="mk-empty">这里还没有地产</div>';
  const g = $('#mkGrid'); if (g.dataset.h !== html) { g.dataset.h = html; g.innerHTML = html; }
  const th = tabs.map(([k]) => k === v.tab).join(); const tb = $('#mkTabs'); if (tb.dataset.h !== th) { tb.dataset.h = th; tb.innerHTML = tabs.map(([k, n]) => `<button data-tab="${k}" class="${v.tab === k ? 'on' : ''}">${n}</button>`).join(''); }
}
function marketDetail() {
  const v = localView, d = $('#mkDetail'), m = me();
  if (v.sel == null) { d.innerHTML = '<div class="mk-empty">👈 先在左边点一块地<br>每块地的角落写着它现在属于谁</div>'; return; }
  const i = v.sel, sq = BOARD[i], st = S.props[i], o = st.owner && pById(st.owner);
  let h = `<h4>${sq.name}</h4><div class="muted">${sq.type === 'prop' ? sq.mark + ' · ' + GROUPS[sq.group].name + '组' : sq.type === 'rail' ? '机场' : '公用事业'} · 标价 ${fmt(sq.price)}</div>`;
  if (!o) h += `<div class="mk-empty" style="padding:22px 0 10px">这块地由 🏦 银行持有<br>抵达该格可按现价 <b>${fmt(priceOf(i))}</b> 购买</div><button class="btn primary big wide" data-remote="${i}" ${m.money < priceOf(i) * 3 ? 'disabled' : ''}>⚡️ 立即远程购买 · ${fmt(priceOf(i) * 3)}（3 倍价）</button><div class="muted" style="text-align:center;margin-top:8px">您的现金 ${fmt(m.money)}</div>`;
  else if (groupLocked(i)) h += `<div class="mk-empty" style="padding:30px 0">这个颜色组上还有房屋<br>要先把房屋卖掉才能交易</div>`;
  else {
    const mine = o.id === myId, others = S.players.filter((p) => p.id !== myId && !p.bankrupt);
    if (mine) {
      if (!v.to || !others.some((p) => p.id === v.to)) v.to = others[0] && others[0].id;
      h += `<div class="mk-line" style="margin-top:10px">把它<b>卖给</b>谁？</div><div class="who-pick">${others.map((p) => `<button data-mkto="${p.id}" class="${p.id === v.to ? 'on' : ''}">${avatar(p)}${esc(p.name)}</button>`).join('')}</div><div class="mk-line">您想<b>收</b>多少钱？</div>`;
    } else h += `<div class="mk-line" style="margin-top:10px">主人：<b>${esc(o.name)}</b></div><div class="mk-line">您愿意<b>付</b>多少钱买它？</div>`;
    h += `<div class="mk-price"><input id="mkPrice" type="number" min="0" step="1" placeholder="${sq.price / 1000}" value="${v.price ? v.price / 1000 : ''}"><span>M</span></div>
      <div class="mk-eq" id="mkEq"></div>
      <div class="mk-quick">${[[1, '标价'], [1.5, '1.5 倍'], [2, '2 倍'], [3, '3 倍']].map(([x, n]) => `<button data-mkq="${sq.price * x}">${n} ${fmt(sq.price * x)}</button>`).join('')}</div>
      <button class="btn primary big wide" id="mkSend">${mine ? '发送卖出报价' : `向 ${esc(o.name)} 发送购买报价`}</button>
      <div class="muted" style="margin-top:8px;text-align:center">您的余额 ${fmt(m.money)}</div>`;
  }
  d.innerHTML = h;
  const inp = $('#mkPrice'); if (!inp) return;
  const eq = () => { const k = Math.max(0, Math.round((+inp.value || 0) * 1000)); v.price = k || ''; $('#mkEq').textContent = k ? `= ${fmt(k)}${o.id !== myId && k > m.money ? '（余额不够）' : ''}` : '单位是 M（1000M = 1B）'; };
  inp.oninput = eq; eq();
  inp.onkeydown = (e) => { if (e.key === 'Enter') $('#mkSend').click(); };
  $('#mkSend').onclick = () => {
    const k = Math.max(0, Math.round((+inp.value || 0) * 1000)); if (!k) { toast('请先输入价格'); inp.focus(); return; }
    const mine = o.id === myId;
    if (mine && !v.to) return toast('没有可以交易的玩家');
    act('propose', mine ? { to: v.to, give: [i], getMoney: k } : { to: o.id, get: [i], giveMoney: k }, (r) => { if (r.ok) { toast('报价已发送，等待对方回复'); closeLocal(); } });
  };
}
function openMarket(sel) { const m = me(); if (!S || S.phase !== 'play' || !m || m.bankrupt) return; openLocal({ type: 'market', tab: 'all', sel: sel == null ? null : sel, price: '', to: null }); }

function offerHTML(t) {
  const f = pById(t.from), m = me();
  const tile = (i) => `<div class="tile" style="--tint:${sqColor(i)}">${sqIcon(i)}<div class="tn">${BOARD[i].name}</div><div class="tp">标价 ${fmt(BOARD[i].price)}</div></div>`;
  if (t.get.length === 1 && !t.give.length && !t.getMoney) return `<h3>💰 有人想买您的地</h3><div class="offer">${tile(t.get[0])}<div class="offer-text">${esc(f.name)} 想花 <b>${fmt(t.giveMoney)}</b><br>买您的 <b>${BOARD[t.get[0]].name}</b><div class="muted">成交后您的余额：${fmt(m.money + t.giveMoney)}</div></div></div>`;
  if (t.give.length === 1 && !t.get.length && !t.giveMoney) return `<h3>🏷 有人想卖地给您</h3><div class="offer">${tile(t.give[0])}<div class="offer-text">${esc(f.name)} 想把 <b>${BOARD[t.give[0]].name}</b><br>以 <b>${fmt(t.getMoney)}</b> 卖给您<div class="muted">您的余额：${fmt(m.money)}${m.money < t.getMoney ? '（不够）' : ''}</div></div></div>`;
  const part = (props, money) => [props.map((i) => BOARD[i].name).join('、'), money ? `现金 ${fmt(money)}` : ''].filter(Boolean).join(' + ') || '（无）';
  return `<h3>🤝 ${esc(f.name)} 想和您交易</h3><div class="offer-text"><b>您得到：</b>${part(t.give, t.giveMoney)}<br><b>您付出：</b>${part(t.get, t.getMoney)}</div>`;
}

function auctionTips(pos) {
  const sq = BOARD[pos], m = me(), tips = [], money = m ? m.money : 0;
  let mult = 1;
  if (sq.type === 'prop') {
    const grp = Object.keys(S.props).map(Number).filter((k) => BOARD[k].group === sq.group), g = GROUPS[sq.group];
    const mine = grp.filter((k) => S.props[k].owner === myId).length, cnt = {};
    grp.forEach((k) => { const o = S.props[k].owner; if (o && o !== myId) cnt[o] = (cnt[o] || 0) + 1; });
    const rival = Object.keys(cnt).find((o) => cnt[o] === grp.length - 1);
    if (mine === grp.length - 1) { mult = 2; tips.push(`🔥 <b>您只差这一块</b>就集齐${g.name}组：租金翻倍，还能建房收每秒收益。值得出到标价的 1.5–2 倍。`); }
    else if (rival) { mult = 1.5; tips.push(`🛡 <b>${esc(pById(rival).name)} 只差这一块</b>就集齐${g.name}组。抢下它，或者把价格抬高让他多花钱。`); }
    else if (mine > 0) { mult = 1.3; tips.push(`👍 您已经有 ${mine}/${grp.length} 块${g.name}地，拿下这块离集齐更近，可以比标价多出一点。`); }
    else tips.push(`🧊 ${g.name}组（共 ${grp.length} 块）还没有人占优，不用高价追，低于标价拿下才划算。`);
    tips.push(`📈 空地租金 ${fmtI(sq.rent[0])}，要被被抵达约 ${Math.round(sq.price / sq.rent[0])} 次才回本；建成酒店后租金 ${fmtI(sq.rent[5])}，每秒再收 ${fmtI(incomePerSec(pos, 5))}。`);
  } else if (sq.type === 'rail') {
    const n = Object.keys(S.props).filter((k) => BOARD[k].type === 'rail' && S.props[k].owner === myId).length;
    mult = n ? 1.3 : 1; tips.push(`✈️ 机场和港口越多越值钱：您现在有 ${n} 个，拿下后每次收租 ${fmtI(RULES.railRent[n])}。不能建房，但稳定。`);
  } else { const n = Object.keys(S.props).filter((k) => BOARD[k].type === 'util' && S.props[k].owner === myId).length; tips.push(`⚙️ 公用事业按骰子点数收费：拿下后是"点数 × ${fmt(RULES.utilMult[n])}"。收益看运气，别出太高。`); }
  const cap = Math.min(Math.round(priceOf(pos) * mult), Math.round(money * 0.7));
  tips.push(`💡 您有 ${fmt(money)}，建议最高出到 <b>${fmt(cap)}</b>（至少留三成现金付租金）。`);
  return tips.map((t) => `<div>${t}</div>`).join('');
}
function auctionInfo(pos) {
  const sq = BOARD[pos], st = S.props[pos], c = sqColor(pos);
  const rows = [['标价', fmtI(sq.price)]];
  if (sq.type === 'prop') rows.push(['基础租金', fmtI(sq.rent[0])], ['集齐同色', fmtI(sq.rent[0] * 2)], ['酒店租金', fmtI(sq.rent[5])], ['建房单价', fmtI(GROUPS[sq.group].house)], ['每栋每秒收益', '+' + fmtI(incomePerSec(pos, 1))]);
  else if (sq.type === 'rail') rows.push(['持有 1 处租金', fmtI(RULES.railRent[0])], ['持有 3 处租金', fmtI(RULES.railRent[2])]);
  if (st.fore) rows.push(['法拍房', '半价']);
  return `<div class="au-card" style="--tint:${c}"><div class="au-card-h">${sqIcon(pos)}<div><b>${sq.name}</b><small>${sq.en || ''}${sq.type === 'prop' ? ' · ' + GROUPS[sq.group].name + '组' : ''}</small></div></div>${rows.map(([a, b]) => `<div class="au-row"><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
}
let aucCell = -1;
function markAuction() {
  const ap = S.auction && S.phase === 'play' ? S.auction.pos : -1; if (ap === aucCell) return;
  if (aucCell >= 0) $('#cell' + aucCell).classList.remove('auc');
  aucCell = ap; document.body.classList.toggle('auction-mode', ap >= 0);
  const md = $('#modal'); md.classList.toggle('glass', ap >= 0);
  if (ap >= 0) { const c = $('#cell' + ap), b = $('#boardWrap'); c.classList.add('auc'); md.style.justifyItems = c.offsetLeft + c.offsetWidth / 2 > b.offsetWidth / 2 ? 'start' : 'end'; } else md.style.justifyItems = '';
}
function updateAuction() {
  const a = S.auction, m = me(), top = a.bidder && pById(a.bidder);
  $('#auPrice').textContent = fmt(a.bid); $('#auWho').textContent = top ? `${top.name} 出价最高` : '还没有人出价';
  document.querySelectorAll('#auBtns [data-inc]').forEach((b) => (b.disabled = !m || m.money < a.bid + +b.dataset.inc || a.bidder === myId));
}
function renderStateModal() {
  const md = $('#modal'), box = $('#modalBox'), pd = S.pending, m = me();
  let key = '', h = '';
  const t = m && S.phase === 'play' && S.trades.find((x) => x.to === myId);
  if (S.phase === 'end') {
    key = 'end';
    const w = pById(S.winner);
    h = `<div class="trophy">🏆</div><h3 style="text-align:center">${esc(w.name)} ${S.ranking[0].won ? '成为首富！' : '获得第一名！'}</h3><p class="muted" style="text-align:center">👑 成为富翁：总资产达到 ${fmt(RULES.winCash)}，按达成先后排名；其余玩家按总资产排名</p><div class="rank">${S.ranking.map((r, i) => { const p = pById(r.id); return `<div style="animation-delay:${i * 0.12}s"><span>${i + 1}</span>${avatar(p)}<span>${esc(p.name)}</span><span class="${r.won ? 'rk-win' : r.broke ? 'rk-lose' : ''}">${r.won ? '👑 达成目标时 ' + fmt(r.worth) : r.broke ? '💥 破产' : '结束时 ' + fmt(r.worth)}</span></div>`; }).join('')}</div>
      <div class="act-row"><button class="btn primary" data-recap="1">📋 查看本局复盘清单</button><button class="btn" id="backLobby">回到大厅</button></div>`;
  } else if (pd && pd.kind === 'auction' && S.auction) {
    key = 'auction';
    const a = S.auction, sq = BOARD[a.pos];
    h = `<h3>🔨 拍卖 · ${sq.name}</h3><div class="au-meta">${a.by && pById(a.by) ? `<span>发起人 ${avatar(pById(a.by))}<b>${esc(pById(a.by).name)}</b></span>` : ''}<span>${a.seller ? `强制拍卖 · 原主人 <b>${esc(pById(a.seller).name)}</b>（成交款归原主人）` : '银行地产 · 成交款归银行'}</span></div><p class="muted">全体玩家均可出价：开拍 10 秒，有人加价后只剩 5 秒，倒计时结束即成交。地图上发光的格子就是这块地。</p>
      <div class="auction-price" id="auPrice"></div><div class="auction-who" id="auWho"></div>
      <div class="au-cd"><div class="countdown"><div id="cdBar"></div></div><b id="cdSec"></b></div>
      ${m && !m.bankrupt ? `<div class="act-row" id="auBtns">${RULES.bids.map((n, i) => `<button class="btn ${i === 2 ? 'primary' : ''}" data-act="bid" data-inc="${n}">+${fmt(n)}<kbd>${i + 1}</kbd></button>`).join('')}</div><p class="muted" style="text-align:center">您的余额 ${fmt(m.money)}</p>` : ''}`;
    h = `<div class="au-wrap"><div class="au-info">${auctionInfo(a.pos)}<div class="au-tips">${auctionTips(a.pos)}</div></div><div class="au-main">${h}</div></div>`;
  } else if (!fxBusy && pd && pd.kind === 'buy' && curP().id === myId) {
    key = 'buy' + pd.pos;
    h = `${deedHTML(pd.pos)}<p class="muted" style="text-align:center;margin-top:12px">您有 ${fmt(m.money)}</p>
      <div class="act-row"><button class="btn" data-act="auction">拍卖<kbd>A</kbd></button><button class="btn primary" data-act="buy">${S.props[pd.pos].fore ? '法拍半价 ' : '购买 '}${fmt(priceOf(pd.pos))}<kbd>B</kbd></button></div>`;
  } else if (t && !(pd && pd.kind === 'card')) {
    key = 'trade' + t.id;
    const canCounter = t.give.length + t.get.length === 1 && !(t.giveMoney && t.getMoney), ref = t.giveMoney || t.getMoney;
    h = `${t.counter ? '<div class="offer-tag">↩️ 这是对方的还价</div>' : ''}${offerHTML(t)}<div class="offer-exp" data-at="${t.at || 0}"></div>
      ${canCounter ? `<div class="counter-row"><span>不合适？还价</span><div class="mk-price"><input id="ctPrice" type="number" min="0" step="1" placeholder="${ref / 1000}"><span>M</span></div><button class="btn" id="ctGo">发出还价</button></div><div class="mk-quick">${[0.8, 0.9, 1.1, 1.2, 1.5].map((x) => `<button data-ctq="${Math.round((ref * x) / 1000)}">${x < 1 ? '压价' : '加价'} ${Math.round(x * 100)}%</button>`).join('')}</div>` : ''}
      <div class="act-row"><button class="btn" data-act="respond" data-id="${t.id}" data-accept="">拒绝<kbd>X</kbd></button><button class="btn primary" data-act="respond" data-id="${t.id}" data-accept="1">接受<kbd>Y</kbd></button></div>`;
  }
  if (key === 'auction' && stateModalKey === 'auction') return updateAuction();
  if (key === stateModalKey) return;
  stateModalKey = key;
  if (!key) { md.hidden = true; return; }
  box.innerHTML = h; md.hidden = false;
  if (key === 'auction') updateAuction();
  if (key.startsWith('trade')) {
    Snd.turn();
    const inp = $('#ctPrice'), go = $('#ctGo'), tid = +key.slice(5);
    if (go) {
      const send = () => { const k = Math.round((+inp.value || 0) * 1000); if (!k) { toast('请先输入还价金额'); inp.focus(); return; } act('counter', { id: tid, price: k }, (r) => r.ok && toast('还价已发出，等待对方回复')); };
      go.onclick = send; inp.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      box.querySelectorAll('[data-ctq]').forEach((b) => (b.onclick = () => { inp.value = b.dataset.ctq; inp.focus(); }));
    }
  }
  if (key === 'end') { Snd.win(); confetti(); closeLocal(); $('#backLobby').onclick = () => { localStorage.removeItem('dfw_room'); location.href = '/'; }; if (S.recap) setTimeout(() => { if (S && S.phase === 'end' && !localView) openLocal({ type: 'recap' }); }, 3200); }
}
setInterval(() => {
  const bar = $('#cdBar');
  if (bar && S && S.auction) {
    const left = S.auction.endsAt - (Date.now() + skew), sec = Math.max(0, Math.ceil(left / 1000)), el = $('#cdSec');
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / (S.auction.total || 15000))).toFixed(3)})`;
    if (el && el.dataset.s !== String(sec)) { el.dataset.s = sec; el.textContent = sec > 0 ? `${sec} 秒` : '成交中'; el.classList.toggle('urgent', sec <= 3); if (sec > 0 && sec <= 3) Snd.tone(1400, 0.06, 'square', 0.05); }
    bar.classList.toggle('urgent', sec <= 3);
  }
}, 200);
function confetti() {
  const box = $('#confetti');
  for (let i = 0; i < 110; i++) {
    const d = document.createElement('i'); d.style.left = Math.random() * 100 + '%'; d.style.background = COLORS[i % 8]; box.appendChild(d);
    d.animate([{ transform: 'translateY(-10vh) rotate(0)' }, { transform: `translateY(110vh) rotate(${360 + Math.random() * 720}deg)` }], { duration: 2400 + Math.random() * 2200, delay: Math.random() * 900, easing: 'cubic-bezier(.3,.6,.6,1)', fill: 'backwards' }).onfinish = () => d.remove();
  }
}

// ================= 事件 =================
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && !a.disabled) {
    if (a.dataset.confirm && !confirm(a.dataset.confirm)) return;
    const args = {};
    if (a.dataset.pos) args.pos = +a.dataset.pos;
    if (a.dataset.inc) args.inc = +a.dataset.inc;
    if (a.dataset.id) { args.id = +a.dataset.id; args.accept = !!a.dataset.accept; }
    act(a.dataset.act, args);
    return;
  }
  const kk = e.target.closest('[data-kick]'); if (kk) { const kp = pById(kk.dataset.kick); if (confirm(`确认将「${kp ? kp.name : ''}」移出房间？${S.phase === 'play' ? '其名下地产将转为法拍房。' : ''}`)) { act('kick', { id: kk.dataset.kick }); closeLocal(); } return; }
  const rb = e.target.closest('[data-remote]'); if (rb) { if (confirm('确认以 3 倍价格远程购买该地产？')) act('remoteBuy', { pos: +rb.dataset.remote }, (r) => { if (r.ok) closeLocal(); }); return; }
  const sk = e.target.closest('[data-stock]'); if (sk) return act('stock', { pct: +sk.dataset.stock });
  if (e.target.closest('[data-force="skip"]')) return act('force', { pos: null });
  const fp = e.target.closest('[data-forcepos]'); if (fp) { act('force', { pos: +fp.dataset.forcepos }); return closeLocal(); }
  if (e.target.closest('[data-local="force"]')) return openLocal({ type: 'force' });
  if (e.target.closest('[data-local="bank"]')) return openLocal({ type: 'bank' });
  const bk = e.target.closest('[data-bank]'); if (bk && localView) { const [key, k] = bk.dataset.bank.split(':'); localView[key] = k; return renderLocal(); }
  if (e.target.closest('[data-bankall]') && localView) { localView.amount = me().w[localView.from]; return renderLocal(); }
  const rc = e.target.closest('[data-recv]'); if (rc) return act('pay', { k: 'recv', m: rc.dataset.recv });
  if (e.target.closest('[data-close]')) return closeLocal();
  const dd = e.target.closest('[data-deed]'); if (dd) return openLocal({ type: 'deed', pos: +dd.dataset.deed });
  if (e.target.closest('[data-local="market"]')) return openMarket();
  if (e.target.closest('[data-local="send"]')) return openLocal({ type: 'send', to: null, amount: 0 });
  const plc = e.target.closest('#players .pl'); if (plc && S.phase === 'play' && plc.dataset.pid !== myId && me() && !me().bankrupt) return openLocal({ type: 'send', to: plc.dataset.pid, amount: 0 });
  const em = e.target.closest('[data-emote]'); if (em && localView && localView.to) { socket.emit('emote', { to: localView.to, e: em.dataset.emote }); return closeLocal(); }
  const pay = e.target.closest('[data-pay]'); if (pay) return act('pay', { m: pay.dataset.pay });
  const st = e.target.closest('[data-sendto]'); if (st && localView) { localView.to = st.dataset.sendto; return renderLocal(); }
  const sq_ = e.target.closest('[data-sendq]'); if (sq_ && localView) { localView.amount = +sq_.dataset.sendq; return renderLocal(); }
  const bf = e.target.closest('[data-buyfrom]') || e.target.closest('[data-sellto]'); if (bf) return openMarket(+(bf.dataset.buyfrom || bf.dataset.sellto));
  if (!localView || localView.type !== 'market') return;
  const tab = e.target.closest('[data-tab]'); if (tab) { localView.tab = tab.dataset.tab; return marketGrid(); }
  const tile = e.target.closest('#mkGrid [data-tile]'); if (tile) { localView.sel = +tile.dataset.tile; localView.price = ''; marketGrid(); marketDetail(); const inp = $('#mkPrice'); if (inp) inp.focus(); return; }
  const to = e.target.closest('[data-mkto]'); if (to) { localView.to = to.dataset.mkto; return marketDetail(); }
  const q = e.target.closest('[data-mkq]'); if (q) { localView.price = +q.dataset.mkq; marketDetail(); }
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return closeLocal(); }
  if (e.target.tagName === 'INPUT') return;
  if (k === 'm') return toggleMute();
  if (k === 'n') return toggleTheme();
  if (!S || S.phase !== 'play') return;
  if (k === 'h' || k === '?') return localView && localView.type === 'help' ? closeLocal() : openLocal({ type: 'help' });
  const m = me(); if (!m || m.bankrupt) return;
  if (k === 't') return localView && localView.type === 'market' ? closeLocal() : openMarket();
  if (k === 'f') return openFin('stock');
  if (k === 'g') return openFin('bet');
  if (k === 'l') return openFin('loan');
  if (localView) return;
  const pd = S.pending, mine = curP().id === myId;
  if (pd && pd.kind === 'auction') { const i = '12345'.indexOf(k); if (i >= 0 && k.length === 1) act('bid', { inc: RULES.bids[i] }); return; }
  if (stateModalKey.startsWith('trade') && (k === 'y' || k === 'x')) { const t = S.trades.find((x) => x.to === myId); if (t) act('respond', { id: t.id, accept: k === 'y' }); return; }
  if (pd && pd.kind === 'card') { if ((k === ' ' || k === 'enter') && pd.pid === myId && $('.stage-foot.show')) { e.preventDefault(); act('card'); } return; }
  if (fxBusy) { if (k === ' ') e.preventDefault(); return; }
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (pd && pd.kind === 'pay' && pd.payer === myId) { if (m.money >= pd.amount) act('swipe'); return; }
    if (!mine || pd || m.money < 0) return;
    return act(!S.rolled || S.canRollAgain ? 'roll' : 'endTurn');
  }
  if (!mine) return;
  if (pd && pd.kind === 'buy') { if (k === 'b') act('buy'); if (k === 'a') act('auction'); return; }
  if (!pd && m.inJail && !S.rolled) { if (k === 'j') act('payJail'); if (k === 'u' && m.goojf.length) act('useCard'); }
});

// ================= 每秒收益 & 倒计时 =================
socket.on('tick', (money) => {
  if (!S) return;
  for (const p of S.players) {
    const v = money[p.id]; if (v === undefined) continue;
    const [mn, wt] = Array.isArray(v) ? v : [v, p.worth + v - p.money], d = mn - p.money;
    p.money = mn; if (shown[p.id] !== undefined) shown[p.id] += d;
    if (wt !== p.worth) { p.worth = wt; const w = document.querySelector(`.wt[data-pid="${p.id}"]`); if (w) w.textContent = '总资产 ' + fmt(p.worth); }
  }
  const pd = S.pending; if (pd && pd.kind === 'pay' && pd.payer === myId && !fxBusy) { renderActions(); renderDock(); }
});
socket.on('income', (list) => {           // 只有主人自己能收到：在自己的地标上飘 +多少
  if (document.hidden) return;
  for (const [pos, amt] of list) {
    const c = $('#cell' + pos); if (!c) continue;
    const d = document.createElement('div'); d.className = 'inc'; d.textContent = '+' + fmt(amt); c.appendChild(d);
    d.animate([{ transform: 'translate(-50%, 40%)', opacity: 0 }, { transform: 'translate(-50%, -20%)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -130%)', opacity: 0 }], { duration: 950, easing: 'ease-out' }).onfinish = () => d.remove();
  }
});
setInterval(() => {
  const ex = $('.offer-exp'); if (ex && +ex.dataset.at) { const left = Math.max(0, Math.ceil((+ex.dataset.at + 120000 - (Date.now() + skew)) / 1000)); const t = `⌛ ${left} 秒内不处理将自动作废`; if (ex._v !== t) { ex._v = t; ex.textContent = t; } }
  const box = $('#clock'); if (!S || S.phase !== 'play') { if (box) box.hidden = true; return; }
  const cur = curP(), total = RULES.turnSecs * 1000, left = S.deadline - (Date.now() + skew), paused = !!S.auction || left > total;
  box.hidden = false;
  const el = Math.max(0, Math.floor((Date.now() + skew - S.startedAt) / 1000)), pad = (x) => String(x).padStart(2, '0');
  // 只在内容真的变化时才改 DOM，避免每 0.25 秒重排一次（省电）
  const setT = (id, v, html) => { const n = $(id); if (n && n._v !== v) { n._v = v; html ? (n.innerHTML = v) : (n.textContent = v); } };
  setT('#elapsed', (el >= 3600 ? Math.floor(el / 3600) + ':' + pad(Math.floor(el / 60) % 60) : Math.floor(el / 60)) + ':' + pad(el % 60));
  setT('#stageTag', `第 ${S.stage + 1} 阶段 · 地价 ×${Math.round(PINF() * 100) / 100} · 租金 ×${Math.round(S.infl * 100) / 100} · 地产税 ${Math.round((S.taxRate || 0.04) * 1000) / 10}%`);
  const secs = Math.max(0, Math.ceil(Math.min(left, total) / 1000));
  setT('#clockText', `${dotOf(cur.id)}现在是 <b>${cur.id === myId ? '您' : esc(cur.name)}</b> 的回合 <span class="secs ${!paused && secs <= 5 ? 'low' : ''}">${S.auction ? '拍卖中' : paused ? '…' : '⏱ ' + secs + ' 秒'}</span>`, true);
  $('#clockBar').style.transform = `scaleX(${paused ? 1 : Math.max(0, Math.min(1, left / total)).toFixed(3)})`;
  const hurry = !paused && left < 5000;
  if (hurry && cur.id === myId && secs !== window._lastTick) { window._lastTick = secs; Snd.tone(1000, 0.05, 'square', 0.06); }
  const hk = hurry ? cur.id : ''; if (window._hurryKey !== hk) { window._hurryKey = hk; document.querySelectorAll('#players .pl').forEach((el) => el.classList.toggle('hurry', hurry && el.dataset.pid === cur.id)); }
}, 500);

// ================= 表情互动 =================
socket.on('emote', ({ from, to, e, text }) => {
  const a = tokenEls[from], b = tokenEls[to]; if (!a || !b || !S || S.phase === 'lobby') return;
  const pf = pById(from), pt = pById(to); if (pf && pt) toast(`${pf.name} → ${pt.name}：${text || e}`);
  if (!text) return emoteFx(e, from, to);
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const sx = ra.left + ra.width / 2, sy = ra.top + ra.height / 2, dx = rb.left + rb.width / 2 - sx, dy = rb.top + rb.height / 2 - sy;
  const d = document.createElement('div'); d.className = 'emo-fly bubble'; d.textContent = text; d.style.left = sx + 'px'; d.style.top = sy + 'px'; $('#floats').appendChild(d);
  Snd.swoosh();
  d.animate([{ transform: 'translate(-50%,-50%) scale(.4)' }, { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 140}px)) scale(1.6) rotate(-6deg)`, offset: 0.5 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` }], { duration: 850, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }).onfinish = () => {
    d.remove(); const bb = document.createElement('div'); bb.className = 'emo-fly bubble stay'; bb.textContent = text; bb.style.left = sx + dx + 'px'; bb.style.top = sy + dy - 34 + 'px'; $('#floats').appendChild(bb); Snd.plus();
    bb.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.1 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.85 }, { opacity: 0, transform: 'translate(-50%,-80%) scale(1)' }], 3200).onfinish = () => bb.remove();
  };
});
function renderPay() { const m = me(), cur = (m && m.pay) || 'card', rc = (m && (m.recv || m.pay)) || 'card'; document.querySelectorAll('#payPick [data-pay]').forEach((b) => b.classList.toggle('on', b.dataset.pay === cur)); document.querySelectorAll('#recvPick [data-recv]').forEach((b) => b.classList.toggle('on', b.dataset.recv === rc)); }

socket.on('kicked', () => { localStorage.removeItem('dfw_room'); alert('您已被房主移出房间'); location.href = '/'; });
socket.on('market', (d) => { if (!S) return; S.market = d.market; for (const p of S.players) if (d.loans[p.id] !== undefined) p.loan = d.loans[p.id]; if (window.onMarket) onMarket(); });

// ================= 主渲染 =================
socket.on('state', (st) => {
  const first = !S;
  S = st; skew = st.now - Date.now();
  if (first && st.phase !== 'lobby') { setDie(0, st.dice[0], false); setDie(1, st.dice[1], false); }
  for (const p of S.players) if (shown[p.id] === undefined) shown[p.id] = p.money;
  if (!fxBusy) syncShown();
  renderAll();
});
function renderAll() {
  if (!S) return;
  document.body.classList.toggle('ingame', S.phase !== 'lobby');
  if (S.phase === 'lobby') { $('#lobby').hidden = false; $('#game').hidden = true; renderLobby(); return; }
  renderJoinReqs();
  if ($('#game').hidden) { $('#lobby').hidden = true; $('#game').hidden = false; $('#roomTag').textContent = S.code; resize(); }
  updateBoard(); placeTokens(); renderPlayers(); renderActions(); renderAssets(); renderLog(); renderStatus(); renderDock(); renderDanger(); renderCard(); markAuction(); renderStateModal(); renderPay(); if (window.afterRender) afterRender();
  if (localView && (localView.type === 'deed' || localView.type === 'market')) renderLocal();
  if (localView && localView.type === 'expand' && window.refreshExpand) refreshExpand();
  if (localView && S.phase !== 'play' && localView.type !== 'help') closeLocal();
  if (localView && localView.type === 'bank' && !fxBusy) { const a = document.activeElement; if (!a || a.id !== 'bankAmt') renderLocal(); }
  document.body.classList.toggle('portal-mode', !!(S.pending && S.pending.kind === 'portal' && S.pending.pid === myId && !fxBusy));
}
function resize() {
  const narrow = innerWidth < 1000, phone = innerWidth < 700;
  document.body.classList.toggle('phone', phone);
  const r = document.documentElement.style, bar = $('#bottom'), logP = $('.log-panel'), asP = $('#assets');
  let cw, ch, btm = false;
  if (narrow) { cw = ch = phone ? (innerWidth - 8) / (BW + 3) : Math.max(38, (innerWidth - 24) / (BW + 3)); }
  else {
    // 电脑：右侧栏随屏幕变宽；地图横向铺满剩余宽度（格子可略宽于高），下方留信息栏
    const sw = Math.round(Math.min(440, Math.max(340, innerWidth * 0.22)));
    r.setProperty('--sw', sw + 'px');
    const availW = innerWidth - sw - 48, availH = innerHeight - 32;
    const bh0 = Math.round(Math.min(210, Math.max(140, availH * 0.19)));
    btm = (availH - bh0 - 12) / (BH + 3) >= 38;
    ch = Math.max(38, ((btm ? availH - bh0 - 12 : availH)) / (BH + 3));
    cw = Math.max(38, Math.min(availW / (BW + 3), ch * 1.5));
    if (!btm) { ch = Math.min(ch, availH / (BH + 3)); }
  }
  if (btm) { if (asP.parentElement !== bar) { bar.appendChild(asP); bar.appendChild(logP); } bar.hidden = false; bar.style.height = Math.floor(innerHeight - 32 - ch * (BH + 3) - 12) + 'px'; bar.style.width = Math.floor(cw * (BW + 3)) + 'px'; }
  else { if (asP.parentElement !== $('#side')) { $('#side').appendChild(asP); $('#side').appendChild(logP); } bar.hidden = true; }
  uPx = Math.min(cw, ch) / 7.75;
  r.setProperty('--bw', Math.floor(cw * (BW + 3)) + 'px'); r.setProperty('--bh', Math.floor(ch * (BH + 3)) + 'px'); r.setProperty('--u', uPx + 'px');
  const tk = $('#tokens'); tk.style.display = 'none'; void tk.offsetWidth; tk.style.display = '';
  placeTokens(); drawTrack();
}
addEventListener('resize', resize);
resize();
