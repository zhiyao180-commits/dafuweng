// 大富翁 · 世界银行 —— 浏览器端
const { BOARD, GROUPS, CHANCE, CHEST, RULES, COLORS, TOKENS, fmt } = GameData;
const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const socket = io();
let token = localStorage.getItem('dfw_token');
if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); localStorage.setItem('dfw_token', token); }
let S = null, myId = null, skew = 0;
const fxQueue = []; let fxBusy = false;
const animPos = {};
let localView = null;   // 本地弹窗：{type:'deed',pos} / {type:'trade'}
let stateModalKey = '';
let tradeDraft = null;

// ================= 音效（WebAudio 合成，无需素材） =================
const Snd = {
  ctx: null,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, d, type = 'sine', v = 0.12, at = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, at = 0, v = 0.25, f = 1800) {
    const c = this.ctx; if (!c) return;
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
  card() { this.noise(0.25, 0, 0.18, 3000); this.tone(990, 0.3, 'sine', 0.06, 0.25); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.12, i * 0.13)); },
  bad() { this.tone(200, 0.25, 'sawtooth', 0.05); },
  swoosh() { this.noise(0.2, 0, 0.15, 800); },
};
document.addEventListener('pointerdown', () => Snd.init(), { once: false });

// ================= 通用 =================
const me = () => S && S.players.find((p) => p.id === myId);
const pById = (id) => S && S.players.find((p) => p.id === id);
const curP = () => S && S.players[S.turn];
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }
function act(type, args = {}) {
  Snd.init();
  socket.emit('act', { type, ...args }, (r) => { if (r && !r.ok) { toast(r.error); Snd.bad(); } });
}
const avatar = (p, size) => `<div class="avatar" style="background:${p.color}${size ? `;width:${size}px;height:${size}px;font-size:${size * 0.55}px` : ''}">${p.icon}</div>`;
const sqColor = (i) => { const sq = BOARD[i]; return sq.type === 'prop' ? GROUPS[sq.group].color : sq.type === 'rail' ? '#1D1D1F' : '#8E8E93'; };

// ================= 大厅 =================
$('#nameInput').value = localStorage.getItem('dfw_name') || '';
let chosenSize = +(localStorage.getItem('dfw_size') || 4);
function drawSizePick() {
  $('#sizePick').innerHTML = [2, 3, 4, 5, 6, 7, 8].map((n) => `<button data-n="${n}" class="${n === chosenSize ? 'on' : ''}">${n}</button>`).join('');
}
drawSizePick();
$('#sizePick').onclick = (e) => { const b = e.target.closest('button'); if (b) { chosenSize = +b.dataset.n; localStorage.setItem('dfw_size', chosenSize); drawSizePick(); } };
$('#sizeEdit').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) act('size', { n: +b.dataset.n }); };
function enter(res) {
  if (!res.ok) { $('#lobbyErr').textContent = res.error; return; }
  myId = res.id; localStorage.setItem('dfw_room', res.code);
}
$('#createBtn').onclick = () => {
  const name = $('#nameInput').value.trim(); if (!name) return ($('#lobbyErr').textContent = '请先填写名字');
  localStorage.setItem('dfw_name', name); Snd.init();
  socket.emit('create', { name, token, size: chosenSize }, enter);
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
    if (r.ok) myId = r.id; else localStorage.removeItem('dfw_room');
  });
});

function renderLobby() {
  $('#entry').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = S.code;
  $('#lobbyPlayers').innerHTML = S.players.map((p) => `<div class="lp">${avatar(p)}${esc(p.name)}${p.host ? '<span class="host">房主</span>' : ''}</div>`).join('') + Array.from({ length: Math.max(0, S.maxPlayers - S.players.length) }, () => '<div class="lp" style="opacity:.4;font-weight:500">等待加入…</div>').join('');
  const m = me();
  $('#colorPick').innerHTML = COLORS.map((c) => { const taken = S.players.some((p) => p.color === c && p.id !== myId); return `<button data-color="${c}" class="${m && m.color === c ? 'on' : ''} ${taken ? 'taken' : ''}" style="background:${c}"></button>`; }).join('');
  $('#iconPick').innerHTML = TOKENS.map((c) => { const taken = S.players.some((p) => p.icon === c && p.id !== myId); return `<button data-icon="${c}" class="${m && m.icon === c ? 'on' : ''} ${taken ? 'taken' : ''}">${c}</button>`; }).join('');
  const host = m && m.host, n = S.players.length, max = S.maxPlayers;
  $('#sizeText').textContent = `已加入 ${n} / ${max} 人`;
  $('#sizeEdit').hidden = !host;
  if (host) $('#sizeEdit').innerHTML = [2, 3, 4, 5, 6, 7, 8].map((k) => `<button data-n="${k}" class="${k === max ? 'on' : ''}" ${k < n ? 'disabled' : ''}>${k}人</button>`).join('');
  $('#startBtn').hidden = !host; $('#waitHost').hidden = host;
  $('#startBtn').disabled = n < 2;
  $('#startBtn').textContent = n < 2 ? '至少需要 2 人' : n < max ? `人没到齐，先开始（${n} 人）` : `开始游戏（${n} 人）`;
}
$('#colorPick').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('taken')) act('look', { color: b.dataset.color }); };
$('#iconPick').onclick = (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('taken')) act('look', { icon: b.dataset.icon }); };

