// 大富翁 · 世界银行版 —— 联机服务器
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');

const PORT = process.env.PORT || 3000;
const SAVE = path.join(__dirname, 'data', 'rooms.json');

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
  save();
}

// 拍卖倒计时
setInterval(() => {
  for (const g of rooms.values()) if (g.auction && g.tickAuction()) broadcast(g);
}, 250);

io.on('connection', (socket) => {
  const reply = (cb, data) => typeof cb === 'function' && cb(data);
  const bind = (g, p) => {
    socket.join(g.code);
    socket.data.code = g.code; socket.data.token = p.token;
    p.connected = true;
  };

  socket.on('create', ({ name, token, size }, cb) => {
    try {
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
      if (!p) p = g.addPlayer(name, token);
      bind(g, p);
      reply(cb, { ok: true, code: g.code, id: p.id });
      broadcast(g);
    } catch (e) { reply(cb, { ok: false, error: e.message }); }
  });

  socket.on('act', ({ type, ...args }, cb) => {
    const g = rooms.get(socket.data.code);
    if (!g) return reply(cb, { ok: false, error: '不在房间中' });
    try {
      g.act(socket.data.token, type, args);
      reply(cb, { ok: true });
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      g.fx = [];
      reply(cb, { ok: false, error: e instanceof GameError ? e.message : '服务器出错了' });
    }
    broadcast(g);
  });

  socket.on('disconnect', () => {
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
