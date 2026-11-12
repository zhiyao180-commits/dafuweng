// 金融中心（股票 / 基金 / 外汇 / 竞猜 / 贷款）与右侧面板放大详情
(function () {
  const AS = GameData.ASSETS;
  const KIND = { stock: '股票', fund: '基金', fx: '外汇', bet: '涨跌竞猜', loan: '银行贷款' };
  const mk = (id) => (S.market || []).find((x) => x.id === id);
  const meta = (id) => AS.find((a) => a.id === id);
  const chg = (m) => (m.hist.length ? (m.price / m.hist[0] - 1) * 100 : 0);
  const px = (m) => { const a = meta(m.id); return a.kind === 'fx' ? m.price.toFixed(a.base < 1 ? 4 : 3) : m.price >= 100 ? m.price.toFixed(1) : m.price.toFixed(2); };
  const spark = (hist, w, h, fill) => {
    if (!hist || hist.length < 2) return '';
    const lo = Math.min(...hist), hi = Math.max(...hist), r = hi - lo || 1;
    const pts = hist.map((v, i) => `${((i / (hist.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
    const up = hist[hist.length - 1] >= hist[0], c = up ? '#E5383B' : '#2DA44E'; // 红涨绿跌
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">${fill ? `<polygon points="0,${h} ${pts} ${w},${h}" fill="${c}" opacity=".12"/>` : ''}<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${fill ? 2 : 1.6}" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const amt = (id) => Math.max(0, Math.round((+($('#' + id) || {}).value || 0) * 1000));

  function finShell(v, box) {
    const tabs = ['stock', 'fund', 'fx', 'bet', 'loan'];
    box.innerHTML = `<div class="mk-head"><div><h3>📈 金融中心</h3><div class="muted">行情每 2 秒更新 · 红涨绿跌 · 交易手续费 0.3% · 金融持仓计入总资产</div></div>
      <div class="mk-tabs">${tabs.map((t) => `<button data-fintab="${t}" class="${v.tab === t ? 'on' : ''}">${KIND[t]}</button>`).join('')}</div></div>
      <div class="fin-body">${v.tab === 'loan' ? '<div class="fin-loan" id="finLoan"></div>' : `<div class="fin-list" id="finList"></div><div class="fin-detail" id="finDetail"></div>`}</div>
      <div class="fin-foot" id="finFoot"></div>
      <div class="act-row"><button class="btn wide" data-close>关闭<kbd>Esc</kbd></button></div>`;
    if (v.tab === 'loan') {
      $('#finLoan').innerHTML = `<div class="loan-card"><div class="muted">当前贷款余额</div><div class="loan-big" id="loanBal"></div><div class="muted" id="loanInfo"></div></div>
        <div class="loan-ops"><div class="mk-price"><input id="loanAmt" type="number" min="0" step="1" placeholder="金额"><span>M</span></div>
        <div class="act-row"><button class="btn primary" id="loanBorrow">申请贷款</button><button class="btn" id="loanRepay">偿还</button><button class="btn" id="loanAll">全部还清</button></div>
        <div class="muted" style="line-height:1.7;margin-top:8px">· 年化利率极高：<b>每分钟复利 3%</b>，越早还越划算<br>· 贷款额度 = 总资产的一半（含已贷金额）<br>· 未还贷款会从总资产中扣除；破产时由银行清算</div></div>`;
      $('#loanBorrow').onclick = () => act('borrow', { amount: amt('loanAmt') });
      $('#loanRepay').onclick = () => act('repay', { amount: amt('loanAmt') });
      $('#loanAll').onclick = () => act('repay', { amount: 1e15 });
    } else {
      const d = $('#finDetail');
      d.innerHTML = `<div class="fd-h"><div><b id="fdName"></b><small id="fdKind"></small></div><div class="fd-px"><b id="fdPx"></b><small id="fdChg"></small></div></div>
        <div class="fd-chart" id="fdChart"></div><div class="fd-hold" id="fdHold"></div>
        ${v.tab === 'bet' ? `<div class="muted">押注后 10 秒结算：猜中返还 1.9 倍，猜错全部损失</div>
          <div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="押注金额"><span>M</span></div>
          <div class="mk-quick">${[10, 50, 100].map((x) => `<button data-finq="${x}">${x}M</button>`).join('')}</div>
          <div class="act-row"><button class="btn up" id="betUp">📈 看涨</button><button class="btn down" id="betDown">📉 看跌</button></div><div class="bet-live" id="betLive"></div>`
        : `<div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="交易金额"><span>M</span></div>
          <div class="mk-quick">${[10, 50, 100, 500].map((x) => `<button data-finq="${x}">${x}M</button>`).join('')}</div>
          <div class="act-row"><button class="btn up" id="finBuy">买入</button><button class="btn down" id="finSell">卖出</button><button class="btn" id="finAll">全部卖出</button></div>`}`;
      const q = (side) => act('trade', { id: v.sel, side, amount: side === 'all' ? 1e15 : amt('finAmt') }, (r) => r.ok && (Snd.beep(), toast(side === 'buy' ? '买入成功' : '卖出成功')));
      if (v.tab === 'bet') { $('#betUp').onclick = () => act('bet', { id: v.sel, dir: 'up', amount: amt('finAmt') }); $('#betDown').onclick = () => act('bet', { id: v.sel, dir: 'down', amount: amt('finAmt') }); }
      else { $('#finBuy').onclick = () => q('buy'); $('#finSell').onclick = () => q('sell'); $('#finAll').onclick = () => act('trade', { id: v.sel, side: 'sell', amount: 1e15 }); }
    }
  }
  function finUpdate() {
    const v = localView; if (!v || v.type !== 'fin' || !S || !S.market) return;
    const m = me(); if (!m) return;
    if (v.tab === 'loan') {
      $('#loanBal').textContent = fmt(Math.round(m.loan || 0));
      const nw = m.worth, lim = Math.max(0, Math.round((nw + (m.loan || 0)) * 0.5 - (m.loan || 0)));
      $('#loanInfo').textContent = `可再贷 ${fmt(lim)} · 每分钟利息约 ${fmt(Math.round((m.loan || 0) * 0.03))}`;
    } else {
      const kinds = v.tab === 'bet' ? ['stock', 'fund', 'fx'] : [v.tab];
      const list = AS.filter((a) => kinds.includes(a.kind));
      if (!list.some((a) => a.id === v.sel)) v.sel = list[0].id;
      $('#finList').innerHTML = list.map((a) => { const x = mk(a.id), c = chg(x), h = (m.hold || {})[a.id]; return `<div class="fin-row ${v.sel === a.id ? 'on' : ''}" data-finsel="${a.id}"><div><b>${a.name}</b><small>${a.id}${h ? ' · 持有 ' + fmt(Math.round(h * x.price)) : ''}</small></div>${spark(x.hist, 70, 26)}<div class="fr-px"><b>${px(x)}</b><small class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(2)}%</small></div></div>`; }).join('');
      const x = mk(v.sel), a = meta(v.sel), c = chg(x), h = (m.hold || {})[v.sel] || 0;
      $('#fdName').textContent = a.name; $('#fdKind').textContent = ` ${a.id} · ${KIND[a.kind]}${a.kind === 'fx' ? '（1 单位兑世界银行币）' : ''}`;
      $('#fdPx').textContent = px(x); const ce = $('#fdChg'); ce.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}%（近 2 分钟）`; ce.className = c >= 0 ? 'up' : 'down';
      $('#fdChart').innerHTML = spark(x.hist, 300, 110, true);
      $('#fdHold').innerHTML = `持有市值 <b>${fmt(Math.round(h * x.price))}</b>　·　现金 <b>${fmt(m.money)}</b>`;
      const bl = $('#betLive');
      if (bl) bl.innerHTML = m.bet ? `进行中：${meta(m.bet.id).name} ${m.bet.dir === 'up' ? '看涨' : '看跌'} ${fmt(m.bet.stake)}，剩余 ${Math.max(0, Math.ceil((m.bet.endAt - Date.now() - skew) / 1000))} 秒` : '';
    }
    $('#finFoot').innerHTML = `💰 现金 <b>${fmt(m.money)}</b>　📊 金融持仓 <b>${fmt(m.hv || 0)}</b>　🏦 贷款 <b>${fmt(Math.round(m.loan || 0))}</b>　🧾 总资产 <b>${fmt(m.worth)}</b>`;
  }
  window.onMarket = finUpdate;
  setInterval(() => { if (localView && localView.type === 'fin' && localView.tab === 'bet') finUpdate(); }, 1000);

  // ---------------- 右侧面板放大详情 ----------------
  function expandHTML(kind) {
    const m = me();
    if (kind === 'players') return `<h3>👥 玩家详情</h3><div class="xp-table">${S.players.map((p) => {
      const props = Object.keys(S.props).filter((k) => S.props[k].owner === p.id), houses = props.reduce((n, k) => n + S.props[k].houses, 0), t = S.tasks[p.id];
      return `<div class="xp-row ${p.won ? 'won' : p.bankrupt ? 'dead' : ''}">${avatar(p)}<div class="xp-who"><b>${esc(p.name)}</b>${p.host ? ' <span class="badge">房主</span>' : ''}${p.won ? ' <span class="badge crown">👑 成为富翁</span>' : p.bankrupt ? ' <span class="badge jail">破产</span>' : ''}${!p.connected ? ' <span class="badge off">离线</span>' : ''}<small>${t ? (t.done ? '✅ ' : '🎯 ') + t.text : ''}</small></div>
        <div class="xp-nums"><span>现金<b>${fmt(p.money)}</b></span><span>总资产<b>${fmt(p.won ? p.wonWorth : p.worth)}</b></span><span>地产<b>${props.length} 块 · ${houses} 栋</b></span><span>金融<b>${fmt(p.hv || 0)}</b></span><span>贷款<b>${fmt(Math.round(p.loan || 0))}</b></span>${p.w ? `<span>钱包<b>💳${fmt(p.w.card)} 📱${fmt(p.w.phone)} 💵${fmt(p.w.cash)}</b></span>` : ''}</div>
        ${p.id !== myId && !p.bankrupt ? `<div class="xp-ops"><button class="btn sm" data-xpsend="${p.id}">💬 互动</button>${m && m.host ? `<button class="btn sm danger" data-kick="${p.id}">移出</button>` : ''}</div>` : ''}</div>`;
    }).join('')}</div>`;
    if (kind === 'assets') {
      const list = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === myId);
      return `<h3>🏠 我的地产</h3><div class="xp-table">${list.map((i) => { const sq = BOARD[i], st = S.props[i]; return `<div class="xp-row" data-deed="${i}" style="cursor:pointer"><i class="xp-dot" style="background:${sqColor(i)}"></i><div class="xp-who"><b>${sq.name}</b><small>${sq.en || ''}${st.mortgaged ? ' · 已抵押' : ''}</small></div><div class="xp-nums"><span>现价<b>${fmt(priceOf(i))}</b></span><span>房屋<b>${st.houses === 5 ? '酒店' : st.houses + ' 栋'}</b></span>${sq.type === 'prop' ? `<span>每秒收益<b>+${fmt(Math.round(incomePerSec(i, st.houses) * INF()))}</b></span>` : ''}</div></div>`; }).join('') || '<div class="mk-empty">暂无地产</div>'}</div>`;
    }
    if (kind === 'log') return `<h3>🧾 对局记录</h3><div class="xp-log">${S.log.slice().reverse().map((l) => `<div><small>${new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false })}</small>${esc(l.msg)}</div>`).join('')}</div>`;
    return `<h3>⏱ 对局信息</h3><div class="xp-info"><div>已进行 <b>${$('#elapsed').textContent}</b></div><div>通胀阶段 <b>第 ${S.stage + 1} 阶段 · 物价 ×${Math.round(S.infl * 100) / 100}</b></div><div>首富目标 <b>总资产 ${fmt(RULES.winCash)}</b></div><div>已胜出 <b>${S.rich.length} 人</b></div><div>银行剩余 <b>${S.housesLeft} 栋房屋 · ${S.hotelsLeft} 座酒店</b></div></div>
      <div class="muted" style="line-height:1.8;margin-top:10px">· 每 10 分钟通胀一次：地价、房价、租金、工资、卡牌奖惩全部 ×1.5<br>· 经过起点 / 环球中心：领取工资，同时按地产现值 4% 缴纳地产税<br>· 抵达前也可在地产交易所以 3 倍价格远程购买银行持有的地产</div>`;
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

  window.renderExtra = (v, box) => {
    if (v.type === 'fin') {
      box.classList.add('market');
      const key = 'fin:' + v.tab; if (box.dataset.v !== key) { box.dataset.v = key; finShell(v, box); }
      finUpdate(); return true;
    }
    if (v.type === 'expand') { box.classList.add('market'); box.dataset.v = 'expand'; refreshExpand(); return true; }
    return false;
  };
  window.afterRender = () => {
    if (localView && localView.type === 'fin') finUpdate();
    for (const [sel, kind] of [['#players', 'players'], ['#assets', 'assets'], ['.log-panel', 'log'], ['#clock', 'clock']]) {
      const el = $(sel); if (el && !el.querySelector(':scope > .xp-btn')) { const b = document.createElement('button'); b.className = 'xp-btn'; b.dataset.expand = kind; b.title = '放大查看详情'; b.textContent = '⤢'; el.appendChild(b); }
    }
  };
  document.addEventListener('click', (e) => {
    const t = e.target;
    const tab = t.closest('[data-fintab]'); if (tab && localView) { localView.tab = tab.dataset.fintab; return renderLocal(); }
    const sel = t.closest('[data-finsel]'); if (sel && localView) { localView.sel = sel.dataset.finsel; return finUpdate(); }
    const q = t.closest('[data-finq]'); if (q) { const i = $('#finAmt'); if (i) i.value = q.dataset.finq; return; }
    if (t.closest('[data-local="fin"]')) return openLocal({ type: 'fin', tab: 'stock', sel: 'WTK' });
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