// ================= 棋盘 =================
function gridPos(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 20) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}
const sideOf = (i) => (i % 10 === 0 ? 'corner' : i < 10 ? 'side-b' : i < 20 ? 'side-l' : i < 30 ? 'side-t' : 'side-r');
function cellInner(i) {
  const sq = BOARD[i];
  switch (sq.type) {
    case 'prop': return `<div class="bar" style="background:${GROUPS[sq.group].color}"></div><div class="ci"><div class="cname">${sq.name}</div><div class="cprice">${fmt(sq.price)}</div></div>`;
    case 'rail': return `<div class="ci"><div class="cicon">✈️</div><div class="cname">${sq.name}</div><div class="cprice">${fmt(sq.price)}</div></div>`;
    case 'util': return `<div class="ci"><div class="cicon">${sq.icon}</div><div class="cname">${sq.name}</div><div class="cprice">${fmt(sq.price)}</div></div>`;
    case 'chance': return `<div class="ci"><div class="cicon">?</div><div class="cname">机会</div></div>`;
    case 'chest': return `<div class="ci"><div class="cicon">✦</div><div class="cname">命运</div></div>`;
    case 'tax': return `<div class="ci"><div class="cicon">💸</div><div class="cname">${sq.name}</div><div class="cprice">支付 ${fmt(sq.amount)}</div></div>`;
    case 'go': return `<div class="ci"><div class="cicon">←</div><div class="cname">起点</div><div class="cprice">经过领取 ${fmt(RULES.goSalary)}</div></div>`;
    case 'jail': return `<div class="ci"><div class="cicon">🔒</div><div class="cname">监狱</div><div class="cprice">仅探监</div></div>`;
    case 'parking': return `<div class="ci"><div class="cicon">🅿️</div><div class="cname">免费停车</div></div>`;
    case 'gotojail': return `<div class="ci"><div class="cicon">👮</div><div class="cname">入狱</div></div>`;
  }
}
function buildBoard() {
  const b = $('#board');
  BOARD.forEach((sq, i) => {
    const [r, c] = gridPos(i);
    const d = document.createElement('div');
    d.className = `cell ${sideOf(i)} ${sq.type} ${i % 10 === 0 ? 'corner' : ''}`;
    d.style.gridRow = r; d.style.gridColumn = c; d.dataset.pos = i; d.id = 'cell' + i;
    d.innerHTML = cellInner(i) + '<div class="houses"></div>';
    b.appendChild(d);
  });
  b.onclick = (e) => { const c = e.target.closest('.cell'); if (c) { const i = +c.dataset.pos; if (S.props[i]) openDeed(i); } };
}
buildBoard();

function updateBoard() {
  for (const [i, st] of Object.entries(S.props)) {
    const cell = $('#cell' + i);
    cell.classList.toggle('mortgaged', st.mortgaged);
    let o = cell.querySelector('.owner');
    if (st.owner) { if (!o) { o = document.createElement('div'); o.className = 'owner'; cell.appendChild(o); } o.style.background = pById(st.owner).color; }
    else if (o) o.remove();
    const h = cell.querySelector('.houses');
    const want = st.houses === 5 ? '<div class="hotel"></div>' : '<div class="house"></div>'.repeat(st.houses);
    if (h.innerHTML !== want) h.innerHTML = want;
  }
}

// ---------- 棋子 ----------
const tokenEls = {};
function displayPos(p) { return animPos[p.id] !== undefined ? animPos[p.id] : p.pos; }
function placeTokens() {
  if (!S || S.phase === 'lobby') return;
  const bs = $('#boardWrap').offsetWidth, u = bs / 100;
  const groups = {};
  S.players.forEach((p) => { if (!p.bankrupt) (groups[displayPos(p)] = groups[displayPos(p)] || []).push(p); });
  for (const p of S.players) {
    let el = tokenEls[p.id];
    if (!el) { el = document.createElement('div'); el.className = 'token'; $('#tokens').appendChild(el); tokenEls[p.id] = el; }
    el.style.background = p.color; el.textContent = p.icon;
    el.classList.toggle('gone', p.bankrupt);
    el.classList.toggle('cur', curP() && curP().id === p.id);
    if (p.bankrupt) continue;
    const pos = displayPos(p), cell = $('#cell' + pos);
    const list = groups[pos], k = list.indexOf(p), n = list.length;
    let dx = 0, dy = 0;
    if (n > 1) { const cols = n <= 4 ? 2 : 3, row = Math.floor(k / cols), col = k % cols, rows = Math.ceil(n / cols); dx = (col - (cols - 1) / 2) * 2.6 * u; dy = (row - (rows - 1) / 2) * 2.6 * u; }
    el.style.left = cell.offsetLeft + cell.offsetWidth / 2 + dx + 'px';
    el.style.top = cell.offsetTop + cell.offsetHeight / 2 + dy + 'px';
  }
}

