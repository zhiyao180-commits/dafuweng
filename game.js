// 大富翁规则引擎（服务器权威：所有点数、余额都由这里决定）
const D = require('./public/data.js');
const AUCTION_START = 30000, AUCTION_EXT = 15000; // 拍卖：开拍 30 秒，有人加价后至少再留 15 秒
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
  transfer(from, to, amt, label) {
    if (amt <= 0) return;
    if (from) from.money -= amt;
    if (to) to.money += amt;
    this.fx.push({ type: 'pos', from: from ? from.id : null, to: to ? to.id : null, amount: amt, label });
    this.say(`💳 ${this.name(from)} → ${this.name(to)} ${fmt(amt)}（${label}）${from ? `｜${from.name} 余额 ${fmt(from.money)}` : ''}${to ? `｜${to.name} 余额 ${fmt(to.money)}` : ''}`);
  }

  // 一对多 / 多对一：合并成一次刷卡动画
  transferMulti(froms, tos, each, label) {
    if (each <= 0 || !froms.length || !tos.length) return;
    const one = froms.length === 1 ? froms[0] : tos[0], many = froms.length === 1 ? tos : froms, total = each * many.length;
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
    must(this.phase === 'lobby', '游戏已经开始，不能再加入');
    must(this.players.length < this.maxPlayers, `房间已满（${this.maxPlayers} 人）`);
    name = String(name || '').trim().slice(0, 10) || '玩家';
    must(!this.players.some((p) => p.name === name), '这个名字已经有人用了');
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

  setLook(p, color, icon) {
    must(this.phase === 'lobby', '游戏已开始');
    if (color && D.COLORS.includes(color)) { must(!this.players.some((o) => o !== p && o.color === color), '颜色已被选'); p.color = color; }
    if (icon && D.TOKENS.includes(icon)) { must(!this.players.some((o) => o !== p && o.icon === icon), '棋子已被选'); p.icon = icon; }
  }

  setSize(p, n) {
    must(p.token === this.hostToken, '只有房主可以修改人数');
    must(this.phase === 'lobby', '游戏已开始');
    n = Math.floor(Number(n));
    must(n >= 2 && n <= RULES.maxPlayers, '人数需要在 2 到 8 之间');
    must(n >= this.players.length, `房间里已经有 ${this.players.length} 人了`);
    this.maxPlayers = n;
  }

  start(p) {
    must(p.token === this.hostToken, '只有房主可以开始');
    must(this.phase === 'lobby', '已经开始了');
    must(this.players.length >= 2, '至少需要 2 位玩家');
    this.players = shuffle(this.players);
    this.phase = 'play';
    this.startedAt = Date.now();
    this.turn = 0;
    this.say(`游戏开始！每人获得 ${fmt(RULES.startMoney)}，总资产（现金+地产+房屋）率先达到 ${fmt(RULES.winCash)} 者成为首富并胜出，其余玩家继续对战争夺名次。顺序：${this.players.map((x) => x.name).join(' → ')}`);
    this.say(`轮到 ${this.cur.name}`);
    this.fx.push({ type: 'turn', pid: this.cur.id });
    this.touch();
  }

  // ---------- 掷骰与移动 ----------
  roll(p) {
    must(this.phase === 'play', '游戏未进行');
    must(p === this.cur, '还没轮到您');
    must(!this.pending, '请先处理当前事项');
    must(!this.rolled || this.canRollAgain, '本回合已经掷过了');
    must(p.money >= 0, '您欠着钱，请先卖房/抵押筹钱');
    const d = [die(), die()];
    this.dice = d;
    const sum = d[0] + d[1], dbl = d[0] === d[1];
    this.fx.push({ type: 'dice', pid: p.id, dice: d });
    if (dbl) this.prog(p, 'dbl');
    this.rolled = true;
    this.canRollAgain = false;

    if (p.inJail) {
      if (dbl) {
        p.inJail = false; p.jailTurns = 0;
        this.say(`${p.name} 掷出双数 ${d[0]}+${d[1]}，出狱！`);
        this.moveBy(p, sum);
      } else {
        p.jailTurns++;
        if (p.jailTurns >= 3) {
          this.say(`${p.name} 第三次没掷出双数，必须缴纳保释金 ${fmt(this.I(RULES.jailFine))}`);
          this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.I(RULES.jailFine), reason: '保释金', next: { t: 'release', move: sum } };
        } else this.say(`${p.name} 掷出 ${d[0]}+${d[1]}，没有双数，继续坐牢（第 ${p.jailTurns} 次）`);
      }
      return;
    }

    if (dbl) {
      this.doubles++;
      if (this.doubles >= 3) {
        this.say(`${p.name} 连续三次掷出双数，超速入狱！`);
        this.sendJail(p);
        return;
      }
      this.canRollAgain = true;
    }
    this.say(`${p.name} 掷出 ${d[0]} + ${d[1]} = ${sum}${dbl ? '（双数，可再掷一次）' : ''}`);
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
      if (st.mortgaged) { this.say(`${sq.name} 已抵押，免付租金`); return; }
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
      this.pending = { kind: 'card', deck: sq.type, id, pid: p.id, text, seq: (this.cardSeq = (this.cardSeq || 0) + 1) };
      this.say(`${p.name} 抽到${sq.name}卡：${text}`);
      return;
    }
    if (sq.type === 'bonus') {
      this.transfer(null, p, Math.round(sq.amount * this.infl), sq.name + '分红');
      return;
    }
    if (sq.type === 'stock' || sq.type === 'portal') { this.pending = { kind: sq.type, pid: p.id }; return; }
    if (sq.type === 'force') { if (this.forceTargets(p).length) this.pending = { kind: 'force', pid: p.id }; else this.say('现在没有可以强制拍卖的地产'); return; }
    if (sq.type === 'wheel') {
      const id = Math.floor(Math.random() * D.WHEEL.length);
      const text = this.scaleText(D.WHEEL[id].text);
      this.pending = { kind: 'card', deck: 'wheel', id, pid: p.id, text, seq: (this.cardSeq = (this.cardSeq || 0) + 1) };
      this.say(`${p.name} 转动幸运转盘：${text}`);
      return;
    }
    if (sq.type === 'gotojail') {
      this.say(`${p.name} 被送进监狱！`);
      this.sendJail(p);
    }
  }

  // ---------- 卡片 ----------
  ackCard(p) {
    const pd = this.pending;
    must(pd && pd.kind === 'card' && pd.pid === p.id, '没有要确认的卡片');
    const card = (pd.deck === 'chance' ? CHANCE : pd.deck === 'chest' ? CHEST : D.WHEEL)[pd.id];
    this.pending = null;
    this.prog(p, 'card');
    const f = { ...card.fx };
    for (const k of ['amt', 'house', 'hotel']) if (f[k] && f.t !== 'wallet') f[k] = this.I(f[k]);
    switch (f.t) {
      case 'wallet': {
        this.settle(p); const nm = { card: '银行卡', phone: '手机钱包', cash: '现金' }[f.w];
        const amt = Math.round(p.w[f.w] * f.pct / 100);
        if (!amt) { this.say(`${p.name} 的${nm}没有余额，不受影响`); break; }
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
        if (rich !== poor && rich.money > poor.money) { this.transfer(rich, poor, f.amt, '企业赞助'); this.say(`企业赞助：${rich.name} 送给 ${poor.name} ${fmt(f.amt)}`); }
        break;
      }
      case 'proptax': {
        const cnt = (o) => Object.values(this.props).filter((st) => st.owner === o.id).length;
        const act = this.active(), max = Math.max(...act.map(cnt));
        if (max > 0) for (const o of act) if (cnt(o) === max) {
          this.transfer(o, null, f.amt, '地产税'); this.say(`地产税：${o.name}（${max} 块地）支付 ${fmt(f.amt)}`);
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
        else this.say(`${p.name} 没有房屋，无需维修费`);
        break;
      }
      case 'each': {
        const others = this.active().filter((o) => o !== p);
        if (f.amt > 0) {
          this.transferMulti(others, [p], f.amt, '卡片收款');
          for (const o of others) if (o.money < 0) { o.creditor = p.id; this.say(`${o.name} 余额不足，需要筹钱`); }
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
    must(pd && pd.kind === 'pay' && pd.payer === p.id, '现在不需要您付款');
    must(p.money >= pd.amount, `余额不足（需要 ${fmt(pd.amount)}），请先卖房或抵押`);
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
      this.props[n.pos].owner = p.id;
      this.fx.push({ type: 'buy', pid: p.id, pos: n.pos }); this.props[n.pos].fore = false; this.prog(p, 'buy');
      this.say(`${p.name} 买下了 ${BOARD[n.pos].name}`);
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
    must(pd && pd.kind === 'buy' && p === this.cur, '现在不能购买');
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
    must(pd && pd.kind === 'buy' && p === this.cur, '现在不能拍卖');
    this.pending = { kind: 'auction' };
    this.auction = { pos: pd.pos, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_START, total: AUCTION_START, by: p.id };
    this.say(`${BOARD[pd.pos].name} 开始拍卖！`);
  }

  bid(p, inc) {
    const a = this.auction;
    must(a, '没有拍卖');
    must(!p.bankrupt, '您已破产');
    inc = Number(inc);
    must(RULES.bids.includes(inc), '加价无效');
    const amt = a.bid + inc;
    must(p.money >= amt, '余额不足');
    a.bid = amt; a.bidder = p.id;
    if (Date.now() + AUCTION_EXT > a.endsAt) { a.endsAt = Date.now() + AUCTION_EXT; a.total = AUCTION_EXT; } // 有人加价：至少再留 15 秒
    this.fx.push({ type: 'bid', pid: p.id, amount: amt });
  }

  tickAuction() {
    const a = this.auction;
    if (!a || Date.now() < a.endsAt) return false;
    const sq = BOARD[a.pos];
    if (a.bidder) {
      const w = this.byId(a.bidder);
      this.transfer(w, a.seller ? this.byId(a.seller) : null, a.bid, `拍得 ${sq.name}`);
      this.props[a.pos].owner = w.id;
      this.fx.push({ type: 'buy', pid: w.id, pos: a.pos }); this.props[a.pos].fore = false; this.prog(w, 'buy');
      this.say(`${w.name} 以 ${fmt(a.bid)} 拍得 ${sq.name}`);
    } else this.say(`${sq.name} 无人出价，流拍`);
    this.auction = null;
    if (this.pending && this.pending.kind === 'auction') this.pending = null;
    this.checkSets(); this.checkGoals(); this.maybeAdvance(); this.touch();
    return true;
  }

  // ---------- 监狱 ----------
  payJail(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '现在不能缴保释金');
    this.pending = { kind: 'pay', payer: p.id, to: null, amount: this.I(RULES.jailFine), reason: '保释金', next: { t: 'jailPaid' } };
  }

  useCard(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '现在不能用出狱卡');
    must(p.goojf.length, '您没有出狱卡');
    const deck = p.goojf.shift();
    const list = deck === 'chance' ? CHANCE : CHEST;
    this.decks[deck].push(list.findIndex((c) => c.fx.t === 'goojf'));
    p.inJail = false; p.jailTurns = 0;
    this.say(`${p.name} 使用出狱许可证出狱`);
  }

  // ---------- 房产管理 ----------
  ownProp(p, pos) {
    const st = this.props[pos];
    must(st && st.owner === p.id, '这不是您的地产');
    must(!this.auction, '拍卖进行中');
    return [BOARD[pos], st];
  }

  build(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(sq.type === 'prop', '只能在城市地产上建房');
    must(this.ownsGroup(p.id, sq.group), `需要集齐全部${GROUPS[sq.group].name}地产`);
    const g = GROUP_POS[sq.group].map((i) => this.props[i]);
    must(g.every((x) => !x.mortgaged), '同色组有抵押地产，先赎回');
    must(st.houses < 5, '已经是酒店了');
    must(st.houses <= Math.min(...g.map((x) => x.houses)), '必须平均建房：先在同色其他地产上建');
    const cost = this.buildCost(pos);
    must(p.money >= cost, '余额不足');
    if (st.houses === 4) { must(this.hotelsLeft > 0, '银行酒店已售罄'); this.hotelsLeft--; this.housesLeft += 4; }
    else { must(this.housesLeft > 0, '银行房屋已售罄'); this.housesLeft--; }
    st.houses++;
    this.fx.push({ type: 'build', pid: p.id, pos, level: st.houses }); this.prog(p, 'build');
    this.transfer(p, null, cost, st.houses === 5 ? `${sq.name} 建酒店` : `${sq.name} 建房`);
    this.say(`${p.name} 在 ${sq.name} ${st.houses === 5 ? '建了酒店' : '建了第 ' + st.houses + ' 栋房屋'}`);
  }

  sell(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(sq.type === 'prop' && st.houses > 0, '这里没有房屋');
    const g = GROUP_POS[sq.group].map((i) => this.props[i]);
    must(st.houses >= Math.max(...g.map((x) => x.houses)), '必须平均卖房：先卖同色房屋更多的地产');
    let n = 1;
    if (st.houses === 5) {
      this.hotelsLeft++;
      if (this.housesLeft >= 4) this.housesLeft -= 4;
      else n = 5; // 银行房屋不够换回 4 栋：整座酒店直接卖掉
    } else this.housesLeft++;
    st.houses -= n;
    const v = Math.round(this.houseCost(sq) / 2) * n;
    this.transfer(null, p, v, `${sq.name} 卖房`);
    this.say(`${p.name} 卖出 ${sq.name} 的${n === 5 || st.houses === 4 ? '酒店' : '一栋房屋'}，得 ${fmt(v)}`);
    this.afterRaise(p);
  }

  mortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(!st.mortgaged, '已经抵押了');
    if (sq.type === 'prop') must(GROUP_POS[sq.group].every((i) => this.props[i].houses === 0), '同色组还有房屋，先卖掉');
    st.mortgaged = true;
    const mv = this.nice(sq.price * this.pinfl / 2);
    this.transfer(null, p, mv, `抵押 ${sq.name}`);
    this.afterRaise(p);
  }

  unmortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(st.mortgaged, '没有抵押');
    const cost = Math.ceil((sq.price * this.pinfl / 2) * 1.1 / 10) * 10;
    must(p.money >= cost, `赎回需要 ${fmt(cost)}`);
    st.mortgaged = false;
    this.transfer(p, null, cost, `赎回 ${sq.name}`);
    this.say(`${p.name} 赎回了 ${sq.name}`);
  }

  afterRaise(p) {
    if (p.money >= 0 && p.creditor) { this.say(`${p.name} 还清了欠款`); p.creditor = null; }
  }

  // ---------- 交易 ----------
  tradable(pid, list) {
    for (const pos of list) {
      const st = this.props[pos];
      must(st && st.owner === pid, '交易中包含不属于对方的地产');
      const sq = BOARD[pos];
      if (sq.type === 'prop') must(GROUP_POS[sq.group].every((i) => this.props[i].houses === 0), `${sq.name} 所在色组有房屋，不能交易`);
    }
  }

  propose(p, o) {
    must(this.phase === 'play' && !p.bankrupt, '现在不能交易');
    const to = this.byId(o.to);
    must(to && to !== p && !to.bankrupt, '交易对象无效');
    const give = (o.give || []).map(Number), get = (o.get || []).map(Number);
    const giveMoney = Math.max(0, Math.floor(Number(o.giveMoney) || 0)), getMoney = Math.max(0, Math.floor(Number(o.getMoney) || 0));
    must(give.length || get.length || giveMoney || getMoney, '交易内容为空');
    this.tradable(p.id, give); this.tradable(to.id, get);
    must(p.money >= giveMoney, '您的余额不够');
    this.trades = this.trades.filter((t) => t.from !== p.id);
    const t = { id: this.tradeSeq++, from: p.id, to: to.id, give, get, giveMoney, getMoney };
    this.trades.push(t);
    this.say(`${p.name} 向 ${to.name} 发起交易`);
  }

  respond(p, id, accept) {
    const t = this.trades.find((x) => x.id === Number(id));
    must(t, '交易已失效');
    must(t.to === p.id || (t.from === p.id && !accept), '无权处理此交易');
    this.trades = this.trades.filter((x) => x !== t);
    const from = this.byId(t.from), to = this.byId(t.to);
    if (!accept) { this.say(t.from === p.id ? `${from.name} 撤回了交易` : `${to.name} 拒绝了 ${from.name} 的交易`); return; }
    this.tradable(from.id, t.give); this.tradable(to.id, t.get);
    must(from.money >= t.giveMoney, `${from.name} 余额已不足`);
    must(to.money >= t.getMoney, '您的余额不足');
    t.give.forEach((i) => (this.props[i].owner = to.id));
    t.get.forEach((i) => (this.props[i].owner = from.id));
    if (t.giveMoney) this.transfer(from, to, t.giveMoney, '交易');
    if (t.getMoney) this.transfer(to, from, t.getMoney, '交易');
    this.say(`${to.name} 接受了 ${from.name} 的交易 ✅`);
    this.fx.push({ type: 'deal', from: from.id, to: to.id });
    this.afterRaise(from); this.afterRaise(to);
  }

  // ---------- 破产 ----------
  bankrupt(p, forced) {
    const pd = this.pending;
    const owing = pd && pd.kind === 'pay' && pd.payer === p.id;
    must(forced || owing || p.money < 0, '您没有欠款，不能宣布破产');
    let creditor = null;
    if (owing && pd.to && pd.to !== 'each') creditor = this.byId(pd.to);
    else if (!owing && p.creditor) creditor = this.byId(p.creditor);
    if (owing) this.pending = null;

    let cash = Math.max(0, p.money + this.holdValue(p) - (p.loan || 0));
    p.hold = {}; p.loan = 0; p.bet = null;
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
    this.say(`💥 ${p.name} ${forced ? '被请出房间' : '宣布破产'}，名下地产成为法拍房（半价出售）`);
    delete this.tasks[p.id];
    this.fx.push({ type: 'bankrupt', pid: p.id });

    if (this.active().length <= 1) { this.finish(); return; }
    if (p === this.cur) this.nextTurn();
  }

  finish() {
    this.phase = 'end';
    this.pending = null; this.auction = null;
    const ri = (id) => { const i = this.rich.indexOf(id); return i < 0 ? 999 : i; };
    this.ranking = this.players.map((p) => ({ id: p.id, worth: p.won ? p.wonWorth : p.bankrupt ? 0 : this.netWorth(p), rich: ri(p.id), won: !!p.won, broke: !!p.bankrupt && !p.won })).sort((a, b) => a.rich - b.rich || b.worth - a.worth);
    this.winner = this.ranking[0].id;
    this.say(`🏆 游戏结束！第一名：${this.byId(this.winner).name}`);
  }

  // 首富：现金达到目标的人按先后顺序排名；所有人都达到则结束
  checkGoals() {
    if (this.phase !== 'play') return false;
    let ch = false;
    for (const o of this.active()) if (this.netWorth(o) >= RULES.winCash) {
      this.rich.push(o.id); o.won = this.rich.length; o.wonWorth = this.netWorth(o); o.hold = {}; o.loan = 0; o.bet = null; ch = true;
      this.fx.push({ type: 'rich', pid: o.id, rank: o.won });
      this.say(`👑 ${o.name} 的总资产达到 ${fmt(RULES.winCash)}，以第 ${o.won} 名胜出！其名下地产交还银行，其余玩家继续对战`);
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
      if (has && !this.sets[k]) { this.fx.push({ type: 'set', pid: o.id, group: g }); this.say(`🎉 ${o.name} 集齐了${GROUPS[g].name}地产，可以开始建房了`); }
      this.sets[k] = has;
    }
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
    else if (pd && pd.kind === 'buy') { this.pending = null; this.say(`⏱ ${p.name} 超时，放弃购买 ${BOARD[pd.pos].name}`); }
    else if (pd && pd.kind === 'pay') {
      const payer = this.byId(pd.payer);
      if (pd.cancelTo && payer.money < pd.amount) this.pending = null;
      else { this.autoRaise(payer, pd.amount); if (payer.money >= pd.amount) this.swipe(payer); else this.bankrupt(payer); }
    } else if (!pd) {
      if (p.money < 0) { this.autoRaise(p, 0); if (p.money < 0) this.bankrupt(p); }
      else if (!this.rolled || this.canRollAgain) { this.say(`⏱ ${p.name} 超时，系统自动掷骰`); this.roll(p); }
      else { this.say(`⏱ ${p.name} 超时，自动结束回合`); this.nextTurn(); }
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
      o.money += amt; (inc[o.id] = inc[o.id] || []).push([+i, amt]);
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
  // 远程购买：未抵达也可购买银行持有的地产，价格为现价的 3 倍
  remoteBuy(p, pos) {
    pos = Number(pos); const st = this.props[pos];
    must(st && !st.owner, '只能远程购买银行持有的地产');
    must(!this.auction || this.auction.pos !== pos, '这块地正在拍卖');
    const pd = this.pending; must(!(pd && pd.kind === 'buy' && pd.pos === pos), '您正停在这块地上，请直接购买');
    const price = this.priceOf(pos) * 3; must(p.money >= price, `远程购买需要 ${fmt(price)}`);
    this.transfer(p, null, price, `远程购买 ${BOARD[pos].name}（3 倍价）`);
    st.owner = p.id; st.fore = false; this.fx.push({ type: 'buy', pid: p.id, pos }); this.prog(p, 'buy');
    this.say(`${p.name} 以 3 倍价格远程购买了 ${BOARD[pos].name}`);
  }
  // ---------- 金融中心 ----------
  asset(id) { const m = this.market.find((x) => x.id === id); must(m, '没有这个品种'); return m; }
  trade(p, id, side, amount) {
    const m = this.asset(id); p.hold = p.hold || {};
    amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额');
    const fee = 0.003, nm = D.ASSETS.find((a) => a.id === id).name;
    if (side === 'buy') {
      must(p.money >= amount, '现金余额不足');
      p.hold[id] = (p.hold[id] || 0) + (amount * (1 - fee)) / m.price;
      this.transfer(p, null, amount, `买入 ${nm}`);
    } else {
      const have = (p.hold[id] || 0) * m.price; must(have > 0, '您没有持有该品种');
      const amt = Math.min(amount, have); p.hold[id] -= amt / m.price; if (p.hold[id] * m.price < 1) delete p.hold[id];
      this.transfer(null, p, Math.round(amt * (1 - fee)), `卖出 ${nm}`); this.afterRaise(p);
    }
  }
  loanLimit(p) { return Math.max(0, Math.round((this.netWorth(p) + (p.loan || 0)) * 0.5) - (p.loan || 0)); }
  borrow(p, amount) {
    amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额');
    must(amount <= this.loanLimit(p), `当前最多可再贷 ${fmt(this.loanLimit(p))}`);
    p.loan = (p.loan || 0) + amount; this.transfer(null, p, amount, '银行贷款'); this.afterRaise(p);
    this.say(`🏦 ${p.name} 向银行贷款 ${fmt(amount)}（每分钟利息 3%）`);
  }
  repay(p, amount) {
    must(p.loan > 0, '您没有贷款'); amount = Math.min(Math.floor(Number(amount)), Math.ceil(p.loan), p.money); must(amount > 0, '现金不足');
    p.loan -= amount; if (p.loan < 1) p.loan = 0; this.transfer(p, null, amount, '偿还贷款');
  }
  bet(p, id, dir, stake) {
    const m = this.asset(id); stake = Math.floor(Number(stake));
    must(['up', 'down'].includes(dir), '请选择看涨或看跌'); must(stake > 0 && p.money >= stake, '现金余额不足');
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
      if (Math.random() < 0.006) { const shock = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.1) * (a.kind === 'stock' ? 1 : 0.25); r += shock; this.fx.push({ type: 'news', id: m.id, pct: Math.round(shock * 100) }); this.say(`📰 市场快讯：${a.name}${shock > 0 ? '暴涨' : '暴跌'} ${Math.abs(Math.round(shock * 100))}%`); }
      m.price = Math.max(a.base * 0.05, m.price * Math.exp(r)); m.hist.push(+m.price.toPrecision(5)); if (m.hist.length > 60) m.hist.shift();
    }
    let ch = false;
    for (const p of this.players) {
      if (p.loan > 0) p.loan *= Math.pow(1.03, dt / 60);
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
      if (win) { this.transfer(null, p, payout, '竞猜获胜'); this.say(`🎯 ${p.name} 竞猜 ${nm} ${b.dir === 'up' ? '看涨' : '看跌'}命中，结算 +${fmt(payout)}`); }
      else this.say(`📉 ${p.name} 竞猜 ${nm} ${b.dir === 'up' ? '看涨' : '看跌'}未命中，损失 ${fmt(b.stake)}`);
    }
    return ch;
  }

  // ---------- 新格子 ----------
  stock(p, pct) {
    const pd = this.pending; must(pd && pd.kind === 'stock' && pd.pid === p.id, '现在不能炒股');
    this.pending = null; pct = Number(pct);
    if (![10, 25, 50].includes(pct) || p.money <= 0) { this.say(`${p.name} 路过股票交易所，没有入场`); return; }
    const stake = Math.floor((p.money * pct) / 100), d = die(), win = d >= 4;
    this.fx.push({ type: 'stockroll', pid: p.id, d, win, stake });
    this.say(`📈 ${p.name} 押上 ${fmt(stake)} 炒股，掷出 ${d}：${win ? '大涨，翻倍！' : '下跌，亏一半'}`);
    if (win) this.transfer(null, p, stake, '股票大涨'); else this.transfer(p, null, Math.floor(stake / 2), '股票下跌');
  }
  portal(p, pos) {
    const pd = this.pending; must(pd && pd.kind === 'portal' && pd.pid === p.id, '现在不能传送');
    pos = Math.floor(Number(pos)); must(pos >= 0 && pos < N && pos !== p.pos && BOARD[pos].type !== 'portal', '不能传送到这里');
    this.pending = null;
    this.fx.push({ type: 'tp', pid: p.id, to: pos }); p.pos = pos;
    this.say(`🌀 ${p.name} 传送到了 ${BOARD[pos].name}`);
    this.land(p);
  }
  forceTargets(p) {
    return Object.keys(this.props).map(Number).filter((i) => { const st = this.props[i], sq = BOARD[i]; return st.owner && st.owner !== p.id && !st.mortgaged && !(sq.type === 'prop' && GROUP_POS[sq.group].some((k) => this.props[k].houses > 0)); });
  }
  force(p, pos) {
    const pd = this.pending; must(pd && pd.kind === 'force' && pd.pid === p.id, '现在不能强制拍卖');
    if (pos == null) { this.pending = null; this.say(`${p.name} 放弃了强制拍卖`); return; }
    pos = Number(pos); must(this.forceTargets(p).includes(pos), '这块地不能强制拍卖');
    const owner = this.byId(this.props[pos].owner);
    this.pending = { kind: 'auction' };
    this.auction = { pos, bid: 0, bidder: null, endsAt: Date.now() + AUCTION_START, total: AUCTION_START, seller: owner.id, by: p.id };
    this.say(`🔨 ${p.name} 对 ${owner.name} 的 ${BOARD[pos].name} 发起强制拍卖！成交价归 ${owner.name}，没人出价则不变`);
  }
  // ---------- 通货膨胀 & 进程加速器 ----------
  bumpStage(why) {
    this.stage++;
    this.fx.push({ type: 'stage', stage: this.stage, infl: this.infl, pinfl: this.pinfl, taxRate: this.taxRate });
    this.say(`📈 通货膨胀（${why}）：进入第 ${this.stage + 1} 阶段，租金、工资、每秒收益 ×${Math.round(this.infl * 100) / 100}，地价、房价 ×${Math.round(this.pinfl * 100) / 100}，地产税率升至 ${Math.round(this.taxRate * 1000) / 10}%`);
  }
  tickStage() {
    if (this.phase !== 'play' || !this.startedAt) return false;
    if (Math.floor((Date.now() - this.startedAt) / 600000) <= this.autoStage) return false;
    this.autoStage++; this.bumpStage('每 10 分钟自动'); return true;
  }
  accelerate(p) {
    must(p.token === this.hostToken, '只有房主可以启动进程加速器');
    this.bumpStage('房主启动进程加速器');
    const reward = Math.round(400000 * this.infl);
    for (const o of this.active()) { const t = D.TASKS[Math.floor(Math.random() * D.TASKS.length)]; this.tasks[o.id] = { ...t, have: 0, reward, done: false }; }
    this.fx.push({ type: 'boost' });
    this.say(`🚀 进程加速器启动！每人领到一个任务，完成奖励 ${fmt(reward)}`);
  }
  prog(p, t) {
    const k = p && this.tasks[p.id]; if (!k || k.done || k.t !== t) return;
    if (++k.have < k.need) return;
    k.done = true; this.fx.push({ type: 'task', pid: p.id, reward: k.reward });
    this.transfer(null, p, k.reward, '完成加速任务');
  }
  kick(p, id) {
    must(p.token === this.hostToken, '只有房主可以移出玩家');
    const t = this.byId(id); must(t && t !== p, '玩家无效');
    if (this.phase === 'lobby') { this.players = this.players.filter((x) => x !== t); this.say(`房主将 ${t.name} 移出了房间`); return t; }
    must(!t.bankrupt, '该玩家已不在对局中');
    must(!this.auction, '拍卖进行中，稍后再试');
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
    this.settle(p); amount = Math.floor(Number(amount)); must(amount > 0, '请输入金额'); must(p.w[from] >= amount, '这个钱包里的钱不够');
    p.w[from] -= amount; p.w[to] += amount;
    const nm = { card: '银行卡', phone: '手机钱包', cash: '现金' };
    this.fx.push({ type: 'xchg', pid: p.id, from, to, amount });
    this.say(`🏦 ${p.name} 在银行把 ${fmt(amount)} 从${nm[from]}换成${nm[to]}`);
  }

  // 私人转账
  send(p, toId, amount) {
    const to = this.byId(toId);
    must(to && to !== p && !to.bankrupt, '收款人无效');
    amount = Math.floor(Number(amount));
    must(amount > 0, '请输入金额');
    must(p.money >= amount, '余额不足');
    this.transfer(p, to, amount, '私人转账');
    this.afterRaise(to);
  }

  endGame(p) {
    must(p.token === this.hostToken, '只有房主可以结束游戏');
    must(this.phase === 'play', '游戏未进行');
    this.finish();
  }

  // ---------- 回合 ----------
  endTurn(p) {
    must(p === this.cur, '还没轮到您');
    must(this.rolled && !this.canRollAgain, '您还需要掷骰子');
    must(!this.pending, '请先处理当前事项');
    must(p.money >= 0, '您还欠着钱');
    this.nextTurn();
  }

  // 还没确认就被取消的出狱卡要放回牌堆
  dropCard() { const pd = this.pending; if (pd && pd.kind === 'card' && this.decks[pd.deck] && (pd.deck === 'chance' ? CHANCE : CHEST)[pd.id].fx.t === 'goojf') this.decks[pd.deck].push(pd.id); }
  nextTurn() {
    this.dropCard();
    const n = this.players.length;
    let i = this.turn;
    do { i = (i + 1) % n; } while (this.players[i].bankrupt);
    this.turn = i;
    this.rolled = false; this.canRollAgain = false; this.doubles = 0;
    this.pending = null;
    this.say(`轮到 ${this.cur.name}`);
    this.fx.push({ type: 'turn', pid: this.cur.id });
  }

  // 房主可以替掉线的玩家跳过回合
  skip(p) {
    must(p.token === this.hostToken, '只有房主可以跳过');
    must(!this.cur.connected, '当前玩家在线，不能跳过');
    must(!this.auction, '拍卖进行中');
    this.say(`房主跳过了掉线的 ${this.cur.name}`);
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
    must(p, '找不到您的玩家身份');
    if (type === 'pay') { if (['card', 'phone', 'cash'].includes(a.m)) p[a.k === 'recv' ? 'recv' : 'pay'] = a.m; return; }
    if (type === 'look') return this.setLook(p, a.color, a.icon);
    if (type === 'kick') return this.kick(p, a.id);
    if (type === 'start') return this.start(p);
    if (type === 'size') return this.setSize(p, a.n);
    must(this.phase === 'play', '游戏不在进行中');
    if (p.bankrupt) throw new GameError(p.won ? '您已胜出，正在观战' : '您已破产，只能观战');
    const map = {
      roll: () => this.roll(p), buy: () => this.buy(p), cancelBuy: () => this.cancelBuy(p),
      auction: () => this.startAuction(p), bid: () => this.bid(p, a.inc), swipe: () => this.swipe(p),
      card: () => this.ackCard(p), payJail: () => this.payJail(p), useCard: () => this.useCard(p),
      build: () => this.build(p, a.pos), sell: () => this.sell(p, a.pos),
      mortgage: () => this.mortgage(p, a.pos), unmortgage: () => this.unmortgage(p, a.pos),
      propose: () => this.propose(p, a), respond: () => this.respond(p, a.id, !!a.accept),
      bankrupt: () => this.bankrupt(p), endTurn: () => this.endTurn(p),
      endGame: () => this.endGame(p), skip: () => this.skip(p), send: () => this.send(p, a.to, a.amount), stock: () => this.stock(p, a.pct), portal: () => this.portal(p, a.pos), force: () => this.force(p, a.pos),
      boost: () => this.accelerate(p), remoteBuy: () => this.remoteBuy(p, a.pos),
      trade: () => this.trade(p, a.id, a.side, a.amount), borrow: () => this.borrow(p, a.amount), repay: () => this.repay(p, a.amount), bet: () => this.bet(p, a.id, a.dir, a.amount), wallet: () => this.exchange(p, a.from, a.to, a.amount),
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
      log: this.log.slice(-60), winner: this.winner, ranking: this.ranking,
      players: this.players.map(({ token, ...rest }) => ({ ...rest, host: token === this.hostToken, worth: this.netWorth(rest), hv: this.holdValue(rest) })),
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
