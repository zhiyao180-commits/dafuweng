// 金融中心（股票 / 涨跌竞猜 / 银行贷款）与右侧面板放大详情
(function () {
  const AS = GameData.ASSETS;
  const mk = (id) => (S.market || []).find((x) => x.id === id);
  const meta = (id) => AS.find((a) => a.id === id);
  const chg = (m) => (m.hist.length ? (m.price / m.hist[0] - 1) * 100 : 0);
  const px = (m) => (m.price >= 100 ? m.price.toFixed(1) : m.price.toFixed(2));
  window.finPx = px;
  const spark = (hist, w, h, fill) => {
    if (!hist || hist.length < 2) return '';
    const lo = Math.min(...hist), hi = Math.max(...hist), r = hi - lo || 1;
    const pts = hist.map((v, i) => `${((i / (hist.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
    const up = hist[hist.length - 1] >= hist[0], c = up ? '#E5383B' : '#2DA44E'; // 红涨绿跌
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">${fill ? `<polygon points="0,${h} ${pts} ${w},${h}" fill="${c}" opacity=".12"/>` : ''}<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${fill ? 2 : 1.6}" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const amt = (id) => Math.max(0, Math.round((+($('#' + id) || {}).value || 0) * 1000));

  const GUIDE = {
    stock: ['股票：波动较大，价格可能在短时间内大幅涨跌', ['在左侧选择股票，右侧显示分时走势与最新成交价', '输入交易金额（单位 M，例如 50 即 50M），点按「买入」开仓', '点按「卖出」或「全部卖出」平仓；价格上涨则获利，下跌则亏损']],
    bet: ['涨跌竞猜：10 秒结算', ['在左侧选择标的，下单时的价格即为开仓价', '输入投注金额，预判 10 秒后的价格方向，点按「看涨」或「看跌」', '预测正确返还本金的 1.9 倍，预测错误则损失全部本金；同一时间仅可持有一笔竞猜']],
    loan: ['银行贷款：用于短期资金周转', ['输入金额并点按「申请贷款」，资金即时到账', '贷款按每分钟 3% 复利计息，请及时偿还', '可随时部分偿还或全部还清；未偿还的贷款将从总资产中扣除']],
  };
  const TITLE = { stock: ['📈', '股票交易', '行情每 2 秒更新 · 红涨绿跌 · 手续费 0.3%'], bet: ['🎯', '涨跌竞猜', '10 秒结算 · 命中返还 1.9 倍 · 红涨绿跌'], loan: ['🏦', '银行贷款', '即时到账 · 每分钟复利 3% · 额度为总资产的 50%'] };
  const guideHTML = (tab) => { const g = GUIDE[tab], open = localStorage.getItem('dfw_guide_' + tab) !== '0'; return `<details class="fin-guide" data-guide="${tab}" ${open ? 'open' : ''}><summary>📘 交易说明 · ${g[0]}</summary><ol>${g[1].map((x) => `<li>${x}</li>`).join('')}</ol><p>所有交易均以现金结算；股票持仓按实时价格计入总资产，现金不足以支付款项时，系统将自动卖出持仓。</p></details>`; };
  function finShell(v, box) {
    if (v.tab === 'stock') return stockShell(v, box);
    if (v.tab === 'bet') return betShell(v, box);
    if (v.tab === 'loan') return loanShell(v, box);
    const t = TITLE[v.tab];
    box.innerHTML = `<div class="mk-head"><div class="fin-title"><i class="fin-ico ${v.tab}">${t[0]}</i><div><h3>${t[1]}</h3><div class="muted">${t[2]}</div></div></div></div>
      ${guideHTML(v.tab)}
      <div class="fin-body">${v.tab === 'loan' ? '<div class="fin-loan" id="finLoan"></div>' : `<div class="fin-list" id="finList"></div><div class="fin-detail" id="finDetail"></div>`}</div>
      <div class="fin-foot" id="finFoot"></div>
      <div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    if (v.tab === 'loan') {
      $('#finLoan').innerHTML = `<div class="loan-card"><div class="muted">当前贷款余额</div><div class="loan-big" id="loanBal"></div><div class="muted" id="loanInfo"></div></div>
        <div class="loan-ops"><div class="mk-price"><input id="loanAmt" type="number" min="0" step="1" placeholder="金额"><span>M</span></div>
        <div class="act-row"><button class="btn primary" id="loanBorrow">申请贷款</button><button class="btn" id="loanRepay">偿还</button><button class="btn" id="loanAll">全部还清</button></div>
        <div class="muted" style="line-height:1.7;margin-top:8px">· 利率：<b>每分钟复利 3%</b>，建议尽早偿还<br>· 贷款额度 = 总资产的 50%（含已借金额）<br>· 未偿还贷款将从总资产中扣除；破产时由银行清算</div></div>`;
      $('#loanBorrow').onclick = () => act('borrow', { amount: amt('loanAmt') });
      $('#loanRepay').onclick = () => act('repay', { amount: amt('loanAmt') });
      $('#loanAll').onclick = () => act('repay', { amount: 1e15 });
    } else {
      const d = $('#finDetail');
      d.innerHTML = `<div class="fd-h"><div><b id="fdName"></b><small id="fdKind"></small></div><div class="fd-px"><b id="fdPx"></b><small id="fdChg"></small></div></div>
        <div class="fd-chart" id="fdChart"></div><div class="fd-hold" id="fdHold"></div>
        ${v.tab === 'bet' ? `<div class="fd-label">投注金额（单位 M）</div>
          <div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="投注金额"><span>M</span></div>
          <div class="mk-quick">${[10, 50, 100, 500].map((x) => `<button data-finq="${x}">${x}M</button>`).join('')}</div>
          <div class="act-row"><button class="btn bull" id="betUp">📈 看涨 · 做多</button><button class="btn bear" id="betDown">📉 看跌 · 做空</button></div><div class="bet-live" id="betLive"></div>`
        : `<div class="fd-label">交易金额（单位 M）</div><div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="交易金额"><span>M</span></div>
          <div class="mk-quick">${[10, 50, 100, 500].map((x) => `<button data-finq="${x}">${x}M</button>`).join('')}</div>
          <div class="act-row"><button class="btn buy" id="finBuy">买入</button><button class="btn sell" id="finSell">卖出</button><button class="btn sell" id="finAll">全部卖出</button></div>`}`;
      const q = (side) => act('trade', { id: v.sel, side, amount: side === 'all' ? 1e15 : amt('finAmt') }, (r) => r.ok && (Snd.beep(), toast(side === 'buy' ? '买入成功' : '卖出成功')));
      if (v.tab === 'bet') { const go = (dir) => act('bet', { id: v.sel, dir, amount: amt('finAmt') }, (r) => r.ok && (Snd.beep(), toast(`已${dir === 'up' ? '看涨' : '看跌'}开仓，10 秒后结算`))); $('#betUp').onclick = () => go('up'); $('#betDown').onclick = () => go('down'); }
      else { $('#finBuy').onclick = () => q('buy'); $('#finSell').onclick = () => q('sell'); $('#finAll').onclick = () => act('trade', { id: v.sel, side: 'sell', amount: 1e15 }); }
    }
  }
  function finUpdate() {
    const v = localView; if (!v || v.type !== 'fin' || !S || !S.market) return;
    const m = me(); if (!m) return;
    if (v.tab === 'stock') return stockUpdate(v, m);
    if (v.tab === 'bet') return betUpdate(v, m);
    if (v.tab === 'loan') return loanUpdate(v, m);
    if (v.tab === 'loan') {
      $('#loanBal').textContent = fmt(Math.round(m.loan || 0));
      const nw = m.worth, lim = Math.max(0, Math.round((nw + (m.loan || 0)) * 0.5 - (m.loan || 0)));
      $('#loanInfo').textContent = `可借额度 ${fmt(lim)} · 每分钟利息约 ${fmt(Math.round((m.loan || 0) * 0.03))}`;
    } else {
      const list = AS;
      if (!list.some((a) => a.id === v.sel)) v.sel = list[0].id;
      $('#finList').innerHTML = list.map((a) => { const x = mk(a.id), c = chg(x), h = (m.hold || {})[a.id]; return `<div class="fin-row ${v.sel === a.id ? 'on' : ''}" data-finsel="${a.id}"><div><b>${a.name}</b><small>${a.id}${h ? ' · 持有 ' + fmt(Math.round(h * x.price)) : ''}</small></div>${spark(x.hist, 70, 26)}<div class="fr-px"><b>${px(x)}</b><small class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(2)}%</small></div></div>`; }).join('');
      const x = mk(v.sel), a = meta(v.sel), c = chg(x), h = (m.hold || {})[v.sel] || 0;
      $('#fdName').textContent = a.name; $('#fdKind').textContent = ` ${a.id} · 股票`;
      $('#fdPx').textContent = px(x); const ce = $('#fdChg'); ce.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}%（近 2 分钟）`; ce.className = c >= 0 ? 'up' : 'down';
      $('#fdChart').innerHTML = spark(x.hist, 300, 110, true);
      $('#fdHold').innerHTML = `持有市值 <b>${fmt(Math.round(h * x.price))}</b>　·　现金 <b>${fmt(m.money)}</b>`;
      const bl = $('#betLive');
      if (bl) bl.innerHTML = m.bet ? `⏱ 持仓中：${meta(m.bet.id).name} ${m.bet.dir === 'up' ? '看涨' : '看跌'} ${fmt(m.bet.stake)} · 开仓价 ${px({ id: m.bet.id, price: m.bet.start })} · 剩余 ${Math.max(0, Math.ceil((m.bet.endAt - Date.now() - skew) / 1000))} 秒` : '';
    }
    $('#finFoot').innerHTML = `💰 现金 <b>${fmt(m.money)}</b>　📊 股票持仓 <b>${fmt(m.hv || 0)}</b>　🏦 贷款 <b>${fmt(Math.round(m.loan || 0))}</b>　🧾 总资产 <b>${fmt(m.worth)}</b>`;
  }
  // 右侧实时行情栏：点击任一品种打开金融中心
  function renderTicker() {
    const el = $('#ticker'); if (!el || !S || !S.market) return;
    const m = me(), rows = AS.map((a) => { const x = mk(a.id), c = chg(x), h = m && m.hold && m.hold[a.id]; return `<div class="tk-row" data-tick="${a.id}"><span class="tk-n">${a.name}${h ? ' <i>持</i>' : ''}</span>${spark(x.hist, 60, 18)}<b>${px(x)}</b><small class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(1)}%</small></div>`; }).join('');
    const n = window.lastNews && Date.now() - lastNews.t < 12000 ? lastNews : null;
    el.innerHTML = `<div class="panel-title"><span>📈 股票行情 · 点按交易</span><span>${m && m.loan ? '贷款 ' + fmt(Math.round(m.loan)) : ''}</span></div>${n ? `<div class="tk-news ${n.up ? 'up' : 'down'}">📰 市场快讯：${n.text}</div>` : ''}<div class="tk-list">${rows.replace(n ? `data-tick="${n.id}"` : '\u0000', n ? `data-tick="${n.id}" style="background:rgba(245,183,0,.22)"` : '')}</div>`;
  }
  window.openFin = (tab, sel) => { if (localView && localView.type === 'fin' && localView.tab === tab && !sel) return closeLocal(); openLocal({ type: 'fin', tab, sel: sel || (localView && localView.sel) || 'WTK' }); };
  window.onMarket = () => { finUpdate(); renderTicker(); };
  setInterval(() => { if (localView && localView.type === 'fin' && (localView.tab === 'bet' || localView.tab === 'loan') && !document.hidden) finUpdate(); }, 1000);

  // ---------------- 🎯 涨跌竞猜（好用版） ----------------
  const NICEK = (x) => Math.max(1000, Math.round(x / 1000) * 1000);
  function betShell(v, box) {
    box.innerHTML = `<div class="mk-head"><div class="fin-title"><i class="fin-ico bet">🎯</i><div><h3>涨跌竞猜</h3><div class="muted">预测 10 秒后的价格方向 · 命中返还 1.9 倍 · 键盘 ↑ 看涨 / ↓ 看跌</div></div></div></div>
      ${guideHTML('bet')}
      <div class="bt-body"><div class="fin-list" id="finList"></div>
        <div class="bt-main"><div class="bt-live" id="btLive"></div>
          <div class="bt-q" id="btQ"></div><div class="fd-chart" id="fdChart"></div><div class="bt-mom" id="btMom"></div>
          <div class="bt-stake"><div class="fd-label">投注金额（单位 M）</div><div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="投注金额"><span>M</span></div>
            <div class="mk-quick" id="btQuick"></div><div class="bt-est" id="btEst"></div>
            <div class="act-row"><button class="btn bull" id="betUp">📈 看涨 · 做多 <kbd>↑</kbd></button><button class="btn bear" id="betDown">📉 看跌 · 做空 <kbd>↓</kbd></button></div>
            <button class="btn wide bt-again" id="btAgain" hidden></button></div>
          <div class="bt-rec" id="btRec"></div></div></div>
      <div class="fin-foot" id="finFoot"></div><div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    const inp = $('#finAmt'); inp.oninput = () => betUpdate(v, me(), true);
    const go = (dir, id, stake) => act('bet', { id: id || v.sel, dir, amount: stake || amt('finAmt') }, (r) => r.ok && (Snd.beep(), toast(`已${dir === 'up' ? '看涨' : '看跌'} ${meta(id || v.sel).name}，10 秒后结算`)));
    $('#betUp').onclick = () => go('up'); $('#betDown').onclick = () => go('down');
    $('#btAgain').onclick = () => { const h = (me().betHist || []).slice(-1)[0]; if (h) { v.sel = h.id; go(h.dir, h.id, h.stake); } };
    box.querySelector('.bt-body').addEventListener('click', (e) => { const q = e.target.closest('[data-btq]'); if (q) { inp.value = q.dataset.btq; betUpdate(v, me(), true); } });
    v.keys = (e) => { if (e.target.tagName === 'INPUT' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; if (e.key === 'ArrowUp') { e.preventDefault(); go('up'); } if (e.key === 'ArrowDown') { e.preventDefault(); go('down'); } };
    betUpdate(v, me());
  }
  document.addEventListener('keydown', (e) => { if (localView && localView.type === 'fin' && localView.tab === 'bet' && localView.keys) localView.keys(e); });
  function betUpdate(v, m, onlyStake) {
    if (!m || !$('#btQ')) return;
    if (!AS.some((a) => a.id === v.sel)) v.sel = AS[0].id;
    const x = mk(v.sel), a = meta(v.sel), k = amt('finAmt'), cash = Math.max(0, m.money);
    $('#btQuick').innerHTML = [10000, 50000, 100000].map((q) => `<button data-btq="${q / 1000}">${fmt(q)}</button>`).join('') + [[0.05, '5%'], [0.1, '10%'], [0.25, '25%']].map(([f, n]) => `<button data-btq="${NICEK(cash * f) / 1000}" ${cash <= 0 ? 'disabled' : ''}>现金 ${n}</button>`).join('');
    $('#btEst').innerHTML = k ? `命中到账 <b class="up">${fmt(Math.round(k * 1.9))}</b>（净收益 ${fmt(Math.round(k * 0.9))}）· 未命中损失 <b class="down">${fmt(k)}</b>${k > cash ? ' · <b class="down">现金不足</b>' : k > cash * 0.25 ? ' · ⚠️ 超过现金的 25%，风险较高' : ''}` : `可用现金 ${fmt(m.money)}`;
    const H = m.betHist || [], last = H[H.length - 1], ag = $('#btAgain');
    ag.hidden = !last || !!m.bet; if (last) ag.innerHTML = `🔁 再次下单：${last.dir === 'up' ? '看涨' : '看跌'} ${meta(last.id).name} ${fmt(last.stake)}`;
    $('#betUp').disabled = $('#betDown').disabled = !!m.bet;
    if (onlyStake) return;
    $('#finList').innerHTML = AS.map((s2) => { const y = mk(s2.id), h = y.hist, d10 = h.length > 5 ? (y.price / h[h.length - 6] - 1) * 100 : 0; return `<div class="fin-row ${v.sel === s2.id ? 'on' : ''}" data-finsel="${s2.id}"><div><b>${s2.name}</b><small>${s2.id} · 波动率 ${(s2.vol * 100).toFixed(1)}%</small></div>${spark(h.slice(-20), 70, 26)}<div class="fr-px"><b>${px(y)}</b><small class="${d10 >= 0 ? 'up' : 'down'}">10 秒 ${d10 >= 0 ? '+' : ''}${d10.toFixed(2)}%</small></div></div>`; }).join('');
    const h = x.hist, d10 = h.length > 5 ? (x.price / h[h.length - 6] - 1) * 100 : 0, d30 = h.length > 15 ? (x.price / h[h.length - 16] - 1) * 100 : 0;
    const last20 = h.slice(-21), ups = last20.slice(1).filter((p2, i) => p2 > last20[i]).length, dns = last20.length - 1 - ups;
    $('#btQ').innerHTML = `<div><b>${a.name}</b><small>${a.id}</small></div><div class="bt-px ${d10 >= 0 ? 'up' : 'down'}"><b>${px(x)}</b><span>近 10 秒 ${d10 >= 0 ? '+' : ''}${d10.toFixed(2)}% · 近 30 秒 ${d30 >= 0 ? '+' : ''}${d30.toFixed(2)}%</span></div>`;
    $('#fdChart').innerHTML = spark(h.slice(-30), 300, 92, true);
    $('#btMom').innerHTML = `<span>近 20 次报价</span><div class="bt-bar"><i class="up" style="width:${(ups / Math.max(1, ups + dns)) * 100}%"></i><i class="down" style="width:${(dns / Math.max(1, ups + dns)) * 100}%"></i></div><span><b class="up">涨 ${ups}</b> / <b class="down">跌 ${dns}</b></span><small>行情随机生成，以上数据仅供参考</small>`;
    // 进行中的竞猜
    const b = m.bet, lv = $('#btLive');
    if (b) { const left = Math.max(0, (b.endAt - Date.now() - skew) / 1000), y = mk(b.id), now = y ? y.price : b.start, dd = now - b.start, ahead = b.dir === 'up' ? dd > 0 : dd < 0, C = 2 * Math.PI * 15;
      lv.hidden = false; lv.className = 'bt-live ' + (ahead ? 'ahead' : dd === 0 ? '' : 'behind');
      lv.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - left / 10)}"/></svg><b class="bt-s">${Math.ceil(left)}</b><div><b>进行中：${b.dir === 'up' ? '看涨' : '看跌'} ${meta(b.id).name} ${fmt(b.stake)}</b><small>开仓 ${px({ price: b.start })} → 现在 ${px({ price: now })}（${dd >= 0 ? '+' : ''}${((now / b.start - 1) * 100).toFixed(2)}%）· ${dd === 0 ? '持平' : ahead ? '✅ 暂时领先' : '❌ 暂时落后'}</small></div>`;
    } else lv.hidden = true;
    // 战绩
    const n = H.length, w = H.filter((r) => r.win).length, pnl = H.reduce((s3, r) => s3 + r.pnl, 0);
    let streak = 0; for (let i = n - 1; i >= 0 && H[i].win === (H[n - 1] || {}).win; i--) streak++;
    $('#btRec').innerHTML = n ? `<div class="bt-rh"><b>我的竞猜记录</b><span>${n} 次 · 命中率 ${Math.round((w / n) * 100)}% · 净盈亏 <b class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))}</b>${n >= 2 ? ` · ${H[n - 1].win ? '🔥 连胜' : '🧊 连败'} ${streak}` : ''}</span></div><div class="bt-chips">${H.slice(-14).reverse().map((r) => `<span class="${r.win ? 'w' : 'l'}" title="${meta(r.id).name} ${fmt(r.stake)}">${r.dir === 'up' ? '▲' : '▼'} ${r.win ? '+' : '−'}${fmt(Math.abs(r.pnl))}</span>`).join('')}</div>`
      : '<div class="bt-rh"><b>我的竞猜记录</b><span>暂无竞猜记录</span></div>';
    $('#finFoot').innerHTML = `💰 现金 <b>${fmt(m.money)}</b>　🎯 本局竞猜净盈亏 <b class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))}</b>　🧾 总资产 <b>${fmt(m.worth)}</b>`;
  }

  // ---------------- 🏦 银行贷款（好用版） ----------------
  function loanShell(v, box) {
    box.innerHTML = `<div class="mk-head"><div class="fin-title"><i class="fin-ico loan">🏦</i><div><h3>银行贷款</h3><div class="muted">即时到账 · 每分钟复利 3% · 额度为总资产的 50%</div></div></div></div>
      ${guideHTML('loan')}
      <div class="ln-body"><div class="ln-left"><div class="ln-card" id="lnCard"></div><div class="ln-need" id="lnNeed"></div><div class="ln-proj" id="lnProj"></div></div>
        <div class="ln-right">
          <div class="ln-op"><div class="ln-tabs"><button data-lnside="borrow">借款</button><button data-lnside="repay">还款</button></div>
            <div class="mk-price"><input id="loanAmt" type="number" min="0" step="1" placeholder="金额"><span>M</span></div>
            <div class="mk-quick" id="lnQuick"></div><div class="bt-est" id="lnEst"></div><button class="btn big wide" id="lnGo"></button></div>
          <div class="ln-auto" id="lnAuto"></div>
          <div class="ln-stat" id="lnStat"></div></div></div>
      <div class="fin-foot" id="finFoot"></div><div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    v.side = v.side || ((me().loan || 0) > 0 && me().money > 0 ? 'repay' : 'borrow');
    const inp = $('#loanAmt'); inp.oninput = () => loanUpdate(v, me(), true); inp.onkeydown = (e) => { if (e.key === 'Enter') $('#lnGo').click(); };
    const body = box.querySelector('.ln-body');
    body.addEventListener('click', (e) => {
      const sd = e.target.closest('[data-lnside]'); if (sd) { v.side = sd.dataset.lnside; inp.value = ''; return loanUpdate(v, me()); }
      const q = e.target.closest('[data-lnq]'); if (q) { inp.value = q.dataset.lnq; return loanUpdate(v, me(), true); }
      const nd = e.target.closest('[data-lnneed]'); if (nd) return act('borrow', { amount: +nd.dataset.lnneed }, (r) => r.ok && (Snd.plus(), toast('贷款已到账，差额已补足，请完成支付')));
      const ak = e.target.closest('[data-lnkeep]'); if (ak) { $('#lnKeep').value = ak.dataset.lnkeep; return; }
      if (e.target.closest('#lnAutoGo')) { const on = !(me().autoRepay && me().autoRepay.on), keep = Math.round((+($('#lnKeep') || {}).value || 0) * 1000); return act('autoRepay', { on, keep }, (r) => r.ok && toast(on ? `已开启自动还款：现金超过 ${fmt(keep)} 的部分自动还贷` : '已关闭自动还款')); }
    });
    $('#lnGo').onclick = () => { const k = amt('loanAmt'); if (!k) { toast('请输入金额'); inp.focus(); return; } act(v.side === 'borrow' ? 'borrow' : 'repay', { amount: k }, (r) => { if (r.ok) { Snd.beep(); toast(v.side === 'borrow' ? `已借入 ${fmt(k)}` : '还款成功'); inp.value = ''; } }); };
    loanUpdate(v, me());
  }
  function loanUpdate(v, m, onlyOp) {
    if (!m || !$('#lnCard')) return;
    const loan = Math.round(m.loan || 0), nw = m.worth, cap = Math.max(1, Math.round((nw + loan) * 0.5)), lim = Math.max(0, cap - loan), perMin = Math.round(loan * 0.03), cash = Math.max(0, m.money);
    document.querySelectorAll('[data-lnside]').forEach((b) => b.classList.toggle('on', b.dataset.lnside === v.side));
    const k = amt('loanAmt'), q = v.side === 'borrow' ? [[0.25, '额度 25%'], [0.5, '额度 50%'], [1, '全部额度']].map(([f, n]) => [NICEK(lim * f), n]) : [[0.5, '偿还 50%'], [1, '全部还清']].map(([f, n]) => [Math.min(cash, Math.ceil(loan * f)), n]).concat([[cash, '以全部现金偿还']]);
    $('#lnQuick').innerHTML = q.map(([val, n]) => `<button data-lnq="${Math.floor(val / 1000)}" ${val <= 0 ? 'disabled' : ''}>${n} ${fmt(Math.floor(val / 1000) * 1000)}</button>`).join('');
    $('#lnEst').innerHTML = v.side === 'borrow' ? (k ? `借入后贷款余额 ${fmt(loan + k)}，每分钟利息约 <b class="down">${fmt(Math.round((loan + k) * 0.03))}</b>${k > lim ? ' · <b class="down">超出可借额度</b>' : ''}` : `可借额度 <b>${fmt(lim)}</b>`) : (k ? `还款后剩余贷款 ${fmt(Math.max(0, loan - Math.min(k, cash)))}，每分钟利息减少约 ${fmt(Math.round(Math.min(k, cash, loan) * 0.03))}` : loan ? `当前贷款 ${fmt(loan)} · 现金 ${fmt(m.money)}` : '您当前没有贷款');
    const go = $('#lnGo'); go.className = 'btn big wide ' + (v.side === 'borrow' ? 'ln-b' : 'ln-r'); go.textContent = v.side === 'borrow' ? '申请贷款' : '确认还款'; go.disabled = v.side === 'repay' && !loan;
    if (onlyOp) return;
    const ratio = nw > 0 ? loan / (nw + loan) : loan ? 1 : 0, risk = ratio < 0.2 ? ['低风险', 'ok'] : ratio < 0.4 ? ['中风险', 'mid'] : ['高风险', 'bad'];
    $('#lnCard').innerHTML = `<div class="muted">当前贷款余额</div><div class="loan-big">${fmt(loan)}</div>
      <div class="ln-bar"><i style="width:${Math.min(100, (loan / cap) * 100)}%"></i></div><div class="ln-cap">已用额度 ${fmt(loan)} / ${fmt(cap)} · 可借额度 <b>${fmt(lim)}</b></div>
      <div class="ln-kv"><span>每分钟利息<b>${loan ? '+' + fmt(perMin) : '0'}</b></span><span>负债率<b class="r-${risk[1]}">${Math.round(ratio * 100)}% · ${risk[0]}</b></span></div>`;
    // 欠款时一键补足
    const pd = S.pending, owe = pd && pd.kind === 'pay' && pd.payer === myId ? pd.amount - m.money : m.money < 0 ? -m.money : 0;
    $('#lnNeed').innerHTML = owe > 0 ? `<div class="ln-owe">⚠️ 您需支付 <b>${fmt(pd && pd.payer === myId ? pd.amount : -m.money)}</b>，现金尚缺 <b>${fmt(owe)}</b>${owe <= lim ? `<button class="btn primary" data-lnneed="${NICEK(owe + 999)}">贷款补足 ${fmt(NICEK(owe + 999))}</button>` : `<small>差额超过可借额度 ${fmt(lim)}，请先出售房屋、抵押地产或卖出股票</small>`}</div>` : '';
    // 不还的话会涨到多少
    $('#lnProj').innerHTML = loan ? `<div class="fd-label">若不偿还</div><table>${[5, 10, 20, 30].map((t) => { const f = loan * Math.pow(1.03, t); return `<tr><td>${t} 分钟后</td><td><b>${fmt(Math.round(f))}</b></td><td class="down">利息 +${fmt(Math.round(f - loan))}</td></tr>`; }).join('')}</table>` : `<div class="ln-tip">💡 贷款适用于可快速收回成本的用途，例如集齐同色组并建造房屋，房屋每秒收益通常可在数分钟内覆盖利息。不建议借款参与竞猜。</div>`;
    // 自动还款
    const ar = m.autoRepay || {}, keepNow = ar.keep || NICEK(Math.max(100000, cash));
    const ka = $('#lnKeep'), keepVal = ka && document.activeElement === ka ? ka.value : keepNow / 1000;
    const la = $('#lnAuto'), lk = JSON.stringify([!!ar.on, ar.keep || 0, !!loan]);
    if (la._k !== lk) la._k = lk, la.innerHTML = `<div class="ln-ah"><b>🔁 自动还款</b><button class="sw ${ar.on ? 'on' : ''}" id="lnAutoGo" title="开 / 关"><i></i></button></div>
      <div class="muted">现金超过保留金额时，超出部分将每秒自动用于偿还贷款</div>
      <div class="ln-keep"><span>保留现金</span><div class="mk-price"><input id="lnKeep" type="number" min="0" step="1" value="${keepVal}"><span>M</span></div></div>
      <div class="mk-quick">${[100000, 300000, 1000000].map((x) => `<button data-lnkeep="${x / 1000}">${fmt(x)}</button>`).join('')}</div>
      ${ar.on ? `<div class="ln-on">✅ 已开启：现金超过 ${fmt(ar.keep)} 的部分将自动用于还款${loan ? '' : '（当前无贷款）'}</div>` : ''}`;
    const s4 = m.st || {};
    $('#lnStat').innerHTML = `<span>本局累计借款<b>${fmt(s4.loanTaken || 0)}</b></span><span>已偿还<b>${fmt(s4.loanRepaid || 0)}</b></span><span>已付利息<b class="down">${fmt(Math.round(s4.interest || 0))}</b></span>`;
    $('#finFoot').innerHTML = `💰 现金 <b>${fmt(m.money)}</b>　🏦 贷款 <b>${fmt(loan)}</b>　🧾 总资产 <b>${fmt(m.worth)}</b>（已扣除贷款）`;
  }

  // ---------------- 股票交易所（专业版）：K 线 + 均线 + 成交量 + 持仓成本与盈亏 ----------------
  const UP = '#E5383B', DN = '#1E9B4D';
  const ma = (arr, n) => arr.map((_, i) => (i + 1 < n ? null : arr.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));
  const pct = (a, b) => (b ? (a / b - 1) * 100 : 0);
  const sgn = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  const idx = () => { const v = AS.map((a) => { const x = mk(a.id); return x ? x.price / (a.base * (S.infl || 1)) : 1; }); return (v.reduce((a, b) => a + b, 0) / v.length) * 1000; };
  const idx0 = () => { const v = AS.map((a) => { const x = mk(a.id); return x && x.hist.length ? x.hist[0] / (a.base * (S.infl || 1)) : 1; }); return (v.reduce((a, b) => a + b, 0) / v.length) * 1000; };
  function kSVG(x, mode, W, H) {
    const VH = 36, PH = H - VH - 8, k = mode === 'k' && x.k && x.k.length ? x.k : null;
    const series = k ? k : x.hist.map((v, i, a) => [i ? a[i - 1] : v, v, v, v, 0]);
    const n = Math.max(series.length, mode === 'k' ? 24 : 2), lo0 = Math.min(...series.map((c) => c[2])), hi0 = Math.max(...series.map((c) => c[1])), pad = (hi0 - lo0 || hi0 * 0.01) * 0.12;
    const lo = lo0 - pad, hi = hi0 + pad, Y = (v) => (PH - ((v - lo) / (hi - lo)) * PH).toFixed(1), cw = W / n, X = (i) => (i + 0.5) * cw;
    const vmax = Math.max(1, ...series.map((c) => c[4]));
    let g = '';
    for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3, y = Y(v); g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="kg"/><text x="${W - 2}" y="${+y - 3}" text-anchor="end" class="kl">${finPx({ price: v })}</text>`; }
    let body = '';
    if (k) {
      k.forEach((c, i) => { const up = c[3] >= c[0], col = up ? UP : DN, x0 = X(i), bw = Math.max(2, cw * 0.62), yo = +Y(c[0]), yc = +Y(c[3]);
        body += `<line x1="${x0}" x2="${x0}" y1="${Y(c[1])}" y2="${Y(c[2])}" stroke="${col}" stroke-width="1.2"/><rect x="${(x0 - bw / 2).toFixed(1)}" y="${Math.min(yo, yc).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.2, Math.abs(yc - yo)).toFixed(1)}" fill="${up ? '#fff' : col}" stroke="${col}" stroke-width="1.2" rx=".6"/>`;
        const vh = (c[4] / vmax) * VH; body += `<rect x="${(x0 - bw / 2).toFixed(1)}" y="${(H - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${col}" opacity=".45"/>`; });
      const cl = k.map((c) => c[3]), line = (arr, col) => { const pts = arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v)}`)).filter(Boolean); return pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>` : ''; };
      body += line(ma(cl, 5), '#F59E0B') + line(ma(cl, 10), '#7C4DFF');
    } else {
      const h = x.hist, up = h[h.length - 1] >= h[0], col = up ? UP : DN, pts = h.map((v, i) => `${((i / Math.max(1, h.length - 1)) * W).toFixed(1)},${Y(v)}`).join(' ');
      body += `<polygon points="0,${PH} ${pts} ${W},${PH}" fill="${col}" opacity=".1"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/><line x1="0" x2="${W}" y1="${Y(h[0])}" y2="${Y(h[0])}" class="kref"/>`;
    }
    const last = series[series.length - 1][3], ly = Y(last), lup = last >= series[0][0];
    body += `<line x1="0" x2="${W}" y1="${ly}" y2="${ly}" class="klast" stroke="${lup ? UP : DN}"/><rect x="${W - 56}" y="${+ly - 9}" width="56" height="18" rx="5" fill="${lup ? UP : DN}"/><text x="${W - 28}" y="${+ly + 4}" text-anchor="middle" class="ktag">${finPx({ price: last })}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="ksvg" data-n="${n}" data-cw="${cw}">${g}${body}<line class="kx" x1="0" x2="0" y1="0" y2="${H}" style="display:none"/></svg>`;
  }
  function stockShell(v, box) {
    v.side = v.side || 'buy'; v.mode = v.mode || 'k';
    box.innerHTML = `<div class="sx-head"><div class="fin-title"><i class="fin-ico stock">📈</i><div><h3>股票交易所</h3><div class="muted">行情每 2 秒更新 · 每根 K 线 10 秒 · 红涨绿跌 · 手续费 0.3%</div></div></div><div class="sx-idx" id="sxIdx"></div></div>
      ${guideHTML('stock')}
      <div class="sx-body"><div class="sx-list" id="sxList"></div>
        <div class="sx-main"><div class="sx-q" id="sxQ"></div>
          <div class="sx-tabs"><button data-sxmode="line">分时</button><button data-sxmode="k">K 线</button><span class="sx-leg"><i style="background:#F59E0B"></i>MA5 <i style="background:#7C4DFF"></i>MA10</span><span class="sx-tip" id="sxTip"></span></div>
          <div class="sx-chart" id="sxChart"></div>
          <div class="sx-pos" id="sxPos"></div>
          <div class="sx-order"><div class="sx-side"><button data-sxside="buy">买入</button><button data-sxside="sell">卖出</button></div>
            <div class="mk-price"><input id="sxAmt" type="number" min="0" step="1" placeholder="金额"><span>M</span></div>
            <div class="mk-quick" id="sxQuick"></div><div class="sx-est" id="sxEst"></div>
            <button class="btn big wide" id="sxGo"></button></div>
        </div></div>
      <div class="fin-foot" id="finFoot"></div><div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    const amtIn = $('#sxAmt'); amtIn.oninput = () => stockUpdate(v, me(), true);
    amtIn.onkeydown = (e) => { if (e.key === 'Enter') $('#sxGo').click(); };
    box.querySelector('.sx-body').addEventListener('click', (e) => {
      const r = e.target.closest('[data-sxsel]'); if (r) { v.sel = r.dataset.sxsel; return stockUpdate(v, me()); }
      const md = e.target.closest('[data-sxmode]'); if (md) { v.mode = md.dataset.sxmode; return stockUpdate(v, me()); }
      const sd = e.target.closest('[data-sxside]'); if (sd) { v.side = sd.dataset.sxside; amtIn.value = ''; return stockUpdate(v, me()); }
      const q = e.target.closest('[data-sxq]'); if (q) { amtIn.value = q.dataset.sxq; return stockUpdate(v, me(), true); }
    });
    $('#sxGo').onclick = () => {
      const k = Math.round((+amtIn.value || 0) * 1000); if (!k) { toast('请输入金额'); amtIn.focus(); return; }
      act('trade', { id: v.sel, side: v.side, amount: k }, (r) => { if (r.ok) { Snd.beep(); toast(v.side === 'buy' ? `已买入 ${meta(v.sel).name} ${fmt(k)}` : `已卖出 ${meta(v.sel).name}`); amtIn.value = ''; } });
    };
    // 十字光标：显示鼠标所在那根 K 线的 开/高/低/收
    const ch = $('#sxChart');
    ch.addEventListener('mousemove', (e) => {
      const sv = ch.querySelector('svg'), x = mk(v.sel); if (!sv || !x) return;
      const r = sv.getBoundingClientRect(), W = 600, px = ((e.clientX - r.left) / r.width) * W, cw = +sv.dataset.cw, i = Math.floor(px / cw), line = sv.querySelector('.kx');
      const k = v.mode === 'k' && x.k ? x.k : null, c = k ? k[i] : null, tip = $('#sxTip');
      if (!c && !(v.mode !== 'k' && x.hist[Math.round((px / W) * (x.hist.length - 1))])) { line.style.display = 'none'; tip.textContent = ''; return; }
      line.style.display = ''; line.setAttribute('x1', px); line.setAttribute('x2', px);
      if (c) tip.innerHTML = `开 ${finPx({ price: c[0] })} 高 ${finPx({ price: c[1] })} 低 ${finPx({ price: c[2] })} 收 <b style="color:${c[3] >= c[0] ? UP : DN}">${finPx({ price: c[3] })}</b> 量 ${c[4]}`;
      else { const hv = x.hist[Math.round((px / W) * (x.hist.length - 1))]; tip.innerHTML = `价格 <b>${finPx({ price: hv })}</b>`; }
    });
    ch.addEventListener('mouseleave', () => { const l = ch.querySelector('.kx'); if (l) l.style.display = 'none'; $('#sxTip').textContent = ''; });
    stockUpdate(v, me());
  }
  function stockUpdate(v, m, onlyOrder) {
    if (!m || !$('#sxList')) return;
    if (!AS.some((a) => a.id === v.sel)) v.sel = AS[0].id;
    const x = mk(v.sel), a = meta(v.sel), hold = (m.hold || {})[v.sel] || 0, val = hold * x.price, cost = ((m.cost || {})[v.sel]) || 0, pl = val - cost;
    const amtIn = $('#sxAmt'), k = Math.round((+amtIn.value || 0) * 1000), fee = 0.003;
    // 下单区
    document.querySelectorAll('[data-sxside]').forEach((b) => b.classList.toggle('on', b.dataset.sxside === v.side));
    const base = v.side === 'buy' ? Math.max(0, m.money) : val;
    $('#sxQuick').innerHTML = [[0.25, '1/4'], [0.5, '1/2'], [1, v.side === 'buy' ? '全部现金' : '全部持仓']].map(([f, n]) => `<button data-sxq="${Math.floor((base * f) / 1000)}" ${base <= 0 ? 'disabled' : ''}>${n} ${fmt(Math.floor(base * f))}</button>`).join('');
    $('#sxEst').innerHTML = k ? (v.side === 'buy' ? `预计买入 ${((k * (1 - fee)) / x.price).toFixed(2)} 份 · 手续费 ${fmt(Math.round(k * fee))}${k > m.money ? ' · <b class="down">现金不足</b>' : ''}` : `预计卖出 ${(Math.min(k, val) / x.price).toFixed(2)} 份 · 到账 ${fmt(Math.round(Math.min(k, val) * (1 - fee)))}${k > val ? ' · 超出持仓部分将按全部持仓卖出' : ''}`) : `可用现金 ${fmt(m.money)} · 持仓市值 ${fmt(Math.round(val))}`;
    const go = $('#sxGo'); go.className = 'btn big wide ' + (v.side === 'buy' ? 'sx-buy' : 'sx-sell'); go.textContent = `${v.side === 'buy' ? '买入' : '卖出'} ${a.name}`;
    if (onlyOrder) return;
    // 指数
    const I = idx(), I0 = idx0(), ip = pct(I, I0);
    $('#sxIdx').innerHTML = `<small>世界综合指数</small><b class="${ip >= 0 ? 'up' : 'down'}">${I.toFixed(1)}</b><span class="${ip >= 0 ? 'up' : 'down'}">${sgn(ip)}%</span>`;
    // 自选列表
    $('#sxList').innerHTML = AS.map((s2) => { const y = mk(s2.id), c = chg(y), h = (m.hold || {})[s2.id], cv = h ? h * y.price - ((m.cost || {})[s2.id] || 0) : 0; return `<div class="sx-row ${v.sel === s2.id ? 'on' : ''}" data-sxsel="${s2.id}"><div class="sx-n"><b>${s2.name}</b><small>${s2.id}${h ? ` · <span class="${cv >= 0 ? 'up' : 'down'}">持仓 ${cv >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(cv)))}</span>` : ''}</small></div>${spark(y.hist, 56, 24)}<div class="sx-p"><b>${finPx(y)}</b><small class="${c >= 0 ? 'up' : 'down'}">${sgn(c)}%</small></div></div>`; }).join('');
    // 报价头
    const K = x.k || [], cur = K[K.length - 1] || [x.price, x.price, x.price, x.price, 0], open = K.length ? K[0][0] : x.hist[0], hi = Math.max(...x.hist), lo = Math.min(...x.hist), c = pct(x.price, x.hist[0]), d = x.price - x.hist[0], vol = K.reduce((s3, c2) => s3 + c2[4], 0);
    $('#sxQ').innerHTML = `<div class="sx-qn"><b>${a.name}</b><small>${a.id} · 波动率 ${(a.vol * 100).toFixed(1)}%</small></div><div class="sx-qp ${c >= 0 ? 'up' : 'down'}"><b>${finPx(x)}</b><span>${c >= 0 ? '▲' : '▼'} ${sgn(d)} (${sgn(c)}%)</span></div>
      <div class="sx-qs"><span>今开 <b>${finPx({ price: open })}</b></span><span>最高 <b class="up">${finPx({ price: hi })}</b></span><span>最低 <b class="down">${finPx({ price: lo })}</b></span><span>成交量 <b>${vol >= 10000 ? (vol / 10000).toFixed(1) + '万' : vol}</b></span><span>本根 K 线 <b class="${cur[3] >= cur[0] ? 'up' : 'down'}">${sgn(pct(cur[3], cur[0]))}%</b></span></div>`;
    document.querySelectorAll('[data-sxmode]').forEach((b) => b.classList.toggle('on', b.dataset.sxmode === v.mode));
    $('#sxChart').innerHTML = kSVG(x, v.mode, 600, 210);
    // 持仓
    const real = (m.st && m.st.stockReal) || 0, tv = AS.reduce((s3, s2) => s3 + ((m.hold || {})[s2.id] || 0) * mk(s2.id).price, 0), tc = AS.reduce((s3, s2) => s3 + (((m.cost || {})[s2.id]) || 0), 0);
    $('#sxPos').innerHTML = hold ? `<div><small>持仓市值</small><b>${fmt(Math.round(val))}</b></div><div><small>持仓成本</small><b>${fmt(Math.round(cost))}</b></div><div><small>浮动盈亏</small><b class="${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(pl)))}</b></div><div><small>收益率</small><b class="${pl >= 0 ? 'up' : 'down'}">${sgn(cost ? (pl / cost) * 100 : 0)}%</b></div>`
      : `<div class="sx-empty">您尚未持有 ${a.name}。可在下方输入金额买入，价格上涨后卖出即可获得差价收益。</div>`;
    $('#finFoot').innerHTML = `💰 现金 <b>${fmt(m.money)}</b>　📊 股票总市值 <b>${fmt(Math.round(tv))}</b>　📈 总浮动盈亏 <b class="${tv - tc >= 0 ? 'up' : 'down'}">${tv - tc >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(tv - tc)))}</b>　✅ 已实现盈亏 <b class="${real >= 0 ? 'up' : 'down'}">${real >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(real)))}</b>`;
  }

  // ---------------- 涨跌竞猜：进行中的浮动胶囊 + 10 秒结算全屏报告 ----------------
  setInterval(() => {
    if (document.hidden) return;
    const m = S && S.phase === 'play' && me(), b = m && m.bet; let el = $('#betPill');
    if (!b) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'betPill'; document.body.appendChild(el); }
    const left = Math.max(0, (b.endAt - Date.now() - skew) / 1000), x = mk(b.id), now = x ? x.price : b.start, d = now - b.start, ahead = b.dir === 'up' ? d > 0 : d < 0;
    const C = 2 * Math.PI * 15, off = C * (1 - left / 10);
    el.className = 'show ' + (b.dir === 'up' ? 'long' : 'short');
    el.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${off}"/></svg><span class="bp-s">${Math.ceil(left)}</span>
      <div class="bp-t"><b>${b.dir === 'up' ? '看涨 · 做多' : '看跌 · 做空'}</b><small>${meta(b.id).name} · 本金 ${fmt(b.stake)}</small></div>
      <div class="bp-px"><b class="${d >= 0 ? 'up' : 'down'}">${px({ price: now })}</b><small class="${ahead ? 'ok' : d === 0 ? '' : 'no'}">${d === 0 ? '持平' : ahead ? '当前盈利' : '当前亏损'}</small></div>`;
  }, 500);

  window.showBetResult = (f) => {
    const a = meta(f.id), win = f.win, long = f.dir === 'up', flat = f.end === f.start, pct = (f.end / f.start - 1) * 100, pnl = win ? f.payout - f.stake : -f.stake;
    const sub = win ? (long ? '看涨判断正确 · 多头头寸获利了结' : '看跌判断正确 · 空头头寸获利了结')
      : flat ? '结算价与开仓价持平 · 未形成有效波动，按未命中结算' : long ? '标的价格下行，与看涨方向相反 · 头寸止损平仓' : '标的价格上行，与看跌方向相反 · 头寸止损平仓';
    // 10 秒分时走势：虚线为开仓价
    const P = f.path && f.path.length > 1 ? f.path : [f.start, f.end], W = 300, H = 84, lo = Math.min(...P), hi = Math.max(...P), r = hi - lo || hi * 0.001 || 1;
    const Y = (v) => (H - 10 - ((v - lo) / r) * (H - 20)).toFixed(1), X = (i) => ((i / (P.length - 1)) * (W - 12) + 4).toFixed(1);
    const line = P.map((v, i) => `${X(i)},${Y(v)}`).join(' '), col = f.end >= f.start ? '#E5383B' : '#2DA44E';
    const chart = `<svg viewBox="0 0 ${W} ${H}" class="br-svg"><defs><linearGradient id="brg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${Y(f.start)}" y2="${Y(f.start)}" class="br-entry"/><text x="${W - 4}" y="${f.end >= f.start ? +Y(f.start) + 13 : +Y(f.start) - 6}" text-anchor="end" class="br-lbl">开仓价 ${px({ price: f.start })}</text>
      <polygon points="${X(0)},${H} ${line} ${X(P.length - 1)},${H}" fill="url(#brg)"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" class="br-line"/>
      <circle cx="${X(P.length - 1)}" cy="${Y(f.end)}" r="5" fill="${col}" class="br-dot"/></svg>`;
    const old = $('#betRes'); if (old) old.remove();
    const o = document.createElement('div'); o.id = 'betRes'; o.className = win ? 'win' : 'lose';
    o.innerHTML = `${win ? '<div class="br-rays"></div>' : ''}<div class="br-card">
      <div class="br-badge"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="br-c"/>${win ? '<path d="M24 41l11 11 22-24" class="br-m"/>' : '<path d="M28 28l24 24M52 28L28 52" class="br-m"/>'}</svg></div>
      <div class="br-kick">涨跌竞猜 · 10 秒结算报告</div>
      <h2>${win ? '恭喜 · 预测命中' : '很遗憾 · 预测未命中'}</h2>
      <div class="br-sub">${sub}</div>
      <div class="br-chart">${chart}</div>
      <div class="br-grid">
        <div><small>标的</small><b>${a.name}</b></div><div><small>方向</small><b>${long ? '看涨 · 做多' : '看跌 · 做空'}</b></div>
        <div><small>开仓价</small><b>${px({ price: f.start })}</b></div><div><small>结算价</small><b class="${f.end >= f.start ? 'up' : 'down'}">${px({ price: f.end })}</b></div>
        <div><small>区间涨跌幅</small><b class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</b></div><div><small>投注本金</small><b>${fmt(f.stake)}</b></div>
      </div>
      <div class="br-pnl"><small>本笔盈亏</small><b id="brPnl">${pnl > 0 ? '+' : '−'}${fmt(0)}</b><span>${win ? `收益率 +90% · 结算入账 ${fmt(f.payout)}（本金 ${fmt(f.stake)} + 收益 ${fmt(pnl)}）` : '收益率 −100% · 本金已全部亏损'}</span></div>
      <div class="br-foot">${win ? '资金已实时划入您的现金账户' : '市场有风险，投资需谨慎'}　·　点按任意位置关闭</div></div>`;
    document.body.appendChild(o);
    const close = () => { if (!o.isConnected) return; o.classList.add('out'); setTimeout(() => o.remove(), 350); };
    o.onclick = close; setTimeout(close, 5200);
    const card = o.querySelector('.br-card');
    card.animate([{ transform: 'perspective(900px) translateY(40px) scale(.72) rotateX(28deg)', opacity: 0 }, { transform: 'perspective(900px) translateY(-6px) scale(1.03) rotateX(-4deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.25,1)' });
    // 盈亏数字滚动
    const pe = o.querySelector('#brPnl'), abs = Math.abs(pnl), t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0 - 450) / 900), e = k <= 0 ? 0 : 1 - Math.pow(1 - k, 3); pe.textContent = (pnl > 0 ? '+' : '−') + fmt(Math.round((abs * e) / 10) * 10); if (k < 1 && o.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (win) {
      Snd.chord([523, 659, 784], 0.25, 'triangle', 0.05); Snd.win(); [1568, 2093, 2637].forEach((fq, i) => Snd.tone(fq, 0.3, 'sine', 0.05, 0.6 + i * 0.09));
      setTimeout(() => { confetti(); const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + 70; for (let i = 0; i < 28; i++) { const d = document.createElement('div'); d.className = 'coin'; d.textContent = i % 4 ? '🪙' : '✨'; d.style.left = cx + 'px'; d.style.top = cy + 'px'; d.style.zIndex = 320; $('#floats').appendChild(d); const ang = Math.random() * Math.PI * 2, rr = 160 + Math.random() * 240; d.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * rr}px), calc(-50% + ${Math.sin(ang) * rr + 90}px)) scale(1.3) rotate(${Math.random() * 540}deg)`, opacity: 0 }], { duration: 1000 + Math.random() * 700, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => d.remove(); } }, 520);
    } else {
      Snd.sweep(420, 110, 0.8, 'sawtooth', 0.05); Snd.tone(98, 0.6, 'sine', 0.12, 0.1);
      setTimeout(() => card.animate([{ translate: '0 0' }, { translate: '-10px 0' }, { translate: '9px 0' }, { translate: '-6px 0' }, { translate: '4px 0' }, { translate: '0 0' }], 420), 560);
    }
  };

  // ---------------- 右侧面板放大详情 ----------------
  function expandHTML(kind) {
    const m = me();
    if (kind === 'players') return `<h3>👥 玩家详情</h3><div class="xp-table">${S.players.map((p) => {
      const props = Object.keys(S.props).filter((k) => S.props[k].owner === p.id), houses = props.reduce((n, k) => n + S.props[k].houses, 0), t = S.tasks[p.id];
      return `<div class="xp-row ${p.won ? 'won' : p.bankrupt ? 'dead' : ''}">${avatar(p)}<div class="xp-who"><b>${esc(p.name)}</b>${p.host ? ' <span class="badge">房主</span>' : ''}${p.won ? ' <span class="badge crown">👑 成为富翁</span>' : p.bankrupt ? ' <span class="badge jail">破产</span>' : ''}${!p.connected ? ' <span class="badge off">离线</span>' : ''}<small>${t ? (t.done ? '✅ ' : '🎯 ') + t.text : ''}</small></div>
        <div class="xp-nums"><span>现金<b>${fmt(p.money)}</b></span><span>总资产<b>${fmt(p.won ? p.wonWorth : p.worth)}</b></span><span>地产<b>${props.length} 块 · ${houses} 栋</b></span><span>股票<b>${fmt(p.hv || 0)}</b></span><span>贷款<b>${fmt(Math.round(p.loan || 0))}</b></span>${p.w ? `<span>钱包<b>💳${fmt(p.w.card)} 📱${fmt(p.w.phone)} 💵${fmt(p.w.cash)}</b></span>` : ''}</div>
        ${p.id !== myId && !p.bankrupt ? `<div class="xp-ops"><button class="btn sm" data-xpsend="${p.id}">💬 互动</button>${m && m.host ? `<button class="btn sm danger" data-kick="${p.id}">移出</button>` : ''}</div>` : ''}</div>`;
    }).join('')}</div>`;
    if (kind === 'assets') {
      const list = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === myId);
      return `<h3>🏠 持有地产</h3><div class="xp-table">${list.map((i) => { const sq = BOARD[i], st = S.props[i]; return `<div class="xp-row" data-deed="${i}" style="cursor:pointer"><i class="xp-dot" style="background:${sqColor(i)}"></i><div class="xp-who"><b>${sq.name}</b><small>${sq.en || ''}${st.mortgaged ? ' · 已抵押' : ''}</small></div><div class="xp-nums"><span>现价<b>${fmt(priceOf(i))}</b></span><span>房屋<b>${st.houses === 5 ? '酒店' : st.houses + ' 栋'}</b></span>${sq.type === 'prop' ? `<span>每秒收益<b>+${fmt(Math.round(incomePerSec(i, st.houses) * INF()))}</b></span>` : ''}</div></div>`; }).join('') || '<div class="mk-empty">暂无地产</div>'}</div>`;
    }
    if (kind === 'log') return `<h3>🧾 对局记录</h3><div class="xp-log">${S.log.slice().reverse().map((l) => `<div><small>${new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false })}</small>${esc(l.msg)}</div>`).join('')}</div>`;
    return `<h3>⏱ 对局信息</h3><div class="xp-info"><div>已用时 <b>${$('#elapsed').textContent}</b></div><div>通胀阶段 <b>第 ${S.stage + 1} 阶段</b></div><div>地价 / 房价指数 <b>×${Math.round((S.pinfl || 1) * 100) / 100}（每分钟 +1%）</b></div><div>租金 / 工资 / 收益 <b>×${Math.round(S.infl * 100) / 100}</b></div><div>建材紧缺系数 <b>×${Math.round((S.scarcity || 1) * 100) / 100}</b></div><div>当前地产税率 <b>${Math.round((S.taxRate || 0.04) * 1000) / 10}%（经过起点时缴纳）</b></div><div>首富目标 <b>总资产 ${fmt(RULES.winCash)}</b></div><div>已胜出 <b>${S.rich.length} 人</b></div><div>银行剩余 <b>${S.housesLeft} 栋房屋 · ${S.hotelsLeft} 座酒店</b></div></div>
      <div class="muted" style="line-height:1.8;margin-top:10px">· 每 10 分钟发生一次通货膨胀：地价、房价 ×1.7；租金、工资、卡牌奖惩 ×1.5；此外地价、房价每分钟上涨 1%<br>· 同一地产的建造成本逐级递增（第 2 栋 ×1.3、第 3 栋 ×1.7、第 4 栋 ×2.2、酒店 ×3）；全场房屋总数越多，建材越紧缺（最高额外 ×2）<br>· 经过起点 / 环球中心：领取工资，同时按地产现值缴纳地产税（第 1 阶段 4%，每次通胀 +1.5%，最高 16%）<br>· 亦可在地产交易所以 3 倍价格远程购买银行持有的地产</div>`;
  }
  let expandKind = '';
  function openExpand(kind, from) {
    expandKind = kind; openLocal({ type: 'expand' });
    const box = $('#localBox'), to = box.getBoundingClientRect();
    if (!from) return;
    box.style.animation = 'none';
    box.animate([{ transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.5, borderRadius: '16px' }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)' });
  }
  window.refreshExpand = () => { if (localView && localView.type === 'expand') { const b = $('#localBox'), y = (b.querySelector('.xp-table, .xp-log') || {}).scrollTop; b.innerHTML = expandHTML(expandKind) + '<div class="act-row"><button class="btn wide" data-close>收起</button></div>'; const sc = b.querySelector('.xp-table, .xp-log'); if (sc && y) sc.scrollTop = y; } };

  // ---------------- 对局复盘清单 ----------------
  const hms = (ms) => { const t = Math.max(0, Math.round((ms || 0) / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s2 = t % 60, p2 = (x) => String(x).padStart(2, '0'); return h ? `${h}:${p2(m)}:${p2(s2)}` : `${m}:${p2(s2)}`; };
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(Math.round(v || 0)));
  const pn = (id) => { const p = pById(id); return p ? esc(p.name) : '?'; };
  function tips(x) {
    const s = x.st || {}, out = [];
    if (x.won) out.push(`✅ 于 ${hms(x.wonAt)} 达成 ${fmt(S.recap.goal)} 目标，以第 ${x.won} 名胜出`);
    if (x.out) out.push(`❌ 于 ${hms(x.outAt)} 出局：${esc(x.outWhy || '')}`);
    if ((s.rentOut || 0) > (s.rentIn || 0) * 2 && s.rentOut > 0) out.push(`⚠️ 租金支出（${fmt(s.rentOut)}）为租金收入的 ${s.rentIn ? (s.rentOut / s.rentIn).toFixed(1) + ' 倍' : '数倍'}，建议优先集齐同色组并建造房屋`);
    if (!s.builds) out.push('⚠️ 本局未建造房屋：房屋每秒收益是中后期最主要的收入来源');
    else if ((s.houseIncome || 0) > (s.buildSpent || 0)) out.push(`👍 建房投入 ${fmt(s.buildSpent)}，每秒收益累计 ${fmt(s.houseIncome)}，已收回成本`);
    if ((s.interest || 0) > 0) out.push(`⚠️ 累计支付贷款利息约 ${fmt(s.interest)}，建议在现金充裕时尽早还款`);
    if (x.bet < 0) out.push(`⚠️ 涨跌竞猜净亏损 ${fmt(-x.bet)}（${s.bets || 0} 次，命中 ${s.betWins || 0} 次）`);
    else if (x.bet > 0) out.push(`👍 涨跌竞猜净收益 ${fmt(x.bet)}（${s.bets || 0} 次，命中 ${s.betWins || 0} 次）`);
    if (x.stock < 0) out.push(`⚠️ 股票净亏损 ${fmt(-x.stock)}`); else if (x.stock > 0) out.push(`👍 股票净收益 ${fmt(x.stock)}`);
    if ((s.tax || 0) > (s.salary || 0) && s.tax > 0) out.push(`⚠️ 税费支出 ${fmt(s.tax)} 超过工资收入 ${fmt(s.salary || 0)}，中后期地产税负担较重，请注意现金储备`);
    if ((s.jail || 0) >= 3) out.push(`⚠️ 入狱 ${s.jail} 次，损失了较多行动回合`);
    if (!out.length) out.push('👍 表现稳健，未发现明显失误');
    return out;
  }
  function recapHTML() {
    const R = S.recap; if (!R) return '<div class="mk-empty">暂无复盘数据</div>';
    const head = `<div class="rc-head"><div><h3>📋 对局复盘</h3><div class="muted">时长 ${hms(R.dur)} · ${R.players.length} 位玩家 · 共 ${R.rounds} 个回合 · 通胀到第 ${R.stage + 1} 阶段 · ${esc(R.why || '')}</div></div><button class="btn sm" id="rcCopy">📄 复制文本</button></div>`;
    const rank = `<div class="rc-sec"><h4>🏆 最终名次</h4><div class="rc-rank">${R.players.map((x) => `<div class="rc-r ${x.won ? 'won' : x.out ? 'out' : ''}"><b>${x.rank}</b>${avatar(x)}<span class="nm">${esc(x.name)}</span><span>${x.won ? `👑 ${hms(x.wonAt)} 达成目标` : x.out ? `💥 ${hms(x.outAt)} 出局` : '坚持至终局'}</span><span>${x.won ? '达成时' : x.out ? '出局' : '结束时'} <b>${x.out ? '0' : fmt(x.worth)}</b></span><span class="muted">最高 ${fmt(x.peak[0])}（${hms(x.peak[1])}）</span></div>`).join('')}</div></div>`;
    const chart = window.worthChart ? `<div class="rc-sec"><h4>📊 总资产走势</h4><div class="wc-wrap">${worthChart(R.players.map((x) => ({ name: x.name, color: x.color, wh: x.wh || [] })))}</div></div>` : '';
    const aw = R.awards.length ? `<div class="rc-sec"><h4>🏅 本局奖项</h4><div class="rc-aw">${R.awards.map((a) => `<div class="${a.good ? '' : 'bad'}"><b>${a.title}</b><span>${pn(a.pid)}</span><small>${/^(块地|次)/.test(a.unit) ? a.v + ' ' + a.unit : a.unit + ' ' + fmt(Math.round(a.v))}</small></div>`).join('')}</div></div>` : '';
    const cards = `<div class="rc-sec"><h4>🧾 玩家明细</h4><div class="rc-cards">${R.players.map((x) => { const s = x.st || {}; return `<div class="rc-card" style="--pc:${x.color}"><div class="rc-ch">${avatar(x)}<b>${esc(x.name)}</b><span>第 ${x.rank} 名</span></div>
      <ul>
        <li><i>🗺 地产</i>购地 ${s.buys || 0} 块、拍得 ${s.auctionsWon || 0} 块，共支出 ${fmt(s.landSpent || 0)}；建房 ${s.builds || 0} 次，支出 ${fmt(s.buildSpent || 0)}${s.hotels ? `（酒店 ${s.hotels} 座）` : ''}</li>
        <li><i>💰 收入</i>工资 ${fmt(s.salary || 0)} · 租金 ${fmt(s.rentIn || 0)}（${s.rentN || 0} 次）· 房屋每秒收益 ${fmt(s.houseIncome || 0)}${s.bonus ? ' · 分红 ' + fmt(s.bonus) : ''}${s.taskReward ? ' · 任务 ' + fmt(s.taskReward) : ''}</li>
        <li><i>💸 支出</i>租金 ${fmt(s.rentOut || 0)} · 税 ${fmt(s.tax || 0)}${s.jailFine ? ' · 保释金 ' + fmt(s.jailFine) : ''}${s.interest ? ' · 贷款利息 ' + fmt(s.interest) : ''}</li>
        <li><i>📈 金融</i>股票 ${sg(x.stock)} · 竞猜 ${s.bets || 0} 次命中 ${s.betWins || 0} 次 ${sg(x.bet)}${s.loanTaken ? ` · 贷款 ${fmt(s.loanTaken)}` : ''}</li>
        <li><i>🍀 运气</i>机会/命运/转盘 ${s.cards || 0} 张，净 ${sg(s.luck || 0)} · 相同点数 ${s.doubles || 0} 次 · 入狱 ${s.jail || 0} 次 · 经过起点 ${s.laps || 0} 次</li>
        ${s.maxIn ? `<li><i>⬆️ 最大进账</i>${fmt(s.maxIn[0])}（${esc(s.maxIn[1])}）</li>` : ''}${s.maxOut ? `<li><i>⬇️ 最大支出</i>${fmt(s.maxOut[0])}（${esc(s.maxOut[1])}）</li>` : ''}
      </ul><div class="rc-tips">${tips(x).map((t) => `<div>${t}</div>`).join('')}</div></div>`; }).join('')}</div></div>`;
    const rents = R.rents.length ? `<div class="rc-sec"><h4>🔥 本局最高租金</h4><ol class="rc-list">${R.rents.map((r) => `<li>${hms(r.t)}　${pn(r.from)} → ${pn(r.to)}　<b>${fmt(r.amt)}</b>（${esc(r.city)}）</li>`).join('')}</ol></div>` : '';
    const tl = `<div class="rc-sec"><h4>🕒 关键时刻</h4><div class="rc-tl">${R.moments.map((m) => `<div><small>${hms(m.t)}</small><span>${esc(m.text)}</span></div>`).join('')}</div></div>`;
    return head + `<div class="rc-body">${rank}${chart}${aw}${cards}${rents}${tl}</div><div class="act-row"><button class="btn wide" data-close>关闭</button></div>`;
  }
  function recapText() {
    const R = S.recap; if (!R) return '';
    const L = [`【大富翁 · 世界银行】对局复盘`, `时长 ${hms(R.dur)}｜${R.players.length} 位玩家｜${R.rounds} 个回合｜通胀第 ${R.stage + 1} 阶段｜${R.why || ''}`, '', '一、最终名次'];
    R.players.forEach((x) => L.push(`${x.rank}. ${x.name}　${x.won ? `👑 ${hms(x.wonAt)} 达成目标（${fmt(x.worth)}）` : x.out ? `💥 ${hms(x.outAt)} 出局（${x.outWhy || ''}）` : `结束时总资产 ${fmt(x.worth)}`}　最高 ${fmt(x.peak[0])}`));
    if (R.awards.length) { L.push('', '二、本局奖项'); R.awards.forEach((a) => L.push(`${a.title}：${(pById(a.pid) || {}).name || '?'}（${/^(块地|次)/.test(a.unit) ? a.v + ' ' + a.unit : a.unit + ' ' + fmt(Math.round(a.v))}）`)); }
    L.push('', '三、玩家明细');
    R.players.forEach((x) => { const s = x.st || {}; L.push(`■ ${x.name}（第 ${x.rank} 名）`, `  地产：购地 ${s.buys || 0}、拍得 ${s.auctionsWon || 0}，支出 ${fmt(s.landSpent || 0)}；建房 ${s.builds || 0} 次，支出 ${fmt(s.buildSpent || 0)}`, `  收入：工资 ${fmt(s.salary || 0)}，租金 ${fmt(s.rentIn || 0)}，房屋收益 ${fmt(s.houseIncome || 0)}`, `  支出：租金 ${fmt(s.rentOut || 0)}，税 ${fmt(s.tax || 0)}，利息 ${fmt(s.interest || 0)}`, `  金融：股票 ${sg(x.stock)}，竞猜 ${sg(x.bet)}`); tips(x).forEach((t) => L.push('  ' + t)); });
    if (R.rents.length) { L.push('', '四、最高租金'); R.rents.forEach((r, i) => L.push(`${i + 1}. ${hms(r.t)} ${(pById(r.from) || {}).name} → ${(pById(r.to) || {}).name} ${fmt(r.amt)}（${r.city}）`)); }
    L.push('', '五、关键时刻'); R.moments.forEach((m) => L.push(`${hms(m.t)}　${m.text}`));
    return L.join('\n');
  }
  window.renderExtra = (v, box) => {
    if (v.type === 'fin') {
      box.classList.add('market');
      const key = 'fin:' + v.tab; if (box.dataset.v !== key) { box.dataset.v = key; finShell(v, box); }
      finUpdate(); return true;
    }
    if (v.type === 'expand') { box.classList.add('market'); box.dataset.v = 'expand'; refreshExpand(); return true; }
    if (v.type === 'recap') {
      box.classList.add('market'); if (box.dataset.v === 'recap') return true; box.dataset.v = 'recap'; box.innerHTML = recapHTML();
      const cp = box.querySelector('#rcCopy'); if (cp) cp.onclick = () => { const t = recapText(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('复盘内容已复制'), () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('复盘内容已复制'); }); };
      return true;
    }
    return false;
  };
  window.afterRender = () => {
    renderTicker();
    if (localView && localView.type === 'fin') finUpdate();
    for (const [sel, kind] of [['#players', 'players'], ['#assets', 'assets'], ['.log-panel', 'log'], ['#clock', 'clock']]) {
      const el = $(sel); if (el && !el.querySelector(':scope > .xp-btn')) { const b = document.createElement('button'); b.className = 'xp-btn'; b.dataset.expand = kind; b.title = '展开详情'; b.textContent = '⤢'; el.appendChild(b); }
    }
  };
  document.addEventListener('toggle', (e) => { const g = e.target.closest && e.target.closest('[data-guide]'); if (g) localStorage.setItem('dfw_guide_' + g.dataset.guide, g.open ? '1' : '0'); }, true);
  document.addEventListener('click', (e) => {
    const t = e.target;
    const sel = t.closest('[data-finsel]'); if (sel && localView) { localView.sel = sel.dataset.finsel; return finUpdate(); }
    const q = t.closest('[data-finq]'); if (q) { const i = $('#finAmt'); if (i) i.value = q.dataset.finq; return; }
    const fb = t.closest('[data-fin]'); if (fb) return openFin(fb.dataset.fin);
    const tk = t.closest('[data-tick]'); if (tk && S && S.phase === 'play' && me() && !me().bankrupt) return openFin('stock', tk.dataset.tick);
    if (t.closest('#betPill')) return openFin('bet', me() && me().bet ? me().bet.id : undefined);
    if (t.closest('[data-recap]')) return openLocal({ type: 'recap' });
    const xs = t.closest('[data-xpsend]'); if (xs) return openLocal({ type: 'send', to: xs.dataset.xpsend, amount: 0 });
    const xb = t.closest('[data-expand]'); if (xb) { const pnl = xb.parentElement; return openExpand(xb.dataset.expand, pnl.getBoundingClientRect()); }
    // 点击右侧面板的空白处也可放大
    const pnl = t.closest('#side #players, #side #assets, #side .log-panel, #side #clock');
    if (pnl && !t.closest('button, .pl, .chip-p, input, a') && S && S.phase === 'play') {
      const kind = pnl.id === 'players' ? 'players' : pnl.id === 'assets' ? 'assets' : pnl.id === 'clock' ? 'clock' : 'log';
      openExpand(kind, pnl.getBoundingClientRect());
    }
  });
})();
