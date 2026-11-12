// 大富翁 · 世界银行版 —— 联机服务器
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');
const crypto = require('crypto');
const D = require('./public/data.js');
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
// 创建房间的密码（只存哈希值）。想换密码：在服务器上设置环境变量 CREATE_PASSWORD
const PASS_HASH = process.env.CREATE_PASSWORD ? sha(process.env.CREATE_PASSWORD) : 'f21ce2390cc90e663ac24786ff3591e1b015daf8fc12ff9cdaefca5f8fd6b384';

const PORT = process.env.PORT || 3000;
const SAVE = path.join(__dirname, 'data', 'rooms-v6.json');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

// ---------- 房间存档（服务器重启后可继续） ----------
const rooms = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
  for (const g of raw) rooms.set(g.code, Game.from(g));
  console.log(`已恢复 ${rooms.size} 个房间`);
} catch (_) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(SAVE), { recursive: true });
      const week = Date.now() - 7 * 864e5;
      for (const [c, g] of rooms) if (g.updatedAt < week) rooms.delete(c);
      fs.writeFileSync(SAVE, JSON.stringify([...rooms.values()]));
    } catch (e) { console.error('保存失败', e.message); }
  }, 500);
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function broadcast(g) {
  if (g.fx.length) { io.to(g.code).emit('fx', g.fx); g.fx = []; }
  io.to(g.code).emit('state', g.publicState());
  sendLedgers(g);
  save();
}
// 个人账本只发给本人，且只在有变化时发送
function sendLedgers(g, force) {
  for (const p of g.players) if (p.ledger && (p.ledgerDirty || force)) { p.ledgerDirty = false; io.to(g.code + ':' + p.id).emit('ledger', p.ledger.slice(-60)); }
}

// 拍卖倒计时
setInterval(() => {
  for (const g of rooms.values()) {
    try {
      if (g.auction) { if (g.tickAuction()) broadcast(g); }
      else if (g.phase === 'play' && g.cur && g.cur.auto && !g.auction && Date.now() >= (g.autoAt || 0)) { g.autoAt = Date.now() + 2800; try { g.autoSmart(g.cur); } catch (e) { console.error(e); } broadcast(g); }
    else if (g.phase === 'play' && g.deadline && Date.now() > g.deadline) { g.autoPlay(); broadcast(g); }
    } catch (e) { console.error(e); g.fx = []; g.touch(); }
  }
}, 250);
// 每秒收益：余额发给所有人，具体哪块地 +多少 只发给主人自己
setInterval(() => {
  for (const g of rooms.values()) {
    if (g.tickStage()) broadcast(g);
    if (g.settleBets()) broadcast(g);
    if (g.phase === 'play' && (g.mt = (g.mt || 0) + 1) % 2 === 0) { const ch = g.tickMarket(2); if (ch || g.fx.length) broadcast(g); else io.to(g.code).emit('market', { market: g.market, loans: Object.fromEntries(g.players.map((p) => [p.id, p.loan || 0])) }); }
    if (g.phase !== 'play') continue;
    if (g.expireTrades()) broadcast(g);
    const oldJ = g.expireJoins(); if (oldJ.length) { for (const [, sk] of io.sockets.sockets) if (oldJ.some((r) => r.token === sk.data.joinToken)) { sk.data.joinToken = null; sk.emit('joinDenied', { msg: '房主未在 2 分钟内处理，申请已过期，您可重新申请' }); } broadcast(g); }
    const inc = g.tickIncome();
    if (inc) for (const pid of Object.keys(inc)) io.to(g.code + ':' + pid).emit('income', inc[pid]);
    // 每秒都检查是否有人达到目标（地价每分钟上涨、股价波动也会让总资产越过目标）
    if (g.tickAutoRepay()) { broadcast(g); continue; }
    if (g.checkGoals()) broadcast(g);
    else { io.to(g.code).emit('tick', g.tickWorth()); sendLedgers(g); }
  }
}, 1000);