// ---------- 骰子 ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_TF = { 1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const spin = [[0, 0], [0, 0]];
for (const k of [0, 1]) {
  const d = $('#die' + k);
  d.innerHTML = [1, 2, 3, 4, 5, 6].map((v) => `<div class="face f${v}" style="transform:${FACE_TF[v]} translateZ(calc(var(--u) * 3.2))">${PIPS[v].map((n) => `<div class="pip" style="grid-area:${Math.ceil(n / 3)}/${((n - 1) % 3) + 1}"></div>`).join('')}</div>`).join('');
}
function setDie(k, v, animate) {
  const d = $('#die' + k);
  if (animate) { spin[k][0] += 2 + Math.floor(Math.random() * 2); spin[k][1] += 2 + Math.floor(Math.random() * 2); d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce'); }
  else d.style.transition = 'none';
  const [x, y] = SHOW[v];
  d.style.transform = `rotateX(${x + spin[k][0] * 360}deg) rotateY(${y + spin[k][1] * 360}deg)`;
  if (!animate) { void d.offsetWidth; d.style.transition = ''; }
}

// ---------- 刷卡机 ----------
function cardHTML(p) {
  const n = (p.id.charCodeAt(1) * 7919 + p.id.charCodeAt(2) * 31) % 10000;
  return `<div class="bk">WORLD BANK</div><div class="chip"></div><div class="num">•••• •••• ${String(n).padStart(4, '0')}</div><div class="nm">${esc(p.name)}</div><div class="ic">${p.icon}</div>`;
}
const cardBg = (p) => `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))`;
function posScreen(label, amount, cls = '') {
  $('#posLabel').textContent = label; const a = $('#posAmount'); a.textContent = amount; a.className = 'pos-amount ' + cls;
}
function pressKey(sym) { const k = [...document.querySelectorAll('.pos-keys i')].find((i) => i.textContent === sym); if (k) { k.classList.add('press'); Snd.key(); setTimeout(() => k.classList.remove('press'), 160); } }
async function cardIn(p, T) {
  const c = $('#posCard'); c.innerHTML = cardHTML(p); c.style.background = cardBg(p);
  c.className = 'bank-card in-slot'; void c.offsetWidth; c.classList.add('show');
  await wait(260 * T); Snd.swoosh(); c.classList.add('inserted'); await wait(420 * T);
}
async function cardOut(T) { const c = $('#posCard'); c.classList.remove('inserted'); await wait(330 * T); c.classList.remove('show'); await wait(200 * T); }
async function posAnim(f) {
  const T = fxQueue.length > 2 ? 0.45 : 1;
  const led = $('#posLed'); led.className = 'pos-led busy';
  const from = f.from && pById(f.from), to = f.to && pById(f.to);
  if (from) {
    posScreen(f.label, '…'); await cardIn(from, T);
    for (const ch of fmt(f.amount).replace(/[KM.]/g, '').slice(0, 3)) { pressKey(ch); await wait(70 * T); }
    pressKey('−'); posScreen(`${from.name} 支付 · ${f.label}`, '−' + fmt(f.amount), 'neg'); Snd.beep(); Snd.minus();
    await wait(650 * T); await cardOut(T);
  } else posScreen(`银行支付 · ${f.label}`, fmt(f.amount));
  if (to) {
    await cardIn(to, T); pressKey('+'); posScreen(`${to.name} 收款 · ${f.label}`, '+' + fmt(f.amount), 'pos-plus'); Snd.beep(); Snd.plus();
    await wait(650 * T); await cardOut(T);
  } else if (from) { posScreen('已付给银行', '✓'); await wait(300 * T); }
  led.className = 'pos-led ok';
  clearTimeout(posAnim.t); posAnim.t = setTimeout(() => { posScreen('WORLD BANK', 'READY'); led.className = 'pos-led'; }, 2500);
}

// ---------- 拖卡付款 ----------
function renderDock() {
  const dock = $('#cardDock'), m = me(), pd = S.pending;
  const show = !fxBusy && m && !m.bankrupt && pd && pd.kind === 'pay' && pd.payer === myId;
  const key = show ? `${pd.amount}|${pd.reason}|${m.money}` : '';
  if (dock.dataset.key === key) return;
  dock.dataset.key = key;
  if (!show) { dock.innerHTML = ''; return; }
  const enough = m.money >= pd.amount;
  dock.innerHTML = `<div class="bank-card" id="myCard" style="background:${cardBg(m)}">${cardHTML(m)}</div><div class="dock-hint">${enough ? `把银行卡拖进刷卡机，支付 ${fmt(pd.amount)}` : `余额不足 ${fmt(pd.amount)}，先卖房或抵押`}</div>`;
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
    else { card.style.transform = ''; }
  };
}

