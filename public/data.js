// 棋盘与卡片数据（服务器和浏览器共用）
// 金额：内部 1 = 1K，显示为 K / M / B
(function (root) {
  const GROUPS = {
    brown:    { name: '棕色', color: '#A0714F', house: 500 },
    lightblue:{ name: '浅蓝', color: '#4FB3E8', house: 500 },
    pink:     { name: '粉色', color: '#E0609E', house: 1000 },
    orange:   { name: '橙色', color: '#F08A2E', house: 1000 },
    teal:     { name: '青色', color: '#19A7A0', house: 1000 },
    red:      { name: '红色', color: '#E5484D', house: 1500 },
    yellow:   { name: '黄色', color: '#E2B100', house: 1500 },
    purple:   { name: '紫色', color: '#8E5BD6', house: 1500 },
    green:    { name: '绿色', color: '#30A46C', house: 2000 },
    darkblue: { name: '深蓝', color: '#3E63DD', house: 2000 },
    slate:    { name: '石灰', color: '#64748B', house: 1000 },
    nordic:   { name: '冰蓝', color: '#0E90B8', house: 1000 },
    lime:     { name: '草绿', color: '#7CB518', house: 1500 },
    magenta:  { name: '洋红', color: '#C026D3', house: 2000 },
    rose:     { name: '玫红', color: '#F4567A', house: 2000 },
    gold:     { name: '金色', color: '#B8860B', house: 2500 },
  };

  const EN = { 开罗: 'Cairo', 孟买: 'Mumbai', 曼谷: 'Bangkok', 雅加达: 'Jakarta', 仰光: 'Yangon', 吉隆坡: 'Kuala Lumpur', 新加坡: 'Singapore', 首尔: 'Seoul',
    伊斯坦堡: 'Istanbul', 莫斯科: 'Moscow', 迪拜: 'Dubai', 里约: 'Rio', 墨西哥城: 'Mexico City', 开普敦: 'Cape Town', 悉尼: 'Sydney', 多伦多: 'Toronto', 柏林: 'Berlin',
    雅典: 'Athens', 罗马: 'Rome', 巴黎: 'Paris', 北京: 'Beijing', 上海: 'Shanghai', 香港: 'Hong Kong', 阿姆斯特丹: 'Amsterdam', 旧金山: 'San Francisco', 东京: 'Tokyo',
    伦敦: 'London', 纽约: 'New York', 大阪: 'Osaka', 台北: 'Taipei', 深圳: 'Shenzhen', 哥本哈根: 'Copenhagen', 斯德哥尔摩: 'Stockholm', 奥斯陆: 'Oslo',
    洛杉矶: 'Los Angeles', 芝加哥: 'Chicago', 温哥华: 'Vancouver', 米兰: 'Milan', 维也纳: 'Vienna', 苏黎世: 'Zurich', 多哈: 'Doha', 利雅得: 'Riyadh', 阿布扎比: 'Abu Dhabi',
    法兰克福: 'Frankfurt', 日内瓦: 'Geneva', 摩纳哥: 'Monaco',
    樟宜: 'Changi SIN', 希思罗: 'Heathrow LHR', 肯尼迪: 'JFK', 成田: 'Narita NRT', 戴高乐: 'Paris CDG', 巴生港: 'Port Klang', 鹿特丹港: 'Rotterdam', 釜山港: 'Busan', 洋山港: 'Yangshan' };
  EN['迪拜 '] = 'Dubai DXB';
  const P = (name, group, price, rent, mark) => ({ type: 'prop', name, group, price, rent, mark, en: EN[name] });
  const R = (name, short, kind) => ({ type: 'rail', name, short, kind: kind || 'air', price: 2000, en: EN[short] });
  const U = (name, icon) => ({ type: 'util', name, price: 1500, icon });
  const CH = { type: 'chance', name: '机会' }, CC = { type: 'chest', name: '命运' };

  // 52 格：下边 14 格、左边 10 格、上边 14 格、右边 10 格 + 4 个角
  const LAYOUT = { w: 12, h: 8, w2: 8, h2: 4 }; // 外圈 44 格 + 内圈 28 格
  const BOARD = [
    { type: 'go', name: '起点' },
    // —— 外圈 下边 12 ——
    P('开罗', 'brown', 600, [20, 100, 300, 900, 1600, 2500], '金字塔'),
    { ...CC },
    P('孟买', 'brown', 600, [40, 200, 600, 1800, 3200, 4500], '印度门'),
    { type: 'tax', name: '所得税', amount: 2000 },
    P('曼谷', 'lightblue', 1000, [60, 300, 900, 2700, 4000, 5500], '郑王庙'),
    R('樟宜机场', '樟宜'),
    P('雅加达', 'lightblue', 1200, [80, 400, 1000, 3000, 4500, 6000], '民族纪念碑'),
    { ...CH },
    P('吉隆坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500], '双子塔'),
    P('新加坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500], '滨海湾金沙'),
    { type: 'wheel', name: '幸运转盘' },
    P('首尔', 'pink', 1600, [120, 600, 1800, 5000, 7000, 9000], '南山塔'),
    { type: 'jail', name: '监狱' },
    // —— 外圈 左边 8 ——
    P('伊斯坦堡', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500], '蓝色清真寺'),
    P('莫斯科', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500], '圣瓦西里教堂'),
    { ...CC },
    P('迪拜', 'orange', 2000, [160, 800, 2200, 6000, 8000, 10000], '哈利法塔'),
    R('巴生港', '巴生港', 'port'),
    P('悉尼', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500], '歌剧院'),
    { ...CH },
    P('柏林', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500], '勃兰登堡门'),
    { type: 'parking', name: '免费停车' },
    // —— 外圈 上边 12 ——
    P('多伦多', 'red', 2400, [200, 1000, 3000, 7500, 9250, 11000], '国家电视塔'),
    { type: 'stock', name: '股票交易所' },
    P('雅典', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500], '帕特农神庙'),
    P('罗马', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500], '斗兽场'),
    R('希思罗机场', '希思罗'),
    P('巴黎', 'yellow', 2800, [240, 1200, 3600, 8500, 10250, 12000], '埃菲尔铁塔'),
    { ...CC },
    P('北京', 'purple', 2800, [250, 1250, 3750, 8750, 10600, 12400], '天坛'),
    P('上海', 'purple', 2800, [250, 1250, 3750, 8750, 10600, 12400], '东方明珠'),
    { type: 'portal', name: '传送门' },
    P('香港', 'purple', 3000, [260, 1300, 3900, 9000, 11000, 12750], '维港帆船'),
    { ...CH },
    { type: 'gotojail', name: '入狱' },
    // —— 外圈 右边 8 ——
    P('旧金山', 'green', 3200, [280, 1500, 4500, 10000, 12000, 14000], '金门大桥'),
    P('东京', 'green', 3400, [300, 1600, 4800, 10500, 12500, 14500], '鸟居'),
    { ...CC },
    { type: 'force', name: '强制拍卖' },
    R('肯尼迪机场', '肯尼迪'),
    P('伦敦', 'darkblue', 3600, [350, 1750, 5000, 11000, 13000, 15000], '大本钟'),
    { type: 'tax', name: '奢侈税', amount: 1000 },
    P('纽约', 'darkblue', 4000, [500, 2000, 6000, 14000, 17000, 20000], '自由女神'),
    // ================= 内圈 28 格 =================
    { type: 'hub', name: '环球中心' },
    P('大阪', 'slate', 1600, [120, 600, 1800, 5000, 7000, 9000], '天守阁'),
    P('台北', 'slate', 1600, [120, 600, 1800, 5000, 7000, 9000], '101 大楼'),
    { ...CH },
    P('深圳', 'slate', 1800, [140, 700, 2000, 5500, 7500, 9500], '平安金融中心'),
    R('鹿特丹港', '鹿特丹港', 'port'),
    { ...CC },
    P('洛杉矶', 'lime', 2400, [200, 1000, 3000, 7500, 9250, 11000], '好莱坞'),
    P('芝加哥', 'lime', 2400, [200, 1000, 3000, 7500, 9250, 11000], '云门'),
    { type: 'parking', name: '度假村' },
    P('温哥华', 'lime', 2600, [220, 1100, 3300, 8000, 9750, 11500], '加拿大广场'),
    { type: 'portal', name: '传送门' },
    P('米兰', 'magenta', 3000, [260, 1300, 3900, 9000, 11000, 12750], '大教堂'),
    P('苏黎世', 'magenta', 3200, [280, 1500, 4500, 10000, 12000, 14000], '班霍夫大街'),
    { type: 'bonus', name: '世界银行', amount: 1000 },
    P('维也纳', 'magenta', 3000, [260, 1300, 3900, 9000, 11000, 12750], '金色大厅'),
    { ...CH },
    R('戴高乐机场', '戴高乐'),
    P('多哈', 'rose', 3400, [300, 1600, 4800, 10500, 12500, 14500], '伊斯兰艺术馆'),
    P('利雅得', 'rose', 3400, [300, 1600, 4800, 10500, 12500, 14500], '王国中心'),
    { ...CC },
    P('阿布扎比', 'rose', 3600, [350, 1750, 5000, 11000, 13000, 15000], '大清真寺'),
    { type: 'wheel', name: '幸运转盘' },
    { type: 'gotojail', name: '海关' },
    P('法兰克福', 'gold', 3800, [400, 1900, 5500, 12500, 15000, 17500], '欧洲央行'),
    { type: 'stock', name: '股票交易所' },
    P('日内瓦', 'gold', 3800, [400, 1900, 5500, 12500, 15000, 17500], '大喷泉'),
    P('摩纳哥', 'gold', 4200, [550, 2200, 6500, 15000, 18000, 21000], '蒙特卡洛'),
  ];

  // 卡片效果：goto 前往 / nearest 最近的 / money 收付钱 / back 后退 / fwd 前进 / jail 入狱
  // goojf 出狱卡 / repairs 维修费 / each 与每位玩家结算
  const to = (name) => ({ t: 'goto', to: name });
  const CHANCE = [
    { text: '前往「起点」，领取 2M', fx: to('起点') },
    { text: '前往「柏林」。经过起点可领取 2M', fx: to('柏林') },
    { text: '前往「吉隆坡」。经过起点可领取 2M', fx: to('吉隆坡') },
    { text: '前往「巴黎」。经过起点可领取 2M', fx: to('巴黎') },
    { text: '前往「北京」。经过起点可领取 2M', fx: to('北京') },
    { text: '前往「纽约」', fx: to('纽约') },
    { text: '飞往「樟宜机场」。经过起点可领取 2M', fx: to('樟宜机场') },
    { text: '前往「世界银行」，领取分红 1M', fx: to('世界银行') },
    { text: '前往最近的机场。若已有主人，支付双倍租金', fx: { t: 'nearest', kind: 'rail' } },
    { text: '前往最近的机场。若已有主人，支付双倍租金', fx: { t: 'nearest', kind: 'rail' } },
    { text: '出狱许可证：可保留至需要时使用', fx: { t: 'goojf' } },
    { text: '后退 3 格', fx: { t: 'back', n: 3 } },
    { text: '后退 2 格', fx: { t: 'back', n: 2 } },
    { text: '顺风车：前进 5 格', fx: { t: 'fwd', n: 5 } },
    { text: '直接入狱，不得经过起点，不得领取 2M', fx: { t: 'jail' } },
    { text: '房屋全面维修：每栋房屋支付 250K，每座酒店支付 1M', fx: { t: 'repairs', house: 250, hotel: 1000 } },
    { text: '银行向你派发股息 500K', fx: { t: 'money', amt: 500 } },
    { text: '你的建筑贷款到期，领取 1.5M', fx: { t: 'money', amt: 1500 } },
    { text: '你的短视频爆火，获得广告收入 800K', fx: { t: 'money', amt: 800 } },
    { text: '加密货币暴涨，赚到 1.2M', fx: { t: 'money', amt: 1200 } },
    { text: '航班延误，获得赔偿 300K', fx: { t: 'money', amt: 300 } },
    { text: '中了彩票！领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '超速罚款 150K', fx: { t: 'money', amt: -150 } },
    { text: '加密货币暴跌，亏损 600K', fx: { t: 'money', amt: -600 } },
    { text: '冲动买了奢侈品，支付 400K', fx: { t: 'money', amt: -400 } },
    { text: '你当选董事会主席，向每位玩家支付 500K', fx: { t: 'each', amt: -500 } },
    { text: '请所有人喝奶茶，向每位玩家支付 100K', fx: { t: 'each', amt: -100 } },
    { text: '企业赞助：现金最多的玩家，送给现金最少的玩家 1M', fx: { t: 'sponsor', amt: 1000 } },
    { text: '地产税：地产最多的玩家（可能不止一位）向银行支付 1M', fx: { t: 'proptax', amt: 1000 } },
  ];

  const CHEST = [
    { text: '前往「起点」，领取 2M', fx: to('起点') },
    { text: '免费船票：前往「巴生港」。经过起点可领取 2M', fx: to('巴生港') },
    { text: '休息一下：前往「免费停车」', fx: to('免费停车') },
    { text: '前进 2 格', fx: { t: 'fwd', n: 2 } },
    { text: '出狱许可证：可保留至需要时使用', fx: { t: 'goojf' } },
    { text: '直接入狱，不得经过起点，不得领取 2M', fx: { t: 'jail' } },
    { text: '银行出错，对你有利，领取 2M', fx: { t: 'money', amt: 2000 } },
    { text: '出售股票，获得 500K', fx: { t: 'money', amt: 500 } },
    { text: '假期基金到期，领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '退税，领取 200K', fx: { t: 'money', amt: 200 } },
    { text: '人寿保险到期，领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '获得咨询费 250K', fx: { t: 'money', amt: 250 } },
    { text: '你在选美比赛中获得二等奖，领取 100K', fx: { t: 'money', amt: 100 } },
    { text: '你继承了一笔遗产，领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '拿到奖学金，领取 800K', fx: { t: 'money', amt: 800 } },
    { text: '兼职发工资，领取 400K', fx: { t: 'money', amt: 400 } },
    { text: '房屋保险赔付，领取 600K', fx: { t: 'money', amt: 600 } },
    { text: '股票分红，领取 700K', fx: { t: 'money', amt: 700 } },
    { text: '看医生，支付 500K', fx: { t: 'money', amt: -500 } },
    { text: '支付住院费 1M', fx: { t: 'money', amt: -1000 } },
    { text: '支付学费 500K', fx: { t: 'money', amt: -500 } },
    { text: '手机屏幕碎了，维修费 200K', fx: { t: 'money', amt: -200 } },
    { text: '交通罚单，支付 100K', fx: { t: 'money', amt: -100 } },
    { text: '慈善捐款，支付 300K', fx: { t: 'money', amt: -300 } },
    { text: '网购冲动消费，支付 350K', fx: { t: 'money', amt: -350 } },
    { text: '街道维修：每栋房屋支付 400K，每座酒店支付 1.15M', fx: { t: 'repairs', house: 400, hotel: 1150 } },
    { text: '今天是你的生日！每位玩家送你 100K', fx: { t: 'each', amt: 100 } },
    { text: '朋友们还钱了：每位玩家付你 200K', fx: { t: 'each', amt: 200 } },
    { text: '企业赞助：现金最多的玩家，送给现金最少的玩家 1M', fx: { t: 'sponsor', amt: 1000 } },
    { text: '地产税：地产最多的玩家（可能不止一位）向银行支付 1M', fx: { t: 'proptax', amt: 1000 } },
  ];
  for (const c of [...CHANCE, ...CHEST]) if (c.fx.t === 'goto') c.fx.pos = BOARD.findIndex((s) => s.name === c.fx.to);

  // 把上面的旧数值统一换算成"元"（×20）：起始 30 万，纽约 8 万，目标 100 万
  const S = 20;
  // 内部 1 个单位 = 1K；显示成 K / M / B
  function fmt(n) {
    const neg = n < 0; n = Math.abs(Math.round(n));
    const r = (x) => (Math.round(x * 100) / 100).toString();
    const s = n >= 1e6 ? r(n / 1e6) + 'B' : n >= 1000 ? r(n / 1000) + 'M' : n + 'K';
    return (neg ? '-' : '') + s;
  }
  for (const g of Object.values(GROUPS)) g.house *= S;
  for (const sq of BOARD) { if (sq.price) sq.price *= S; if (sq.rent) sq.rent = sq.rent.map((r) => r * S); if (sq.amount) sq.amount *= S; }
  for (const c of [...CHANCE, ...CHEST]) {
    for (const k of ['amt', 'house', 'hotel']) if (c.fx[k]) c.fx[k] *= S;
    c.text = c.text.replace(/(\d+(?:\.\d+)?)(M|K)/g, (m, a, u) => fmt(parseFloat(a) * (u === 'M' ? 1000 : 1) * S));
  }

  const RULES = {
    startMoney: 300000,
    goSalary: 40000,
    jailFine: 10000,
    winCash: 1000000,   // 总资产达到 1B 获胜，游戏结束
    turnSecs: 20,       // 每步操作限时
    maxPlayers: 8,
    houses: 56,
    hotels: 20,
    bids: [500, 1000, 5000, 10000, 50000],
    railRent: [5000, 10000, 20000, 40000, 60000, 80000, 100000, 120000, 140000, 160000], // 按拥有的机场+港口数量
    utilMult: [800, 2000, 4000, 6000],
  };
  // 有房屋的地产每秒产生的收益：地价越低收益率越高（类似现实中的租金回报率）
  function incomePerSec(pos, houses) {
    const sq = BOARD[pos]; if (sq.type !== 'prop') return 0;
    return Math.round((GROUPS[sq.group].house / 200) * houses); // 约 3 分多钟回本一栋房
  }
  // 幸运转盘
  const WHEEL = [
    { text: '🎉 头奖！获得 150M', fx: { t: 'money', amt: 150000 } }, { text: '获得 60M', fx: { t: 'money', amt: 60000 } }, { text: '获得 30M', fx: { t: 'money', amt: 30000 } },
    { text: '💸 破财：支付 40M', fx: { t: 'money', amt: -40000 } }, { text: '支付 20M', fx: { t: 'money', amt: -20000 } },
    { text: '前进 3 格', fx: { t: 'fwd', n: 3 } }, { text: '后退 3 格', fx: { t: 'back', n: 3 } },
    { text: '人气王：每位玩家给你 15M', fx: { t: 'each', amt: 15000 } }, { text: '请客：你给每位玩家 10M', fx: { t: 'each', amt: -10000 } },
    { text: '🚔 手气太差：直接入狱', fx: { t: 'jail' } }, { text: '企业赞助：现金最多的玩家送给现金最少的玩家 20M', fx: { t: 'sponsor', amt: 20000 } },
  ];
  // 进程加速器发的任务
  const TASKS = [
    { t: 'build', need: 2, text: '建 2 栋房屋' }, { t: 'buy', need: 1, text: '买下 1 块地（拍卖也算）' }, { t: 'lap', need: 1, text: '经过起点或环球中心 1 次' },
    { t: 'rent', need: 1, text: '收到 1 次租金' }, { t: 'dbl', need: 1, text: '掷出 1 次双数' }, { t: 'card', need: 1, text: '抽 1 张机会/命运/转盘' },
  ];
  const EMOTES = ['👍', '😀', '😂', '😭', '😡', '❤️', '⚡️', '🔥', '💩', '🎉', '🙏', '👏', '🤝', '💰', '😱', '🤡', '🌹', '💣'];

  const COLORS = ['#E6194B', '#F58231', '#FFD400', '#2FB344', '#00C2D1', '#2F5BEA', '#9B27D8', '#1F2328', '#8B4513', '#FF69B4', '#8FE000', '#008080', '#0A1F7A', '#9AA0A6', '#FF00E6', '#B89B00'];
  const TOKENS = ['🚗', '🎩', '🐶', '🚢', '✈️', '🦖', '🐱', '🚀', '🦊', '🐼', '🐯', '🦄', '🐸', '🐵', '🐧', '🦁', '👑', '💎', '🎸', '⚽️', '🍔', '🌈', '👻', '🤖'];

  const api = { GROUPS, BOARD, LAYOUT, CHANCE, CHEST, RULES, COLORS, TOKENS, fmt, incomePerSec, EMOTES, WHEEL, TASKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameData = api;
})(typeof window !== 'undefined' ? window : globalThis);
