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
    stock: ['股票：波动大，可能短时间大涨或大跌', ['在左侧选择一只股票，右侧会显示分时走势和最新成交价', '输入投入金额（单位 M，例如输入 50 即 50M），点「买入」建仓', '价格上涨后点「卖出」或「全部卖出」平仓，赚取差价；下跌则亏损']],
    bet: ['涨跌竞猜：10 秒定输赢', ['在左侧选择一只股票，记下当前价格', '输入押注金额，判断 10 秒后价格会更高还是更低，点「看涨」或「看跌」', '猜中返还押注的 1.9 倍，猜错损失全部押注；同一时间只能有一笔竞猜']],
    loan: ['银行贷款：急需资金时使用', ['输入金额点「申请贷款」，资金立即到账', '贷款每分钟按 3% 复利增长，请尽早偿还', '可随时「偿还」部分或「全部还清」；未还的贷款会从总资产中扣除']],
  };
  const TITLE = { stock: ['📈', '股票交易', '行情每 2 秒更新 · 红涨绿跌 · 手续费 0.3%'], bet: ['🎯', '涨跌竞猜', '10 秒定输赢 · 猜中返还 1.9 倍 · 红涨绿跌'], loan: ['🏦', '银行贷款', '即时到账 · 每分钟复利 3% · 额度为总资产一半'] };
  const guideHTML = (tab) => { const g = GUIDE[tab], open = localStorage.getItem('dfw_guide_' + tab) !== '0'; return `<details class="fin-guide" data-guide="${tab}" ${open ? 'open' : ''}><summary>📘 怎么参与 · ${g[0]}</summary><ol>${g[1].map((x) => `<li>${x}</li>`).join('')}</ol><p>所有交易都使用现金；股票持仓按实时价格计入总资产，钱不够付账时系统会自动卖出持仓。</p></details>`; };
  function finShell(v, box) {
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
        <div class="muted" style="line-height:1.7;margin-top:8px">· 利率极高：<b>每分钟复利 3%</b>，越早还越划算<br>· 贷款额度 = 总资产的一半（含已贷金额）<br>· 未还贷款会从总资产中扣除；破产时由银行清算</div></div>`;
      $('#loanBorrow').onclick = () => act('borrow', { amount: amt('loanAmt') });
      $('#loanRepay').onclick = () => act('repay', { amount: amt('loanAmt') });
      $('#loanAll').onclick = () => act('repay', { amount: 1e15 });
    } else {
      const d = $('#finDetail');
      d.innerHTML = `<div class="fd-h"><div><b id="fdName"></b><small id="fdKind"></small></div><div class="fd-px"><b id="fdPx"></b><small id="fdChg"></small></div></div>
        <div class="fd-chart" id="fdChart"></div><div class="fd-hold" id="fdHold"></div>
        ${v.tab === 'bet' ? `<div class="fd-label">押注金额（单位 M）</div>
          <div class="mk-price"><input id="finAmt" type="number" min="0" step="1" placeholder="押注金额"><span>M</span></div>
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
    if (v.tab === 'loan') {
      $('#loanBal').textContent = fmt(Math.round(m.loan || 0));
      const nw = m.worth, lim = Math.max(0, Math.round((nw + (m.loan || 0)) * 0.5 - (m.loan || 0)));
      $('#loanInfo').textContent = `可再贷 ${fmt(lim)} · 每分钟利息约 ${fmt(Math.round((m.loan || 0) * 0.03))}`;
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
    el.innerHTML = `<div class="panel-title"><span>📈 股市行情 · 点击交易</span><span>${m && m.loan ? '贷款 ' + fmt(Math.round(m.loan)) : ''}</span></div>${n ? `<div class="tk-news ${n.up ? 'up' : 'down'}">📰 市场快讯：${n.text}</div>` : ''}<div class="tk-list">${rows.replace(n ? `data-tick="${n.id}"` : '\u0000', n ? `data-tick="${n.id}" style="background:rgba(245,183,0,.22)"` : '')}</div>`;
  }
  window.openFin = (tab, sel) => { if (localView && localView.type === 'fin' && localView.tab === tab && !sel) return closeLocal(); openLocal({ type: 'fin', tab, sel: sel || (localView && localView.sel) || 'WTK' }); };
  window.onMarket = () => { finUpdate(); renderTicker(); };
  setInterval(() => { if (localView && localView.type === 'fin' && localView.tab === 'bet') finUpdate(); }, 1000);

  // ---------------- 涨跌竞猜：进行中的浮动胶囊 + 10 秒结算全屏报告 ----------------
  setInterval(() => {
    const m = S && S.phase === 'play' && me(), b = m && m.bet; let el = $('#betPill');
    if (!b) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'betPill'; document.body.appendChild(el); }
    const left = Math.max(0, (b.endAt - Date.now() - skew) / 1000), x = mk(b.id), now = x ? x.price : b.start, d = now - b.start, ahead = b.dir === 'up' ? d > 0 : d < 0;
    const C = 2 * Math.PI * 15, off = C * (1 - left / 10);
    el.className = 'show ' + (b.dir === 'up' ? 'long' : 'short');
    el.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${off}"/></svg><span class="bp-s">${Math.ceil(left)}</span>
      <div class="bp-t"><b>${b.dir === 'up' ? '看涨 · 做多' : '看跌 · 做空'}</b><small>${meta(b.id).name} · 本金 ${fmt(b.stake)}</small></div>
      <div class="bp-px"><b class="${d >= 0 ? 'up' : 'down'}">${px({ price: now })}</b><small class="${ahead ? 'ok' : d === 0 ? '' : 'no'}">${d === 0 ? '持平' : ahead ? '暂时领先' : '暂时落后'}</small></div>`;
  }, 200);

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
      <h2>${win ? '恭喜 · 预测命中' : '很遗憾 · 预测未中'}</h2>
      <div class="br-sub">${sub}</div>
      <div class="br-chart">${chart}</div>
      <div class="br-grid">
        <div><small>标的</small><b>${a.name}</b></div><div><small>方向</small><b>${long ? '看涨 · 做多' : '看跌 · 做空'}</b></div>
        <div><small>开仓价</small><b>${px({ price: f.start })}</b></div><div><small>结算价</small><b class="${f.end >= f.start ? 'up' : 'down'}">${px({ price: f.end })}</b></div>
        <div><small>区间涨跌幅</small><b class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</b></div><div><small>押注本金</small><b>${fmt(f.stake)}</b></div>
      </div>
      <div class="br-pnl"><small>本笔盈亏</small><b id="brPnl">${pnl > 0 ? '+' : '−'}${fmt(0)}</b><span>${win ? `收益率 +90% · 结算入账 ${fmt(f.payout)}（本金 ${fmt(f.stake)} + 收益 ${fmt(pnl)}）` : '收益率 −100% · 本金已全部亏损'}</span></div>
      <div class="br-foot">${win ? '资金已实时划入您的现金账户' : '市场有风险，投资需谨慎'}　·　点击任意处关闭</div></div>`;
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
        <div class="xp-nums"><span>现金<b>${fmt(p.money)}</b></span><span>总资产<b>${fmt(p.won ? p.wonWorth : p.worth)}</b></span><span>地产<b>${props.length} 块 · ${houses} 栋</b></span><span>金融<b>${fmt(p.hv || 0)}</b></span><span>贷款<b>${fmt(Math.round(p.loan || 0))}</b></span>${p.w ? `<span>钱包<b>💳${fmt(p.w.card)} 📱${fmt(p.w.phone)} 💵${fmt(p.w.cash)}</b></span>` : ''}</div>
        ${p.id !== myId && !p.bankrupt ? `<div class="xp-ops"><button class="btn sm" data-xpsend="${p.id}">💬 互动</button>${m && m.host ? `<button class="btn sm danger" data-kick="${p.id}">移出</button>` : ''}</div>` : ''}</div>`;
    }).join('')}</div>`;
    if (kind === 'assets') {
      const list = Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === myId);
      return `<h3>🏠 我的地产</h3><div class="xp-table">${list.map((i) => { const sq = BOARD[i], st = S.props[i]; return `<div class="xp-row" data-deed="${i}" style="cursor:pointer"><i class="xp-dot" style="background:${sqColor(i)}"></i><div class="xp-who"><b>${sq.name}</b><small>${sq.en || ''}${st.mortgaged ? ' · 已抵押' : ''}</small></div><div class="xp-nums"><span>现价<b>${fmt(priceOf(i))}</b></span><span>房屋<b>${st.houses === 5 ? '酒店' : st.houses + ' 栋'}</b></span>${sq.type === 'prop' ? `<span>每秒收益<b>+${fmt(Math.round(incomePerSec(i, st.houses) * INF()))}</b></span>` : ''}</div></div>`; }).join('') || '<div class="mk-empty">暂无地产</div>'}</div>`;
    }
    if (kind === 'log') return `<h3>🧾 对局记录</h3><div class="xp-log">${S.log.slice().reverse().map((l) => `<div><small>${new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false })}</small>${esc(l.msg)}</div>`).join('')}</div>`;
    return `<h3>⏱ 对局信息</h3><div class="xp-info"><div>已进行 <b>${$('#elapsed').textContent}</b></div><div>通胀阶段 <b>第 ${S.stage + 1} 阶段</b></div><div>地价 / 房价指数 <b>×${Math.round((S.pinfl || 1) * 100) / 100}（每分钟 +1%）</b></div><div>租金 / 工资 / 收益 <b>×${Math.round(S.infl * 100) / 100}</b></div><div>建材紧缺系数 <b>×${Math.round((S.scarcity || 1) * 100) / 100}</b></div><div>当前地产税率 <b>${Math.round((S.taxRate || 0.04) * 1000) / 10}%（经过起点时缴纳）</b></div><div>首富目标 <b>总资产 ${fmt(RULES.winCash)}</b></div><div>已胜出 <b>${S.rich.length} 人</b></div><div>银行剩余 <b>${S.housesLeft} 栋房屋 · ${S.hotelsLeft} 座酒店</b></div></div>
      <div class="muted" style="line-height:1.8;margin-top:10px">· 每 10 分钟通胀一次：地价、房价 ×1.7；租金、工资、卡牌奖惩 ×1.5；地价、房价每分钟另外上涨 1%<br>· 同一块地越往上盖越贵（第 2 栋 ×1.3、第 3 栋 ×1.7、第 4 栋 ×2.2、酒店 ×3），全场盖的房越多，建材越紧缺（最高再 ×2）<br>· 经过起点 / 环球中心：领取工资，同时按地产现值缴纳地产税（第 1 阶段 4%，每次通胀 +1.5%，最高 16%）<br>· 抵达前也可在地产交易所以 3 倍价格远程购买银行持有的地产</div>`;
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
    renderTicker();
    if (localView && localView.type === 'fin') finUpdate();
    for (const [sel, kind] of [['#players', 'players'], ['#assets', 'assets'], ['.log-panel', 'log'], ['#clock', 'clock']]) {
      const el = $(sel); if (el && !el.querySelector(':scope > .xp-btn')) { const b = document.createElement('button'); b.className = 'xp-btn'; b.dataset.expand = kind; b.title = '放大查看详情'; b.textContent = '⤢'; el.appendChild(b); }
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