// ================= 动画队列 =================
socket.on('fx', (list) => {
  for (const f of list) {
    if ((f.type === 'move' || f.type === 'jump') && animPos[f.pid] === undefined) { const p = pById(f.pid); if (p) animPos[f.pid] = p.pos; }
    fxQueue.push(f);
  }
  runFx();
});
async function runFx() {
  if (fxBusy) return; fxBusy = true; renderAll();
  while (fxQueue.length) { const f = fxQueue.shift(); try { await playFx(f); } catch (e) { console.error(e); } }
  fxBusy = false;
  for (const k in animPos) delete animPos[k];
  renderAll();
}
async function playFx(f) {
  if (f.type === 'dice') {
    Snd.dice(); setDie(0, f.dice[0], true); setDie(1, f.dice[1], true);
    $('#status').innerHTML = `${dotOf(f.pid)}${esc(pById(f.pid)?.name || '')} 掷骰子…`;
    await wait(1150);
    $('#status').innerHTML = `${dotOf(f.pid)}${esc(pById(f.pid)?.name || '')} 掷出 ${f.dice[0]} + ${f.dice[1]} = ${f.dice[0] + f.dice[1]}${f.dice[0] === f.dice[1] ? ' · 双数！' : ''}`;
    await wait(250);
  } else if (f.type === 'move') {
    const dir = f.steps > 0 ? 1 : -1, el = tokenEls[f.pid];
    const dt = fxQueue.length > 3 ? 90 : 175;
    let pos = animPos[f.pid] !== undefined ? animPos[f.pid] : f.from;
    for (let s = 0; s < Math.abs(f.steps); s++) {
      pos = (pos + dir + 40) % 40; animPos[f.pid] = pos; placeTokens(); Snd.step();
      if (el) { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
      await wait(dt);
    }
    const c = $('#cell' + pos); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
    await wait(220);
  } else if (f.type === 'jump') {
    animPos[f.pid] = f.to; placeTokens(); Snd.bad(); await wait(500);
  } else if (f.type === 'pos') {
    await posAnim(f);
  } else if (f.type === 'bid') {
    Snd.tone(1200, 0.08, 'sine', 0.1);
  } else if (f.type === 'bankrupt') {
    toast(`💥 ${pById(f.pid)?.name} 破产了`); Snd.bad(); await wait(600);
  }
}
const dotOf = (pid) => { const p = pById(pid); return p ? `<span class="dot" style="background:${p.color}"></span>` : ''; };

// ================= 侧栏 =================
function renderPlayers() {
  $('#players').innerHTML = S.players.map((p, i) => `
    <div class="pl ${i === S.turn && S.phase === 'play' ? 'cur' : ''} ${p.bankrupt ? 'dead' : ''}">
      ${avatar(p)}
      <div class="who">
        <div class="nm">${esc(p.name)}${p.id === myId ? '<span class="badge">我</span>' : ''}${p.inJail ? '<span class="badge jail">监狱</span>' : ''}${!p.connected && !p.bankrupt ? '<span class="badge off">离线</span>' : ''}</div>
        <div class="mn ${p.money < 0 ? 'neg' : ''}">${p.bankrupt ? '已破产' : fmt(p.money)}</div>
      </div>
    </div>`).join('');
}

function renderActions() {
  const el = $('#actions'), m = me(), cur = curP(), pd = S.pending;
  if (!m) { el.innerHTML = '<div class="act-sub">观战中</div>'; return; }
  const myTurn = cur.id === myId;
  let h = '';
  if (S.phase === 'end') h = `<div class="act-title">游戏结束</div>`;
  else if (m.bankrupt) h = `<div class="act-title">你已破产</div><div class="act-sub">可以继续观战</div>`;
  else if (fxBusy) h = `<div class="act-title">${myTurn ? '你的回合' : esc(cur.name) + ' 的回合'}</div><div class="act-sub">…</div>`;
  else if (pd && pd.kind === 'pay' && pd.payer === myId) {
    const to = pd.to === 'each' ? '每位玩家' : pd.to ? pById(pd.to).name : '银行';
    h = `<div class="act-title">需支付 ${fmt(pd.amount)}</div><div class="act-sub">${esc(pd.reason)} → ${esc(to)}</div>`;
    if (m.money >= pd.amount) h += `<div class="act-sub">👉 把棋盘中间的银行卡拖进刷卡机</div><button class="btn primary wide" data-act="swipe">刷卡支付</button>`;
    else h += `<div class="act-sub" style="color:#D70015">余额不足，还差 ${fmt(pd.amount - m.money)}。点击下方地产卖房或抵押</div>`;
    const row = [];
    if (pd.cancelTo) row.push(`<button class="btn" data-act="cancelBuy">不买了</button>`);
    if (m.money < pd.amount) row.push(`<button class="btn danger" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`);
    if (row.length) h += `<div class="act-row">${row.join('')}</div>`;
  } else if (myTurn && pd && pd.kind === 'buy') {
    const sq = BOARD[pd.pos];
    h = `<div class="act-title">要买下 ${sq.name} 吗？</div><div class="act-sub">价格 ${fmt(sq.price)} · 你有 ${fmt(m.money)}</div>
         <div class="act-row"><button class="btn primary" data-act="buy">购买</button><button class="btn" data-act="auction">拍卖</button></div>`;
  } else if (myTurn && !pd) {
    if (m.money < 0) h = `<div class="act-title" style="color:#D70015">你欠款 ${fmt(-m.money)}</div><div class="act-sub">先卖房或抵押，否则只能破产</div><button class="btn danger wide" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`;
    else if (m.inJail && !S.rolled) {
      h = `<div class="act-title">你在监狱里（第 ${m.jailTurns + 1} 次尝试）</div><div class="act-sub">掷出双数即可出狱，或缴纳保释金</div>
        <button class="btn primary big wide" data-act="roll">🎲 掷骰子（试双数）</button>
        <div class="act-row"><button class="btn" data-act="payJail">缴保释金 ${fmt(RULES.jailFine)}</button>${m.goojf.length ? `<button class="btn green" data-act="useCard">用出狱卡</button>` : ''}</div>`;
    } else if (!S.rolled || S.canRollAgain) h = `<div class="act-title">${S.canRollAgain ? '双数！再掷一次' : '轮到你了'}</div><button class="btn primary big wide" data-act="roll">🎲 掷骰子</button><div class="act-sub" style="text-align:center">快捷键：空格</div>`;
    else h = `<div class="act-title">本回合行动完成</div><div class="act-sub">可以建房、交易，然后结束回合</div><button class="btn primary big wide" data-act="endTurn">结束回合</button>`;
  } else {
    let what = '思考中…';
    if (pd && pd.kind === 'pay') what = `正在支付 ${fmt(pd.amount)}（${esc(pd.reason)}）`;
    else if (pd && pd.kind === 'buy') what = `考虑是否购买 ${BOARD[pd.pos].name}`;
    else if (pd && pd.kind === 'card') what = '正在看卡片';
    else if (pd && pd.kind === 'auction') what = '拍卖进行中';
    h = `<div class="act-title">${esc(cur.name)} 的回合</div><div class="act-sub">${what}</div>`;
    if (m.money < 0) h += `<div class="act-sub" style="color:#D70015">你欠款 ${fmt(-m.money)}，请卖房/抵押</div><button class="btn danger wide" data-act="bankrupt" data-confirm="确定宣布破产吗？">宣布破产</button>`;
    if (!cur.connected && m.host) h += `<button class="btn wide" data-act="skip">跳过掉线玩家</button>`;
  }
  // 我发出的交易
  const mine = S.trades.find((t) => t.from === myId);
  if (mine && S.phase === 'play') h += `<div class="act-sub">⏳ 等待 ${esc(pById(mine.to).name)} 回复交易 <button class="btn sm" data-act="respond" data-id="${mine.id}" data-accept="">撤回</button></div>`;
  if (S.phase === 'play' && !m.bankrupt) h += `<div class="act-row"><button class="btn sm" data-local="trade">🤝 交易</button>${m.host ? `<button class="btn sm" data-act="endGame" data-confirm="确定现在结束游戏，按总资产排名吗？">结束并结算</button>` : ''}</div>`;
  el.innerHTML = h;
}

function renderAssets() {
  const m = me(); if (!m) return;
  const list = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === myId);
  const st = (i) => S.props[i];
  $('#assets').innerHTML = `<div class="panel-title"><span>我的地产（${list.length}）</span><span>总资产 ${fmt(m.worth)}</span></div>` +
    (list.length ? `<div class="chips">${list.map((i) => `<div class="chip-p ${st(i).mortgaged ? 'mort' : ''}" data-deed="${i}"><i style="background:${sqColor(i)}"></i>${BOARD[i].name}${st(i).houses ? `<small>${st(i).houses === 5 ? '🏨' : '🏠' + st(i).houses}</small>` : ''}</div>`).join('')}</div>` : '<div class="act-sub" style="margin:0">还没有地产，踩到空地就能买</div>') +
    (m.goojf.length ? `<div class="act-sub" style="margin-top:8px">🎟️ 出狱许可证 × ${m.goojf.length}</div>` : '');
}

