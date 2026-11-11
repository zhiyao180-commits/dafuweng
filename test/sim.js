// 8 个机器人随机对局，检查规则引擎不会卡死/出错
const { Game, GameError } = require('../game');
const D = require('../public/data.js');
let games = 0, turnsTotal = 0, errs = 0, stuck = 0, endings = {};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
for (let gi = 0; gi < 300; gi++) {
  const g = new Game('T' + gi);
  for (let i = 0; i < 8; i++) g.addPlayer('bot' + i, 't' + i);
  g.act('t0', 'start');
  let steps = 0;
  while (g.phase === 'play' && steps < 40000) {
    steps++;
    if (g.auction) {
      // 随机出价或等它结束
      const bidders = g.active().filter((p) => p.money > g.auction.bid + 2000);
      if (bidders.length && Math.random() < 0.5 && g.auction.bid < 60000) { try { g.act(pick(bidders).token, 'bid', { inc: pick(D.RULES.bids.slice(0, 4)) }); } catch (e) { if (!(e instanceof GameError)) throw e; } }
      else { g.auction.endsAt = 0; g.tickAuction(); }
      continue;
    }
    // 偶尔有非当前玩家发起交易/欠款处理
    for (const o of g.active()) {
      if (o.money < 0) {
        const mine = Object.entries(g.props).filter(([, s]) => s.owner === o.id);
        const h = mine.find(([, s]) => s.houses > 0), m = mine.find(([, s]) => !s.mortgaged);
        let ok = false;
        for (const [k] of mine) for (const t of ['sell', 'mortgage']) { if (ok) break; try { g.act(o.token, t, { pos: +k }); ok = true; } catch (e) { if (!(e instanceof GameError)) throw e; } }
        if (!ok) g.act(o.token, 'bankrupt');
      }
    }
    if (g.phase !== 'play') break;
    const p = g.cur, pd = g.pending;
    const tryA = (t, a) => { try { g.act(p.token, t, a); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };
    if (Math.random() < 0.05 && g.trades.length) { const t = g.trades[0]; try { g.act(g.byId(t.to).token, 'respond', { id: t.id, accept: Math.random() < 0.5 }); } catch (e) { if (!(e instanceof GameError)) throw e; } }
    if (Math.random() < 0.02) { const o = pick(g.active().filter((x) => x !== p)); const mine = Object.keys(g.props).filter((k) => g.props[k].owner === p.id); tryA('propose', { to: o.id, give: mine.slice(0, 1), getMoney: 2000 }); }
    if (pd) {
      if (pd.kind === 'buy') { if (Math.random() < 0.7) tryA('buy'); else tryA('auction'); continue; }
      if (pd.kind === 'card') { tryA('card'); continue; }
      if (pd.kind === 'stock') { tryA('stock', { pct: pick([0, 10, 25, 50]) }); continue; }
      if (pd.kind === 'portal') { tryA('portal', { pos: (p.pos + 1 + Math.floor(Math.random() * 60)) % D.BOARD.length }); if (g.pending && g.pending.kind === 'portal') g.pending = null; continue; }
      if (pd.kind === 'force') { const t = g.forceTargets(p); tryA('force', { pos: Math.random() < 0.5 ? t[0] : null }); continue; }
      if (pd.kind === 'pay') {
        if (tryA('swipe')) continue;
        if (pd.cancelTo) { tryA('cancelBuy'); tryA('auction'); continue; }
        const mine = Object.entries(g.props).filter(([, s]) => s.owner === p.id);
        const h = mine.find(([, s]) => s.houses > 0), m = mine.find(([, s]) => !s.mortgaged && s.houses === 0);
        if (h && tryA('sell', { pos: +h[0] })) continue;
        if (m && tryA('mortgage', { pos: +m[0] })) continue;
        if (!tryA('bankrupt')) { // 卖房不平均等问题：逐个尝试
          let done = false;
          for (const [k] of mine) if (tryA('sell', { pos: +k }) || tryA('mortgage', { pos: +k })) { done = true; break; }
          if (!done) { stuck++; console.log('STUCK pay', pd, p.money); break; }
        }
        continue;
      }
      stuck++; console.log('unknown pending', pd); break;
    }
    if (p.inJail && !g.rolled && Math.random() < 0.3) { if (!tryA('useCard')) tryA('payJail'); continue; }
    // 建房
    if (Math.random() < 0.3) for (const k of Object.keys(g.props)) if (g.props[k].owner === p.id && p.money > 80000) tryA('build', { pos: +k });
    if (Math.random() < 0.1) for (const k of Object.keys(g.props)) if (g.props[k].mortgaged && g.props[k].owner === p.id) tryA('unmortgage', { pos: +k });
    if (p.money < 0) continue; // 先由上面的欠款处理筹钱
    if (!g.rolled || g.canRollAgain) { if (!tryA('roll')) { stuck++; console.log('cannot roll', p.money, g.pending); break; } continue; }
    if (!tryA('endTurn')) { stuck++; console.log('cannot end', p.money, g.pending, g.canRollAgain); break; }
    turnsTotal++;
    // 不变量检查
    for (const pl of g.players) if (Number.isNaN(pl.money)) throw new Error('NaN money');
    const houses = Object.values(g.props).reduce((n, s) => n + (s.houses === 5 ? 0 : s.houses), 0);
    const hotels = Object.values(g.props).filter((s) => s.houses === 5).length;
    if (houses + g.housesLeft !== D.RULES.houses || hotels + g.hotelsLeft !== D.RULES.hotels) throw new Error(`house count broke ${houses}+${g.housesLeft} ${hotels}+${g.hotelsLeft}`);
    if (g.decks.chance.length + g.players.reduce((n, x) => n + x.goojf.filter((d) => d === 'chance').length, 0) !== D.CHANCE.length) throw new Error('deck size');
    g.fx = [];
  }
  games++;
  endings[g.phase] = (endings[g.phase] || 0) + 1;
  JSON.stringify(g.publicState());
}
console.log({ games, turnsTotal, stuck, endings });