io.on('connection', (socket) => {
  const reply = (cb, data) => typeof cb === 'function' && cb(data);
  const bind = (g, p) => {
    socket.join(g.code); socket.join(g.code + ':' + p.id);
    socket.data.code = g.code; socket.data.token = p.token;
    p.connected = true; p.ledgerDirty = true; // 重新连上时把账本补发给本人
  };

  socket.on('create', ({ name, token, size, password }, cb) => {
    try {
      if (sha(password || '') !== PASS_HASH) throw new GameError('创建房间密码错误（未持有密码的玩家仅可加入房间）');
      const g = new Game(newCode());
      const n = Math.floor(Number(size));
      if (n >= 2 && n <= 8) g.maxPlayers = n;
      rooms.set(g.code, g);
      const p = g.addPlayer(name, token);
      bind(g, p);
      reply(cb, { ok: true, code: g.code, id: p.id });
      broadcast(g);
    } catch (e) { reply(cb, { ok: false, error: e.message }); }
  });

  socket.on('join', ({ code, name, token }, cb) => {
    try {
      const g = rooms.get(String(code || '').toUpperCase().trim());
      if (!g) throw new GameError('房间不存在，请检查房间号');
      let p = g.P(token);
      if (!p && g.phase === 'play') {
        // 游戏已开始：向房主发送加入申请，等待批准
        const r = g.requestJoin(name, token);
        socket.data.joinCode = g.code; socket.data.joinToken = token;
        const host = g.P(g.hostToken); if (host) io.to(g.code + ':' + host.id).emit('joinReq', { rid: r.rid, name: r.name });
        reply(cb, { ok: false, wait: true, code: g.code, name: r.name });
        broadcast(g); return;
      }
      if (!p) p = g.addPlayer(name, token);
      bind(g, p);
      reply(cb, { ok: true, code: g.code, id: p.id });
      broadcast(g);
    } catch (e) { reply(cb, { ok: false, error: e.message }); }
  });

  socket.on('act', ({ type, ...args }, cb) => {
    const g = rooms.get(socket.data.code);
    if (!g) return reply(cb, { ok: false, error: '您不在该房间中' });
    try {
      const kicked = type === 'kick' && g.phase === 'lobby' ? g.byId(args.id) : null;
      if (type === 'kick' && g.byId(args.id)) io.to(g.code + ':' + args.id).emit('kicked');
      const res = g.act(socket.data.token, type, args);
      if (type === 'approve' && res) {
        const tk = res.player ? res.player.token : res.denied && res.denied.token;
        for (const [, sk] of io.sockets.sockets) if (sk.data.joinToken === tk && sk.data.joinCode === g.code) {
          sk.data.joinToken = null;
          if (res.player) { sk.join(g.code); sk.join(g.code + ':' + res.player.id); sk.data.code = g.code; sk.data.token = tk; sk.emit('joinOk', { code: g.code, id: res.player.id }); }
          else sk.emit('joinDenied', { msg: '房主拒绝了您的加入申请' });
        }
      }
      if (kicked) for (const [, sk] of io.sockets.sockets) if (sk.data.token === kicked.token) { sk.leave(g.code); sk.data.code = null; }
      reply(cb, { ok: true });
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      g.fx = [];
      reply(cb, { ok: false, error: e instanceof GameError ? e.message : '服务器错误，请稍后再试' });
    }
    broadcast(g);
  });

  socket.on('emote', ({ to, e, text } = {}) => {
    const g = rooms.get(socket.data.code); if (!g) return;
    const p = g.P(socket.data.token); if (!p || !g.byId(to)) return;
    if (Date.now() - (socket.data.lastEmote || 0) < 500) return;
    const msg = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
    if (!msg && !D.EMOTES.includes(e)) return;
    socket.data.lastEmote = Date.now();
    io.to(g.code).emit('emote', { from: p.id, to, e: msg ? '' : e, text: msg });
    if (msg) { g.say(`💬 ${p.name} 对 ${g.byId(to).name} 说：${msg}`); broadcast(g); }
  });

  socket.on('cancelJoin', () => {
    const g = rooms.get(socket.data.joinCode); if (!g || !socket.data.joinToken) return;
    g.joinReqs = (g.joinReqs || []).filter((r) => r.token !== socket.data.joinToken); socket.data.joinToken = null; broadcast(g);
  });
  socket.on('disconnect', () => {
    const gj = rooms.get(socket.data.joinCode);
    if (gj && socket.data.joinToken) { gj.joinReqs = (gj.joinReqs || []).filter((r) => r.token !== socket.data.joinToken); broadcast(gj); }
    const g = rooms.get(socket.data.code);
    if (!g) return;
    const p = g.P(socket.data.token);
    const still = [...(io.sockets.adapter.rooms.get(g.code) || [])].some((id) => io.sockets.sockets.get(id)?.data.token === socket.data.token);
    if (p && !still) { p.connected = false; broadcast(g); }
  });
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n🎲 大富翁 · 世界银行版 已启动');
  console.log(`   本机打开：  http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`   同一 WiFi： http://${ip}:${PORT}`));
  console.log('');
});