function renderLog() { $('#log').innerHTML = S.log.slice().reverse().map((l) => `<div>${esc(l.msg)}</div>`).join(''); }

function renderStatus() {
  if (fxBusy) return;
  const cur = curP(), pd = S.pending;
  let s = `${dotOf(cur.id)}轮到 ${esc(cur.name)}`;
  if (pd && pd.kind === 'pay') s = `${dotOf(pd.payer)}${esc(pById(pd.payer).name)} 需支付 ${fmt(pd.amount)}`;
  if (pd && pd.kind === 'auction') s = `🔨 拍卖中：${BOARD[S.auction.pos].name}`;
  if (S.phase === 'end') s = `🏆 ${esc(pById(S.winner).name)} 获胜`;
  $('#status').innerHTML = s;
}

// ================= 弹窗 =================
function deedHTML(i) {
  const sq = BOARD[i], st = S.props[i], owner = st.owner && pById(st.owner);
  const head = (c) => `<div class="deed-head" style="background:${c}"><small>${sq.type === 'prop' ? '地 契' : sq.type === 'rail' ? '机 场' : '公 用 事 业'}</small><b>${sq.name}</b></div>`;
  let rows = '';
  if (sq.type === 'prop') {
    const full = owner && Object.keys(S.props).every((k) => BOARD[k].group !== sq.group || S.props[k].owner === st.owner);
    const lv = st.houses;
    rows = [['租金', sq.rent[0], lv === 0 && !full], ['集齐同色（无房）', sq.rent[0] * 2, lv === 0 && full], ['1 栋房屋', sq.rent[1], lv === 1], ['2 栋房屋', sq.rent[2], lv === 2], ['3 栋房屋', sq.rent[3], lv === 3], ['4 栋房屋', sq.rent[4], lv === 4], ['酒店', sq.rent[5], lv === 5]]
      .map(([a, b, on]) => `<tr class="${on && owner ? 'on' : ''}"><td>${a}</td><td>${fmt(b)}</td></tr>`).join('');
    rows += `</table><div class="foot">房屋每栋 ${fmt(GROUPS[sq.group].house)} · 酒店 ${fmt(GROUPS[sq.group].house)} + 4 栋房屋<br>抵押值 ${fmt(sq.price / 2)} · 售价 ${fmt(sq.price)}</div>`;
    return `<div class="deed">${head(GROUPS[sq.group].color)}<table>${rows}</div>`;
  }
  if (sq.type === 'rail') rows = [1, 2, 3, 4].map((n) => `<tr><td>拥有 ${n} 个机场</td><td>${fmt(250 * 2 ** (n - 1))}</td></tr>`).join('');
  else rows = `<tr><td>拥有 1 家</td><td>点数 × 40K</td></tr><tr><td>拥有 2 家</td><td>点数 × 100K</td></tr>`;
  return `<div class="deed">${head(sq.type === 'rail' ? '#1D1D1F' : '#8E8E93')}<table>${rows}</table><div class="foot">抵押值 ${fmt(sq.price / 2)} · 售价 ${fmt(sq.price)}</div></div>`;
}

