// 互动表情：24 个表情，每个都有自己的飞行方式、落点特效和音效
(function () {
  const FL = () => $('#floats');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const later = (ms, f) => setTimeout(f, ms);
  const T = (x, y, s = 1, r = 0) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s}) rotate(${r}deg)`;
  // 生成一个漂浮元素（文字/表情或纯色块）
  function mk(txt, x, y, cls = 'emo-fly', css) {
    const d = document.createElement('div'); d.className = cls; if (txt) d.textContent = txt;
    d.style.left = x + 'px'; d.style.top = y + 'px'; if (css) Object.assign(d.style, css); FL().appendChild(d); return d;
  }
  const run = (d, kf, o) => { const a = d.animate(kf, typeof o === 'number' ? { duration: o } : o); a.onfinish = () => d.remove(); return a; };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // 抛物线：初速度 (vx, vy)，重力 g
  function toss(txt, x, y, vx, vy, { g = 900, dur = 1000, size, spin = 0, cls, css } = {}) {
    const d = mk(txt, x, y, cls || 'emo-fly', css); if (size) d.style.fontSize = size + 'px';
    const kf = [], N = 12;
    for (let i = 0; i <= N; i++) { const t = (i / N) * (dur / 1000); kf.push({ transform: T(vx * t, vy * t + 0.5 * g * t * t, 1, (spin * i) / N), opacity: i < N * 0.7 ? 1 : 1 - (i - N * 0.7) / (N * 0.3) }); }
    return run(d, kf, { duration: dur, easing: 'linear' });
  }
  // 从一点向四周炸开
  function burst(txts, x, y, n, { r = [70, 150], dur = [700, 1100], size = [18, 30], g = 0, spin = 360, up = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), rr = rnd(r[0], r[1]), du = rnd(dur[0], dur[1]);
      const tx = Math.cos(ang) * rr, ty = Math.sin(ang) * rr - up;
      const d = mk(Array.isArray(txts) ? txts[i % txts.length] : txts, x, y, 'emo-fly'); d.style.fontSize = rnd(size[0], size[1]) + 'px';
      run(d, [{ transform: T(0, 0, 0.3), opacity: 1 }, { transform: T(tx * 0.8, ty * 0.8, 1.1, spin * 0.6), opacity: 1, offset: 0.55 }, { transform: T(tx, ty + g, 0.8, spin), opacity: 0 }], { duration: du, easing: 'cubic-bezier(.15,.75,.3,1)' });
    }
  }
  function ring(x, y, color, { size = 170, dur = 700, w = 4, delay = 0 } = {}) {
    const d = mk('', x, y, 'ef-ring', { borderColor: color, borderWidth: w + 'px', width: size + 'px', height: size + 'px' });
    run(d, [{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'backwards' });
  }
  function caption(x, y, text, color, { dur = 1300, size = 22, rise = 70, delay = 0 } = {}) {
    const d = mk(text, x, y, 'ef-txt', { color, fontSize: size + 'px' });
    run(d, [{ transform: T(0, 10, 0.4), opacity: 0 }, { transform: T(0, -rise * 0.4, 1.15), opacity: 1, offset: 0.25 }, { transform: T(0, -rise * 0.7, 1), opacity: 1, offset: 0.75 }, { transform: T(0, -rise, 1), opacity: 0 }], { duration: dur, delay, easing: 'ease-out', fill: 'backwards' });
  }
  function flash(color, { dur = 300, op = 0.7 } = {}) { const d = mk('', 0, 0, 'ef-flash', { background: color }); run(d, [{ opacity: op }, { opacity: 0 }], { duration: dur, easing: 'ease-out' }); }
  const shake = (node, amp = 6, dur = 450) => node && node.animate([0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ translate: i === 7 ? '0 0' : `${(i % 2 ? 1 : -1) * amp * (1 - i / 8)}px ${(i % 3 - 1) * amp * 0.4}px` })), { duration: dur });
  const glow = (node, filter, dur = 700) => node && node.animate([{ filter: 'none' }, { filter, offset: 0.3 }, { filter, offset: 0.7 }, { filter: 'none' }], dur);
  const boardShake = (amp = 8, dur = 500) => shake($('#boardWrap') || document.body, amp, dur);

  // 飞行：从发送者飞到目标，arc 为弧度（负数向上），trail 为拖尾
  function fly(txt, c, { dur = 800, arc = -140, scale = 2.2, spin = -15, trail, every = 55, size, wobble = 0, fromX, fromY } = {}) {
    return new Promise((res) => {
      const sx = fromX !== undefined ? fromX : c.sx, sy = fromY !== undefined ? fromY : c.sy, dx = c.tx - sx, dy = c.ty - sy;
      const d = mk(txt, sx, sy); if (size) d.style.fontSize = size + 'px';
      const pos = (t) => { const e = ease(t); return [dx * e, dy * e + arc * 4 * e * (1 - e)]; };
      const kf = [], N = 14;
      for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = pos(t), s = t < 0.5 ? 0.5 + (scale - 0.5) * (t / 0.5) : scale + (1.3 - scale) * ((t - 0.5) / 0.5); kf.push({ transform: T(x, y, s, spin * Math.sin(Math.PI * t) + wobble * Math.sin(t * Math.PI * 8)) }); }
      const t0 = performance.now(); let tm = null;
      if (trail) tm = setInterval(() => { const t = Math.min(1, (performance.now() - t0) / dur), [x, y] = pos(t), q = mk(typeof trail === 'function' ? trail() : trail, sx + x, sy + y, 'emo-fly'); q.style.fontSize = rnd(12, 20) + 'px'; run(q, [{ transform: T(0, 0, 1), opacity: 0.85 }, { transform: T(rnd(-14, 14), rnd(6, 26), 0.3), opacity: 0 }], 520); }, every);
      run(d, kf, { duration: dur, easing: 'linear' }).finished.then(() => { if (tm) clearInterval(tm); res(); });
    });
  }
  // 落点主体：在目标处出现并按关键帧表演
  const land = (txt, c, kf, o, size) => { const d = mk(txt, c.tx, c.ty); if (size) d.style.fontSize = size + 'px'; return run(d, kf, o); };

  const FX = {
    '👍': async (c) => {
      await fly('👍', c, { spin: -25 });
      Snd.noise(0.12, 0, 0.4, 400); Snd.tone(523, 0.12, 'triangle', 0.1); Snd.tone(784, 0.25, 'triangle', 0.1, 0.1);
      land('👍', c, [{ transform: T(0, -10, 4.2, -20), opacity: 0 }, { transform: T(0, 0, 1.6, 0), opacity: 1, offset: 0.25 }, { transform: T(0, 0, 1.9, 0), offset: 0.4 }, { transform: T(0, 0, 1.6, 0), opacity: 1, offset: 0.85 }, { transform: T(0, -20, 1.6), opacity: 0 }], 1300);
      later(300, () => { ring(c.tx, c.ty, '#0A6FE0', { size: 190 }); shake(c.b, 4, 300); });
      [0, 260, 520].forEach((t, i) => caption(c.tx + (i - 1) * 34, c.ty - 30, '+1', '#0A6FE0', { delay: 300 + t, size: 20 + i * 4 }));
    },
    '😂': async (c) => {
      await fly('😂', c, { wobble: 18, spin: 0 });
      [0, 1, 2, 3].forEach((i) => Snd.tone(760 - i * 50, 0.09, 'triangle', 0.1, i * 0.13));
      land('😂', c, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ transform: T(0, (i % 2) * -6, 2, i === 8 ? 0 : (i % 2 ? 18 : -18)), opacity: i === 8 ? 0 : 1 })), 1300);
      for (let i = 0; i < 14; i++) later(i * 70, () => toss('💧', c.tx + (i % 2 ? 22 : -22), c.ty - 8, (i % 2 ? 1 : -1) * rnd(120, 220), rnd(-320, -200), { dur: 900, size: 16 }));
      caption(c.tx, c.ty - 50, '哈哈哈哈', '#E2A100', { delay: 200, size: 20 });
    },
    '😭': async (c) => {
      await fly('😭', c, { arc: -40, dur: 1000, spin: 0, scale: 1.6 });
      Snd.sweep(620, 260, 1.1, 'triangle', 0.07);
      land('😭', c, [{ transform: T(0, 0, 1.6), opacity: 1 }, { transform: T(0, 4, 1.9), offset: 0.5 }, { transform: T(0, 0, 1.7), opacity: 1, offset: 0.9 }, { transform: T(0, 0, 1.7), opacity: 0 }], 1800);
      const cl = mk('☁️', c.tx, c.ty - 70); cl.style.fontSize = '46px'; run(cl, [{ transform: T(0, -20, 0.5), opacity: 0 }, { transform: T(0, 0, 1), opacity: 1, offset: 0.15 }, { transform: T(0, 0, 1), opacity: 1, offset: 0.85 }, { transform: T(0, -10, 1), opacity: 0 }], 1900);
      for (let i = 0; i < 22; i++) later(i * 60, () => { toss('💧', c.tx + (i % 2 ? 16 : -16), c.ty - 6, (i % 2 ? 1 : -1) * rnd(60, 130), rnd(-260, -160), { dur: 800, size: 14 }); if (i % 3 === 0) toss('💧', c.tx + rnd(-30, 30), c.ty - 60, 0, 60, { dur: 600, size: 11, g: 700 }); });
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'saturate(.3) brightness(.9) hue-rotate(180deg)', offset: 0.3 }, { filter: 'saturate(.3) brightness(.9) hue-rotate(180deg)', offset: 0.8 }, { filter: 'none' }], 1800);
    },
    '😡': async (c) => {
      await fly('😡', c, { arc: 0, dur: 420, scale: 1.8, spin: 0 });
      Snd.tone(110, 0.6, 'sawtooth', 0.08); Snd.noise(0.5, 0, 0.3, 250);
      land('😡', c, [{ transform: T(0, 0, 1.6), filter: 'none' }, { transform: T(0, 0, 2.4), filter: 'drop-shadow(0 0 14px red)', offset: 0.2 }, { transform: T(0, 0, 1.8), offset: 0.35 }, { transform: T(0, 0, 2.6), filter: 'drop-shadow(0 0 18px red)', offset: 0.55 }, { transform: T(0, 0, 2), opacity: 1, offset: 0.85 }, { transform: T(0, 0, 2), opacity: 0 }], 1400);
      shake(c.b, 9, 700); [0, 250, 500].forEach((t) => ring(c.tx, c.ty, '#E5383B', { size: 150, delay: t, w: 5 }));
      for (let i = 0; i < 6; i++) later(150 + i * 140, () => { const a = rnd(0, Math.PI * 2); const d = mk('💢', c.tx + Math.cos(a) * 44, c.ty + Math.sin(a) * 44); d.style.fontSize = '24px'; run(d, [{ transform: T(0, 0, 0.2), opacity: 1 }, { transform: T(0, 0, 1.4), opacity: 1, offset: 0.4 }, { transform: T(0, 0, 0.8), opacity: 0 }], 500); });
      for (let i = 0; i < 4; i++) later(300 + i * 160, () => toss('💨', c.tx + (i % 2 ? 26 : -26), c.ty - 30, (i % 2 ? 1 : -1) * 30, -120, { g: -40, dur: 800, size: 22 }));
    },
    '❤️': async (c) => {
      await fly('❤️', c, { arc: -110, spin: 10 });
      Snd.tone(90, 0.18, 'sine', 0.25); Snd.tone(90, 0.18, 'sine', 0.25, 0.28); Snd.chord([1046, 1318, 1568], 0.6, 'sine', 0.04, 0.6);
      land('❤️', c, [{ transform: T(0, 0, 1.4) }, { transform: T(0, 0, 2.3), offset: 0.12 }, { transform: T(0, 0, 1.6), offset: 0.25 }, { transform: T(0, 0, 2.6), offset: 0.38 }, { transform: T(0, 0, 1.8), opacity: 1, offset: 0.5 }, { transform: T(0, -20, 0.6), opacity: 0 }], 1300);
      later(620, () => { // 爱心形状排列的小心心
        for (let i = 0; i < 18; i++) { const t = (i / 18) * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3), hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); const d = mk(i % 3 ? '💕' : '❤️', c.tx, c.ty); d.style.fontSize = '16px'; run(d, [{ transform: T(0, 0, 0.2), opacity: 1 }, { transform: T(hx * 5, hy * 5, 1), opacity: 1, offset: 0.5 }, { transform: T(hx * 6, hy * 6 - 50, 0.8), opacity: 0 }], 1300); }
      });
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'drop-shadow(0 0 12px #ff4d8d) brightness(1.2)', offset: 0.4 }, { filter: 'none' }], 1500);
    },
    '🌹': async (c) => {
      await fly('🌹', c, { arc: -120, spin: 200, dur: 900 });
      [784, 988, 1175, 1568, 1976].forEach((f, i) => Snd.tone(f, 0.5, 'sine', 0.05, i * 0.09));
      land('🌹', c, [{ transform: T(0, 0, 1.5, -20) }, { transform: T(0, -6, 2, 0), offset: 0.3 }, { transform: T(0, 0, 1.8, 0), opacity: 1, offset: 0.85 }, { transform: T(0, 0, 1.8), opacity: 0 }], 1900);
      for (let i = 0; i < 16; i++) later(i * 70, () => { const x0 = c.tx + rnd(-90, 90), d = mk('', x0, c.ty - 120, 'ef-petal', { background: i % 3 ? '#E8466B' : '#FF8FAB' }); const sway = rnd(20, 40); run(d, [{ transform: `translate(-50%,-50%) rotate(0deg)`, opacity: 0 }, { transform: `translate(calc(-50% + ${sway}px), 40px) rotate(120deg)`, opacity: 1, offset: 0.3 }, { transform: `translate(calc(-50% - ${sway}px), 110px) rotate(260deg)`, opacity: 1, offset: 0.7 }, { transform: `translate(-50%, 170px) rotate(380deg)`, opacity: 0 }], { duration: rnd(1300, 1800), easing: 'ease-in-out' }); });
    },
    '👏': async (c) => {
      await fly('👏', c, { dur: 550, scale: 1.6 });
      for (let i = 0; i < 7; i++) later(i * 150, () => {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2, x = c.tx + Math.cos(a) * 58, y = c.ty + Math.sin(a) * 58;
        Snd.noise(0.06, 0, 0.55, 2400 + i * 120);
        const d = mk('👏', x, y); d.style.fontSize = '30px'; run(d, [{ transform: T(0, 0, 0.3, -30), opacity: 0 }, { transform: T(0, 0, 1.4, 10), opacity: 1, offset: 0.3 }, { transform: T(0, 0, 1, 0), opacity: 1, offset: 0.7 }, { transform: T(0, -20, 0.8), opacity: 0 }], 900);
        ring(x, y, '#F5B700', { size: 70, dur: 450, w: 3 });
      });
      later(1050, () => { caption(c.tx, c.ty - 40, '漂亮！', '#E2A100', { size: 26 }); Snd.win(); });
    },
    '🎉': async (c) => {
      await fly('🎉', c, { spin: -40 });
      Snd.noise(0.15, 0, 0.6, 1500); Snd.win();
      land('🎉', c, [{ transform: T(0, 0, 1.4, 0) }, { transform: T(0, 0, 2.4, -25), offset: 0.15 }, { transform: T(0, 0, 2, -15), opacity: 1, offset: 0.8 }, { transform: T(0, 0, 2), opacity: 0 }], 1500);
      const cols = ['#E6194B', '#F58231', '#FFD400', '#2FB344', '#00C2D1', '#2F5BEA', '#9B27D8', '#FF69B4'];
      for (let i = 0; i < 46; i++) { const d = mk('', c.tx, c.ty, 'ef-strip', { background: cols[i % 8] }); const vx = rnd(-260, 260), vy = rnd(-560, -300), sp = rnd(-720, 720), N = 10, du = rnd(1300, 1900); const kf = []; for (let k = 0; k <= N; k++) { const t = (k / N) * (du / 1000); kf.push({ transform: `translate(calc(-50% + ${vx * t}px), calc(-50% + ${vy * t + 450 * t * t}px)) rotate(${sp * k / N}deg) rotateX(${k * 70}deg)`, opacity: k < N - 2 ? 1 : 0 }); } run(d, kf, { duration: du, easing: 'linear' }); }
    },
    '🙏': async (c) => {
      await fly('🙏', c, { arc: -60, dur: 900, scale: 1.6, spin: 0 });
      Snd.chord([523, 659, 784], 1.4, 'sine', 0.045); Snd.chord([1046, 1318], 1.2, 'sine', 0.02, 0.3);
      const r = mk('', c.tx, c.ty, 'ef-rays'); run(r, [{ transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(60deg)', opacity: 0.9, offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(1.1) rotate(150deg)', opacity: 0 }], 1900);
      const h = mk('', c.tx, c.ty - 34, 'ef-halo'); run(h, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-60%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-60%) scale(1.2)', opacity: 0 }], 1900);
      land('🙏', c, [{ transform: T(0, 0, 1.6), opacity: 1 }, { transform: T(0, -8, 1.8), offset: 0.3 }, { transform: T(0, 0, 1.6), offset: 0.6 }, { transform: T(0, -8, 1.8), opacity: 1, offset: 0.85 }, { transform: T(0, -8, 1.8), opacity: 0 }], 1900);
      later(400, () => burst('✨', c.tx, c.ty, 10, { r: [50, 100], size: [12, 20] }));
    },
    '🤝': async (c) => {
      const mx = (c.sx + c.tx) / 2, my = (c.sy + c.ty) / 2 - 40;
      Snd.swoosh();
      await Promise.all([fly('🫱', { ...c, tx: mx - 14, ty: my }, { arc: -60, dur: 650, scale: 1.8, spin: 0 }), fly('🫲', { ...c, tx: mx + 14, ty: my }, { arc: -60, dur: 650, scale: 1.8, spin: 0, fromX: c.tx, fromY: c.ty })]);
      Snd.noise(0.1, 0, 0.6, 2000); Snd.plus(); flash('#fff', { dur: 220, op: 0.35 });
      const d = mk('🤝', mx, my); run(d, [{ transform: T(0, 0, 1.4) }, { transform: T(0, 0, 3), offset: 0.2 }, { transform: T(0, 0, 2.4), opacity: 1, offset: 0.8 }, { transform: T(0, -20, 2.4), opacity: 0 }], 1500);
      ring(mx, my, '#2DA44E', { size: 200 }); burst(['✨', '⭐'], mx, my, 14, { r: [80, 150] });
      caption(mx, my - 50, '合作愉快', '#2DA44E', { delay: 200, size: 22 });
    },
    '💰': async (c) => {
      await fly('💰', c, { arc: -200, dur: 900, spin: 30, scale: 1.8 });
      Snd.noise(0.12, 0, 0.5, 300); [2093, 2637, 3136].forEach((f, i) => Snd.tone(f, 0.25, 'sine', 0.06, 0.1 + i * 0.08));
      land('💰', c, [{ transform: T(0, 0, 2.2) }, { transform: 'translate(-50%,-38%) scale(2.6,1.7)', offset: 0.1 }, { transform: T(0, -14, 2, 0), offset: 0.25 }, { transform: T(0, 0, 2.1), opacity: 1, offset: 0.85 }, { transform: T(0, 0, 2.1), opacity: 0 }], 1700);
      for (let i = 0; i < 24; i++) later(100 + i * 35, () => { toss('🪙', c.tx, c.ty - 20, rnd(-200, 200), rnd(-560, -320), { dur: 1100, size: rnd(16, 24), spin: rnd(-540, 540) }); if (i % 4 === 0) Snd.tone(rnd(1800, 2600), 0.08, 'sine', 0.04); });
      caption(c.tx, c.ty - 60, '¥¥¥', '#E2A100', { delay: 300, size: 26 });
    },
    '👑': async (c) => {
      await fly('👑', c, { arc: -260, dur: 900, scale: 1.8, spin: 0 });
      [523, 659, 784, 1046].forEach((f, i) => Snd.tone(f, i === 3 ? 0.6 : 0.16, 'square', 0.04, i * 0.13));
      const r = mk('', c.tx, c.ty, 'ef-rays gold'); run(r, [{ transform: 'translate(-50%,-50%) scale(.2) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.1) rotate(80deg)', opacity: 1, offset: 0.4 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(160deg)', opacity: 0 }], 2000);
      land('👑', c, [{ transform: T(0, -120, 2.4, -10), opacity: 0 }, { transform: T(0, -34, 1.9, 0), opacity: 1, offset: 0.35 }, { transform: T(0, -26, 1.7, 0), offset: 0.45 }, { transform: T(0, -30, 1.8, 0), opacity: 1, offset: 0.88 }, { transform: T(0, -30, 1.8), opacity: 0 }], 2000);
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'drop-shadow(0 0 14px #FFC300) brightness(1.25)', offset: 0.4 }, { filter: 'drop-shadow(0 0 14px #FFC300) brightness(1.25)', offset: 0.8 }, { filter: 'none' }], 2000);
      later(700, () => { burst('✨', c.tx, c.ty - 30, 12, { r: [60, 120], size: [12, 22] }); caption(c.tx, c.ty - 80, '王者', '#C98A00', { size: 24 }); });
    },
    '⚡️': async (c) => {
      Snd.sweep(300, 1400, 0.25, 'sawtooth', 0.03);
      await fly('⚡️', c, { arc: -260, dur: 500, scale: 1.4, spin: 0 });
      const top = -20, pts = [[c.tx, top]]; let y = top; while (y < c.ty - 30) { y += rnd(40, 80); pts.push([c.tx + rnd(-40, 40), Math.min(y, c.ty)]); } pts.push([c.tx, c.ty]);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ef-bolt'); svg.innerHTML = `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" opacity=".45"/><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#FFE45C" stroke-width="4" stroke-linejoin="round"/>`; FL().appendChild(svg);
      run(svg, [{ opacity: 1 }, { opacity: 0.1, offset: 0.2 }, { opacity: 1, offset: 0.35 }, { opacity: 0.2, offset: 0.55 }, { opacity: 1, offset: 0.65 }, { opacity: 0 }], 650);
      flash('#fff', { dur: 380, op: 0.85 }); Snd.noise(0.5, 0, 0.8, 900); Snd.tone(60, 0.8, 'sawtooth', 0.08, 0.05);
      boardShake(10, 450);
      c.b && c.b.animate([{ filter: 'brightness(3)' }, { filter: 'brightness(.25) contrast(1.5)', offset: 0.2 }, { filter: 'brightness(.25) contrast(1.5)', offset: 0.7 }, { filter: 'none' }], 1300);
      burst(['✨', '⚡️'], c.tx, c.ty, 14, { r: [50, 130], size: [14, 24] });
      later(250, () => { for (let i = 0; i < 3; i++) toss('💨', c.tx + rnd(-10, 10), c.ty - 10, rnd(-30, 30), -90, { g: -30, dur: 1000, size: 24 }); });
    },
    '🔥': async (c) => {
      Snd.noise(0.9, 0, 0.35, 420);
      await fly('🔥', c, { trail: '🔥', every: 40, dur: 750, scale: 1.8, spin: 0 });
      Snd.noise(1.2, 0, 0.45, 300); Snd.sweep(200, 90, 1, 'sawtooth', 0.04);
      for (let i = 0; i < 18; i++) later(i * 60, () => { const d = mk('🔥', c.tx + rnd(-30, 30), c.ty + 10); d.style.fontSize = rnd(20, 40) + 'px'; run(d, [{ transform: T(0, 0, 0.4), opacity: 0 }, { transform: T(rnd(-8, 8), -40, 1.2), opacity: 1, offset: 0.4 }, { transform: T(rnd(-14, 14), -110, 0.4), opacity: 0 }], { duration: 900, easing: 'ease-out' }); });
      for (let i = 0; i < 16; i++) later(200 + i * 60, () => { const d = mk('', c.tx + rnd(-40, 40), c.ty, 'ef-ember'); run(d, [{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${rnd(-40, 40)}px), ${-rnd(90, 160)}px)`, opacity: 0 }], 1100); });
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'drop-shadow(0 0 14px #FF6A00) sepia(.6) saturate(3) hue-rotate(-20deg)', offset: 0.3 }, { filter: 'drop-shadow(0 0 14px #FF6A00) sepia(.6) saturate(3) hue-rotate(-20deg)', offset: 0.8 }, { filter: 'none' }], 1600);
    },
    '💣': async (c) => {
      await fly('💣', c, { arc: -180, dur: 900, spin: 360, scale: 1.7 });
      Snd.noise(0.1, 0, 0.4, 300);
      const b = mk('💣', c.tx, c.ty); b.style.fontSize = '50px'; const fuse = mk('✨', c.tx + 18, c.ty - 26); fuse.style.fontSize = '20px';
      run(fuse, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ opacity: i % 2 ? 0.3 : 1, transform: T(0, 0, i % 2 ? 0.7 : 1.3) })), 1000);
      [0, 380, 650, 830, 950].forEach((t) => Snd.tone(1600, 0.06, 'square', 0.05, t / 1000));
      b.animate([{ transform: T(0, 0, 1) }, { transform: T(0, 0, 1.25), offset: 0.38 }, { transform: T(0, 0, 1), offset: 0.45 }, { transform: T(0, 0, 1.35), offset: 0.65 }, { transform: T(0, 0, 1.05), offset: 0.72 }, { transform: T(0, 0, 1.6), offset: 0.95 }, { transform: T(0, 0, 1.6) }], 1000).onfinish = () => {
        b.remove(); Snd.noise(0.9, 0, 0.9, 160); Snd.tone(45, 1, 'sine', 0.3); flash('#FFB347', { dur: 450, op: 0.6 }); boardShake(14, 650);
        const f = mk('', c.tx, c.ty, 'ef-boom'); run(f, [{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.4 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], 700);
        ring(c.tx, c.ty, '#FF6A00', { size: 320, w: 8, dur: 650 }); burst(['💥', '🔥', '💥', '🪨'], c.tx, c.ty, 16, { r: [90, 200], size: [18, 34] });
        for (let i = 0; i < 6; i++) toss('☁️', c.tx + rnd(-30, 30), c.ty, rnd(-60, 60), rnd(-140, -60), { g: -20, dur: 1400, size: rnd(26, 40) });
        c.b && c.b.animate([{ filter: 'none' }, { filter: 'brightness(.3) sepia(1)', offset: 0.2 }, { filter: 'brightness(.5) sepia(1)', offset: 0.7 }, { filter: 'none' }], 1600); shake(c.b, 10, 600);
      };
    },
    '💩': async (c) => {
      Snd.sweep(500, 900, 0.5, 'triangle', 0.05);
      await fly('💩', c, { arc: -260, dur: 950, spin: 720, scale: 1.6 });
      Snd.noise(0.25, 0, 0.7, 260); Snd.sweep(400, 120, 0.4, 'square', 0.04, 0.05);
      land('💩', c, [{ transform: T(0, 0, 1.6) }, { transform: 'translate(-50%,-30%) scale(2.6,.9)', offset: 0.08 }, { transform: 'translate(-50%,-50%) scale(1.5,1.9)', offset: 0.18 }, { transform: T(0, 0, 1.7), opacity: 1, offset: 0.9 }, { transform: T(0, 0, 1.7), opacity: 0 }], 2200);
      for (let i = 0; i < 12; i++) { const a = rnd(0, Math.PI * 2), r = rnd(30, 75), d = mk('', c.tx, c.ty + 8, 'ef-blob', { width: rnd(8, 16) + 'px', height: rnd(6, 12) + 'px' }); run(d, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * 0.5}px)) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * 0.5}px)) scale(1)`, opacity: 0 }], 1800); }
      for (let k = 0; k < 2; k++) { const f = mk('🪰', c.tx, c.ty); f.style.fontSize = '16px'; const kf = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 4 + k * Math.PI; kf.push({ transform: T(Math.cos(a) * (40 + k * 10), Math.sin(a) * 22 - 40 + Math.sin(i) * 6, 1, 0), opacity: i > 21 ? 0 : 1 }); } run(f, kf, { duration: 2000, delay: 300, fill: 'backwards' }); }
      for (let i = 0; i < 6; i++) Snd.tone(220 + (i % 2) * 15, 0.15, 'sawtooth', 0.012, 0.4 + i * 0.25);
    },
    '🥶': async (c) => {
      Snd.tone(2400, 0.3, 'sine', 0.04); Snd.tone(3200, 0.3, 'sine', 0.03, 0.15);
      await fly('🥶', c, { trail: '❄️', every: 50, scale: 1.8 });
      Snd.noise(0.4, 0, 0.35, 6000); [2637, 3136, 3520, 4186].forEach((f, i) => Snd.tone(f, 0.4, 'sine', 0.03, i * 0.06));
      const ice = mk('', c.tx, c.ty, 'ef-ice'); run(ice, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.78 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0 }], 1900);
      land('🥶', c, [{ transform: T(0, 0, 1.6) }, { transform: T(-2, 0, 1.6), offset: 0.3 }, { transform: T(2, 0, 1.6), offset: 0.35 }, { transform: T(-2, 0, 1.6), offset: 0.4 }, { transform: T(0, 0, 1.6), opacity: 1, offset: 0.78 }, { transform: T(0, 0, 1.6), opacity: 0 }], 1900);
      burst('❄️', c.tx, c.ty, 12, { r: [60, 120], size: [14, 22] });
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'saturate(.2) brightness(1.3) hue-rotate(170deg)', offset: 0.2 }, { filter: 'saturate(.2) brightness(1.3) hue-rotate(170deg)', offset: 0.8 }, { filter: 'none' }], 1900);
      later(1450, () => { Snd.noise(0.25, 0, 0.5, 4500); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, d = mk('', c.tx, c.ty, 'ef-shard'); run(d, [{ transform: `translate(-50%,-50%) rotate(${a}rad)`, opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * 90}px), calc(-50% + ${Math.sin(a) * 90 + 40}px)) rotate(${a + 3}rad)`, opacity: 0 }], 600); } });
    },
    '😱': async (c) => {
      await fly('😱', c, { dur: 600, scale: 1.6 });
      Snd.sweep(380, 1300, 0.7, 'sawtooth', 0.05); Snd.sweep(400, 1350, 0.7, 'square', 0.02);
      boardShake(7, 600);
      land('😱', c, [{ transform: T(0, 0, 1.4), opacity: 1 }, { transform: T(0, 0, 2.2), opacity: 1, offset: 0.2 }, { transform: T(0, 0, 2.2), opacity: 1, offset: 0.4 }, { transform: T(0, 0, 9), opacity: 0 }], 1300);
      [0, 120, 240, 360].forEach((t) => ring(c.tx, c.ty, '#5B4BD6', { size: 240, w: 3, delay: t, dur: 600 }));
      const d = mk('', 0, 0, 'ef-flash', { background: 'radial-gradient(circle at ' + c.tx + 'px ' + c.ty + 'px, transparent 0, transparent 120px, rgba(20,10,60,.45) 420px)' }); run(d, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], 1200);
      c.b && c.b.animate([{ filter: 'none' }, { filter: 'grayscale(1) contrast(1.4)', offset: 0.2 }, { filter: 'grayscale(1) contrast(1.4)', offset: 0.7 }, { filter: 'none' }], 1200);
      caption(c.tx, c.ty - 60, '啊——！', '#5B4BD6', { size: 26, delay: 150 });
    },
    '🤡': async (c) => {
      await fly('🤡', c, { spin: 720, trail: () => ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'][Math.floor(Math.random() * 6)], every: 45, dur: 900 });
      Snd.tone(300, 0.18, 'square', 0.06); Snd.tone(240, 0.3, 'square', 0.06, 0.2); Snd.sweep(200, 800, 0.35, 'sine', 0.06, 0.5);
      land('🤡', c, [{ transform: T(0, 0, 1.6) }, { transform: 'translate(-50%,-40%) scale(2.4,1.2)', offset: 0.1 }, { transform: T(0, -60, 1.5), offset: 0.25 }, { transform: 'translate(-50%,-40%) scale(2.2,1.3)', offset: 0.4 }, { transform: T(0, -30, 1.6), offset: 0.52 }, { transform: 'translate(-50%,-45%) scale(1.9,1.5)', offset: 0.62 }, { transform: T(0, 0, 1.7), opacity: 1, offset: 0.9 }, { transform: T(0, 0, 1.7), opacity: 0 }], 1800);
      ['#E6194B', '#FFD400', '#2FB344', '#2F5BEA'].forEach((col, i) => ring(c.tx, c.ty, col, { size: 120 + i * 40, delay: i * 90, w: 4 }));
      for (let i = 0; i < 3; i++) later(300 + i * 200, () => toss('🎈', c.tx + (i - 1) * 30, c.ty - 20, (i - 1) * 20, -160, { g: -60, dur: 1600, size: 26 }));
    },
    '🚀': async (c) => {
      Snd.noise(1.5, 0, 0.3, 600); Snd.sweep(150, 900, 1.5, 'sawtooth', 0.03);
      await fly('🚀', c, { trail: '💨', every: 35, dur: 800, arc: -80, spin: 0, scale: 1.6 });
      // 绕目标一圈后冲天而去
      const d = mk('🚀', c.tx, c.ty); d.style.fontSize = '42px'; const kf = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2 + Math.PI / 2; kf.push({ transform: T(Math.cos(a) * 55, Math.sin(a) * 55, 1, (a * 180) / Math.PI + 90 - 45) }); }
      kf.push({ transform: T(0, -window.innerHeight, 1.2, -45) });
      kf.forEach((k, i) => (k.offset = i < 17 ? (i / 16) * 0.65 : 1));
      run(d, kf, { duration: 1500, easing: 'linear' });
      later(980, () => { Snd.sweep(300, 1600, 0.5, 'sawtooth', 0.05); for (let i = 0; i < 8; i++) toss('🔥', c.tx, c.ty - 40 - i * 30, rnd(-20, 20), 80, { g: 200, dur: 600, size: 18 }); burst('⭐', c.tx, c.ty - 60, 10, { r: [60, 120], size: [12, 20] }); });
    },
    '🎁': async (c) => {
      await fly('🎁', c, { arc: -220, dur: 850, spin: 20, scale: 1.8 });
      Snd.noise(0.1, 0, 0.4, 400);
      const g = mk('🎁', c.tx, c.ty); g.style.fontSize = '50px';
      [0, 0.25, 0.45].forEach((t) => Snd.noise(0.06, t + 0.3, 0.3, 1800));
      g.animate([{ transform: T(0, 0, 1) }, { transform: T(0, 0, 1, -12), offset: 0.3 }, { transform: T(0, 0, 1, 12), offset: 0.38 }, { transform: T(0, 0, 1, -14), offset: 0.5 }, { transform: T(0, 0, 1, 14), offset: 0.58 }, { transform: T(0, 0, 1.3, 0), offset: 0.85 }, { transform: T(0, 0, 0.2, 0), opacity: 0 }], 1100).onfinish = () => {
        g.remove(); Snd.chord([1046, 1318, 1568, 2093], 0.8, 'sine', 0.04); flash('#FFF4C2', { dur: 300, op: 0.5 });
        const prize = ['💎', '🍀', '🌟', '🏆', '💵'][Math.floor(Math.random() * 5)];
        land(prize, c, [{ transform: T(0, 0, 0.3), opacity: 0 }, { transform: T(0, -50, 2.4, 0), opacity: 1, offset: 0.25 }, { transform: T(0, -46, 2.1), opacity: 1, offset: 0.85 }, { transform: T(0, -60, 2.1), opacity: 0 }], 1500);
        burst(['⭐', '✨', '🎀'], c.tx, c.ty, 16, { r: [70, 150], size: [14, 24] }); ring(c.tx, c.ty, '#E2A100', { size: 200 });
        caption(c.tx, c.ty - 100, '惊喜！', '#E2A100', { size: 24 });
      };
    },
    '💎': async (c) => {
      await fly('💎', c, { trail: '✨', every: 60, scale: 1.8, spin: 0 });
      [2637, 3136, 3520, 4186, 3520].forEach((f, i) => Snd.tone(f, 0.35, 'sine', 0.035, i * 0.11));
      land('💎', c, [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: `translate(-50%,-50%) scale(${i % 2 ? 0.25 * 2 : 2}, 2)`, opacity: i === 6 ? 0 : 1 })), { duration: 1700, easing: 'ease-in-out' });
      const cols = ['#FF5E5E', '#FFB13B', '#FFE45C', '#5EE07A', '#4FC3F7', '#7C6CFF', '#E66BFF'];
      later(200, () => { for (let i = 0; i < 14; i++) { const a = (i / 14) * 360, d = mk('', c.tx, c.ty, 'ef-glint', { background: cols[i % 7] }); run(d, [{ transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-20px) scaleY(.2)`, opacity: 0 }, { transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-60px) scaleY(1)`, opacity: 1, offset: 0.4 }, { transform: `translate(-50%,-50%) rotate(${a + 30}deg) translateY(-90px) scaleY(.4)`, opacity: 0 }], 1100); } });
      for (let i = 0; i < 8; i++) later(i * 160, () => { const d = mk('✨', c.tx + rnd(-60, 60), c.ty + rnd(-60, 40)); d.style.fontSize = rnd(12, 22) + 'px'; run(d, [{ transform: T(0, 0, 0), opacity: 0 }, { transform: T(0, 0, 1.3, 90), opacity: 1, offset: 0.5 }, { transform: T(0, 0, 0, 180), opacity: 0 }], 600); });
    },
    '⏰': async (c) => {
      await fly('⏰', c, { dur: 500, arc: -60, scale: 1.6 });
      for (let i = 0; i < 14; i++) Snd.tone(i % 2 ? 2200 : 1800, 0.05, 'square', 0.035, i * 0.06);
      land('⏰', c, [...Array(16)].map((_, i) => ({ transform: T(i % 2 ? 3 : -3, 0, 2, i === 15 ? 0 : (i % 2 ? 16 : -16)), opacity: i === 15 ? 0 : 1 })), 1400);
      [0, 200, 400, 600].forEach((t) => ring(c.tx, c.ty, '#E5383B', { size: 130, w: 3, delay: t, dur: 500 }));
      shake(c.b, 5, 900);
      caption(c.tx, c.ty - 56, '快点！', '#E5383B', { size: 26, delay: 150 });
      later(500, () => caption(c.tx + 46, c.ty - 30, '⏱', '#E5383B', { size: 20 }));
    },
    '💤': async (c) => {
      await fly('💤', c, { arc: -50, dur: 1200, scale: 1.4, spin: 0 });
      Snd.sweep(330, 160, 1.2, 'sine', 0.07); Snd.sweep(300, 150, 1.2, 'sine', 0.05, 1.3);
      for (let i = 0; i < 5; i++) later(i * 300, () => { const d = mk('Z', c.tx + 14, c.ty - 16, 'ef-z'); d.style.fontSize = 14 + i * 5 + 'px'; const kf = []; for (let k = 0; k <= 10; k++) kf.push({ transform: T(k * 7 + Math.sin(k) * 10, -k * 12, 0.6 + k * 0.06, -10), opacity: k < 2 ? k / 2 : k > 8 ? (10 - k) / 2 : 1 }); run(d, kf, { duration: 1600, easing: 'linear' }); });
      c.b && c.b.animate([{ opacity: 1, rotate: '0deg' }, { opacity: 0.55, rotate: '-8deg', offset: 0.3 }, { opacity: 0.55, rotate: '8deg', offset: 0.6 }, { opacity: 1, rotate: '0deg' }], 2200);
      land('😴', c, [{ transform: T(0, 0, 0.5), opacity: 0 }, { transform: T(0, -6, 1.5), opacity: 1, offset: 0.2 }, { transform: T(0, 0, 1.5), opacity: 1, offset: 0.85 }, { transform: T(0, 0, 1.5), opacity: 0 }], 2200);
    },
  };
  const LABEL = { '👍': '点赞', '😂': '笑哭', '😭': '大哭', '😡': '生气', '❤️': '爱心', '🌹': '献花', '👏': '鼓掌', '🎉': '庆祝', '🙏': '拜托', '🤝': '合作', '💰': '撒钱', '👑': '王者', '⚡️': '雷劈', '🔥': '火力', '💣': '炸弹', '💩': '便便', '🥶': '冻住', '😱': '惊吓', '🤡': '小丑', '🚀': '起飞', '🎁': '礼物', '💎': '钻石', '⏰': '催促', '💤': '睡着' };
  window.EMO_LABEL = LABEL;
  window.emoteFx = (e, from, to) => {
    const a = tokenEls[from], b = tokenEls[to]; if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const c = { e, a, b, sx: ra.left + ra.width / 2, sy: ra.top + ra.height / 2, tx: rb.left + rb.width / 2, ty: rb.top + rb.height / 2 };
    Snd.swoosh();
    (FX[e] || FX['👍'])(c);
  };
})();
