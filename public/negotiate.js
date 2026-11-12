// 地产议价：收到报价时显示地块位置（小地图 + 地图高亮）、卖不卖的建议、一键还价；报价被拒绝 / 同意 / 过期时通知发起人
(function () {
  const N = BOARD.length;
  const NICE = (x) => { if (x < 100) return Math.round(x); const m = Math.pow(10, Math.floor(Math.log10(x)) - 2); return Math.round(x / m) * m; };
  const posOf = (t) => (t.get.length ? t.get[0] : t.give[0]);
  const single = (t) => t.give.length + t.get.length === 1 && !(t.giveMoney && t.getMoney);
  const priceOfT = (t) => t.giveMoney || t.getMoney;

  // ---------- 位置：文字 + 小地图 ----------
  function whereText(pos) {
    const c = $('#cell' + pos); if (!c) return '';
    const ring = c.classList.contains('inner') || c.classList.contains('corner2') ? '内圈' : '外圈';
    const side = c.classList.contains('side-b') ? '下方' : c.classList.contains('side-t') ? '上方' : c.classList.contains('side-l') ? '左侧' : c.classList.contains('side-r') ? '右侧' : '角落';
    return `${ring}${side}`;
  }
  function distText(pos) {
    const m = me(); if (!m || m.bankrupt) return '';
    const d = (pos - m.pos + N) % N;
    if (d === 0) return '您当前正位于该地产';
    const pr = d >= 2 && d <= 12 ? Math.round(((6 - Math.abs(d - 7)) / 36) * 100) : 0;
    return `距您当前位置 ${d} 格${pr ? `，下次掷骰抵达概率为 ${pr}%` : ''}`;
  }
  window.miniMap = (pos) => {
    const bd = $('#board'); if (!bd) return '';
    const br = bd.getBoundingClientRect(), sq = BOARD[pos], grp = sq.type === 'prop' ? sq.group : null;
    let h = '';
    for (let i = 0; i < N; i++) {
      const c = $('#cell' + i); if (!c) continue;
      const r = c.getBoundingClientRect(), x = r.left - br.left, y = r.top - br.top, st = S.props[i], o = st && st.owner && pById(st.owner);
      const same = grp != null && BOARD[i].type === 'prop' && BOARD[i].group === grp;
      const fill = i === pos ? GROUPS[grp] ? GROUPS[grp].color : '#5B6470' : same ? GROUPS[grp].color : 'rgba(127,127,127,.16)';
      h += `<rect x="${x + 1}" y="${y + 1}" width="${r.width - 2}" height="${r.height - 2}" rx="3" fill="${fill}" opacity="${i === pos ? 1 : same ? 0.5 : 1}"${i === pos ? ' class="mm-t"' : ''}/>`;
      if (o && (same || i === pos)) h += `<circle cx="${x + r.width / 2}" cy="${y + r.height / 2}" r="${Math.min(r.width, r.height) * 0.22}" fill="${o.color}" stroke="#fff" stroke-width="2"/>`;
    }
    const m = me();
    for (const p of S.players) { if (p.bankrupt) continue; const c = $('#cell' + p.pos); if (!c) continue; const r = c.getBoundingClientRect(); if (p.id === myId || (m && p.id !== myId && S.trades.some((t) => (t.from === p.id && t.to === myId) || (t.to === p.id && t.from === myId)))) h += `<text x="${r.left - br.left + r.width / 2}" y="${r.top - br.top + r.height * 0.75}" text-anchor="middle" font-size="${r.height * 0.6}">${p.icon}</text>`; }
    const c = $('#cell' + pos), r = c.getBoundingClientRect();
    h += `<rect x="${r.left - br.left - 4}" y="${r.top - br.top - 4}" width="${r.width + 8}" height="${r.height + 8}" rx="6" fill="none" stroke="#E5383B" stroke-width="4" class="mm-ring"/>`;
    return `<svg viewBox="0 0 ${br.width} ${br.height}" class="minimap">${h}</svg>`;
  };

  // ---------- 卖不卖、值多少钱 ----------
  function advise(t) {
    const pos = posOf(t), sq = BOARD[pos], st = S.props[pos], X = priceOfT(t), meSeller = st.owner === myId, other = pById(t.from);
    const buyerId = meSeller ? other.id : myId, sellerId = meSeller ? myId : other.id;
    const land = NICE(sq.price * PINF()), value = Math.round(land * (st.mortgaged ? 0.55 : 1));
    const notes = []; let mult = 1.3;
    if (sq.type === 'prop') {
      const g = Object.keys(S.props).map(Number).filter((i) => BOARD[i].type === 'prop' && BOARD[i].group === sq.group), n = g.length;
      const buyerAfter = g.filter((i) => S.props[i].owner === buyerId).length + 1, sellerHas = g.filter((i) => S.props[i].owner === sellerId).length;
      if (buyerAfter === n) { mult = 2.6; notes.push(meSeller ? `⚠️ 出售给 ${esc(other.name)} 后，对方将集齐「${GROUPS[sq.group].name}」组全部 ${n} 块，可建造房屋并收取高额租金，对您构成较大威胁` : `⭐ 购得后您将集齐「${GROUPS[sq.group].name}」组全部 ${n} 块，可建造房屋，租金加倍`); }
      else if (buyerAfter >= Math.ceil(n / 2) + (n > 2 ? 0 : 1)) { mult = Math.max(mult, 1.7); notes.push(meSeller ? `${esc(other.name)} 购得后将持有同色 ${buyerAfter}/${n} 块，更接近集齐` : `购得后您将持有同色 ${buyerAfter}/${n} 块`); }
      if (meSeller && sellerHas >= 2) { mult = Math.max(mult, 2.2); notes.push(`您持有同色 ${sellerHas}/${n} 块，出售后将更难集齐`); }
    } else if (sq.type === 'rail') {
      const k = Object.keys(S.props).filter((i) => BOARD[i].type === 'rail' && S.props[i].owner === buyerId).length + 1;
      if (k >= 2) { mult = 1.8; notes.push(`${meSeller ? esc(other.name) : '您'}购得后将持有 ${k} 个机场 / 港口，租金随持有数量递增`); }
    }
    if (st.mortgaged) notes.push('该地产已抵押：买方日后须支付赎回费用，价值相应折减');
    const rent = (S.rentNow || {})[pos]; if (rent) notes.push(`当前每次抵达须支付租金 ${fmt(rent)}`);
    notes.push('地价每分钟上涨约 1%，每次通货膨胀另 ×1.7，长期持有具有增值空间');
    const fair = NICE(value * mult), ratio = X / value;
    let verdict, tone;
    if (meSeller) {
      if (X >= fair) { verdict = `✅ 出价合理（为现价的 ${Math.round(ratio * 100)}%），建议成交`; tone = 'good'; }
      else if (X >= value) { verdict = `🤔 出价偏低（为现价的 ${Math.round(ratio * 100)}%），建议还价至 ${fmt(fair)}`; tone = 'mid'; }
      else { verdict = `⛔ 出价低于现价（仅为现价的 ${Math.round(ratio * 100)}%），不建议出售，可还价至 ${fmt(fair)}`; tone = 'bad'; }
      const m = me(); if (m && (inDanger(m) || m.money < land * 0.3)) notes.unshift('💡 您的现金较为紧张，出售可缓解资金压力，可适当让步');
    } else {
      if (X <= value) { verdict = `✅ 价格低于现价（为现价的 ${Math.round(ratio * 100)}%），建议购买`; tone = 'good'; }
      else if (X <= fair) { verdict = `🤔 价格尚可接受（为现价的 ${Math.round(ratio * 100)}%）`; tone = 'mid'; }
      else { verdict = `⛔ 价格偏高（为现价的 ${Math.round(ratio * 100)}%），建议还价至 ${fmt(NICE((value + fair) / 2))} 左右`; tone = 'bad'; }
      const m = me(); if (m && X > m.money) notes.unshift(`💡 您的现金为 ${fmt(m.money)}，不足以支付该价格`);
    }
    return { pos, sq, st, X, meSeller, other, land, value, fair, verdict, tone, notes };
  }
  function quickPrices(t, a) {
    let list;
    if (a.meSeller) list = [[a.fair, '建议价'], [a.X * 1.2, '+20%'], [a.X * 1.5, '+50%'], [a.X * 2, '2 倍']];
    else { const mine = (t.hist || []).filter((h) => h.by === myId).pop(); list = [[mine ? (mine.price + a.X) / 2 : a.X * 0.9, mine ? '取中间价' : '−10%'], [a.X * 0.8, '−20%'], [a.value, '按现价'], [a.X * 0.6, '−40%']]; }
    const seen = new Set();
    return list.map(([v, n]) => [NICE(v), n]).filter(([v]) => (a.meSeller ? v > a.X : v < a.X && v > 0) && !seen.has(v) && seen.add(v)).slice(0, 4);
  }

  // ---------- 收到报价时的窗口 ----------
  window.tradeModalHTML = (t) => {
    const f = pById(t.from);
    if (!single(t)) return `${offerHTML(t)}<div class="offer-exp" data-at="${t.at || 0}"></div><div class="act-row"><button class="btn" data-act="respond" data-id="${t.id}" data-accept="">拒绝<kbd>X</kbd></button><button class="btn primary" data-act="respond" data-id="${t.id}" data-accept="1">接受<kbd>Y</kbd></button></div>`;
    const a = advise(t), sq = a.sq, st = a.st, isCounter = (t.hist || []).length > 1;
    const title = a.meSeller ? (isCounter ? `↩️ ${esc(f.name)} 还价：出价 ${fmt(a.X)} 收购您的地产` : `💰 ${esc(f.name)} 申请收购您的地产`) : (isCounter ? `↩️ ${esc(f.name)} 还价：要价 ${fmt(a.X)}` : `🏷 ${esc(f.name)} 拟向您出售地产`);
    const hist = (t.hist || []).length > 1 ? `<div class="ng-hist">${t.hist.map((h, k) => `<span class="${h.by === myId ? 'me' : ''}">${k ? '→ ' : ''}${h.by === myId ? '您' : esc((pById(h.by) || {}).name || '')} ${k ? '还价' : '出价'} <b>${fmt(h.price)}</b></span>`).join('')}</div>` : '';
    const q = quickPrices(t, a);
    return `<h3>${title}</h3>${hist}
      <div class="ng-top">
        <div class="ng-deed" style="--tint:${sqColor(a.pos)}"><div class="ng-lm">${sqIcon(a.pos)}</div><div class="ng-dt"><b>${sq.name}</b><small>${sq.en || ''}${sq.type === 'prop' ? ' · ' + GROUPS[sq.group].name + '组' : sq.type === 'rail' ? ' · 机场 / 港口' : ''}${st.mortgaged ? ' · 已抵押' : ''}</small>
          <div class="ng-px">${a.meSeller ? '对方出价' : '对方要价'} <b>${fmt(a.X)}</b></div><div class="ng-sub">现价 ${fmt(a.land)} · 标价 ${fmt(sq.price)}</div></div></div>
        <div class="ng-map">${miniMap(a.pos)}<div class="ng-where">📍 ${whereText(a.pos)} · 已在地图上以红框标示<br><small>${distText(a.pos)}</small></div></div>
      </div>
      <div class="ng-adv ${a.tone}"><div class="ng-v">${a.verdict}</div><ul>${a.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>
      <div class="offer-exp" data-at="${t.at || 0}"></div>
      <div class="ng-q"><span>${a.meSeller ? '快速还价（加价）' : '快速还价（减价）'}</span>${q.map(([v, n]) => `<button data-ngq="${v}">${n}<b>${fmt(v)}</b></button>`).join('')}</div>
      <div class="counter-row"><span>自定义</span><div class="mk-price"><input id="ctPrice" type="number" min="0" step="1" placeholder="${a.X / 1000}"><span>M</span></div><button class="btn" id="ctGo">发送还价</button></div>
      <div class="act-row"><button class="btn" data-act="respond" data-id="${t.id}" data-accept="">拒绝<kbd>X</kbd></button><button class="btn primary" data-act="respond" data-id="${t.id}" data-accept="1">${a.meSeller ? `接受，以 ${fmt(a.X)} 出售` : `接受，以 ${fmt(a.X)} 购买`}<kbd>Y</kbd></button></div>`;
  };
  window.bindTradeModal = (box, t) => {
    const send = (k) => act('counter', { id: t.id, price: k }, (r) => r.ok && (Snd.beep(), toast(`已还价 ${fmt(k)}，等待对方回复`)));
    box.querySelectorAll('[data-ngq]').forEach((b) => (b.onclick = () => send(+b.dataset.ngq)));
    const inp = $('#ctPrice'), go = $('#ctGo');
    if (go) { const f = () => { const k = Math.round((+inp.value || 0) * 1000); if (!k) { toast('请输入还价金额'); inp.focus(); return; } send(k); }; go.onclick = f; inp.onkeydown = (e) => { if (e.key === 'Enter') f(); }; }
  };

  // ---------- 地图上高亮正在谈的那块地 ----------
  let focused = null;
  window.setTradeFocus = (pos) => {
    if (focused === pos) return;
    if (focused != null) { const c = $('#cell' + focused); if (c) c.classList.remove('ng-focus'); }
    focused = pos; if (pos != null) { const c = $('#cell' + pos); if (c) c.classList.add('ng-focus'); }
  };

  // ---------- 发起人收到结果通知 ----------
  window.showTradeResult = (f) => {
    const o = pById(f.to), nm = f.pos != null && BOARD[f.pos] ? BOARD[f.pos].name : '', what = f.multi ? '发起的交易' : f.buy ? `出价 <b>${fmt(f.price)}</b> 购买「${nm}」` : `以 <b>${fmt(f.price)}</b> 出售「${nm}」`;
    let icon, title, body, btn = '';
    if (f.res === 'ok') { icon = '✅'; title = `${esc(o.name)} 接受了您的报价`; body = f.multi ? '交易已完成，地产与现金已完成交割。' : f.buy ? `交易成功。您以 <b>${fmt(f.price)}</b> 购得「${nm}」，该地产已转入您的名下。` : `交易成功。${esc(o.name)} 以 <b>${fmt(f.price)}</b> 购得您的「${nm}」，款项已到账。`; }
    else if (f.res === 'no') { icon = '❌'; title = `${esc(o.name)} 拒绝了您的报价`; body = `您${what}，对方未接受。${f.multi ? '' : f.buy ? '您可提高出价后重新报价。' : '您可降低价格后重新报价。'}`; if (!f.multi) btn = `<button class="btn primary" data-ngretry="${f.pos}" data-price="${NICE(f.price * (f.buy ? 1.2 : 0.85))}">${f.buy ? '💰 提高出价' : '🏷 下调价格'}</button>`; }
    else { icon = '⌛'; title = '报价已过期'; body = `您${what}，${esc(o.name)} 未在 2 分钟内回复，报价已自动失效。`; if (!f.multi) btn = `<button class="btn primary" data-ngretry="${f.pos}" data-price="${f.price}">重新报价</button>`; }
    const old = $('#tradeNote'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'tradeNote'; d.className = f.res;
    d.innerHTML = `<div class="tn-box"><div class="tn-i">${icon}</div><h3>${title}</h3><p>${body}</p><div class="act-row">${btn}<button class="btn" data-tnclose>好</button></div></div>`;
    document.body.appendChild(d);
    if (f.res === 'ok') { Snd.buy(); Snd.win(); } else if (f.res === 'no') Snd.bad(); else Snd.tone(440, 0.2, 'triangle', 0.06);
    if (f.pos != null) { const c = $('#cell' + f.pos); if (c) c.classList.add('ng-focus'); setTimeout(() => c && focused !== f.pos && c.classList.remove('ng-focus'), 4000); }
    const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 250); };
    d.onclick = (e) => {
      const r = e.target.closest('[data-ngretry]');
      if (r) { close(); return openLocal({ type: 'market', sel: +r.dataset.ngretry, price: +r.dataset.price }); }
      if (e.target.closest('[data-tnclose]') || e.target === d) close();
    };
    setTimeout(() => d.isConnected && close(), 9000);
  };
})();