function openDeed(i) { localView = { type: 'deed', pos: i }; renderLocal(); }
function closeLocal() { localView = null; tradeDraft = null; $('#local').hidden = true; }
$('#local').onclick = (e) => { if (e.target.id === 'local') closeLocal(); };

function renderLocal() {
  if (!localView) { $('#local').hidden = true; return; }
  const box = $('#localBox'), m = me();
  if (localView.type === 'deed') {
    const i = localView.pos, sq = BOARD[i], st = S.props[i], owner = st.owner && pById(st.owner);
    let h = deedHTML(i);
    h += `<p class="muted" style="text-align:center;margin:12px 0 0">${owner ? `主人：${esc(owner.name)}${st.mortgaged ? '（已抵押）' : ''}` : '无主地产'}</p>`;
    if (owner && owner.id === myId && S.phase === 'play' && !m.bankrupt) {
      const btns = [];
      if (sq.type === 'prop' && st.houses < 5 && !st.mortgaged) btns.push(`<button class="btn primary" data-act="build" data-pos="${i}">${st.houses === 4 ? '建酒店' : '建房'} ${fmt(GROUPS[sq.group].house)}</button>`);
      if (sq.type === 'prop' && st.houses > 0) btns.push(`<button class="btn" data-act="sell" data-pos="${i}">卖房 +${fmt(GROUPS[sq.group].house / 2)}</button>`);
      if (!st.mortgaged && st.houses === 0) btns.push(`<button class="btn" data-act="mortgage" data-pos="${i}">抵押 +${fmt(sq.price / 2)}</button>`);
      if (st.mortgaged) btns.push(`<button class="btn green" data-act="unmortgage" data-pos="${i}">赎回 ${fmt(Math.ceil(sq.price / 2 * 1.1 / 10) * 10)}</button>`);
      h += `<div class="act-row">${btns.join('')}</div>`;
    }
    h += `<div class="act-row"><button class="btn wide" data-close>关闭</button></div>`;
    box.innerHTML = h;
  } else if (localView.type === 'trade') {
    if (box.dataset.v !== 'trade') { box.dataset.v = 'trade'; }
    renderTrade(box);
  }
  if (localView.type !== 'trade') box.dataset.v = '';
  $('#local').hidden = false;
}

