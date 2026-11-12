// 特殊格子的矢量插画（自己绘制）：机场、港口、监狱、度假村、免费停车、机会、命运、传送门、幸运转盘
(function () {
  // 公共渐变：放在页面里一个不可见的 svg 中，所有图标共用
  const DEFS = `<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>
    <linearGradient id="gPlane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DFEE"/></linearGradient>
    <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A0"/><stop offset=".5" stop-color="#F5C542"/><stop offset="1" stop-color="#C88A12"/></linearGradient>
    <linearGradient id="gSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7C8596"/><stop offset=".45" stop-color="#E6EAF0"/><stop offset="1" stop-color="#6B7385"/></linearGradient>
    <linearGradient id="gJailWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A4A"/><stop offset="1" stop-color="#34507F"/></linearGradient>
    <linearGradient id="gPBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C9BFF"/><stop offset="1" stop-color="#1748C9"/></linearGradient>
    <linearGradient id="gChance" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB547"/><stop offset=".55" stop-color="#F7771F"/><stop offset="1" stop-color="#D9480F"/></linearGradient>
    <linearGradient id="gChest" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset=".55" stop-color="#1D4ED8"/><stop offset="1" stop-color="#1E2A78"/></linearGradient>
    <linearGradient id="gPortal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset=".5" stop-color="#A855F7"/><stop offset="1" stop-color="#EC4899"/></linearGradient>
    <radialGradient id="gPortalGlow"><stop offset="0" stop-color="#F5D0FE" stop-opacity=".95"/><stop offset=".35" stop-color="#A855F7" stop-opacity=".55"/><stop offset="1" stop-color="#4C1D95" stop-opacity="0"/></radialGradient>
    <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B3FB8"/><stop offset=".45" stop-color="#FF6F91"/><stop offset="1" stop-color="#FFB36B"/></linearGradient>
    <linearGradient id="gSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1FB5C9"/><stop offset="1" stop-color="#0B6F8C"/></linearGradient>
    <pattern id="pChk" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><rect width="3" height="3" fill="#111827"/><rect x="3" y="3" width="3" height="3" fill="#111827"/></pattern>
    <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#15803D"/></linearGradient>
    <linearGradient id="gNavy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F4FB8"/><stop offset="1" stop-color="#0F1F4D"/></linearGradient>
    <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C47F3E"/><stop offset="1" stop-color="#7A4517"/></linearGradient>
    <linearGradient id="gMarble" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#CBD5E1"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#B8C2D0"/></linearGradient>
    <linearGradient id="gGlobe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5BD3FF"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
    <radialGradient id="gSun"><stop offset="0" stop-color="#FFF7C2"/><stop offset=".55" stop-color="#FFD25A"/><stop offset="1" stop-color="#FF9E3D" stop-opacity="0"/></radialGradient>
  </defs></svg>`;
  document.body.insertAdjacentHTML('afterbegin', DEFS);

  const sv = (body, vb = '0 0 48 48', extra = '') => `<svg viewBox="${vb}" ${extra} aria-hidden="true">${body}</svg>`;
  const wins = (n, x0, dx, y, r = 0.62) => Array.from({ length: n }, (_, i) => `<circle cx="${x0 + i * dx}" cy="${y}" r="${r}"/>`).join('');
  // 幸运转盘的 8 个扇区
  const wheelSegs = (() => {
    const cols = ['#EF4444', '#F59E0B', '#FACC15', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'], cx = 24, cy = 25.5, r = 16.5;
    return cols.map((c, k) => { const a0 = (k / 8) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1) / 8) * Math.PI * 2 - Math.PI / 2; return `<path d="M${cx} ${cy}L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)}A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}z" fill="${c}"/>`; }).join('');
  })();
  const bulbs = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${(24 + 17.6 * Math.cos(a)).toFixed(2)}" cy="${(25.5 + 17.6 * Math.sin(a)).toFixed(2)}" r="1.05" class="${i % 2 ? 'b1' : 'b2'}"/>`; }).join('');
  const star4 = (x, y, s, fill) => `<path d="M${x} ${y - s}c${s * 0.18} ${s * 0.62} ${s * 0.38} ${s * 0.82} ${s} ${s}-${s * 0.62} ${s * 0.18}-${s * 0.82} ${s * 0.38}-${s} ${s}c-${s * 0.18}-${s * 0.62}-${s * 0.38}-${s * 0.82}-${s}-${s} ${s * 0.62}-${s * 0.18} ${s * 0.82}-${s * 0.38} ${s}-${s}z" fill="${fill}"/>`;

  const star5 = (cx, cy, R, r, fill) => `<path d="${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R; return (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); }).join('')}z" fill="${fill}"/>`;

  const ICON = {
    air: sv(`<path d="M3 39h10M5.5 43h14" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
      <g transform="rotate(-17 25 27)">
        <path d="M21.5 25.4l8.3-8.9h3.4l-4.3 8.9z" fill="#B9C8E0"/>
        <path d="M9.2 24.9L6.8 16.4h3.7l5.8 8.5z" fill="url(#gPlane)"/>
        <path d="M7.4 27.6c0-1.8 1.4-3 3.3-3h24c3.7 0 7.1 1.3 8.9 3-1.8 1.7-5.2 3-8.9 3h-24c-1.9 0-3.3-1.2-3.3-3z" fill="url(#gPlane)"/>
        <path d="M38.8 25.7c1.4.3 2.6.9 3.4 1.5h-3.6z" fill="#1E3A8A"/>
        <g fill="#3B82F6">${wins(8, 14, 3, 26.9)}</g>
        <path d="M21 29.2l9.6 8.8h3.5l-4.7-8.8z" fill="#fff"/><ellipse cx="27.5" cy="32.2" rx="2.7" ry="1.25" fill="#9FB1CC"/>
        <path d="M7.4 27.8h2.4" stroke="#EF4444" stroke-width="1.2"/>
      </g>`),
    port: sv(`<path d="M34 28V7.5h1.7V28zM27 7.5h15.5v1.7H27zM28.5 9.2l5.6 6.3M41 9.2v5.5" stroke="#FCD34D" stroke-width="1.2" fill="#FCD34D"/>
      <path d="M38.6 9.2v6.5" stroke="#E5E7EB" stroke-width=".7"/><rect x="37.4" y="15.6" width="2.4" height="1.8" rx=".3" fill="#F97316"/>
      <g stroke="#0F172A" stroke-width=".35">
        <rect x="16" y="20.6" width="4.8" height="3.9" fill="#F97316"/><rect x="20.8" y="20.6" width="4.8" height="3.9" fill="#22C55E"/><rect x="25.6" y="20.6" width="4.8" height="3.9" fill="#3B82F6"/><rect x="30.4" y="20.6" width="4.8" height="3.9" fill="#EF4444"/><rect x="35.2" y="20.6" width="4.8" height="3.9" fill="#FACC15"/>
        <rect x="18.4" y="16.7" width="4.8" height="3.9" fill="#3B82F6"/><rect x="23.2" y="16.7" width="4.8" height="3.9" fill="#FACC15"/><rect x="28" y="16.7" width="4.8" height="3.9" fill="#F97316"/>
      </g>
      <path d="M7.5 15h7v9.5h-7z" fill="#F8FAFC"/><rect x="8.5" y="16.6" width="5" height="1.4" rx=".3" fill="#1E3A8A"/><rect x="9.6" y="11.5" width="3" height="3.5" fill="#EF4444"/><rect x="9.6" y="11.5" width="3" height="1" fill="#0F172A"/>
      <path d="M3.5 24.5h41.5l-4.6 8.6H8.2z" fill="#16233B"/><path d="M5.5 29.5h37.8l-1 1.8H6.4z" fill="#DC2626"/><text x="12" y="28.2" font-size="2.6" font-weight="700" fill="#E2E8F0" font-family="Arial">WORLD BANK LINE</text>
      <path d="M1 38c2.9 0 2.9-1.7 5.8-1.7s2.9 1.7 5.8 1.7 2.9-1.7 5.8-1.7 2.9 1.7 5.8 1.7 2.9-1.7 5.8-1.7 2.9 1.7 5.8 1.7 2.9-1.7 5.8-1.7 2.9 1.7 5.8 1.7M5 42.5c2.9 0 2.9-1.5 5.8-1.5s2.9 1.5 5.8 1.5 2.9-1.5 5.8-1.5 2.9 1.5 5.8 1.5 2.9-1.5 5.8-1.5 2.9 1.5 5.8 1.5" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".75"/>`),
    jail: sv(`<rect x="7" y="5.5" width="30" height="31" rx="4.5" fill="url(#gJailWin)" stroke="#AEB6C4" stroke-width="2.6"/>
      <circle cx="29" cy="13" r="3.4" fill="#FFF3C4"/><circle cx="30.6" cy="12" r="3" fill="#1E2D50"/>
      ${star4(14, 12, 1.3, '#FFF3C4')}${star4(20, 18, 0.9, '#C7D2FE')}
      <g fill="url(#gSteel)"><rect x="11.3" y="5.5" width="2.6" height="31" rx="1.3"/><rect x="17.8" y="5.5" width="2.6" height="31" rx="1.3"/><rect x="24.3" y="5.5" width="2.6" height="31" rx="1.3"/><rect x="30.8" y="5.5" width="2.6" height="31" rx="1.3"/><rect x="7" y="19.8" width="30" height="2.4" rx="1.2"/></g>
      <path d="M30.6 30.5v-3.4a5 5 0 0 1 10 0v3.4" stroke="#C88A12" stroke-width="2.6" fill="none"/>
      <rect x="27.6" y="30" width="16" height="12.5" rx="3" fill="url(#gGold)" stroke="#9A6A08" stroke-width=".6"/>
      <circle cx="35.6" cy="35" r="1.6" fill="#6B4A00"/><path d="M34.9 35.6h1.4l.5 3.6h-2.4z" fill="#6B4A00"/>`),
    resort: sv(`<rect width="60" height="48" fill="url(#gSky)"/>
      <circle cx="38" cy="27" r="13" fill="url(#gSun)"/><circle cx="38" cy="28" r="6.5" fill="#FFE27A"/>
      <path d="M2 9.5h7M5 12h9M44 7h9M48 9.5h8" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/>
      <rect y="29" width="60" height="19" fill="url(#gSea)"/><path d="M0 29h60" stroke="#FFE7B0" stroke-width=".6" opacity=".7"/>
      <path d="M31 31.5h14M33 34h10M35 36.5h6" stroke="#FFE27A" stroke-width="1" stroke-linecap="round" opacity=".7"/>
      <path d="M-2 48c8-5 20-7 30-6 8 .8 14 3 22 6z" fill="#F6D29A"/>
      <path d="M13.5 45c-.4-6.5.3-13.5 3.6-20.5l1.2.5c-2.8 6.6-3.4 13.3-3 20z" fill="#3B1F2B"/>
      <path d="M17.6 24.6c-3.7-3.2-8.3-3.3-11.8-.6 3.9-1.2 7.5-.8 11.8.6zM17.6 24.6c.7-4.6 4.2-7.6 8.8-7.4-3.8 1.4-6.6 3.8-8.8 7.4zM17.6 24.6c-1.6-4.3-5.2-6.5-9.4-5.9 3.7.8 6.8 2.9 9.4 5.9zM17.6 24.6c4.4-.9 8.5 1 10.6 4.8-3.1-2.5-6.7-4-10.6-4.8zM17.6 24.6c-4 .4-6.7 3.3-7.3 7.4 1.6-3.4 4.1-5.8 7.3-7.4z" fill="#3B1F2B"/>
      <circle cx="17.2" cy="25.6" r="1" fill="#5A3020"/><circle cx="18.6" cy="26" r=".9" fill="#5A3020"/>`, '0 0 60 48', 'preserveAspectRatio="xMidYMid slice"'),
    parking: sv(`<rect x="22.4" y="34" width="3.2" height="11" rx="1" fill="url(#gSteel)"/>
      <rect x="7" y="3" width="34" height="34" rx="9" fill="#0F2C7A"/><rect x="7" y="2" width="34" height="33.5" rx="9" fill="url(#gPBlue)"/>
      <rect x="9.4" y="4.4" width="29.2" height="28.7" rx="7" fill="none" stroke="#fff" stroke-width="1.4" opacity=".9"/>
      <path fill-rule="evenodd" d="M17.5 9.5h9.6a7.6 7.6 0 0 1 0 15.2h-3.8v5.8h-5.8zM23.3 14.4v5.4h3.4a2.7 2.7 0 0 0 0-5.4z" fill="#fff"/>
      <path d="M10 6.5c6-1.8 16-2.2 26-.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".35" fill="none"/>`),
    chance: sv(`<g transform="rotate(8 24 24)"><rect x="11" y="6.5" width="26" height="36" rx="4.5" fill="#B4400C"/><rect x="11" y="5" width="26" height="36" rx="4.5" fill="url(#gChance)"/>
      <rect x="13.6" y="7.6" width="20.8" height="30.8" rx="3" fill="none" stroke="#FFE8B8" stroke-width="1" opacity=".9"/>
      <path d="M18.6 17.2c0-3.6 2.6-6.1 5.9-6.1 3.4 0 5.8 2.2 5.8 5.3 0 2.4-1.3 3.8-3.1 4.9-1.5.9-1.9 1.6-1.9 3.1v.9h-3.7v-1.1c0-2.6.9-3.9 2.9-5.1 1.3-.9 2.1-1.5 2.1-2.9 0-1.3-1-2.2-2.2-2.2-1.4 0-2.3 1-2.4 2.6z" fill="#B4400C" transform="translate(.6 .8)"/>
      <path d="M18.6 17.2c0-3.6 2.6-6.1 5.9-6.1 3.4 0 5.8 2.2 5.8 5.3 0 2.4-1.3 3.8-3.1 4.9-1.5.9-1.9 1.6-1.9 3.1v.9h-3.7v-1.1c0-2.6.9-3.9 2.9-5.1 1.3-.9 2.1-1.5 2.1-2.9 0-1.3-1-2.2-2.2-2.2-1.4 0-2.3 1-2.4 2.6z" fill="#FFF8EC"/>
      <circle cx="24.3" cy="31.2" r="2.3" fill="#FFF8EC"/>${star4(16.5, 35.5, 1.4, '#FFE8B8')}${star4(32, 10.5, 1.4, '#FFE8B8')}</g>`),
    chest: sv(`<g transform="rotate(-8 24 24)"><rect x="11" y="6.5" width="26" height="36" rx="4.5" fill="#152063"/><rect x="11" y="5" width="26" height="36" rx="4.5" fill="url(#gChest)"/>
      <rect x="13.6" y="7.6" width="20.8" height="30.8" rx="3" fill="none" stroke="#F5D27A" stroke-width="1"/>
      <circle cx="24" cy="21" r="8.6" fill="none" stroke="#F5D27A" stroke-width=".8" opacity=".6"/>
      ${star4(24, 21, 7.4, 'url(#gGold)')}${star4(17.5, 33, 1.6, '#F5D27A')}${star4(30.5, 34.5, 1.1, '#F5D27A')}${star4(30, 11, 1.2, '#C7D2FE')}</g>`),
    portal: sv(`<circle cx="24" cy="24" r="22" fill="url(#gPortalGlow)"/>
      <g class="spin"><circle cx="24" cy="24" r="17" fill="none" stroke="url(#gPortal)" stroke-width="3.2" stroke-dasharray="26 9" stroke-linecap="round"/></g>
      <g class="spin rev"><circle cx="24" cy="24" r="12" fill="none" stroke="url(#gPortal)" stroke-width="2.6" stroke-dasharray="15 7" stroke-linecap="round"/></g>
      <g class="spin fast"><circle cx="24" cy="24" r="7" fill="none" stroke="#F0ABFC" stroke-width="2" stroke-dasharray="8 5" stroke-linecap="round"/></g>
      <circle cx="24" cy="24" r="3.6" fill="#fff"/><circle cx="24" cy="24" r="6" fill="#fff" opacity=".25"/>
      ${star4(8, 10, 1.4, '#E9D5FF')}${star4(40, 38, 1.2, '#A5F3FC')}${star4(41, 9, 0.9, '#FBCFE8')}`),
    go: sv(`<rect x="11.5" y="4.5" width="2.4" height="33" rx="1.2" fill="url(#gSteel)"/><circle cx="12.7" cy="4.5" r="2" fill="url(#gGold)"/>
      <path d="M14 7c5-2.6 10 2.4 15 0s8-1.6 10.5-.6v15.2c-2.5-1-5.5-1.8-10.5.6s-10-2.6-15 0z" fill="url(#pChk)" stroke="#111827" stroke-width=".8"/>
      <path d="M14 7c5-2.6 10 2.4 15 0s8-1.6 10.5-.6" stroke="#fff" stroke-width=".8" fill="none" opacity=".6"/>
      <path d="M5 36.5h24v-5l11 8.3-11 8.2v-5H5z" fill="#14532D" transform="translate(.6 1)"/><path d="M5 36.5h24v-5l11 8.3-11 8.2v-5H5z" fill="url(#gGreen)"/>`),
    police: sv(`<path d="M24 3.5l16 5.2v11.6c0 10.4-6.8 17.6-16 22-9.2-4.4-16-11.6-16-22V8.7z" fill="url(#gGold)"/>
      <path d="M24 6.6l13.2 4.3v9.6c0 8.8-5.6 14.8-13.2 18.6-7.6-3.8-13.2-9.8-13.2-18.6v-9.6z" fill="url(#gNavy)"/>
      ${star5(24, 21.5, 8.6, 3.6, 'url(#gGold)')}<circle cx="24" cy="21.5" r="2" fill="#0F1F4D"/>
      <path d="M13.5 12.2c6-2.4 15-2.4 21 0" stroke="#fff" stroke-width="1" fill="none" opacity=".35"/>`),
    stock: sv(`<path d="M5 41.5h38" stroke="#64748B" stroke-width="1"/><path d="M5 31h38M5 21h38M5 11h38" stroke="#334155" stroke-width=".6" stroke-dasharray="2 2"/>
      <g stroke-width="1.1"><path d="M10 29v12" stroke="#22C55E"/><rect x="8" y="31" width="4" height="7" rx=".6" fill="#22C55E"/>
      <path d="M17 25v11" stroke="#EF4444"/><rect x="15" y="27" width="4" height="7" rx=".6" fill="#EF4444"/>
      <path d="M24 23v10" stroke="#22C55E"/><rect x="22" y="25" width="4" height="5.5" rx=".6" fill="#22C55E"/>
      <path d="M31 15v13" stroke="#EF4444"/><rect x="29" y="17" width="4" height="9" rx=".6" fill="#EF4444"/>
      <path d="M38 7v13" stroke="#EF4444"/><rect x="36" y="9" width="4" height="8.5" rx=".6" fill="#EF4444"/></g>
      <path d="M6 37l9-6 7 1 8-9 9-11" stroke="#FFD54A" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 2px #FFC300)"/>
      <path d="M35.6 10.4l5.2-3.6-.4 6.3z" fill="#FFD54A"/>`),
    force: sv(`<path d="M5 33.5h4M7 28.5l3 3M39 33.5h4M41 28.5l-3 3" stroke="#B45309" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="9" y="36.5" width="30" height="7" rx="2" fill="#5A3210"/><rect x="9" y="35" width="30" height="6.5" rx="2" fill="url(#gWood)"/><rect x="11" y="36" width="26" height="1.2" rx=".6" fill="#fff" opacity=".25"/>
      <g transform="rotate(-38 26 20)"><rect x="25" y="17" width="3" height="24" rx="1.4" fill="url(#gWood)"/>
      <rect x="16" y="7" width="21" height="11" rx="2.6" fill="url(#gWood)"/><rect x="18.4" y="7" width="2.4" height="11" fill="url(#gGold)"/><rect x="32.2" y="7" width="2.4" height="11" fill="url(#gGold)"/>
      <rect x="16" y="8.2" width="21" height="1.4" rx=".7" fill="#fff" opacity=".25"/></g>`),
    bank: sv(`<path d="M4.5 17L24 5.5 43.5 17z" fill="url(#gGold)"/><circle cx="24" cy="12.6" r="2.6" fill="#8A5A00"/><circle cx="24" cy="12.6" r="1.4" fill="#FFE7A0"/>
      <rect x="6" y="17" width="36" height="3.4" fill="#E2B33C"/>
      <g fill="url(#gMarble)">${[8.2, 15.2, 22.2, 29.2, 36.2].map((x) => `<rect x="${x}" y="21" width="3.6" height="14.5"/>`).join('')}</g>
      <rect x="5" y="35.5" width="38" height="3" fill="#CBD5E1"/><rect x="3" y="38.5" width="42" height="3.4" rx=".6" fill="#94A3B8"/>`),
    hub: sv(`<circle cx="24" cy="24" r="15" fill="url(#gGlobe)"/>
      <path d="M15 15c3 .5 5 2.5 4.5 5-.5 2-3 2-3.5 4.5-.5 2.2 1 4 .5 6-2.5-1.5-5-5-5-9.5 0-2.5 1.3-4.6 3.5-6zM26 11c3 0 7 1.5 9 4.5-1.5 1-3.5.5-4.5 2-1 1.5.5 3.5-1 5-1.5 1.5-4 .5-5-1.5-1-2 .5-3.5-.5-5.5-.7-1.6-.4-3.4 2-4.5zM28 28c2.5-.5 5 .5 6.5 2-1.2 2.5-3.5 4.6-6.3 5.6-1.2-1.8-2-4.6-.2-7.6z" fill="#4ADE80" opacity=".9"/>
      <ellipse cx="24" cy="24" rx="6.5" ry="15" fill="none" stroke="#fff" stroke-width=".6" opacity=".4"/><path d="M9 24h30" stroke="#fff" stroke-width=".6" opacity=".4"/>
      <circle cx="19" cy="18" r="6" fill="#fff" opacity=".12"/>
      <g transform="rotate(-22 24 24)"><ellipse cx="24" cy="24" rx="22" ry="7" fill="none" stroke="url(#gGold)" stroke-width="1.8" stroke-dasharray="40 6 120"/><circle cx="45.5" cy="24.5" r="2.2" fill="#FFD54A" stroke="#fff" stroke-width=".8"/></g>`),
    tax: sv(`<path d="M12.5 4.5h23v38.5l-2.9-2-2.9 2-2.9-2-2.9 2-2.9-2-2.9 2-2.9-2-2.9 2z" fill="#7C6F9C" transform="translate(1 1)" opacity=".35"/>
      <path d="M12.5 4.5h23v38.5l-2.9-2-2.9 2-2.9-2-2.9 2-2.9-2-2.9 2-2.9-2-2.9 2z" fill="#FFFFFF"/>
      <g fill="#CBD2E0"><rect x="16" y="9.5" width="16" height="2" rx="1"/><rect x="16" y="14" width="11" height="1.6" rx=".8"/><rect x="16" y="18" width="13" height="1.6" rx=".8"/><rect x="16" y="22" width="9" height="1.6" rx=".8"/></g>
      <rect x="16" y="33" width="16" height="2" rx="1" fill="#1F2328" opacity=".75"/>
      <g transform="rotate(-14 30 27)"><circle cx="30" cy="27" r="7.6" fill="none" stroke="#DC2626" stroke-width="1.6"/><circle cx="30" cy="27" r="6" fill="none" stroke="#DC2626" stroke-width=".6"/><text x="30" y="30.6" text-anchor="middle" font-size="9.5" font-weight="900" fill="#DC2626" font-family="PingFang SC, Microsoft YaHei, sans-serif">税</text></g>`),
    wheel: sv(`<path d="M17 44.5l7-6 7 6z" fill="#8A5A00"/>
      <circle cx="24" cy="25.5" r="19" fill="#7A1F55"/>
      <g class="spin slow">${wheelSegs}<g stroke="#fff" stroke-width=".7" opacity=".85">${[0, 1, 2, 3].map((k) => `<path d="M${24 + 16.5 * Math.cos((k / 4) * Math.PI - Math.PI / 2)} ${25.5 + 16.5 * Math.sin((k / 4) * Math.PI - Math.PI / 2)}L${24 - 16.5 * Math.cos((k / 4) * Math.PI - Math.PI / 2)} ${25.5 - 16.5 * Math.sin((k / 4) * Math.PI - Math.PI / 2)}"/>`).join('')}</g></g>
      <circle cx="24" cy="25.5" r="17.6" fill="none" stroke="url(#gGold)" stroke-width="2.6"/><g class="bulbs">${bulbs}</g>
      <circle cx="24" cy="25.5" r="4" fill="url(#gGold)" stroke="#fff" stroke-width="1"/><circle cx="24" cy="25.5" r="1.4" fill="#8A5A00"/>
      <path d="M24 12.5l-3.6-7.5h7.2z" fill="#E11D48" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`),
  };
  window.SPECIAL_ICON = ICON;
})();
