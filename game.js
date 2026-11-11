// 大富翁规则引擎（服务器权威：所有点数、余额都由这里决定）
const D = require('./public/data.js');
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
  }

  ownsGroup(pid, group) { return GROUP_POS[group].every((i) => this.props[i].owner === pid); }
  countOwned(pid, type) { return BOARD.reduce((n, sq, i) => n + (sq.type === type && this.props[i].owner === pid ? 1 : 0), 0); }

  rentFor(pos, opts = {}) {
    const sq = BOARD[pos], st = this.props[pos];
    if (sq.type === 'rail') {
      const n = this.countOwned(st.owner, 'rail');
      return 250 * Math.pow(2, n - 1) * (opts.doubleRail ? 2 : 1);
    }
    if (sq.type === 'util') {
      const n = this.countOwned(st.owner, 'util');
      const mult = opts.utilTen ? 100 : [40, 100, 200][n - 1] || 200;
      return mult * (opts.diceTotal || this.dice[0] + this.dice[1]);
    }
    if (st.houses > 0) return sq.rent[st.houses];
    return sq.rent[0] * (this.ownsGroup(st.owner, sq.group) ? 2 : 1);
  }

  netWorth(p) {
    let v = p.money;
    for (const [i, st] of Object.entries(this.props)) {
      if (st.owner !== p.id) continue;
      const sq = BOARD[i];
      v += st.mortgaged ? sq.price / 2 : sq.price;
      if (sq.type === 'prop') v += st.houses * GROUPS[sq.group].house;
    }
    return v;
  }

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
    this.turn = 0;
    this.say(`游戏开始！每人获得 ${fmt(RULES.startMoney)}，先拿到 ${fmt(RULES.winCash)} 现金的人立即获胜。顺序：${this.players.map((x) => x.name).join(' → ')}`);
    this.say(`轮到 ${this.cur.name}`);
    this.fx.push({ type: 'turn', pid: this.cur.id });
  }

  // ---------- 掷骰与移动 ----------
  roll(p) {
    must(this.phase === 'play', '游戏未进行');
    must(p === this.cur, '还没轮到你');
    must(!this.pending, '请先处理当前事项');
    must(!this.rolled || this.canRollAgain, '本回合已经掷过了');
    must(p.money >= 0, '你欠着钱，请先卖房/抵押筹钱');
    const d = [die(), die()];
    this.dice = d;
    const sum = d[0] + d[1], dbl = d[0] === d[1];
    this.fx.push({ type: 'dice', pid: p.id, dice: d });
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
          this.say(`${p.name} 第三次没掷出双数，必须缴纳保释金 ${fmt(RULES.jailFine)}`);
          this.pending = { kind: 'pay', payer: p.id, to: null, amount: RULES.jailFine, reason: '保释金', next: { t: 'release', move: sum } };
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
    if (n > 0 && from + n >= N) {
      this.transfer(null, p, RULES.goSalary, '经过起点');
      this.say(`${p.name} 经过起点，领取 ${fmt(RULES.goSalary)}`);
    }
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
      this.pending = { kind: 'pay', payer: p.id, to: null, amount: sq.amount, reason: sq.name };
      return;
    }
    if (sq.type === 'chance' || sq.type === 'chest') {
      const deck = this.decks[sq.type];
      const id = deck.shift();
      const card = (sq.type === 'chance' ? CHANCE : CHEST)[id];
      if (card.fx.t !== 'goojf') deck.push(id);
      this.pending = { kind: 'card', deck: sq.type, id, pid: p.id, seq: (this.cardSeq = (this.cardSeq || 0) + 1) };
      this.say(`${p.name} 抽到${sq.name}卡：${card.text}`);
      return;
    }
    if (sq.type === 'bonus') {
      this.transfer(null, p, sq.amount, '世界银行分红');
      this.say(`${p.name} 获得世界银行分红 ${fmt(sq.amount)}`);
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
    const card = (pd.deck === 'chance' ? CHANCE : CHEST)[pd.id];
    this.pending = null;
    const f = card.fx;
    switch (f.t) {
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
          for (const o of others) {
            this.transfer(o, p, f.amt, '卡片收款');
            if (o.money < 0) { o.creditor = p.id; this.say(`${o.name} 余额不足，欠款 ${fmt(-o.money)}，需要筹钱`); }
          }
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
    must(pd && pd.kind === 'pay' && pd.payer === p.id, '现在不需要你付款');
    must(p.money >= pd.amount, `余额不足（需要 ${fmt(pd.amount)}），请先卖房或抵押`);
    this.pending = null;
    if (pd.to === 'each') {
      for (const o of this.active().filter((x) => x !== p)) this.transfer(p, o, pd.each, pd.reason);
    } else {
      this.transfer(p, pd.to ? this.byId(pd.to) : null, pd.amount, pd.reason);
    }
    this.say(`${p.name} 刷卡支付 ${fmt(pd.amount)}（${pd.reason}${pd.to && pd.to !== 'each' ? ' → ' + this.byId(pd.to).name : ''}）`);
    const n = pd.next;
    if (!n) return;
    if (n.t === 'own') {
      this.props[n.pos].owner = p.id;
      this.fx.push({ type: 'buy', pid: p.id, pos: n.pos });
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
    this.pending = { kind: 'pay', payer: p.id, to: null, amount: sq.price, reason: `购买 ${sq.name}`, next: { t: 'own', pos: pd.pos }, cancelTo: { kind: 'buy', pos: pd.pos } };
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
    this.auction = { pos: pd.pos, bid: 0, bidder: null, endsAt: Date.now() + 15000 };
    this.say(`${BOARD[pd.pos].name} 开始拍卖！`);
  }

  bid(p, inc) {
    const a = this.auction;
    must(a, '没有拍卖');
    must(!p.bankrupt, '你已破产');
    inc = Number(inc);
    must([10, 50, 100, 500, 1000].includes(inc), '加价无效');
    const amt = a.bid + inc;
    must(p.money >= amt, '余额不足');
    a.bid = amt; a.bidder = p.id;
    a.endsAt = Math.max(a.endsAt, Date.now() + 8000);
    this.fx.push({ type: 'bid', pid: p.id, amount: amt });
  }

  tickAuction() {
    const a = this.auction;
    if (!a || Date.now() < a.endsAt) return false;
    const sq = BOARD[a.pos];
    if (a.bidder) {
      const w = this.byId(a.bidder);
      this.transfer(w, null, a.bid, `拍得 ${sq.name}`);
      this.props[a.pos].owner = w.id;
      this.fx.push({ type: 'buy', pid: w.id, pos: a.pos });
      this.say(`${w.name} 以 ${fmt(a.bid)} 拍得 ${sq.name}`);
    } else this.say(`${sq.name} 无人出价，流拍`);
    this.auction = null;
    if (this.pending && this.pending.kind === 'auction') this.pending = null;
    return true;
  }

  // ---------- 监狱 ----------
  payJail(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '现在不能缴保释金');
    this.pending = { kind: 'pay', payer: p.id, to: null, amount: RULES.jailFine, reason: '保释金', next: { t: 'jailPaid' } };
  }

  useCard(p) {
    must(p === this.cur && p.inJail && !this.rolled && !this.pending, '现在不能用出狱卡');
    must(p.goojf.length, '你没有出狱卡');
    const deck = p.goojf.shift();
    const list = deck === 'chance' ? CHANCE : CHEST;
    this.decks[deck].push(list.findIndex((c) => c.fx.t === 'goojf'));
    p.inJail = false; p.jailTurns = 0;
    this.say(`${p.name} 使用出狱许可证出狱`);
  }

  // ---------- 房产管理 ----------
  ownProp(p, pos) {
    const st = this.props[pos];
    must(st && st.owner === p.id, '这不是你的地产');
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
    const cost = GROUPS[sq.group].house;
    must(p.money >= cost, '余额不足');
    if (st.houses === 4) { must(this.hotelsLeft > 0, '银行酒店已售罄'); this.hotelsLeft--; this.housesLeft += 4; }
    else { must(this.housesLeft > 0, '银行房屋已售罄'); this.housesLeft--; }
    st.houses++;
    this.fx.push({ type: 'build', pid: p.id, pos, level: st.houses });
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
    const v = (GROUPS[sq.group].house / 2) * n;
    this.transfer(null, p, v, `${sq.name} 卖房`);
    this.say(`${p.name} 卖出 ${sq.name} 的${n === 5 || st.houses === 4 ? '酒店' : '一栋房屋'}，得 ${fmt(v)}`);
    this.afterRaise(p);
  }

  mortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(!st.mortgaged, '已经抵押了');
    if (sq.type === 'prop') must(GROUP_POS[sq.group].every((i) => this.props[i].houses === 0), '同色组还有房屋，先卖掉');
    st.mortgaged = true;
    this.transfer(null, p, sq.price / 2, `抵押 ${sq.name}`);
    this.say(`${p.name} 抵押了 ${sq.name}，得 ${fmt(sq.price / 2)}`);
    this.afterRaise(p);
  }

  unmortgage(p, pos) {
    const [sq, st] = this.ownProp(p, pos);
    must(st.mortgaged, '没有抵押');
    const cost = Math.ceil((sq.price / 2) * 1.1 / 10) * 10;
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
    must(p.money >= giveMoney, '你的余额不够');
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
    must(to.money >= t.getMoney, '你的余额不足');
    t.give.forEach((i) => (this.props[i].owner = to.id));
    t.get.forEach((i) => (this.props[i].owner = from.id));
    if (t.giveMoney) this.transfer(from, to, t.giveMoney, '交易');
    if (t.getMoney) this.transfer(to, from, t.getMoney, '交易');
    this.say(`${to.name} 接受了 ${from.name} 的交易 ✅`);
    this.fx.push({ type: 'deal', from: from.id, to: to.id });
    this.afterRaise(from); this.afterRaise(to);
  }

  // ---------- 破产 ----------
  bankrupt(p) {
    const pd = this.pending;
    const owing = pd && pd.kind === 'pay' && pd.payer === p.id;
    must(owing || p.money < 0, '你没有欠款，不能宣布破产');
    let creditor = null;
    if (owing && pd.to && pd.to !== 'each') creditor = this.byId(pd.to);
    else if (!owing && p.creditor) creditor = this.byId(p.creditor);
    if (owing) this.pending = null;

    let cash = Math.max(0, p.money);
    for (const [i, st] of Object.entries(this.props)) {
      if (st.owner !== p.id) continue;
      const sq = BOARD[i];
      if (st.houses) {
        cash += (st.houses * GROUPS[sq.group].house) / 2;
        if (st.houses === 5) this.hotelsLeft++; else this.housesLeft += st.houses;
        st.houses = 0;
      }
      if (creditor) st.owner = creditor.id;
      else { st.owner = null; st.mortgaged = false; }
    }
    if (creditor && cash) this.transfer(null, creditor, cash, `${p.name} 破产清算`);
    for (const d of p.goojf) { const list = d === 'chance' ? CHANCE : CHEST; this.decks[d].push(list.findIndex((c) => c.fx.t === 'goojf')); }
    p.goojf = []; p.money = 0; p.bankrupt = true; p.inJail = false; p.creditor = null;
    this.trades = this.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    for (const o of this.players) if (o.creditor === p.id) o.creditor = null;
    this.say(`💥 ${p.name} 宣布破产${creditor ? '，资产归 ' + creditor.name : '，地产归还银行'}`);
    this.fx.push({ type: 'bankrupt', pid: p.id });

    const alive = this.active();
    if (alive.length <= 1) { this.finish(alive[0]); return; }
    if (p === this.cur) this.nextTurn();
  }

  finish(winner) {
    this.phase = 'end';
    this.pending = null; this.auction = null;
    this.ranking = this.players.map((p) => ({ id: p.id, worth: p.bankrupt ? 0 : this.netWorth(p) })).sort((a, b) => b.worth - a.worth);
    this.winner = winner ? winner.id : this.ranking[0].id;
    this.say(`🏆 ${this.byId(this.winner).name} 获胜！`);
  }

  endGame(p) {
    must(p.token === this.hostToken, '只有房主可以结束游戏');
    must(this.phase === 'play', '游戏未进行');
    this.finish(null);
  }

  // ---------- 回合 ----------
  endTurn(p) {
    must(p === this.cur, '还没轮到你');
    must(this.rolled && !this.canRollAgain, '你还需要掷骰子');
    must(!this.pending, '请先处理当前事项');
    must(p.money >= 0, '你还欠着钱');
    this.nextTurn();
  }

  nextTurn() {
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

  // ---------- 入口 ----------
  act(token, type, a = {}) {
    const p = this.P(token);
    must(p, '找不到你的玩家身份');
    if (type === 'look') return this.setLook(p, a.color, a.icon);
    if (type === 'start') return this.start(p);
    if (type === 'size') return this.setSize(p, a.n);
    must(this.phase === 'play', '游戏不在进行中');
    if (p.bankrupt) throw new GameError('你已破产，只能观战');
    const map = {
      roll: () => this.roll(p), buy: () => this.buy(p), cancelBuy: () => this.cancelBuy(p),
      auction: () => this.startAuction(p), bid: () => this.bid(p, a.inc), swipe: () => this.swipe(p),
      card: () => this.ackCard(p), payJail: () => this.payJail(p), useCard: () => this.useCard(p),
      build: () => this.build(p, a.pos), sell: () => this.sell(p, a.pos),
      mortgage: () => this.mortgage(p, a.pos), unmortgage: () => this.unmortgage(p, a.pos),
      propose: () => this.propose(p, a), respond: () => this.respond(p, a.id, !!a.accept),
      bankrupt: () => this.bankrupt(p), endTurn: () => this.endTurn(p),
      endGame: () => this.endGame(p), skip: () => this.skip(p),
    };
    must(map[type], '未知操作');
    map[type]();
    if (this.phase === 'play') {
      const w = this.active().find((o) => o.money >= RULES.winCash);
      if (w) { this.say(`💰 ${w.name} 的现金达到 ${fmt(RULES.winCash)}！`); this.finish(w); }
    }
    this.updatedAt = Date.now();
  }

  publicState() {
    return {
      code: this.code, phase: this.phase, maxPlayers: this.maxPlayers, turn: this.turn, rolled: this.rolled, canRollAgain: this.canRollAgain,
      dice: this.dice, pending: this.pending, auction: this.auction, trades: this.trades,
      housesLeft: this.housesLeft, hotelsLeft: this.hotelsLeft, props: this.props,
      log: this.log.slice(-60), winner: this.winner, ranking: this.ranking,
      players: this.players.map(({ token, ...rest }) => ({ ...rest, host: token === this.hostToken, worth: this.netWorth(rest) })),
      now: Date.now(),
    };
  }

  toJSON() { const { fx, ...rest } = this; return rest; }
  static from(obj) { const g = new Game(obj.code); Object.assign(g, obj); g.fx = []; g.players.forEach((p) => (p.connected = false)); return g; }
}

module.exports = { Game, GameError };
