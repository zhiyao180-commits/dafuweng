// 实用工具：📡 风险雷达（下一掷落点概率与租金风险）、📊 资产走势、🤖 托管
(function () {
  // ---------------- 工具栏（放在右侧操作区） ----------------
  let radarOn = localStorage.getItem('dfw_radar') === '1';
  window.toolsRow = (m) => {
    if (!S || S.phase !== 'play' || !m || m.bankrupt) return '';
    const r = radarOn ? radarData(m) : null;
    return `<div class="tool-row"><button class="tl ${radarOn ? 'on' : ''}" data-tool="radar" title="显示下一次掷骰可能落在哪里、要付多少钱">📡 风险雷达</button><button class="tl" data-tool="worth" title="所有玩家的总资产随时间变化">📊 资产走势</button><button class="tl ${m.auto ? 'on auto' : ''}" data-tool="auto" title="暂时离开时，让系统按稳健策略代为操作">🤖 ${m.auto ? '托管中' : '托管'}</button></div>${r ? radarSum(m, r) : ''}`;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]'); if (!b) return;
    const t = b.dataset.tool;
    if (t === 'radar') { radarOn = !radarOn; localStorage.setItem('dfw_radar', radarOn ? '1' : '0'); toast(radarOn ? '📡 风险雷达已开启：地图上标出下一掷可能落点和要付的钱' : '风险雷达已关闭'); renderActions(); renderRadar(true); }
    if (t === 'worth') openLocal({ type: 'worth' });
    if (t === 'auto') { const m = me(); act('auto', { on: !m.auto }, (r) => r.ok && toast(!m.auto ? '🤖 已开启托管：系统会自动掷骰、量力买地、平均建房、按时付款' : '已取消托管')); }
  });

  // ---------------- 📡 风险雷达 ----------------
  function radarData(m) {
    const N = BOARD.length, res = []; let exp = 0, worst = 0, worstP = 0, free = 0;
    for (let s = 2; s <= 12; s++) {
      const pr = (6 - Math.abs(s - 7)) / 36, pos = (m.pos + s) % N, sq = BOARD[pos], st = S.props[pos];
      let cost = 0, kind = 'safe';
      if (st && st.owner === m.id) kind = 'mine';
      else if (st && st.owner && !st.mortgaged) { cost = (S.rentNow || {})[pos] || 0; kind = 'rent'; }
      else if (sq.type === 'tax') { cost = Math.round(sq.amount * INF()); kind = 'tax'; }
      else if (sq.type === 'gotojail') kind = 'jail';
      else if (['chance', 'chest', 'wheel'].includes(sq.type)) kind = 'luck';
      else if (st && !st.owner) kind = 'buy';
      const prev = res.find((x) => x.pos === pos);
      if (prev) prev.pr += pr; else res.push({ pos, pr, cost, kind });
      exp += pr * cost; if (cost > worst) { worst = cost; worstP = pr; } if (!cost && kind !== 'jail') free += pr;
    }
    return { res, exp, worst, worstP, free };
  }
  function radarSum(m, r) {
    if (m.inJail) return `<div class="radar-sum">📡 您在监狱中：掷出双数才能出狱，或缴纳保释金</div>`;
    const short = r.worst > m.money;
    if (!r.worst) return `<div class="radar-sum">📡 下一掷：不会落到需要付租金或交税的格子，放心掷 · 可购买的空地 <b>${Math.round(r.res.filter((x) => x.kind === 'buy').reduce((a, x) => a + x.pr, 0) * 100)}%</b></div>`;
    return `<div class="radar-sum ${short ? 'warn' : ''}">📡 下一掷：预计支出 <b>${fmt(Math.round(r.exp))}</b> · 最坏 <b>${fmt(r.worst)}</b>（${(r.worstP * 100).toFixed(0)}%）· 不用付钱 <b>${(r.free * 100).toFixed(0)}%</b>${short ? '<br>⚠️ 现金不够付最坏情况，建议先卖股票或抵押备好钱' : ''}</div>`;
  }
  let radarKey = '';
  function renderRadar(force) {
    const m = S && S.phase === 'play' && me();
    if (!radarOn || !m || m.bankrupt || m.inJail) { if (radarKey) { document.querySelectorAll('.cell .rd').forEach((x) => x.remove()); radarKey = ''; } return; }
    const r = radarData(m), key = m.pos + '|' + r.res.map((x) => x.pos + ':' + x.cost + x.kind).join(',');
    if (key === radarKey && !force) return; radarKey = key;
    document.querySelectorAll('.cell .rd').forEach((x) => x.remove());
    const max = Math.max(1, r.worst), lbl = { safe: '安全', mine: '自己的', buy: '可购买', luck: '抽卡', jail: '入狱', tax: '交税', rent: '租金' };
    for (const x of r.res) {
      const cell = $('#cell' + x.pos); if (!cell) continue;
      const d = document.createElement('div'); d.className = 'rd ' + x.kind; d.style.setProperty('--a', (x.cost / max).toFixed(2));
      d.innerHTML = `<b>${Math.round(x.pr * 100)}%</b><small>${x.cost ? fmt(x.cost) : lbl[x.kind]}</small>`;
      cell.appendChild(d);
    }
  }
  const prevAfter = window.afterRender;
  window.afterRender = () => { if (prevAfter) prevAfter(); renderRadar(); };

  // ---------------- 📊 资产走势 ----------------
  const hm = (s) => { s = Math.round(s); return s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':00' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  window.worthChart = (list, W = 680, H = 240) => {
    const lines = list.filter((p) => p.wh && p.wh.length);
    if (!lines.length) return '<div class="mk-empty">还没有足够的数据，过几分钟再来看</div>';
    const pts = lines.flatMap((p) => p.wh), tmax = Math.max(120, ...pts.map((x) => x[0])), L = (v) => Math.log10(Math.max(1e4, v));
    const goal = RULES.winCash, lo = Math.min(L(1e5), ...pts.map((x) => L(x[1]))), hi = Math.max(L(goal), ...pts.map((x) => L(x[1]))) + 0.05;
    const pl = 46, pr = 70, pt = 10, pb = 22, X = (t) => (pl + (t / tmax) * (W - pl - pr)).toFixed(1), Y = (v) => (pt + (1 - (L(v) - lo) / (hi - lo)) * (H - pt - pb)).toFixed(1);
    let g = '';
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) { const v = Math.pow(10, e), y = Y(v); g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="wc-g"/><text x="${pl - 6}" y="${+y + 4}" text-anchor="end" class="wc-t">${fmt(v)}</text>`; }
    for (let k = 0; k <= 4; k++) { const t = (tmax * k) / 4; g += `<text x="${X(t)}" y="${H - 6}" text-anchor="middle" class="wc-t">${hm(t)}</text>`; }
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal)}" y2="${Y(goal)}" class="wc-goal"/><text x="${W - pr + 4}" y="${+Y(goal) + 4}" class="wc-gl">🏁 ${fmt(goal)}</text>`;
    const body = lines.map((p) => { const w = p.wh, last = w[w.length - 1]; return `<polyline points="${w.map((x) => X(x[0]) + ',' + Y(x[1])).join(' ')}" fill="none" stroke="${p.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" fill="${p.color}" stroke="#fff" stroke-width="1.5"/><text x="${+X(last[0]) + 7}" y="${+Y(last[1]) + 4}" class="wc-n" fill="${p.color}">${esc(p.name)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="wc">${g}${body}</svg>`;
  };
  const liveLines = () => {
    const now = Math.floor((Date.now() + skew - S.startedAt) / 1000);
    return S.players.map((p) => ({ name: p.name, color: p.color, wh: (p.wh || [[0, RULES.startMoney]]).concat(p.bankrupt && !p.won ? [] : [[now, p.won ? p.wonWorth : p.worth]]) }));
  };
  const prevExtra = window.renderExtra;
  window.renderExtra = (v, box, m) => {
    if (v.type === 'worth') {
      box.classList.add('market'); box.dataset.v = 'worth';
      const rows = S.players.slice().sort((a, b) => (b.won ? 1e18 - b.won : b.worth) - (a.won ? 1e18 - a.won : a.worth)).map((p) => { const w = p.won ? p.wonWorth : p.bankrupt ? 0 : p.worth, ch = w / RULES.startMoney; return `<div class="wc-row"><i style="background:${p.color}"></i><b>${esc(p.name)}</b><span>${p.won ? '👑 已胜出 ' : p.bankrupt ? '💥 已出局 ' : ''}${fmt(Math.round(w))}</span><small>${p.bankrupt && !p.won ? '' : `开局的 ${ch >= 10 ? Math.round(ch) : ch.toFixed(1)} 倍 · 距目标 ${Math.min(100, (w / RULES.winCash) * 100).toFixed(1)}%`}</small></div>`; }).join('');
      box.innerHTML = `<h3>📊 资产走势</h3><div class="muted">纵轴为对数刻度（每格 ×10），每 30 秒记录一次总资产；金色虚线是胜出目标</div><div class="wc-wrap">${worthChart(liveLines())}</div><div class="wc-list">${rows}</div><div class="act-row"><button class="btn wide" data-close>关闭</button></div>`;
      return true;
    }
    return prevExtra ? prevExtra(v, box, m) : false;
  };
  // 打开着资产走势时，每 30 秒刷新一次
  setInterval(() => { if (localView && localView.type === 'worth' && !document.hidden) renderLocal(); }, 30000);
})();
