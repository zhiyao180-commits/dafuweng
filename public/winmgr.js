// macOS 风格窗口：红（关闭）黄（最小化到底部程序坞）绿（放大/还原），拖动标题栏移动，拖右下角调整大小
(function () {
  const wins = [
    { modal: $('#modal'), win: $('#modalWin'), body: $('#modalBox'), state: true },
    { modal: $('#local'), win: $('#localWin'), body: $('#localBox'), state: false },
  ];
  const dock = $('#winDock');
  const NAMES = { deed: '地契', market: '地产交易所', force: '强制拍卖', fin: '金融中心', recap: '对局复盘', worth: '资产走势', send: '互动 / 转账', help: '帮助与快捷键', expand: '详情', bank: '银行兑换' };
  const titleOf = (w) => { const h = w.body.querySelector('h3, h2'); const t = (h ? h.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 24); if (t) return t; if (!w.state && localView) { if (localView.type === 'deed' && BOARD[localView.pos]) return '地契 · ' + BOARD[localView.pos].name; return NAMES[localView.type] || '窗口'; } return w.state ? '待处理' : '窗口'; };
  const reset = (w) => { w.win.style.translate = ''; w.win.style.width = ''; w.win.style.height = ''; w.win.classList.remove('zoom'); w.pos = null; };
  function setMin(w, on) {
    w.modal.classList.toggle('min', on);
    let item = dock.querySelector(`[data-w="${w.win.id}"]`);
    if (on) {
      if (!item) { item = document.createElement('button'); item.dataset.w = w.win.id; dock.appendChild(item); item.onclick = () => setMin(w, false); }
      item.innerHTML = `<i></i>${esc(titleOf(w))}`;
    } else if (item) item.remove();
    dock.classList.toggle('show', !!dock.children.length);
  }
  // 窗口被程序关掉时（hidden），同步清理最小化状态与位置
  wins.forEach((w) => {
    new MutationObserver(() => { if (w.modal.hidden) { setMin(w, false); reset(w); } }).observe(w.modal, { attributes: true, attributeFilter: ['hidden'] });
    // 内容变化：更新标题；把 body 上的宽窗口样式同步到外框
    new MutationObserver(() => {
      w.win.querySelector('.win-title').textContent = titleOf(w);
      w.win.classList.toggle('wide', w.body.classList.contains('market'));
      if (w.state && w.modal.classList.contains('min')) setMin(w, false); // 新的待处理消息：自动弹回来
    }).observe(w.body, { childList: true, attributes: true, attributeFilter: ['class'] });
    w.win.querySelector('.l-close').onclick = (e) => {
      e.stopPropagation();
      if (!w.state) return closeLocal();
      if (stateModalKey === 'end') { w.modal.hidden = true; return; }
      setMin(w, true); toast('待处理消息已最小化至底部，点按即可恢复');
    };
    w.win.querySelector('.l-min').onclick = (e) => { e.stopPropagation(); setMin(w, true); };
    const zoom = () => { w.win.classList.toggle('zoom'); };
    w.win.querySelector('.l-zoom').onclick = (e) => { e.stopPropagation(); zoom(); };
    const bar = w.win.querySelector('.win-bar');
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.lights')) zoom(); });
    // 拖动
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lights') || document.body.classList.contains('phone') || w.win.classList.contains('zoom')) return;
      e.preventDefault(); bar.setPointerCapture(e.pointerId);
      const p0 = w.pos || [0, 0], sx = e.clientX, sy = e.clientY;
      bar.classList.add('drag');
      const mv = (ev) => { const r = w.win.getBoundingClientRect(); let x = p0[0] + ev.clientX - sx, y = p0[1] + ev.clientY - sy; w.pos = [x, y]; w.win.style.translate = `${x}px ${y}px`; if (r.top < 0 && ev.clientY < sy) { /* 不让标题栏拖出屏幕顶部 */ } };
      const up = () => { bar.classList.remove('drag'); bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); const r = w.win.getBoundingClientRect(); if (r.top < 0 && w.pos) { w.pos[1] -= r.top; w.win.style.translate = `${w.pos[0]}px ${w.pos[1]}px`; } };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    // 右下角调整大小
    const rs = w.win.querySelector('.win-rs');
    rs.addEventListener('pointerdown', (e) => {
      if (w.win.classList.contains('zoom')) return;
      e.preventDefault(); e.stopPropagation(); rs.setPointerCapture(e.pointerId);
      const r = w.win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const mv = (ev) => { w.win.style.width = Math.max(320, r.width + ev.clientX - sx) + 'px'; w.win.style.height = Math.max(220, r.height + ev.clientY - sy) + 'px'; };
      const up = () => { rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); };
      rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up);
    });
  });
  // 打开新的小窗口时，确保它不是最小化状态
  const _open = openLocal;
  openLocal = function (v) { const w = wins[1]; if (w.modal.classList.contains('min')) setMin(w, false); return _open(v); };
})();
