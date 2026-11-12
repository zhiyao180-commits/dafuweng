// 大富翁规则引擎（服务器权威：所有点数、余额都由这里决定）
const D = require('./public/data.js');
const N01 = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()); // 标准正态随机数
const AUCTION_START = 10000, AUCTION_EXT = 5000; // 拍卖：开拍 10 秒，每次有人加价后倒计时重置为 5 秒
const { BOARD, GROUPS, CHANCE, CHEST, RULES, fmt } = D;
const N = BOARD.length;
const JAIL = BOARD.findIndex((s) => s.type === 'jail');

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const range = (n) => [...Array(n).keys()];
const die = () => 1 + Math.floor(Math.random() * 6);
const BUYABLE = (sq) => sq.type === 'prop' || sq.type === 'rail' || sq.type === 'util';
const GROUP_POS = {};
BOARD.forEach((sq, i) => { if (sq.type === 'prop') (GROUP_POS[sq.group] = GROUP_POS[sq.group] || []).push(i); });

class GameError extends Error {}
const must = (cond, msg) => { if (!cond) throw new GameError(msg); };

class Game {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.props = {};
    BOARD.forEach((sq, i) => { if (BUYABLE(sq)) this.props[i] = { owner: null, houses: 0, mortgaged: false }; });
    this.phase = 'lobby';
    this.maxPlayers = RULES.maxPlayers;
    this.turn = 0;
    this.rolled = false;
    this.canRollAgain = false;
    this.doubles = 0;
    this.dice = [1, 1];
    this.pending = null;
    this.auction = null;
    this.trades = [];
    this.housesLeft = RULES.houses;
    this.hotelsLeft = RULES.hotels;
    this.decks = { chance: shuffle(range(CHANCE.length)), chest: shuffle(range(CHEST.length)) };
    this.log = [];
    this.fx = [];
    this.winner = null;
    this.ranking = null;
    this.hostToken = null;
    this.tradeSeq = 1;
    this.updatedAt = Date.now();
    this.rich = [];
    this.sets = {};
    this.deadline = 0;
    this.market = D.ASSETS.map((a) => ({ id: a.id, price: a.base, hist: [a.base] }));
    this.backfillMarket();
    this.stage = 0; this.autoStage = 0; this.startedAt = 0; this.tasks = {};
  }

  // ---------- 工具 ----------
  P(token) { return this.players.find((p) => p.token === token); }
  byId(id) { return this.players.find((p) => p.id === id); }
  get cur() { return this.players[this.turn]; }
  active() { return this.players.filter((p) => !p.bankrupt); }
  say(msg) { this.log.push({ t: Date.now(), msg }); if (this.log.length > 200) this.log.shift(); }
  name(p) { return p ? p.name : '银行'; }

  // 资金变动 + 刷卡机动画
  // 预先生成约 6 分钟的历史行情，开局时 K 线图就是完整的
  backfillMarket() {
    for (const m of this.market) {
      const a = D.ASSETS.find((x) => x.id === m.id); let price = a.base * (0.92 + Math.random() * 0.16); m.hist = []; m.k = []; m.kn = 0;
      for (let i = 0; i < 180; i++) {
        const prev = price; price = Math.max(a.base * 0.3, price * Math.exp(0.03 * Math.log(a.base / price) + a.vol * N01()));
        const px = +price.toPrecision(5), vol = Math.round((60 + Math.random() * 120) * (1 + Math.abs(Math.log(price / prev)) * 25));
        if (i >= 120) m.hist.push(px);
        m.kn++; if (m.kn % 5 === 1) { const o = +prev.toPrecision(5); m.k.push([o, Math.max(o, px), Math.min(o, px), px, 0]); if (m.k.length > 36) m.k.shift(); }
        const c = m.k[m.k.length - 1]; c[1] = Math.max(c[1], px); c[2] = Math.min(c[2], px); c[3] = px; c[4] += vol;
      }
      m.price = price;
    }
  }
  // ---------- 复盘统计 ----------
  stat(p, k, v = 1) { if (!p) return; const s = p.st || (p.st = {}); s[k] = (s[k] || 0) + v; }
  moment(text) { const m = this.moments || (this.moments = []); m.push({ t: Date.now() - (this.startedAt || Date.now()), text }); if (m.length > 120) m.splice(1, 1); }
  track(from, to, amt, L = '') {
    const a = (p, k, v) => this.stat(p, k, v);
    if (/的租金$/.test(L)) { a(from, 'rentOut', amt); a(to, 'rentIn', amt); a(to, 'rentN', 1); (this.bigRents || (this.bigRents = [])).push({ from: from && from.id, to: to && to.id, amt, city: L.replace(/ 的租金$/, ''), t: Date.now() - this.startedAt }); this.bigRents.sort((x, y) => y.amt - x.amt); this.bigRents.length = Math.min(this.bigRents.length, 5); }
    else if (L.startsWith('经过')) { a(to, 'salary', amt); a(to, 'laps', 1); }
    else if (/分红$/.test(L)) a(to, 'bonus', amt);
    else if (L.includes('税')) a(from, 'tax', amt);
    else if (L.startsWith('购买 ') || L.startsWith('远程购买')) { a(from, 'landSpent', amt); a(from, 'buys', 1); }
    else if (L.startsWith('拍得')) { a(from, 'landSpent', amt); a(from, 'auctionsWon', 1); a(to, 'auctionIncome', amt); }
    else if (L.endsWith('建房') || L.endsWith('建酒店')) { a(from, 'buildSpent', amt); a(from, 'builds', 1); }
    else if (L.startsWith('买入 ')) a(from, 'stockBuy', amt);
    else if (L.startsWith('卖出 ')) a(to, 'stockSell', amt);
    else if (L.startsWith('竞猜 ')) { a(from, 'betStake', amt); a(from, 'bets', 1); }
    else if (L === '竞猜获胜') { a(to, 'betPayout', amt); a(to, 'betWins', 1); }
    else if (L === '银行贷款') a(to, 'loanTaken', amt);
    else if (L === '偿还贷款' || L === '自动还贷') a(from, 'loanRepaid', amt);
    else if (L === '保释金') a(from, 'jailFine', amt);
    else if (L === '交易') { a(from, 'tradeOut', amt); a(to, 'tradeIn', amt); }
    else if (L === '私人转账') { a(from, 'giftOut', amt); a(to, 'giftIn', amt); }
    else if (L === '完成加速任务') a(to, 'taskReward', amt);
    else if (L.startsWith('股票')) { a(to, 'stockSq', amt); a(from, 'stockSq', -amt); }
    else if (L.includes('破产清算')) a(to, 'liquidation', amt);
    else if (L.endsWith('卖房') || L.startsWith('抵押') || L.startsWith('赎回')) { a(to, 'raised', amt); a(from, 'raised', -amt); }
    else { a(to, 'luck', amt); a(from, 'luck', -amt); } // 机会、命运、转盘、维修费等
    a(from, 'outAll', amt); a(to, 'inAll', amt);
    this.ledge(from, -amt, L, to); this.ledge(to, amt, L, from);
    if (from) { const t = from.st || (from.st = {}); if (!t.maxOut || amt > t.maxOut[0]) t.maxOut = [amt, L]; }
    if (to) { const t = to.st || (to.st = {}); if (!t.maxIn || amt > t.maxIn[0]) t.maxIn = [amt, L]; }
  }
  // 个人账本：只发给本人（见 server.js 的 sendLedgers）
  ledge(p, amt, label, other) {
    if (!p) return;
    const l = p.ledger || (p.ledger = []);
    l.push({ t: Math.floor((Date.now() - (this.startedAt || Date.now())) / 1000), a: amt, r: label || '', w: other ? other.name : '银行', b: p.money });
    if (l.length > 80) l.splice(0, l.length - 80);
    p.ledgerDirty = true;
  }
  transfer(from, to, amt, label) {
    if (amt <= 0) return;
    if (from) from.money -= amt;
    if (to) to.money += amt;
    this.track(from, to, amt, label);
    this.fx.push({ type: 'pos', from: from ? from.id : null, to: to ? to.id : null, amount: amt, label });
    this.say(`💳 ${this.name(from)} → ${this.name(to)} ${fmt(amt)}（${label}）${from ? `｜${from.name} 余额 ${fmt(from.money)}` : ''}${to ? `｜${to.name} 余额 ${fmt(to.money)}` : ''}`);
  }

  // 一对多 / 多对一：合并成一次刷卡动画
  transferMulti(froms, tos, each, label) {
    if (each <= 0 || !froms.length || !tos.length) return;
    const one = froms.length === 1 ? froms[0] : tos[0], many = froms.length === 1 ? tos : froms, total = each * many.length;
    if (froms.length === 1) { many.forEach((o) => this.track(one, o, each, label)); } else { many.forEach((o) => this.track(o, one, each, label)); }
    if (froms.length === 1) { one.money -= total; many.forEach((o) => (o.money += each)); this.fx.push({ type: 'posmulti', from: one.id, tos: many.map((o) => o.id), each, label }); }
    else { many.forEach((o) => (o.money -= each)); one.money += total; this.fx.push({ type: 'posmulti', froms: many.map((o) => o.id), to: one.id, each, label }); }
    this.say(`💳 ${froms.length === 1 ? `${one.name} → ${many.map((o) => o.name).join('、')}` : `${many.map((o) => o.name).join('、')} → ${one.name}`} 每人 ${fmt(each)}，合计 ${fmt(total)}（${label}）｜${one.name} 余额 ${fmt(one.money)}`);
  }

  ownsGroup(pid, group) { return GROUP_POS[group].every((i) => this.props[i].owner === pid); }
  countOwned(pid, type) { return BOARD.reduce((n, sq, i) => n + (sq.type === type && this.props[i].owner === pid ? 1 : 0), 0); }

  get taxRate() { return Math.min(0.16, 0.04 + 0.015 * (this.stage || 0)); }
  get infl() { return Math.pow(1.5, this.stage || 0); }
  // 物价指数（地价、房价）：每次通胀 ×1.7（租金、工资只 ×1.5），并且每分钟再自然上涨 1%
  // 价格取 3 位有效数字，避免出现 60.01M 这样的零碎数
  nice(x) { if (x < 100) return Math.round(x); const m = Math.pow(10, Math.floor(Math.log10(x)) - 2); return Math.round(x / m) * m; }
  get pinfl() { const min = this.startedAt && this.phase === 'play' ? (Date.now() - this.startedAt) / 60000 : 0; return Math.pow(1.7, this.stage || 0) * Math.pow(1.01, min); }
  priceOf(pos) { return this.nice((this.props[pos].fore ? BOARD[pos].price / 2 : BOARD[pos].price) * this.pinfl); }
  houseCost(sq) { return this.nice(GROUPS[sq.group].house * this.pinfl); }
  // 建房阻力：同一块地越往上盖越贵（第 1–4 栋 ×1 / ×1.3 / ×1.7 / ×2.2，酒店 ×3），且全场房屋盖得越多越贵（建材紧缺，最高 ×2）
  scarcity() { const used = (RULES.houses - this.housesLeft) + 4 * (RULES.hotels - this.hotelsLeft); return 1 + Math.min(1, used / RULES.houses); }
  buildCost(pos) { const sq = BOARD[pos], st = this.props[pos]; return this.nice(this.houseCost(sq) * [1, 1.3, 1.7, 2.2, 3][Math.min(st.houses, 4)] * this.scarcity()); }
  I(x) { return Math.round(x * this.infl); }
  scaleText(t) { return t.replace(/(\d+(?:\.\d+)?)(K|M|B)/g, (m, a, u) => fmt(parseFloat(a) * (u === 'B' ? 1e6 : u === 'M' ? 1000 : 1) * this.infl)); }
  rentFor(pos, opts = {}) { return Math.round(this.baseRent(pos, opts) * this.infl); }
  baseRent(pos, opts = {}) {
    const sq = BOARD[pos], st = this.props[pos];
    if (sq.type === 'rail') {
      const n = this.countOwned(st.owner, 'rail');
      return RULES.railRent[Math.min(n, RULES.railRent.length) - 1] * (opts.doubleRail ? 2 : 1);
    }
    if (sq.type === 'util') {
      const n = this.countOwned(st.owner, 'util');
      const mult = opts.utilTen ? RULES.utilMult[1] : RULES.utilMult[Math.min(n, RULES.utilMult.length) - 1];
      return mult * (opts.diceTotal || this.dice[0] + this.dice[1]);
    }
    if (st.houses > 0) return sq.rent[st.houses];
    return sq.rent[0] * (this.ownsGroup(st.owner, sq.group) ? 2 : 1);
  }

  netWorth(p) {
    let v = p.money;
    for (const [i, st] of Object.entries(this.props)) {
      if (st.owner !== p.id) continue;
      const sq = BOARD[i], pr = this.nice(sq.price * this.pinfl);
      v += st.mortgaged ? pr / 2 : pr;
      if (sq.type === 'prop') v += st.houses * this.houseCost(sq);
    }
    return Math.round(v + this.holdValue(p) - (p.loan || 0));
  }
  holdValue(p) { let v = 0; for (const m of this.market || []) v += ((p.hold && p.hold[m.id]) || 0) * m.price; return Math.round(v); }

  // ---------- 大厅 ----------
  addPlayer(name, token) {
    must(this.phase === 'lobby', '对局已开始，无法加入');
    must(this.players.length < this.maxPlayers, `房间已满（${this.maxPlayers} 人）`);
    name = String(name || '').trim().slice(0, 10) || '玩家';
    must(!this.players.some((p) => p.name === name), '该昵称已被使用');
    const used = new Set(this.players.map((p) => p.color));
    const ci = D.COLORS.findIndex((c) => !used.has(c));
    const p = {
      id: 'p' + Math.random().toString(36).slice(2, 8), token, name,
      color: D.COLORS[ci], icon: D.TOKENS[ci],
      pos: 0, money: RULES.startMoney, inJail: false, jailTurns: 0, goojf: [],
      bankrupt: false, connected: true, creditor: null,
    };
    this.players.push(p);
    if (!this.hostToken) this.hostToken = token;
    this.say(`${p.name} 加入了房间`);
    return p;
  }

  // ---------- 开局后申请加入（房主审批） ----------
  requestJoin(name, token) {
    must(this.phase === 'play', '对局未在进行中');
    name = String(name || '').trim().slice(0, 10) || '玩家';
    must(!this.players.some((p) => p.name === name), '该昵称已被使用，请更换后重新申请');
    must(this.players.length < 8, '房间已满（8 人）');
    this.joinReqs = (this.joinReqs || []).filter((r) => r.token !== token);
    const r = { rid: 'r' + Math.random().toString(36).slice(2, 8), name, token, at: Date.now() };
    this.joinReqs.push(r);
    return r;
  }
  approveJoin(p, rid, ok) {
    must(p.token === this.hostToken, '仅房主可审批加入申请');
    const r = (this.joinReqs || []).find((x) => x.rid === rid); must(r, '申请已失效');
    this.joinReqs = this.joinReqs.filter((x) => x !== r);
    if (!ok) { this.say(`房主拒绝了 ${r.name} 的加入申请`); return { denied: r }; }
    must(this.players.length < 8, '房间已满（8 人）');
    must(!this.players.some((x) => x.name === r.name), '该昵称已被使用');
    const used = new Set(this.players.map((x) => x.color)), ci = Math.max(0, D.COLORS.findIndex((c) => !used.has(c)));
    const usedIcon = new Set(this.players.map((x) => x.icon)), icon = D.TOKENS.find((t) => !usedIcon.has(t)) || D.TOKENS[ci];
    const money = this.nice(RULES.startMoney * this.infl); // 按当前通胀发放起始资金
    const np = { id: 'p' + Math.random().toString(36).slice(2, 8), token: r.token, name: r.name, color: D.COLORS[ci], icon, pos: 0, money, inJail: false, jailTurns: 0, goojf: [], bankrupt: false, connected: true, creditor: null, st: { turns: 0, late: 1 }, peak: [money, Date.now() - this.startedAt], joinedAt: Date.now() - this.startedAt };
    this.players.push(np); this.maxPlayers = Math.max(this.maxPlayers, this.players.length);
    this.say(`🙋 ${np.name} 经房主批准加入对局，获得起始资金 ${fmt(money)}，行动顺序排在末位`);
    this.moment(`🙋 ${np.name} 加入对局（起始资金 ${fmt(money)}）`);
    this.fx.push({ type: 'joined', pid: np.id });
    return { player: np };
  }
  expireJoins() {
    const now = Date.now(), old = (this.joinReqs || []).filter((r) => now - r.at > 120000);
    if (!old.length) return [];
    this.joinReqs = this.joinReqs.filter((r) => !old.includes(r));
    return old;
  }

  setLook(p, color, icon) {
    must(this.phase === 'lobby', '对局已开始');
    if (color && D.COLORS.includes(color)) { must(!this.players.some((o) => o !== p && o.color === color), '该颜色已被其他玩家选择'); p.color = color; }
    if (icon && D.TOKENS.includes(icon)) { must(!this.players.some((o) => o !== p && o.icon === icon), '该棋子已被其他玩家选择'); p.icon = icon; }
  }

  setSize(p, n) {
    must(p.token === this.hostToken, '仅房主可修改人数');
    must(this.phase === 'lobby', '对局已开始');
    n = Math.floor(Number(n));
    must(n >= 2 && n <= RULES.maxPlayers, '人数须介于 2 至 8 人之间');
    must(n >= this.players.length, `房间内已有 ${this.players.length} 名玩家`);
    this.maxPlayers = n;
  }

  start(p) {
    must(p.token === this.hostToken, '仅房主可开始对局');
    must(this.phase === 'lobby', '对局已开始');
    must(this.players.length >= 2, '至少需要 2 位玩家');
    this.players = shuffle(this.players);
    this.phase = 'play';
    this.startedAt = Date.now();
    this.turn = 0;
    this.say(`对局开始。每位玩家获得初始资金 ${fmt(RULES.startMoney)}，总资产（现金 + 地产 + 房屋）率先达到 ${fmt(RULES.winCash)} 者成为首富并胜出，其余玩家继续角逐名次。行动顺序：${this.players.map((x) => x.name).join(' → ')}`);
    this.say(`${this.cur.name} 的回合`);
    this.fx.push({ type: 'turn', pid: this.cur.id });
    this.moments = []; this.bigRents = []; this.rounds = 0; this.players.forEach((x) => { x.st = { turns: 0 }; x.peak = [RULES.startMoney, 0]; });
    this.moment(`🎬 对局开始，${this.players.length} 位玩家，行动顺序：${this.players.map((x) => x.name).join(' → ')}`);
    this.touch();
  }

  // ---------- 掷骰与移动 ----------
  roll(p) {
    must(this.phase === 'play', '对局未在进行中');
    must(p === this.cur, '尚未轮到您');
    must(!this.pending, '请先处理当前事项');
    must(!this.rolled || this.canRollAgain, '本回合已掷骰');
    must(p.money >= 0, '您尚有欠款，请先出售房屋或抵押地产以筹集资金');
    const d = [die(), die()];
    this.dice = d;
    const sum = d[0] + d[1], dbl = d[0] === d[1];
    this.fx.push({ type: 'dice', pid: p.id, dice: d });
    if (dbl) { this.prog(p, 'dbl'); this.stat(p, 'doubles'); }
    this.rolled = true;
    this.canRollAgain = false;

    if (p.inJail) {
      if (dbl) {
        p.inJail = false; p.jailTurns = 0;
        this.say(`${p.name} 掷出相同点数 ${d[0]}+${d[1]}，获释出狱`);
        this.moveBy(p, sum);
      } else {
        p.jailTurns++;
        if (p.jailTurns >= 3) {
          this.say(`${p.name} 第三次未掷出相同点数，须缴纳保释金 ${fmt(this.I(RULES.jailFine))}`);
          this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.I(RULES.jailFine), reason: '保释金', next: { t: 'release', move: sum } };
        } else this.say(`${p.name} 掷出 ${d[0]}+${d[1]}，未掷出相同点数，继续留在监狱（第 ${p.jailTurns} 次）`);
      }
      return;
    }

    if (dbl) {
      this.doubles++;
      if (this.doubles >= 3) {
        this.say(`${p.name} 连续三次掷出相同点数，依规则入狱`);
        this.sendJail(p);
        return;
      }
      this.canRollAgain = true;
    }
    this.say(`${p.name} 掷出 ${d[0]} + ${d[1]} = ${sum}${dbl ? '（相同点数，可再掷一次）' : ''}`);
    this.moveBy(p, sum);
  }

  moveBy(p, n, opts = {}) {
    const from = p.pos;
    const to = (((from + n) % N) + N) % N;
    this.fx.push({ type: 'move', pid: p.id, from, steps: n });
    p.pos = to;
    if (n > 0) for (let k = 1; k <= n; k++) { const q = BOARD[(from + k) % N]; if (q.type === 'go' || q.type === 'hub') { this.transfer(null, p, Math.round(RULES.goSalary * this.infl), '经过' + q.name); this.prog(p, 'lap'); this.propTax(p); } }
    this.land(p, opts);
  }

  moveTo(p, target, opts) { this.moveBy(p, (target - p.pos + N) % N, opts); }

  sendJail(p) {
    this.stat(p, 'jail');
    this.fx.push({ type: 'jump', pid: p.id, to: JAIL });
    p.pos = JAIL; p.inJail = true; p.jailTurns = 0;
    this.canRollAgain = false; this.doubles = 0;
  }

  land(p, opts = {}) {
    const pos = p.pos, sq = BOARD[pos];
    if (BUYABLE(sq)) {
      const st = this.props[pos];
      if (!st.owner) {
        this.pending = { kind: 'buy', pos };
        return;
      }
      if (st.owner === p.id) return;
      if (st.mortgaged) { this.say(`${sq.name} 已抵押，无需支付租金`); return; }
      const owner = this.byId(st.owner);
      let rOpts = { ...opts };
      if (sq.type === 'util' && opts.utilRoll) {
        const d = [die(), die()];
        this.fx.push({ type: 'dice', pid: p.id, dice: d });
        rOpts.diceTotal = d[0] + d[1]; rOpts.utilTen = true;
        this.say(`${p.name} 为公用事业重新掷骰：${d[0]}+${d[1]}`);
      }
      const rent = this.rentFor(pos, rOpts);
      this.pending = { kind: 'pay', payer: p.id, to: owner.id, amount: rent, reason: `${sq.name} 的租金` };
      return;
    }
    if (sq.type === 'tax') {
      this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.I(sq.amount), reason: sq.name };
      return;
    }
    if (sq.type === 'chance' || sq.type === 'chest') {
      const deck = this.decks[sq.type];
      const id = deck.shift();
      const card = (sq.type === 'chance' ? CHANCE : CHEST)[id];
      if (card.fx.t !== 'goojf') deck.push(id);
      const text = this.scaleText(card.text);
      this.pending = { kind: 'card', deck: sq.type, id, pid: p.id, text, seq: (this.cardSeq = (this.cardSeq || 0) + 1) }; this.stat(p, 'cards');
      this.say(`${p.name} 抽取${sq.name}卡：${text}`);
      return;
    }
    if (sq.type === 'bonus') {
      this.transfer(null, p, Math.round(sq.amount * this.infl), sq.name + '分红');
      return;
    }
    if (sq.type === 'stock' || sq.type === 'portal') { this.pending = { kind: sq.type, pid: p.id }; return; }
    if (sq.type === 'force') { if (this.forceTargets(p).length) this.pending = { kind: 'force', pid: p.id }; else this.say('当前没有可强制拍卖的地产'); return; }
    if (sq.type === 'wheel') {
      const id = Math.floor(Math.random() * D.WHEEL.length);
      const text = this.scaleText(D.WHEEL[id].text);
      this.pending = { kind: 'card', deck: 'wheel', id, pid: p.id, text, seq: (this.cardSeq = (this.cardSeq || 0) + 1) }; this.stat(p, 'cards');
      this.say(`${p.name} 转动幸运转盘：${text}`);
      return;
    }
    if (sq.type === 'gotojail') {
      this.say(`${p.name} 被送入监狱`);
      this.sendJail(p);
    }
  }

  // ---------- 卡片 ----------
  ackCard(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'card' && pd.pid === p.id, '当前没有待确认的卡片');
    const card = (pd.deck === 'chance' ? CHANCE : pd.deck === 'chest' ? CHEST : D.WHEEL)[pd.id];
    this.pending = null;
    this.prog(p, 'card');
    const f = { ...card.fx };
    for (const k of ['amt', 'house', 'hotel']) if (f[k] && f.t !== 'wallet') f[k] = this.I(f[k]);
    switch (f.t) {
      case 'wallet': {
        this.settle(p); const nm = { card: '银行卡', phone: '手机钱包', cash: '现金' }[f.w];
        const amt = Math.round(p.w[f.w] * f.pct / 100);
        if (!amt) { this.say(`${p.name} 的${nm}余额为零，不受影响`); break; }
        p.w[f.w] += amt; if (amt > 0) this.transfer(null, p, amt, nm + '收益'); else this.transfer(p, null, -amt, nm + '损失');
        break;
      }
      case 'goto': this.moveTo(p, f.pos); break;
      case 'nearest': {
        let i = p.pos;
        do { i = (i + 1) % N; } while (BOARD[i].type !== f.kind);
        this.moveTo(p, i, f.kind === 'rail' ? { doubleRail: true } : { utilRoll: true });
        break;
      }
      case 'money':
        if (f.amt > 0) this.transfer(null, p, f.amt, '卡片奖励');
        else this.pending = { kind: 'pay', payer: p.id, to: null, amount: -f.amt, reason: '卡片罚款' };
        break;
      case 'back': this.moveBy(p, -f.n); break;
      case 'fwd': this.moveBy(p, f.n); break;
      case 'sponsor': {
        const act = this.active();
        const rich = act.reduce((x, y) => (y.money > x.money ? y : x)), poor = act.reduce((x, y) => (y.money < x.money ? y : x));
        if (rich !== poor && rich.money > poor.money) { this.transfer(rich, poor, f.amt, '企业赞助'); this.say(`企业赞助：${rich.name} 向 ${poor.name} 支付 ${fmt(f.amt)}`); }
        break;
      }
      case 'proptax': {
        const cnt = (o) => Object.values(this.props).filter((st) => st.owner === o.id).length;
        const act = this.active(), max = Math.max(...act.map(cnt));
        if (max > 0) for (const o of act) if (cnt(o) === max) {
          this.transfer(o, null, f.amt, '地产税'); this.say(`地产税：${o.name}（持有 ${max} 块地产）缴纳 ${fmt(f.amt)}`);
          if (o.money < 0) o.creditor = null;
        }
        break;
      }
      case 'jail': this.sendJail(p); break;
      case 'goojf': p.goojf.push(pd.deck); break;
      case 'repairs': {
        let h = 0, H = 0;
        for (const st of Object.values(this.props)) if (st.owner === p.id) { if (st.houses === 5) H++; else h += st.houses; }
        const amt = h * f.house + H * f.hotel;
        if (amt > 0) this.pending = { kind: 'pay', payer: p.id, to: null, amount: amt, reason: `维修费（${h} 栋房屋，${H} 座酒店）` };
        else this.say(`${p.name} 名下无房屋，无需支付维修费`);
        break;
      }
      case 'each': {
        const others = this.active().filter((o) => o !== p);
        if (f.amt > 0) {
          this.transferMulti(others, [p], f.amt, '卡片收款');
          for (const o of others) if (o.money < 0) { o.creditor = p.id; this.say(`${o.name} 余额不足，须筹集资金`); }
        } else {
          this.pending = { kind: 'pay', payer: p.id, to: 'each', amount: -f.amt * others.length, each: -f.amt, reason: '支付每位玩家' };
        }
        break;
      }
    }
  }

  // ---------- 刷卡付款 ----------
  swipe(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'pay' && pd.payer === p.id, '当前没有需要您支付的款项');
    must(p.money >= pd.amount, `余额不足（需支付 ${fmt(pd.amount)}），请先出售房屋或抵押地产`);
    this.pending = null;
    if (pd.to === 'each') {
      this.transferMulti([p], this.active().filter((x) => x !== p), pd.each, pd.reason);
    } else {
      this.transfer(p, pd.to ? this.byId(pd.to) : null, pd.amount, pd.reason);
    }
    if (pd.to && pd.to !== 'each' && /的租金$/.test(pd.reason)) this.prog(this.byId(pd.to), 'rent');
    const n = pd.next;
    if (!n) return;
    if (n.t === 'own') {
      if (this.props[n.pos].owner) { this.transfer(null, p, pd.amount, '购买失败退款'); this.say(`${BOARD[n.pos].name} 已由其他玩家购得，款项已退回`); return; }
      this.props[n.pos].owner = p.id;
      this.fx.push({ type: 'buy', pid: p.id, pos: n.pos }); this.props[n.pos].fore = false; this.prog(p, 'buy');
      this.say(`${p.name} 购得 ${BOARD[n.pos].name}`);
    } else if (n.t === 'release') {
      p.inJail = false; p.jailTurns = 0;
      this.moveBy(p, n.move);
    } else if (n.t === 'jailPaid') {
      p.inJail = false; p.jailTurns = 0;
      this.say(`${p.name} 缴纳保释金出狱`);
    }
  }

  buy(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'buy' && p === this.cur, '当前无法购买');
    const sq = BOARD[pd.pos];
    this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.priceOf(pd.pos), reason: `购买 ${sq.name}`, next: { t: 'own', pos: pd.pos }, cancelTo: { kind: 'buy', pos: pd.pos } };
  }

  cancelBuy(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'pay' && pd.cancelTo && pd.payer === p.id, '无法取消');
    this.pending = pd.cancelTo;
  }

  // ---------- 拍卖 ----------
  startAuction(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'buy' && p === this.cur, '当前无法发起拍卖');
    this.pending = { kind: 'auction' };
    this.auction = { pos: pd.pos, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_START, total: AUCTION_START, by: p.id };
    this.say(`${BOARD[pd.pos].name} 开始拍卖`);
  }

  bid(p, inc) {
    const a = this.auction;
    must(a, '当前没有进行中的拍卖');
    must(!p.bankrupt, '您已破产');
    must(p.id !== a.seller, '您不能竞拍本人被强制拍卖的地产');
    inc = Number(inc);
    must(RULES.bids.includes(inc), '加价幅度无效');
    const amt = a.bid + inc;
    must(p.money >= 0, '您尚有欠款，无法参与竞拍');
    must(p.money >= amt, '余额不足');
    a.bid = amt; a.bidder = p.id;
    a.endsAt = Date.now() + AUCTION_EXT; a.total = AUCTION_EXT; // 有人加价：倒计时重置为 5 秒
    this.fx.push({ type: 'bid', pid: p.id, amount: amt });
  }

  tickAuction() {
    const a = this.auction;
    if (!a || Date.now() < a.endsAt) return false;
    const sq = BOARD[a.pos];
    this.auction = null;
    let w = a.bidder && this.byId(a.bidder);
    if (w && (w.bankrupt || (a.seller && !this.props[a.pos].owner))) { this.say(`${w.name} 已出局或地产已被收回，本次拍卖无效`); w = null; a.bidder = null; }
    if (w && w.money < a.bid) { this.autoRaise(w, a.bid); if (w.money < a.bid) { this.say(`${w.name} 出价 ${fmt(a.bid)} 但现金不足，本次拍卖无效`); w = null; a.bidder = null; } }
    if (a.bidder) {
      this.transfer(w, a.seller ? this.byId(a.seller) : null, a.bid, `拍得 ${sq.name}`);
      this.props[a.pos].owner = w.id;
      this.fx.push({ type: 'buy', pid: w.id, pos: a.pos }); this.props[a.pos].fore = false; this.prog(w, 'buy');
      this.say(`${w.name} 以 ${fmt(a.bid)} 拍得 ${sq.name}`); this.moment(`🔨 ${w.name} 以 ${fmt(a.bid)} 拍得 ${sq.name}${a.seller ? `（强制拍卖，原业主 ${this.byId(a.seller).name}）` : ''}`);
    } else this.say(`${sq.name} 无人出价，流拍`);
    if (this.pending && this.pending.kind === 'auction') this.pending = null;
    this.checkSets(); this.checkGoals(); this.maybeAdvance(); this.touch();
    return true;
  }

  // ---------- 监狱 ----------
  payJail(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '当前无法缴纳保释金');
    this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.I(RULES.jailFine), reason: '保释金', next: { t: 'jailPaid' } };
  }

  useCard(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '当前无法使用出狱许可证');
    must(p.goojf.length, '您没有出狱许可证');
    const deck = p.goojf.shift();
    const list = deck === 'chance' ? CHANCE : CHEST;
    this.decks[deck].push(list.findIndex((c) => c.fx.t === 'goojf'));
    p.inJail = false; p.jailTurns = 0;
    this.say(`${p.name} 使用出狱许可证出狱`);
  }

  // ---------- 房产管理 ----------
  ownProp(p, pos) {
    const st = this.props[pos];
    must(st && st.owner === p.id, '该地产不属于您');
    must(!this.auction, '拍卖进行中');
    return [BOARD[pos], st];
  }

  build(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(sq.type === 'prop', '仅可在城市地产上建造房屋');
    must(this.ownsGroup(p.id, sq.group), `须持有全部${GROUPS[sq.group].name}地产`);
    const g = GROUP_POS[sq.group].map((i) => this.props[i]);
    must(g.every((x) => !x.mortgaged), '同色组中有已抵押的地产，请先赎回');
    must(st.houses < 5, '该地产已建有酒店');
    must(st.houses <= Math.min(...g.map((x) => x.houses)), '须均衡建造：请先在同色组其他地产上建造');
    const cost = this.buildCost(pos);
    this.noDebt(p);
    must(p.money >= cost, '余额不足');
    if (st.houses === 4) { must(this.hotelsLeft > 0, '银行酒店已售罄'); this.hotelsLeft--; this.housesLeft += 4; }
    else { must(this.housesLeft > 0, '银行房屋已售罄'); this.housesLeft--; }
    st.houses++;
    this.fx.push({ type: 'build', pid: p.id, pos, level: st.houses }); this.prog(p, 'build');
    this.transfer(p, null, cost, st.houses === 5 ? `${sq.name} 建酒店` : `${sq.name} 建房`); if (st.houses === 5 && !this.stat(p, 'hotels') && p.st.hotels === 1) this.moment(`🏨 ${p.name} 在 ${sq.name} 建成第一座酒店`);
    this.say(`${p.name} 在 ${sq.name} ${st.houses === 5 ? '建造酒店' : '建造第 ' + st.houses + ' 栋房屋'}`);
  }

  sell(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(sq.type === 'prop' && st.houses > 0, '该地产没有房屋');
    const g = GROUP_POS[sq.group].map((i) => this.props[i]);
    must(st.houses >= Math.max(...g.map((x) => x.houses)), '须均衡出售：请先出售同色组中房屋较多的地产');
    let n = 1;
    if (st.houses === 5) {
      this.hotelsLeft++;
      if (this.housesLeft >= 4) this.housesLeft -= 4;
      else n = 5; // 银行房屋不够换回 4 栋：整座酒店直接卖掉
    } else this.housesLeft++;
    st.houses -= n;
    const v = Math.round(this.houseCost(sq) / 2) * n;
    this.transfer(null, p, v, `${sq.name} 卖房`);
    this.say(`${p.name} 出售 ${sq.name} 的${n === 5 || st.houses === 4 ? '酒店' : '一栋房屋'}，获得 ${fmt(v)}`);
    this.afterRaise(p);
  }

  mortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(!st.mortgaged, '该地产已抵押');
    if (sq.type === 'prop') must(GROUP_POS[sq.group].every((i) => this.props[i].houses === 0), '同色组中仍有房屋，请先出售');
    st.mortgaged = true;
    const mv = this.nice(sq.price * this.pinfl / 2);
    this.transfer(null, p, mv, `抵押 ${sq.name}`);
    this.afterRaise(p);
  }

  unmortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(st.mortgaged, '该地产未抵押');
    const cost = Math.ceil((sq.price * this.pinfl / 2) * 1.1 / 10) * 10;
    this.noDebt(p);
    must(p.money >= cost, `赎回需支付 ${fmt(cost)}`);
    st.mortgaged = false;
    this.transfer(p, null, cost, `赎回 ${sq.name}`);
    this.say(`${p.name} 赎回 ${sq.name}`);
  }

  afterRaise(p) {
    if (p.money >= 0 && p.creditor) { this.say(`${p.name} 已清偿欠款`); p.creditor = null; }
  }

  // ---------- 交易 ----------
  tradable(pid, list) {
    for (const pos of list) {
      const st = this.props[pos];
      must(st && st.owner === pid, '交易中包含不属于对方的地产');
      must(!(this.auction && this.auction.pos === pos), `${BOARD[pos].name} 正在拍卖，无法交易`);
      const sq = BOARD[pos];
      if (sq.type === 'prop') must(GROUP_POS[sq.group].every((i) => this.props[i].houses === 0), `${sq.name} 所在色组中有房屋，无法交易`);
    }
  }

  propose(p, o) {
    must(this.phase === 'play' && !p.bankrupt, '当前无法交易');
    const to = this.byId(o.to);
    must(to && to !== p && !to.bankrupt, '交易对象无效');
    const give = [...new Set((o.give || []).map(Number))].slice(0, 40), get = [...new Set((o.get || []).map(Number))].slice(0, 40);
    const giveMoney = Math.max(0, Math.floor(Number(o.giveMoney) || 0)), getMoney = Math.max(0, Math.floor(Number(o.getMoney) || 0));
    must(give.length || get.length || giveMoney || getMoney, '交易内容为空');
    this.tradable(p.id, give); this.tradable(to.id, get);
    must(p.money >= giveMoney, '您的余额不足');
    if (giveMoney) this.noDebt(p);
    this.trades = this.trades.filter((t) => t.from !== p.id);
    const t = { id: this.tradeSeq++, from: p.id, to: to.id, give, get, giveMoney, getMoney, at: Date.now(), counter: !!o.counter };
    this.trades.push(t);
    this.say(`${p.name} 向 ${to.name} 发起交易报价`);
  }

  respond(p, id, accept) {
    const t = this.trades.find((x) => x.id === Number(id));
    must(t, '交易已失效');
    must(t.to === p.id || (t.from === p.id && !accept), '无权处理此交易');
    this.trades = this.trades.filter((x) => x !== t);
    const from = this.byId(t.from), to = this.byId(t.to);
    const tinfo = { tid: t.id, from: from.id, to: to.id, pos: t.get.length ? t.get[0] : t.give[0], price: t.giveMoney || t.getMoney, buy: t.get.length > 0, multi: t.give.length + t.get.length !== 1 };
    if (!accept) {
      this.say(t.from === p.id ? `${from.name} 撤回了对 ${to.name} 的报价` : `❌ ${to.name} 拒绝了 ${from.name} 的报价`);
      if (t.from !== p.id) this.fx.push({ type: 'tradeRes', res: 'no', ...tinfo });
      return;
    }
    this.tradable(from.id, t.give); this.tradable(to.id, t.get);
    must(from.money >= t.giveMoney, `${from.name} 余额已不足`);
    must(to.money >= t.getMoney, '您的余额不足');
    if (t.getMoney) this.noDebt(to);
    if (t.giveMoney) must(!this.owes(from), `${from.name} 有待支付的款项，暂时无法成交`);
    t.give.forEach((i) => (this.props[i].owner = to.id));
    t.get.forEach((i) => (this.props[i].owner = from.id));
    if (t.giveMoney) this.transfer(from, to, t.giveMoney, '交易');
    if (t.getMoney) this.transfer(to, from, t.getMoney, '交易');
    this.say(`✅ ${to.name} 接受了 ${from.name} 的报价，交易成交`);
    this.fx.push({ type: 'deal', from: from.id, to: to.id });
    this.fx.push({ type: 'tradeRes', res: 'ok', ...tinfo });
    this.afterRaise(from); this.afterRaise(to);
  }

  // 还价：对方报价不合适，直接用新价格反向报价（原报价作废）
  counter(p, id, price) {
    const t = this.trades.find((x) => x.id === Number(id));
    must(t && t.to === p.id, '报价已失效');
    must(t.give.length + t.get.length === 1 && !(t.giveMoney && t.getMoney), '该交易不支持还价');
    price = Math.floor(Number(price)); must(price > 0, '请输入还价金额');
    const from = this.byId(t.from), old = t.giveMoney || t.getMoney;
    must(price !== old, '还价金额与原报价相同');
    const hist = (t.hist || [{ by: t.from, price: old }]).concat([{ by: p.id, price }]);
    this.trades = this.trades.filter((x) => x !== t);
    // 对方想买我的地 → 我还价卖给他；对方想卖地给我 → 我还价买他的
    const o = t.get.length ? { to: from.id, give: t.get, getMoney: price, counter: true } : { to: from.id, get: t.give, giveMoney: price, counter: true };
    this.say(`↩️ ${p.name} 对 ${from.name} 的报价还价 ${fmt(price)}（第 ${hist.length - 1} 轮）`);
    this.propose(p, o);
    const nt = this.trades[this.trades.length - 1]; if (nt) nt.hist = hist.slice(-8);
  }
  // 报价 2 分钟内没人处理就自动作废
  expireTrades() {
    const now = Date.now(), old = this.trades.filter((t) => now - (t.at || now) > 120000);
    if (!old.length) return false;
    this.trades = this.trades.filter((t) => !old.includes(t));
    old.forEach((t) => { this.say(`⌛ ${this.byId(t.from).name} 对 ${this.byId(t.to).name} 的报价超过 2 分钟未处理，已自动失效`); this.fx.push({ type: 'tradeRes', res: 'exp', tid: t.id, from: t.from, to: t.to, pos: t.get.length ? t.get[0] : t.give[0], price: t.giveMoney || t.getMoney, buy: t.get.length > 0, multi: t.give.length + t.get.length !== 1 }); });
    return true;
  }

  // ---------- 破产 ----------
  bankrupt(p, forced) {
    const pd = this.pending;
    const owing = pd && pd.kind === 'pay' && pd.payer === p.id;
    must(forced || owing || p.money < 0, '您没有欠款，无法宣布破产');
    let creditor = null;
    if (owing && pd.to && pd.to !== 'each') creditor = this.byId(pd.to);
    else if (!owing && p.creditor) creditor = this.byId(p.creditor);
    if (owing) this.pending = null;

    let cash = Math.max(0, p.money + this.holdValue(p) - (p.loan || 0));
    p.hold = {}; p.cost = {}; p.loan = 0; p.bet = null;
    for (const [i, st] of Object.entries(this.props)) {
      if (st.owner !== p.id) continue;
      const sq = BOARD[i];
      if (st.houses) {
        cash += Math.round(st.houses * this.houseCost(sq) / 2);
        if (st.houses === 5) this.hotelsLeft++; else this.housesLeft += st.houses;
        st.houses = 0;
      }
      st.owner = null; st.mortgaged = false; st.fore = true; // 回到银行成为法拍房（半价）
    }
    if (creditor && cash) this.transfer(null, creditor, cash, `${p.name} 破产清算`);
    for (const d of p.goojf) { const list = d === 'chance' ? CHANCE : CHEST; this.decks[d].push(list.findIndex((c) => c.fx.t === 'goojf')); }
    p.goojf = []; p.money = 0; p.bankrupt = true; p.inJail = false; p.creditor = null;
    this.trades = this.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    for (const o of this.players) if (o.creditor === p.id) o.creditor = null;
    this.say(`💥 ${p.name} ${forced ? '被移出房间' : '宣布破产'}，名下地产转为法拍房（按半价出售）`);
    p.outAt = Date.now() - this.startedAt; p.outWhy = forced ? '被房主移出' : owing ? `无力支付：${pd.reason} ${fmt(pd.amount)}` : '欠款无法偿还';
    this.moment(`💥 ${p.name} ${forced ? '被房主移出房间' : '破产出局'}${owing ? `（${pd.reason} ${fmt(pd.amount)}）` : ''}`);
    delete this.tasks[p.id];
    this.fx.push({ type: 'bankrupt', pid: p.id });

    if (this.active().length <= 1) { this.finish(); return; }
    if (p === this.cur) this.nextTurn();
  }

  finish(why) {
    this.endWhy = why || (this.rich.length ? '已有玩家达成目标，仅剩一位玩家在局' : '仅剩一位玩家在局');
    this.phase = 'end';
    this.pending = null; this.auction = null;
    const ri = (id) => { const i = this.rich.indexOf(id); return i < 0 ? 999 : i; };
    this.ranking = this.players.map((p) => ({ id: p.id, worth: p.won ? p.wonWorth : p.bankrupt ? 0 : this.netWorth(p), rich: ri(p.id), won: !!p.won, broke: !!p.bankrupt && !p.won })).sort((a, b) => a.rich - b.rich || b.worth - a.worth);
    this.winner = this.ranking[0].id;
    this.say(`🏆 对局结束。第一名：${this.byId(this.winner).name}`);
    this.moment(`🏁 对局结束（${this.endWhy}），第一名 ${this.byId(this.winner).name}`);
    this.recap = this.buildRecap();
  }

  buildRecap() {
    const R = this.ranking, players = this.players.map((p) => {
      const s = p.st || {}, r = R.findIndex((x) => x.id === p.id), stock = (s.stockSell || 0) - (s.stockBuy || 0) + this.holdValue(p) + (s.stockSq || 0);
      return { id: p.id, name: p.name, color: p.color, icon: p.icon, rank: r + 1, wh: (p.wh || []).concat([[Math.floor((Date.now() - this.startedAt) / 1000), Math.round(R[r].worth)]]), worth: R[r].worth, won: p.won || 0, wonAt: p.wonAt, out: p.bankrupt && !p.won, outAt: p.outAt, outWhy: p.outWhy, peak: p.peak || [0, 0],
        props: Object.values(this.props).filter((x) => x.owner === p.id).length, money: p.money, st: s, stock, bet: (s.betPayout || 0) - (s.betStake || 0) };
    });
    const best = (f, title, unit, good = true) => { const c = players.map((x) => [x, f(x)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0]; return c ? { title, pid: c[0].id, v: c[1], unit, good } : null; };
    const awards = [
      best((x) => x.st.rentIn || 0, '🏠 租金收入最高', '租金收入'), best((x) => x.st.houseIncome || 0, '⏱ 房屋收益最高', '房屋收益累计'),
      best((x) => (x.st.buys || 0) + (x.st.auctionsWon || 0), '🗺 地产大亨', '块地', true), best((x) => x.st.builds || 0, '🏗 建造次数最多', '次建房', true),
      best((x) => x.stock, '📈 股票收益最高', '股票净收益'), best((x) => x.bet, '🎯 竞猜收益最高', '竞猜净收益'), best((x) => x.st.luck || 0, '🍀 卡牌收益最高', '机会 / 命运 / 转盘净收益'),
      best((x) => x.st.rentOut || 0, '💸 租金支出最高', '租金支出', false), best((x) => x.st.interest || 0, '🏦 利息支出最高', '利息支出', false), best((x) => x.st.jail || 0, '🚔 入狱次数最多', '次入狱', false),
    ].filter(Boolean);
    return { dur: Date.now() - this.startedAt, stage: this.stage, rounds: this.rounds || 0, why: this.endWhy, goal: RULES.winCash, players: players.sort((a, b) => a.rank - b.rank), awards, rents: this.bigRents || [], moments: this.moments || [] };
  }
  // 首富：现金达到目标的人按先后顺序排名；所有人都达到则结束
  checkGoals() {
    if (this.phase !== 'play') return false;
    let ch = false;
    const hit = this.active().map((o) => [o, this.netWorth(o)]).filter((x) => x[1] >= RULES.winCash).sort((x, y) => y[1] - x[1]);
    for (const [o, w] of hit) {
      if (this.phase !== 'play') break;
      this.rich.push(o.id); o.won = this.rich.length; o.wonWorth = w; o.wonAt = Date.now() - this.startedAt; o.hold = {}; o.cost = {}; o.loan = 0; o.bet = null; ch = true;
      this.moment(`👑 ${o.name} 总资产达到 ${fmt(w)}，以第 ${o.won} 名胜出`);
      this.fx.push({ type: 'rich', pid: o.id, rank: o.won });
      this.say(`👑 ${o.name} 的总资产达到 ${fmt(RULES.winCash)}，以第 ${o.won} 名胜出。其名下地产归还银行，其余玩家继续对局`);
      // 胜出者离场：地产交还银行（原价），房屋退回
      for (const st of Object.values(this.props)) if (st.owner === o.id) { if (st.houses === 5) this.hotelsLeft++; else this.housesLeft += st.houses; st.houses = 0; st.owner = null; st.mortgaged = false; st.fore = false; }
      for (const d of o.goojf) { const list = d === 'chance' ? CHANCE : CHEST; this.decks[d].push(list.findIndex((c) => c.fx.t === 'goojf')); }
      o.goojf = []; o.inJail = false; o.creditor = null; o.bankrupt = true; delete this.tasks[o.id];
      this.trades = this.trades.filter((t) => t.from !== o.id && t.to !== o.id);
      const pd = this.pending; if (pd && (pd.payer === o.id || pd.pid === o.id)) { this.dropCard(); this.pending = null; }
      if (this.active().length <= 1) { this.finish(); return true; }
      if (this.cur === o) { const keep = this.pending && this.pending.kind === 'auction' ? this.pending : null; this.nextTurn(); this.pending = keep; }
    }
    return ch;
  }
  // 集齐一个颜色组时提醒可以建房
  checkSets() {
    for (const o of this.active()) for (const g of Object.keys(GROUP_POS)) {
      const k = o.id + g, has = this.ownsGroup(o.id, g);
      if (has && !this.sets[k]) { this.fx.push({ type: 'set', pid: o.id, group: g }); this.moment(`🎨 ${o.name} 集齐${GROUPS[g].name}地产`); this.say(`🎉 ${o.name} 已集齐${GROUPS[g].name}地产，可开始建造房屋`); }
      this.sets[k] = has;
    }
  }
  // 每秒：返回每人 [现金, 总资产]，同时记录总资产峰值
  tickWorth() {
    const out = {};
    for (const p of this.players) {
      const w = p.won ? p.wonWorth : p.bankrupt ? 0 : this.netWorth(p);
      out[p.id] = [p.money, w];
      if (!p.bankrupt && (!p.peak || w > p.peak[0])) p.peak = [w, Date.now() - this.startedAt];
      const sec = Math.floor((Date.now() - this.startedAt) / 1000), step = this.whStep || (this.whStep = 30);
      if (p.incMin && sec - (p.incAt || 0) >= 60) { const v = p.incMin; p.incMin = 0; p.incAt = sec; this.ledge(p, v, '⏱ 房屋每秒收益（近 1 分钟合计）', null); }
      if (!p.wh) p.wh = [[0, RULES.startMoney]];
      if (!p.bankrupt && sec - p.wh[p.wh.length - 1][0] >= step) { p.wh.push([sec, Math.round(w)]); if (p.wh.length > 240) { p.wh = p.wh.filter((_, k) => k % 2 === 0); this.whStep = step * 2; } }
    }
    return out;
  }
  // 回合倒计时（动画时间不算在内）
  touch() {
    let ms = 0;
    for (const f of this.fx) ms += f.type === 'dice' ? 1600 : f.type === 'move' ? Math.abs(f.steps) * 170 + 400 : f.type === 'pos' || f.type === 'posmulti' ? 2600 : f.type === 'jump' ? 1500 : 1000;
    this.deadline = Date.now() + RULES.turnSecs * 1000 + Math.min(ms, 16000);
  }
  autoRaise(p, need) {
    for (const id of Object.keys(p.hold || {})) { if (p.money >= need) break; try { this.trade(p, id, 'sell', 1e15); } catch (e) { if (!(e instanceof GameError)) throw e; } }
    for (let guard = 0; guard < 400 && p.money < need; guard++) {
      let ok = false;
      for (const k of Object.keys(this.props)) {
        if (this.props[k].owner !== p.id) continue;
        for (const fn of ['sell', 'mortgage']) { try { this[fn](p, +k); ok = true; break; } catch (e) { if (!(e instanceof GameError)) throw e; } }
        if (ok) break;
      }
      if (!ok) break;
    }
  }
  // 超时：系统替玩家做最稳妥的操作
  autoPlay() {
    if (this.phase !== 'play' || this.auction) return;
    for (const o of this.active()) if (o !== this.cur && o.money < 0) { this.autoRaise(o, 0); if (o.money < 0) { this.bankrupt(o); return; } }
    const p = this.cur, pd = this.pending;
    if (pd && pd.kind === 'card') this.ackCard(this.byId(pd.pid));
    else if (pd && ['stock', 'portal', 'force'].includes(pd.kind)) this.pending = null;
    else if (pd && pd.kind === 'buy') { this.pending = null; this.say(`⏱ ${p.name} 操作超时，视为放弃购买 ${BOARD[pd.pos].name}`); }
    else if (pd && pd.kind === 'pay') {
      const payer = this.byId(pd.payer);
      if (pd.cancelTo && payer.money < pd.amount) this.pending = null;
      else { this.autoRaise(payer, pd.amount); if (payer.money >= pd.amount) this.swipe(payer); else this.bankrupt(payer); }
    } else if (!pd) {
      if (p.money < 0) { this.autoRaise(p, 0); if (p.money < 0) this.bankrupt(p); }
      else if (!this.rolled || this.canRollAgain) { this.say(`⏱ ${p.name} 操作超时，系统已自动掷骰`); this.roll(p); }
      else { this.say(`⏱ ${p.name} 操作超时，回合已自动结束`); this.nextTurn(); }
    }
    this.checkSets(); this.checkGoals(); this.maybeAdvance();
    if (this.phase === 'play') this.touch();
  }
  // 🤖 托管：替暂时离开的玩家自动操作（有钱才买地、留足备用金、平均建房）
  setAuto(p, on) { p.auto = !!on; this.say(`🤖 ${p.name} ${p.auto ? '已开启托管，系统将代为操作' : '已取消托管'}`); }
  autoSmart(p) {
    if (this.phase !== 'play' || this.auction || this.cur !== p) return;
    const pd = this.pending, reserve = Math.max(this.I(40000), Math.round(this.netWorth(p) * 0.05));
    const tryA = (f) => { try { f(); return true; } catch (e) { if (e instanceof GameError) return false; throw e; } };
    if (pd && pd.kind === 'buy') {
      const price = this.priceOf(pd.pos);
      if (p.money - price >= reserve) { this.say(`🤖 托管：${p.name} 购得 ${BOARD[pd.pos].name}`); tryA(() => this.buy(p)); }
      else { this.pending = null; this.say(`🤖 托管：${p.name} 资金储备不足，放弃购买 ${BOARD[pd.pos].name}`); }
    } else if (pd && pd.kind === 'pay' && pd.payer === p.id) {
      if (pd.cancelTo && p.money < pd.amount) this.pending = null;
      else { this.autoRaise(p, pd.amount); if (p.money >= pd.amount) this.swipe(p); else this.bankrupt(p); }
    } else if (pd && (pd.kind === 'card' || ['stock', 'portal', 'force'].includes(pd.kind))) this.autoPlay();
    else if (!pd) {
      if (p.money < 0) { this.autoRaise(p, 0); if (p.money < 0) this.bankrupt(p); }
      else if (!this.rolled || this.canRollAgain) this.roll(p);
      else {
        // 平均建房：每次最多建一栋，留足备用金
        const cand = Object.keys(this.props).map(Number).filter((i) => this.props[i].owner === p.id && BOARD[i].type === 'prop' && this.ownsGroup(p.id, BOARD[i].group) && this.props[i].houses < 5)
          .sort((a, b) => this.props[a].houses - this.props[b].houses);
        const pos = cand.find((i) => p.money - this.buildCost(i) >= reserve * 2);
        if (pos === undefined || !tryA(() => this.build(p, pos))) this.nextTurn();
        else this.say(`🤖 托管：${p.name} 在 ${BOARD[pos].name} 建房`);
      }
    }
    this.checkSets(); this.checkGoals(); this.maybeAdvance();
    if (this.phase === 'play') this.touch();
  }
  // 每秒收益：有房屋的地产给主人产生收益
  tickIncome() {
    if (this.phase !== 'play') return null;
    const inc = {};
    for (const [i, st] of Object.entries(this.props)) {
      if (!st.owner || !st.houses || st.mortgaged) continue;
      const o = this.byId(st.owner), amt = Math.round(D.incomePerSec(+i, st.houses) * this.infl);
      o.money += amt; (inc[o.id] = inc[o.id] || []).push([+i, amt]); this.stat(o, 'houseIncome', amt); this.stat(o, 'inAll', amt); o.incMin = (o.incMin || 0) + amt;
      if (o.money >= 0 && o.creditor) o.creditor = null;
    }
    return Object.keys(inc).length ? inc : null;
  }
  // 地产税：每次经过起点 / 环球中心，按名下地产与房屋现值的 4% 缴纳
  propTax(p) {
    let v = 0;
    for (const [i, st] of Object.entries(this.props)) if (st.owner === p.id && !st.mortgaged) { const sq = BOARD[i]; v += sq.price * this.infl + (sq.type === 'prop' ? st.houses * GROUPS[sq.group].house * this.infl : 0); }
    const r = this.taxRate, tax = Math.round(v * r); if (tax <= 0) return;
    this.transfer(p, null, tax, `地产税（地产现值 ${Math.round(r * 1000) / 10}%）`);
    if (p.money < 0) p.creditor = null;
  }
  // 欠着钱（有待付款项或余额为负）时，只能筹钱，不能把钱花到别处或转给别人
  owes(p) { const pd = this.pending; return p.money < 0 || !!(pd && pd.kind === 'pay' && pd.payer === p.id); }
  noDebt(p) { must(!this.owes(p), '您有待支付的款项，请先完成支付（可通过出售房屋、抵押地产、卖出股票或申请贷款筹集资金）'); }
  // 远程购买：未抵达也可购买银行持有的地产，价格为现价的 3 倍
  remoteBuy(p, pos) {
    this.noDebt(p);
    pos = Number(pos); const st = this.props[pos];
    must(st && !st.owner, '仅可远程购买银行持有的地产');
    must(!this.auction || this.auction.pos !== pos, '该地产正在拍卖');
    const pd = this.pending; must(!(pd && pd.kind === 'buy' && pd.pos === pos), '有玩家正停留在该地产，请等待其决定是否购买');
    must(!(pd && pd.kind === 'pay' && pd.next && pd.next.t === 'own' && pd.next.pos === pos), '有玩家正在购买该地产');
    const price = this.priceOf(pos) * 3; must(p.money >= price, `远程购买需支付 ${fmt(price)}`);
    this.transfer(p, null, price, `远程购买 ${BOARD[pos].name}（3 倍价）`);
    st.owner = p.id; st.fore = false; this.fx.push({ type: 'buy', pid: p.id, pos }); this.prog(p, 'buy');
    this.say(`${p.name} 以 3 倍价格远程购得 ${BOARD[pos].name}`);
  }
  // ---------- 金融中心 ----------
  asset(id) { const m = this.market.find((x) => x.id === id); must(m, '该交易品种不存在'); return m; }
  trade(p, id, side, amount) {
    const m = this.asset(id); p.hold = p.hold || {};
    amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额');
    const fee = 0.003, nm = D.ASSETS.find((a) => a.id === id).name;
    if (side === 'buy') {
      this.noDebt(p);
      must(p.money >= amount, '现金余额不足');
      p.hold[id] = (p.hold[id] || 0) + (amount * (1 - fee)) / m.price;
      p.cost = p.cost || {}; p.cost[id] = (p.cost[id] || 0) + amount; // 持仓成本（含手续费）
      if (m.k && m.k.length) m.k[m.k.length - 1][4] += Math.round(amount / m.price / 100);
      this.transfer(p, null, amount, `买入 ${nm}`);
    } else {
      const have = (p.hold[id] || 0) * m.price; must(have > 0, '您未持有该品种');
      const amt = Math.min(amount, have), sh = p.hold[id], sold = amt / m.price, got = Math.round(amt * (1 - fee));
      p.cost = p.cost || {}; const cp = (p.cost[id] || 0) * Math.min(1, sold / sh); p.cost[id] = (p.cost[id] || 0) - cp; this.stat(p, 'stockReal', got - cp);
      p.hold[id] -= sold; if (p.hold[id] * m.price < 1) { delete p.hold[id]; delete p.cost[id]; }
      if (m.k && m.k.length) m.k[m.k.length - 1][4] += Math.round(amt / m.price / 100);
      this.transfer(null, p, got, `卖出 ${nm}`); this.afterRaise(p);
    }
  }
  loanLimit(p) { return Math.max(0, Math.round((this.netWorth(p) + (p.loan || 0)) * 0.5) - (p.loan || 0)); }
  borrow(p, amount) {
    amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额');
    must(amount <= this.loanLimit(p), `当前可借额度为 ${fmt(this.loanLimit(p))}`);
    p.loan = (p.loan || 0) + amount; this.transfer(null, p, amount, '银行贷款'); this.afterRaise(p);
    this.say(`🏦 ${p.name} 向银行借款 ${fmt(amount)}（每分钟利率 3%）`);
  }
  repay(p, amount) {
    must(p.loan > 0, '您当前没有贷款'); amount = Math.min(Math.floor(Number(amount)), Math.ceil(p.loan), p.money); must(amount > 0, '现金不足');
    p.loan -= amount; if (p.loan < 1) p.loan = 0; this.transfer(p, null, amount, '偿还贷款');
  }
  setAutoRepay(p, on, keep) {
    keep = Math.max(0, Math.floor(Number(keep) || 0));
    p.autoRepay = { on: !!on, keep };
    this.say(`🏦 ${p.name} ${on ? `开启自动还款：现金超过 ${fmt(keep)} 的部分自动还贷` : '关闭自动还款'}`);
  }
  // 每秒：开启自动还款的玩家，现金超过保留额的部分自动还贷（欠款时不动）
  tickAutoRepay() {
    if (this.phase !== 'play') return false;
    let ch = false;
    for (const p of this.active()) {
      const ar = p.autoRepay; if (!ar || !ar.on || !(p.loan > 0) || this.owes(p)) continue;
      const amt = Math.min(Math.ceil(p.loan), Math.floor(p.money - ar.keep));
      if (amt < 1000) continue;
      p.loan -= amt; if (p.loan < 1) p.loan = 0; this.transfer(p, null, amt, '自动还贷'); ch = true;
      if (!p.loan) this.say(`🏦 ${p.name} 的贷款已通过自动还款全部还清`);
    }
    return ch;
  }
  bet(p, id, dir, stake) {
    const m = this.asset(id); stake = Math.floor(Number(stake));
    must(['up', 'down'].includes(dir), '请选择看涨或看跌'); this.noDebt(p); must(stake > 0 && p.money >= stake, '现金余额不足');
    must(!(p.bet), '您已有一笔竞猜在进行中');
    p.bet = { id, dir, stake, start: m.price, endAt: Date.now() + 10000, path: [m.price] };
    this.transfer(p, null, stake, `竞猜 ${D.ASSETS.find((a) => a.id === id).name} ${dir === 'up' ? '看涨' : '看跌'}`);
  }
  // 每 2 秒：行情波动、利息累计、竞猜结算。返回是否有需要广播的变化
  tickMarket(dt) {
    if (this.phase !== 'play') return false;
    const N01 = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    for (const m of this.market) {
      const a = D.ASSETS.find((x) => x.id === m.id), base = a.base * this.infl;
      let r = (a.drift || 0) + 0.03 * Math.log(base / m.price) + a.vol * N01();
      if (Math.random() < 0.006) { const shock = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.1) * (a.kind === 'stock' ? 1 : 0.25); r += shock; this.fx.push({ type: 'news', id: m.id, pct: Math.round(shock * 100) }); this.say(`📰 市场快讯：${a.name}${shock > 0 ? '大幅上涨' : '大幅下跌'} ${Math.abs(Math.round(shock * 100))}%`); }
      const prev = m.price;
      m.price = Math.max(a.base * 0.05, m.price * Math.exp(r)); m.hist.push(+m.price.toPrecision(5)); if (m.hist.length > 60) m.hist.shift();
      // K 线：每 5 次报价（10 秒）一根，记录 开 / 高 / 低 / 收 / 成交量
      const px = +m.price.toPrecision(5), vol = Math.round((60 + Math.random() * 120) * (1 + Math.abs(r) * 25)), k = m.k || (m.k = []);
      m.kn = (m.kn || 0) + 1;
      if (!k.length || m.kn % 5 === 1) { const o = +prev.toPrecision(5); k.push([o, Math.max(o, px), Math.min(o, px), px, 0]); if (k.length > 36) k.shift(); }
      const c = k[k.length - 1]; c[1] = Math.max(c[1], px); c[2] = Math.min(c[2], px); c[3] = px; c[4] += vol;
    }
    let ch = false;
    for (const p of this.players) {
      if (p.loan > 0) { const b = p.loan; p.loan *= Math.pow(1.03, dt / 60); this.stat(p, 'interest', p.loan - b); }
      if (p.bet) { const b = p.bet; (b.path = b.path || [b.start]).push(this.asset(b.id).price); }
    }
    return ch;
  }
  // 每秒检查：涨跌竞猜到 10 秒立即结算
  settleBets() {
    if (this.phase !== 'play') return false;
    let ch = false;
    for (const p of this.players) {
      if (!p.bet || Date.now() < p.bet.endAt) continue;
      const b = p.bet, m = this.asset(b.id), end = m.price, win = b.dir === 'up' ? end > b.start : end < b.start;
      p.bet = null; ch = true;
      if (p.bankrupt || p.won) continue;
      const payout = win ? Math.round(b.stake * 1.9) : 0, nm = D.ASSETS.find((a) => a.id === b.id).name;
      this.fx.push({ type: 'betres', pid: p.id, win, stake: b.stake, payout, id: b.id, dir: b.dir, start: b.start, end, path: [...(b.path || [b.start]), end] });
      (p.betHist || (p.betHist = [])).push({ id: b.id, dir: b.dir, stake: b.stake, win, pnl: win ? payout - b.stake : -b.stake, start: b.start, end }); if (p.betHist.length > 30) p.betHist.shift();
      if (win) { this.transfer(null, p, payout, '竞猜获胜'); this.say(`🎯 ${p.name} 竞猜 ${nm} ${b.dir === 'up' ? '看涨' : '看跌'}命中，结算 +${fmt(payout)}`); }
      else this.say(`📉 ${p.name} 竞猜 ${nm} ${b.dir === 'up' ? '看涨' : '看跌'}未命中，损失 ${fmt(b.stake)}`);
    }
    return ch;
  }

  // ---------- 新格子 ----------
  stock(p, pct) {
    const pd = this.pending; must(pd && pd.kind === 'stock' && pd.pid === p.id, '当前无法进行股票交易');
    this.pending = null; pct = Number(pct);
    if (![10, 25, 50].includes(pct) || p.money <= 0) { this.say(`${p.name} 经过股票交易所，未参与交易`); return; }
    const stake = Math.floor((p.money * pct) / 100), d = die(), win = d >= 4;
    this.fx.push({ type: 'stockroll', pid: p.id, d, win, stake });
    this.say(`📈 ${p.name} 投入 ${fmt(stake)} 参与股票交易，掷出 ${d} 点：${win ? '股价上涨，收益 100%' : '股价下跌，亏损 50%'}`);
    if (win) this.transfer(null, p, stake, '股票交易所收益'); else this.transfer(p, null, Math.floor(stake / 2), '股票交易所亏损');
  }
  portal(p, pos) {
    const pd = this.pending; must(pd && pd.kind === 'portal' && pd.pid === p.id, '当前无法传送');
    pos = Math.floor(Number(pos)); must(pos >= 0 && pos < N && pos !== p.pos && BOARD[pos].type !== 'portal', '无法传送至该格');
    this.pending = null;
    this.fx.push({ type: 'tp', pid: p.id, to: pos }); p.pos = pos;
    this.say(`🌀 ${p.name} 传送至 ${BOARD[pos].name}`);
    this.land(p);
  }
  forceTargets(p) {
    return Object.keys(this.props).map(Number).filter((i) => { const st = this.props[i], sq = BOARD[i]; return st.owner && st.owner !== p.id && !st.mortgaged && !(sq.type === 'prop' && GROUP_POS[sq.group].some((k) => this.props[k].houses > 0)); });
  }
  force(p, pos) {
    const pd = this.pending; must(pd && pd.kind === 'force' && pd.pid === p.id, '当前无法发起强制拍卖');
    if (pos == null) { this.pending = null; this.say(`${p.name} 放弃强制拍卖`); return; }
    pos = Number(pos); must(this.forceTargets(p).includes(pos), '该地产不可强制拍卖');
    const owner = this.byId(this.props[pos].owner);
    this.pending = { kind: 'auction' };
    this.auction = { pos, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_START, total: AUCTION_START, seller: owner.id, by: p.id };
    this.say(`🔨 ${p.name} 对 ${owner.name} 的 ${BOARD[pos].name} 发起强制拍卖。成交款归 ${owner.name}；若无人出价，地产维持原状`);
  }
  // ---------- 通货膨胀 & 进程加速器 ----------
  bumpStage(why) {
    this.stage++;
    this.fx.push({ type: 'stage', stage: this.stage, infl: this.infl, pinfl: this.pinfl, taxRate: this.taxRate });
    this.moment(`📈 通货膨胀进入第 ${this.stage + 1} 阶段（${why}）`);
    this.say(`📈 通货膨胀（${why}）：进入第 ${this.stage + 1} 阶段，租金、工资、每秒收益 ×${Math.round(this.infl * 100) / 100}，地价、房价 ×${Math.round(this.pinfl * 100) / 100}，地产税率升至 ${Math.round(this.taxRate * 1000) / 10}%`);
  }
  tickStage() {
    if (this.phase !== 'play' || !this.startedAt) return false;
    if (Math.floor((Date.now() - this.startedAt) / 600000) <= this.autoStage) return false;
    this.autoStage++; this.bumpStage('每 10 分钟自动触发'); return true;
  }
  accelerate(p) {
    must(p.token === this.hostToken, '仅房主可启动进程加速器');
    this.bumpStage('房主启动进程加速器');
    const reward = Math.round(400000 * this.infl);
    for (const o of this.active()) { const t = D.TASKS[Math.floor(Math.random() * D.TASKS.length)]; this.tasks[o.id] = { ...t, have: 0, reward, done: false }; }
    this.fx.push({ type: 'boost' });
    this.say(`🚀 进程加速器已启动。每位玩家获得一项任务，完成后奖励 ${fmt(reward)}`);
  }
  prog(p, t) {
    const k = p && this.tasks[p.id]; if (!k || k.done || k.t !== t) return;
    if (++k.have < k.need) return;
    k.done = true; this.fx.push({ type: 'task', pid: p.id, reward: k.reward });
    this.transfer(null, p, k.reward, '完成加速任务');
  }
  kick(p, id) {
    must(p.token === this.hostToken, '仅房主可移出玩家');
    const t = this.byId(id); must(t && t !== p, '玩家无效');
    if (this.phase === 'lobby') { this.players = this.players.filter((x) => x !== t); this.say(`房主将 ${t.name} 移出了房间`); return t; }
    must(!t.bankrupt, '该玩家已不在对局中');
    must(!this.auction, '拍卖进行中，请稍后再试');
    this.bankrupt(t, true); return t;
  }
  // ---------- 三个钱包：银行卡 / 手机 / 现金 ----------
  settle(p) {
    const w = p.w || (p.w = { card: 0, phone: 0, cash: 0 });
    const diff = Math.max(0, p.money) - (w.card + w.phone + w.cash);
    if (diff > 0) w[p.recv || p.pay || 'card'] += diff;
    else if (diff < 0) { let need = -diff; for (const k of [p.pay || 'card', 'card', 'phone', 'cash']) { const take = Math.min(w[k], need); w[k] -= take; need -= take; } }
  }
  exchange(p, from, to, amount) {
    const ks = ['card', 'phone', 'cash']; must(ks.includes(from) && ks.includes(to) && from !== to, '兑换方式无效');
    this.settle(p); amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额'); must(p.w[from] >= amount, '该钱包余额不足');
    p.w[from] -= amount; p.w[to] += amount;
    const nm = { card: '银行卡', phone: '手机钱包', cash: '现金' };
    this.fx.push({ type: 'xchg', pid: p.id, from, to, amount });
    this.say(`🏦 ${p.name} 在银行将 ${fmt(amount)} 从${nm[from]}转入${nm[to]}`);
  }

  // 私人转账
  send(p, toId, amount) {
    const to = this.byId(toId);
    must(to && to !== p && !to.bankrupt, '收款人无效');
    amount = Math.floor(Number(amount));
    must(amount > 0, '请输入金额');
    this.noDebt(p);
    must(p.money >= amount, '余额不足');
    this.transfer(p, to, amount, '私人转账');
    this.afterRaise(to);
  }

  endGame(p) {
    must(p.token === this.hostToken, '仅房主可结束对局');
    must(this.phase === 'play', '对局未在进行中');
    this.finish('房主提前结束对局，按总资产排名');
  }

  // ---------- 回合 ----------
  endTurn(p) {
    must(p === this.cur, '尚未轮到您');
    must(this.rolled && !this.canRollAgain, '您尚未掷骰');
    must(!this.pending, '请先处理当前事项');
    must(p.money >= 0, '您尚有欠款');
    this.nextTurn();
  }

  // 还没确认就被取消的出狱卡要放回牌堆
  dropCard() { const pd = this.pending; if (pd && pd.kind === 'card' && this.decks[pd.deck] && (pd.deck === 'chance' ? CHANCE : CHEST)[pd.id].fx.t === 'goojf') this.decks[pd.deck].push(pd.id); }
  nextTurn() {
    this.dropCard();
    const n = this.players.length;
    let i = this.turn;
    do { i = (i + 1) % n; } while (this.players[i].bankrupt);
    this.turn = i; this.stat(this.cur, 'turns'); this.rounds = (this.rounds || 0) + 1;
    this.rolled = false; this.canRollAgain = false; this.doubles = 0;
    this.pending = null;
    this.say(`${this.cur.name} 的回合`);
    this.fx.push({ type: 'turn', pid: this.cur.id });
  }

  // 房主可以替掉线的玩家跳过回合
  skip(p) {
    must(p.token === this.hostToken, '仅房主可跳过回合');
    must(!this.cur.connected, '当前玩家在线，无法跳过');
    must(!this.auction, '拍卖进行中');
    this.say(`房主跳过了离线玩家 ${this.cur.name} 的回合`);
    this.nextTurn();
  }

  // 当前玩家行动完毕（已掷骰、无待处理事项、无欠款）时，自动轮到下一位
  maybeAdvance() {
    if (this.phase !== 'play' || this.auction || this.pending) return false;
    const c = this.cur; if (!c || c.bankrupt || !this.rolled || this.canRollAgain || c.money < 0) return false;
    this.nextTurn(); return true;
  }

  // ---------- 入口 ----------
  act(token, type, a = {}) {
    const p = this.P(token);
    must(p, '未找到您的玩家身份');
    if (type === 'pay') { if (['card', 'phone', 'cash'].includes(a.m)) p[a.k === 'recv' ? 'recv' : 'pay'] = a.m; return; }
    if (type === 'look') return this.setLook(p, a.color, a.icon);
    if (type === 'kick') return this.kick(p, a.id);
    if (type === 'start') return this.start(p);
    if (type === 'size') return this.setSize(p, a.n);
    must(this.phase === 'play', '对局未在进行中');
    // 房主即使破产或已胜出，也保留管理权：结束游戏、跳过掉线玩家、进程加速器、移出玩家
    if (type === 'approve') { const res = this.approveJoin(p, a.rid, !!a.ok); this.touch(); this.updatedAt = Date.now(); return res; }
    if (p.bankrupt && p.token === this.hostToken && ['endGame', 'skip', 'boost'].includes(type)) {
      ({ endGame: () => this.endGame(p), skip: () => this.skip(p), boost: () => this.accelerate(p) })[type]();
      this.checkSets(); this.checkGoals(); this.maybeAdvance(); if (this.phase === 'play') this.touch(); this.updatedAt = Date.now(); return;
    }
    if (p.bankrupt) throw new GameError(p.won ? '您已胜出，当前为观战模式' : '您已破产，当前为观战模式');
    const map = {
      roll: () => this.roll(p), buy: () => this.buy(p), cancelBuy: () => this.cancelBuy(p),
      auction: () => this.startAuction(p), bid: () => this.bid(p, a.inc), swipe: () => this.swipe(p),
      card: () => this.ackCard(p), payJail: () => this.payJail(p), useCard: () => this.useCard(p),
      build: () => this.build(p, a.pos), sell: () => this.sell(p, a.pos),
      mortgage: () => this.mortgage(p, a.pos), unmortgage: () => this.unmortgage(p, a.pos),
      propose: () => this.propose(p, a), respond: () => this.respond(p, a.id, !!a.accept), counter: () => this.counter(p, a.id, a.price),
      bankrupt: () => this.bankrupt(p), endTurn: () => this.endTurn(p),
      endGame: () => this.endGame(p), skip: () => this.skip(p), send: () => this.send(p, a.to, a.amount), stock: () => this.stock(p, a.pct), portal: () => this.portal(p, a.pos), force: () => this.force(p, a.pos),
      boost: () => this.accelerate(p), remoteBuy: () => this.remoteBuy(p, a.pos), auto: () => this.setAuto(p, a.on),
      trade: () => this.trade(p, a.id, a.side, a.amount), borrow: () => this.borrow(p, a.amount), repay: () => this.repay(p, a.amount), bet: () => this.bet(p, a.id, a.dir, a.amount), autoRepay: () => this.setAutoRepay(p, a.on, a.keep), wallet: () => this.exchange(p, a.from, a.to, a.amount),
    };
    must(map[type], '未知操作');
    map[type]();
    this.checkSets(); this.checkGoals(); this.maybeAdvance();
    if (this.phase === 'play' && (p === this.cur || type === 'swipe' || type === 'card')) this.touch();
    this.updatedAt = Date.now();
  }

  publicState() {
    this.players.forEach((q) => this.settle(q));
    return {
      stage: this.stage, infl: this.infl, pinfl: this.pinfl, scarcity: this.scarcity(),
      buildCost: Object.fromEntries(Object.keys(this.props).filter((i) => BOARD[i].type === 'prop').map((i) => [i, this.buildCost(+i)])), taxRate: this.taxRate, market: this.market, startedAt: this.startedAt, tasks: this.tasks,
      code: this.code, phase: this.phase, maxPlayers: this.maxPlayers, deadline: this.deadline, rich: this.rich, turn: this.turn, rolled: this.rolled, canRollAgain: this.canRollAgain,
      dice: this.dice, pending: this.pending, auction: this.auction, trades: this.trades,
      housesLeft: this.housesLeft, hotelsLeft: this.hotelsLeft, props: this.props,
      rentNow: Object.fromEntries(Object.entries(this.props).filter(([, st]) => st.owner && !st.mortgaged).map(([i]) => [i, this.rentFor(+i)])),
      log: this.log.slice(-60), winner: this.winner, ranking: this.ranking, recap: this.phase === 'end' ? this.recap : null, joinReqs: (this.joinReqs || []).map((r) => ({ rid: r.rid, name: r.name, at: r.at })),
      players: this.players.map(({ token, ledger, ledgerDirty, incMin, incAt, ...rest }) => ({ ...rest, host: token === this.hostToken, worth: this.netWorth(rest), hv: this.holdValue(rest) })),
      now: Date.now(),
    };
  }

  toJSON() { const { fx, ...rest } = this; return rest; }
  static from(obj) {
    const g = new Game(obj.code); Object.assign(g, obj); g.fx = []; g.players.forEach((p) => (p.connected = false));
    // 旧存档里已下架的品种（基金、外汇）按最后价格折回现金
    const ok = new Set(D.ASSETS.map((a) => a.id)), old = g.market || [];
    for (const p of g.players) {
      for (const id of Object.keys(p.hold || {})) if (!ok.has(id)) { const m = old.find((x) => x.id === id); p.money += Math.round(p.hold[id] * (m ? m.price : 0)); delete p.hold[id]; }
      if (p.bet && !ok.has(p.bet.id)) { p.money += p.bet.stake; p.bet = null; }
    }
    g.market = D.ASSETS.map((a) => old.find((x) => x.id === a.id) || { id: a.id, price: a.base * (g.infl || 1), hist: [a.base * (g.infl || 1)] });
    return g;
  }
}

module.exports = { Game, GameError };
