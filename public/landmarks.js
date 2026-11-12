// 各城市地标的简笔图标（24×24，自己画的矢量图）
(function () {
  const ONION = '<path d="M12 3c.3 1.5 2.5 2.5 2.5 4.5 0 1.2-.8 2-1.5 2.5h-2c-.7-.5-1.5-1.3-1.5-2.5C9.5 5.5 11.7 4.5 12 3z"/><path d="M10.5 10h3v11h-3z"/>';
  const cols = (xs, y, h, w = 1.6) => xs.map((x) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
  const arches = (xs, y, h) => xs.map((x) => `M${x} ${y}v-${h}a1 1 0 0 1 2 0v${h}z`).join('');

  const L = {
    '开罗': '<path d="M1 21 9 7l8 14z"/><path d="M13.5 21l4.5-8 5 8z" opacity=".55"/>',
    '孟买': '<path d="M4 21V10h16v11h-5v-5a3 3 0 0 0-6 0v5z"/><rect x="3" y="8" width="18" height="2"/><path d="M5 8V5h2v3zM17 8V5h2v3zM10 8V6a2 2 0 0 1 4 0v2z"/>',
    '曼谷': '<path d="M12 2l1.5 5h-3zM9.5 7h5l1 5h-7zM7.5 12h9l1.5 9H6z"/><path d="M2.5 21l1.5-7 1.5 7zM18.5 21l1.5-7 1.5 7z" opacity=".7"/>',
    '雅加达': '<path d="M11 6h2l.6 11h-3.2z"/><path d="M12 1.5c1 1.2 1.3 2.2.9 3.5h-1.8c-.4-1.3-.1-2.3.9-3.5z"/><path d="M6 17h12l-2 2H8zM4 19.5h16V21H4z"/>',
    '仰光': '<rect x="11.6" y="1.5" width=".8" height="4"/><path d="M12 5c1 3 1.5 5 4 8 1.5 1.8 2.5 3 3 5H5c.5-2 1.5-3.2 3-5 2.500-3 3-5 4-8z"/><rect x="3" y="18" width="18" height="3"/>',
    '吉隆坡': '<path d="M5 21V11l1-2V6l1-4 1 4v3l1 2v10zM15 21V11l1-2V6l1-4 1 4v3l1 2v10z"/><rect x="9" y="12" width="6" height="1.2"/>',
    '新加坡': '<path d="M4 21V9h3.500v12zM10.250 21V9h3.500v12zM16.500 21V9H20v12z"/><path d="M2 6h20c0 1.500-1 2.200-2.500 2.200h-15C3 8.200 2 7.500 2 6z"/>',
    '首尔': '<path d="M11.4 2h1.2v5h-1.2zM9.500 7h5v3h-5zM11 10h2v6h-2z"/><path d="M2 21c3-4 6-6 10-6s7 2 10 6z"/>',
    '伊斯坦堡': '<path d="M6 21v-6a6 6 0 0 1 12 0v6z"/><path d="M11.600 6.500h.8V9h-.8z"/><path d="M2.500 21V7l1-3 1 3v14zM19.500 21V7l1-3 1 3v14z"/>',
    '莫斯科': ONION + `<g transform="translate(-1.94 7.98) scale(.62)" opacity=".8">${ONION}</g><g transform="translate(11.06 7.98) scale(.62)" opacity=".8">${ONION}</g>`,
    '迪拜': '<path d="M11.700 1h.6l.5 6 1 .5V12l1 .5V17l1.200.5V21H8v-3.500L9.200 17v-4.500l1-.5V7.500l1-.5z"/>',
    '里约': '<path d="M11.300 4.200a.9.9 0 1 1 1.400 0l.3.8H19v1.400h-5.600V12h-2.800V6.400H5V5h6z"/><path d="M3 21c2-5 5-9 9-9s7 4 9 9z"/>',
    '墨西哥城': '<path d="M2 21v-3h3v-3h3v-3h2.500V9h3v3H16v3h3v3h3v3z"/><rect x="10.500" y="6" width="3" height="3" opacity=".7"/>',
    '开普敦': '<path d="M1 21l4-9c.3-.7.8-1 1.500-1h9c.7 0 1.200.3 1.600 1l1.400 2.500 1.500-1.500 3 8z"/><circle cx="19.500" cy="5.500" r="2" opacity=".7"/>',
    '悉尼': '<path d="M3 19c0-6 3-10 7-12-1 4-1 8 0 12zM10.500 19c0-5 2-8.500 5.500-10.500-1 3.500-1 7 0 10.500zM16.500 19c0-3.500 1.500-6 4-7.500-.5 2.500-.5 5 .5 7.500z"/><rect x="2" y="19" width="20" height="2"/>',
    '多伦多': '<path d="M11.700 1h.6l.4 8h-1.400zM9.500 9h5l-.8 2.500h-3.400zM11 11.500h2l1 9.500h-4z"/>',
    '柏林': '<rect x="3" y="8" width="18" height="2.500"/><path d="M9.500 8V5.500h5V8z" opacity=".8"/>' + cols([4, 7.1, 10.2, 13.3, 16.4, 18.4], 10.5, 10.5),
    '雅典': '<path d="M2 9l10-5.500L22 9z"/><rect x="3" y="9.500" width="18" height="1.200"/><rect x="2" y="19.500" width="20" height="1.500"/>' + cols([4, 7.6, 11.2, 14.8, 18.4], 11, 8.5),
    '罗马': `<path fill-rule="evenodd" d="M3 21V8.500C3 7.700 3.700 7 4.500 7H16l5 3.500V21z${arches([4.5, 8, 11.5, 15, 18.5], 21, 3)}${arches([4.5, 8, 11.5, 15], 14.5, 2)}"/>`,
    '巴黎': '<path d="M11.500 1h1l.8 7h-2.600zM10.600 8.500h2.800l1 4.500H9.600zM9.400 13.500h5.200L18 21h-2.600c-.6-3-1.800-4.500-3.400-4.500S9.200 18 8.600 21H6z"/>',
    '北京': '<path d="M12 2.500l.6 1.500c2 .5 3.600 1.500 4.400 3H7c.8-1.500 2.400-2.500 4.400-3z"/><rect x="8.500" y="7" width="7" height="1.600"/><path d="M5.500 11c1-1.300 2-2 3-2.400h7c1 .4 2 1.100 3 2.400z"/><rect x="7.500" y="11" width="9" height="1.800"/><path d="M3.500 15.500c1.200-1.400 2.400-2.200 3.600-2.700h9.800c1.200.5 2.400 1.300 3.600 2.700z"/><rect x="6.500" y="15.500" width="11" height="3"/><rect x="3" y="18.500" width="18" height="2.500"/>',
    '上海': '<rect x="11.600" y="1" width=".8" height="5"/><circle cx="12" cy="7.500" r="2"/><rect x="11" y="9" width="2" height="5"/><circle cx="12" cy="15" r="3"/><path d="M10 17.500L6.500 21h2l2.500-2.500zM14 17.500l3.500 3.500h-2L13 18.500zM11 18h2v3h-2z"/>',
    '香港': '<path d="M3 17h18l-2.500 4h-13z"/><path d="M11 3c3 2 5 6 5 12h-5zM9.500 6c-2.500 2-4 5-4.500 9h4.500z"/><path d="M17 8c2 1.500 3 4 3 7h-3z" opacity=".8"/>',
    '阿姆斯特丹': '<path d="M9.500 21l1.200-9h2.600l1.200 9z"/><circle cx="12" cy="9" r="1.300"/><g transform="rotate(45 12 9)"><rect x="11.500" y="0" width="1" height="18"/><rect x="3" y="8.500" width="18" height="1"/><rect x="12.500" y=".5" width="2.200" height="6"/><rect x="9.300" y="11.500" width="2.200" height="6"/><rect x="14.500" y="9.500" width="6" height="2.200"/><rect x="3.500" y="6.300" width="6" height="2.200"/></g>',
    '旧金山': '<path d="M6 4h2v17H6zM16 4h2v17h-2z"/><rect x="1" y="14" width="22" height="1.500"/><path d="M1 12Q4 11 7 5Q12 15 17 5Q20 11 23 12" fill="none" stroke="currentColor" stroke-width="1"/>',
    '东京': '<path d="M2 5c3.500 1 16.500 1 20 0l-.5 2.500c-3 .8-16 .8-19 0z"/><rect x="4" y="10" width="16" height="1.600"/><path d="M6 7.800h2L8.500 21h-2zM16 7.800h2L17.500 21h-2z"/>',
    '伦敦': '<path fill-rule="evenodd" d="M9.500 21V8h5v13zM12 9.300a1.600 1.600 0 1 0 0 3.200 1.600 1.600 0 0 0 0-3.200z"/><path d="M9.500 8l.8-2h3.400l.8 2zM10.800 6L12 1.500 13.200 6z"/><rect x="8.500" y="19.500" width="7" height="1.500"/>',
    '纽约': '<path d="M8 21v-4h8v4z"/><path d="M9.500 17l.8-6.500h3.400l.8 6.500z"/><circle cx="12" cy="8.300" r="1.600"/><path d="M10.200 7l.5-1.800.9 1.200.4-1.800.4 1.800.9-1.200.5 1.800z"/><path d="M13.600 10.500l2-5.500h1.200l-1.600 6.500z"/><path d="M15.400 4.600c0-1 .5-1.600 1-2.600.5 1 1 1.600 1 2.600z"/>',
  };
  L['台北'] = '<path d="M11.6 1h.8v3h-.8zM10 4h4l-.6 2.5h-2.8zM9.6 6.5h4.8l-.7 2.5h-3.4zM9.6 9h4.8l-.7 2.5h-3.4zM9.6 11.5h4.8l-.7 2.5h-3.4zM9.6 14h4.8l-.7 2.5h-3.4zM9 16.5h6V21H9z"/>';
  L['利雅得'] = '<path fill-rule="evenodd" d="M8 21V3.5c1.5 3 6.5 3 8 0V21zM10 6.5c.5 2.5 3.500 2.500 4 0-1 1-3 1-4 0z"/>';
  L['日内瓦'] = '<path d="M11.4 20V4c-2.200 2-3.400 5-3.800 8.500M12.600 20V4c2.200 2 3.400 5 3.800 8.500" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 19c3-1.500 6-1.500 10 0s7 1.500 10 0v2H2z"/>';
  L['米兰'] = '<path d="M3 21v-7l2-6 1.500 4L8 6l1.700 5L12 2l2.300 9L16 6l1.500 6L19 8l2 6v7z"/>';
  L['大阪'] = '<path d="M12 2l1 2h-2zM7 7c2-.5 3.500-1.500 5-3 1.500 1.500 3 2.500 5 3zM9 7.500h6V10H9zM5 13c2.500-.6 4.500-1.600 7-3 2.500 1.400 4.500 2.400 7 3zM7.500 13.500h9V17h-9zM4 17.500h16V21H4z"/>';
  L['阿布扎比'] = '<path d="M7 21v-5a5 5 0 0 1 10 0v5zM2.500 21V8l1-3 1 3v13zM19.500 21V8l1-3 1 3v13z"/><path d="M11.600 8h.8v3h-.8z"/>';
  const G = ['<path d="M3 21V11h4v10zM8 21V5h5v16zM14 21V9h3v12zM18 21v-8h3v8z"/>', '<path d="M2 21v-7h4v7zM7 21V8l3-3 3 3v13zM14 21V12h4v9zM19 21v-5h3v5z"/>', '<path d="M3 21v-9l3-2v11zM7 21V6h4v15zM12 21V3l4 3v15zM17 21v-8h4v8z"/>'];
  // 双色明暗：左半边受光（提亮），加一条地面线
  window.landmark = (name) => { const g = L[name] || G[(name.charCodeAt(0) + name.length) % 3]; return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><defs><clipPath id="lmL"><rect width="11.5" height="24"/></clipPath></defs><rect x="1" y="21.6" width="22" height="1.1" rx=".55" opacity=".28"/><g>${g}</g><g clip-path="url(#lmL)" fill="#fff" opacity=".3">${g}</g></svg>`; };
})();