function tradableList(pid) {
  return Object.keys(S.props).map(Number).filter((i) => {
    if (S.props[i].owner !== pid) return false;
    const sq = BOARD[i]; if (sq.type !== 'prop') return true;
    return Object.keys(S.props).every((k) => BOARD[k].group !== sq.group || S.props[k].houses === 0);
  });
}
function renderTrade(box) {
  const d = tradeDraft, others = S.players.filter((p) => p.id !== myId && !p.bankrupt);
  if (!d.to && others[0]) d.to = others[0].id;
  const them = pById(d.to);
  const col = (pid, set, money, key) => `
    <div class="trade-list">${tradableList(pid).map((i) => `<label><input type="checkbox" data-tp="${key}" value="${i}" ${set.has(i) ? 'checked' : ''}><i style="background:${sqColor(i)}"></i>${BOARD[i].name}${S.props[i].mortgaged ? '（抵押）' : ''}</label>`).join('') || '<div class="muted">没有可交易的地产</div>'}</div>
    <input type="number" min="0" step="100" placeholder="现金（K）" data-tm="${key}" value="${money || ''}">`;
  box.innerHTML = `<h3>🤝 发起交易</h3><p class="muted">选择交易对象，勾选双方的地产和现金（单位 K，1000K = 1M）</p>
    <div class="who-pick">${others.map((p) => `<button data-to="${p.id}" class="${p.id === d.to ? 'on' : ''}">${avatar(p)}${esc(p.name)}</button>`).join('')}</div>
    ${them ? `<div class="trade-grid"><div class="trade-col"><h4>我给出</h4>${col(myId, d.give, d.giveMoney, 'give')}</div><div class="trade-col"><h4>${esc(them.name)} 给我</h4>${col(them.id, d.get, d.getMoney, 'get')}</div></div>` : '<p>没有其他玩家</p>'}
    <div class="act-row"><button class="btn" data-close>取消</button><button class="btn primary" id="sendTrade">发送交易请求</button></div>`;
  box.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => { d.to = b.dataset.to; d.get = new Set(); d.getMoney = 0; renderTrade(box); }));
  box.querySelectorAll('[data-tp]').forEach((c) => (c.onchange = () => { const s = c.dataset.tp === 'give' ? d.give : d.get; c.checked ? s.add(+c.value) : s.delete(+c.value); }));
  box.querySelectorAll('[data-tm]').forEach((c) => (c.oninput = () => { d[c.dataset.tm + 'Money'] = Math.max(0, +c.value || 0); }));
  const send = $('#sendTrade');
  if (send) send.onclick = () => {
    socket.emit('act', { type: 'propose', to: d.to, give: [...d.give], get: [...d.get], giveMoney: d.giveMoney, getMoney: d.getMoney }, (r) => {
      if (r.ok) { toast('交易请求已发送'); closeLocal(); } else { toast(r.error); Snd.bad(); }
    });
  };
}

function tradeDesc(t) {
  const list = (a) => a.map((i) => `<span style="color:${sqColor(i)};font-weight:700">■</span> ${BOARD[i].name}`).join('、');
  const part = (props, money) => [props.length ? list(props) : '', money ? `现金 ${fmt(money)}` : ''].filter(Boolean).join(' + ') || '（无）';
  return `<div class="trade-sum"><b>${esc(pById(t.from).name)} 给你：</b>${part(t.give, t.giveMoney)}<br><b>你给 ${esc(pById(t.from).name)}：</b>${part(t.get, t.getMoney)}</div>`;
}

function renderStateModal() {
  const md = $('#modal'), box = $('#modalBox'), pd = S.pending, m = me();
  let key = '', h = '';
  if (S.phase === 'end') {
    key = 'end';
    const w = pById(S.winner);
    h = `<div class="trophy">🏆</div><h3 style="text-align:center">${esc(w.name)} 获胜！</h3><div class="rank">${S.ranking.map((r, i) => { const p = pById(r.id); return `<div><span>${i + 1}</span>${avatar(p)}<span>${esc(p.name)}</span><span>${p.bankrupt ? '破产' : fmt(r.worth)}</span></div>`; }).join('')}</div>
      <div class="act-row"><button class="btn primary wide" id="backLobby">回到大厅</button></div>`;
  } else if (fxBusy) { key = ''; }
  else if (pd && pd.kind === 'card') {
    key = `card${pd.deck}${pd.id}${S.log.length}`;
    const card = (pd.deck === 'chance' ? CHANCE : CHEST)[pd.id], chance = pd.deck === 'chance';
    const c = chance ? '#FF9500' : '#0071E3';
    h = `<div class="flip"><div class="flip-in"><div class="flip-face flip-front"><div class="kind" style="color:${c}">${chance ? '机 会' : '命 运'}</div><div class="txt">${esc(card.text)}</div></div><div class="flip-face flip-back" style="background:${c}">${chance ? '?' : '✦'}</div></div></div>
      <p class="muted" style="text-align:center">${esc(pById(pd.pid).name)} 抽到的卡片</p>
      ${pd.pid === myId ? `<div class="act-row"><button class="btn primary wide big" data-act="card">好的</button></div>` : ''}`;
  } else if (pd && pd.kind === 'auction' && S.auction) {
    key = 'auction';
    const a = S.auction, sq = BOARD[a.pos], top = a.bidder && pById(a.bidder);
    const incs = [10, 50, 100, 500, 1000];
    h = `<h3>🔨 拍卖 · ${sq.name}</h3><p class="muted">所有玩家都可以出价，8 秒内没人加价即成交（原价 ${fmt(sq.price)}）</p>
      <div class="auction-price" id="auPrice">${fmt(a.bid)}</div><div class="auction-who" id="auWho">${top ? `${esc(top.name)} 出价最高` : '还没有人出价'}</div>
      <div class="countdown"><div id="cdBar"></div></div>
      ${m && !m.bankrupt ? `<div class="act-row" id="auBtns">${incs.map((n) => `<button class="btn ${n === 100 ? 'primary' : ''}" data-act="bid" data-inc="${n}">+${fmt(n)}</button>`).join('')}</div><p class="muted" style="text-align:center">你的余额 ${fmt(m.money)}</p>` : ''}`;
    if (stateModalKey === 'auction') {
      $('#auPrice').textContent = fmt(a.bid); $('#auWho').textContent = top ? `${top.name} 出价最高` : '还没有人出价';
      box.querySelectorAll('[data-inc]').forEach((b) => (b.disabled = !m || m.money < a.bid + +b.dataset.inc || a.bidder === myId));
      return;
    }
  } else if (pd && pd.kind === 'buy' && curP().id === myId) {
    key = 'buy' + pd.pos;
    const sq = BOARD[pd.pos];
    h = `${deedHTML(pd.pos)}<p class="muted" style="text-align:center;margin-top:12px">你有 ${fmt(m.money)}</p>
      <div class="act-row"><button class="btn" data-act="auction">拍卖</button><button class="btn primary" data-act="buy">购买 ${fmt(sq.price)}</button></div>`;
  } else {
    const t = S.trades.find((x) => x.to === myId);
    if (t) {
      key = 'trade' + t.id;
      h = `<h3>🤝 ${esc(pById(t.from).name)} 想和你交易</h3>${tradeDesc(t)}<div class="act-row"><button class="btn" data-act="respond" data-id="${t.id}" data-accept="">拒绝</button><button class="btn primary" data-act="respond" data-id="${t.id}" data-accept="1">接受</button></div>`;
    }
  }
  if (key === stateModalKey) return;
  stateModalKey = key;
  if (!key) { md.hidden = true; return; }
  box.innerHTML = h; md.hidden = false;
  if (key.startsWith('card')) Snd.card();
  if (key === 'end') { Snd.win(); $('#backLobby').onclick = () => { localStorage.removeItem('dfw_room'); location.href = '/'; }; }
  if (key === 'auction') renderStateModal.call(null);
}
setInterval(() => {
  const bar = $('#cdBar');
  if (bar && S && S.auction) { const left = S.auction.endsAt - (Date.now() + skew); bar.style.width = Math.max(0, Math.min(100, (left / 8000) * 100)) + '%'; }
}, 200);

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
  if (e.target.closest('[data-close]')) return closeLocal();
  const dd = e.target.closest('[data-deed]'); if (dd) return openDeed(+dd.dataset.deed);
  if (e.target.closest('[data-local="trade"]')) { tradeDraft = { to: null, give: new Set(), get: new Set(), giveMoney: 0, getMoney: 0 }; localView = { type: 'trade' }; renderLocal(); }
});
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !S || S.phase !== 'play' || fxBusy || e.target.tagName === 'INPUT') return;
  const m = me(); if (!m || curP().id !== myId || S.pending) return;
  e.preventDefault();
  if (!S.rolled || S.canRollAgain) act('roll'); else act('endTurn');
});

// ================= 主渲染 =================
socket.on('state', (st) => {
  const first = !S;
  S = st; skew = st.now - Date.now();
  if (first && st.phase !== 'lobby') { setDie(0, st.dice[0], false); setDie(1, st.dice[1], false); }
  renderAll();
});
function renderAll() {
  if (!S) return;
  if (S.phase === 'lobby') { $('#lobby').hidden = false; $('#game').hidden = true; renderLobby(); return; }
  if ($('#game').hidden) { $('#lobby').hidden = true; $('#game').hidden = false; resize(); }
  updateBoard(); placeTokens(); renderPlayers(); renderActions(); renderAssets(); renderLog(); renderStatus(); renderDock(); renderStateModal();
  if (localView && localView.type === 'deed') renderLocal();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  let bs = w < 1000 ? Math.min(w - 40, 860) : Math.min(h - 40, w - 360 - 60);
  bs = Math.max(520, Math.floor(bs));
  document.documentElement.style.setProperty('--bs', bs + 'px');
  placeTokens();
}
addEventListener('resize', resize);
resize();
