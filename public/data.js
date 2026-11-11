// 棋盘与卡片数据（服务器和浏览器共用）
// 金额单位：K（千）。1000K = 1M
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
  };

  const P = (name, group, price, rent, mark) => ({ type: 'prop', name, group, price, rent, mark });
  const R = (name, short) => ({ type: 'rail', name, short, price: 2000 });
  const U = (name, icon) => ({ type: 'util', name, price: 1500, icon });
  const CH = { type: 'chance', name: '机会' }, CC = { type: 'chest', name: '命运' };

  // 52 格：下边 14 格、左边 10 格、上边 14 格、右边 10 格 + 4 个角
  const LAYOUT = { w: 14, h: 10 };
  const BOARD = [
    { type: 'go', name: '起点' },
    // —— 下边 ——
    P('开罗', 'brown', 600, [20, 100, 300, 900, 1600, 2500], '金字塔'),
    { ...CC },
    P('孟买', 'brown', 600, [40, 200, 600, 1800, 3200, 4500], '印度门'),
    { type: 'tax', name: '所得税', amount: 2000 },
    P('曼谷', 'lightblue', 1000, [60, 300, 900, 2700, 4000, 5500], '郑王庙'),
    { ...CH },
    R('樟宜机场', '樟宜'),
    P('雅加达', 'lightblue', 1000, [60, 300, 900, 2700, 4000, 5500], '民族纪念碑'),
    P('仰光', 'lightblue', 1200, [80, 400, 1000, 3000, 4500, 6000], '大金塔'),
    U('电力公司', '⚡️'),
    P('吉隆坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500], '双子塔'),
    { ...CC },
    P('新加坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500], '滨海湾金沙'),
    P('首尔', 'pink', 1600, [120, 600, 1800, 5000, 7000, 9000], '南山塔'),
    { type: 'jail', name: '监狱' },
    // —— 左边 ——
    P('伊斯坦堡', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500], '蓝色清真寺'),
    { ...CH },
    P('莫斯科', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500], '圣瓦西里教堂'),
    P('迪拜', 'orange', 2000, [160, 800, 2200, 6000, 8000, 10000], '哈利法塔'),
    R('迪拜机场', '迪拜'),
    P('里约', 'teal', 2000, [170, 850, 2350, 6500, 8400, 10250], '基督像'),
    { ...CC },
    P('墨西哥城', 'teal', 2000, [170, 850, 2350, 6500, 8400, 10250], '太阳金字塔'),
    P('开普敦', 'teal', 2200, [180, 900, 2500, 7000, 8750, 10500], '桌山'),
    { type: 'bonus', name: '世界银行', amount: 1000 },
    { type: 'parking', name: '免费停车' },
    // —— 上边 ——
    P('悉尼', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500], '歌剧院'),
    { ...CH },
    P('多伦多', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500], '国家电视塔'),
    P('柏林', 'red', 2400, [200, 1000, 3000, 7500, 9250, 11000], '勃兰登堡门'),
    U('自来水厂', '💧'),
    P('雅典', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500], '帕特农神庙'),
    R('希思罗机场', '希思罗'),
    P('罗马', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500], '斗兽场'),
    P('巴黎', 'yellow', 2800, [240, 1200, 3600, 8500, 10250, 12000], '埃菲尔铁塔'),
    { ...CC },
    P('北京', 'purple', 2800, [250, 1250, 3750, 8750, 10600, 12400], '天坛'),
    P('上海', 'purple', 2800, [250, 1250, 3750, 8750, 10600, 12400], '东方明珠'),
    { ...CH },
    P('香港', 'purple', 3000, [260, 1300, 3900, 9000, 11000, 12750], '维港帆船'),
    { type: 'gotojail', name: '入狱' },
    // —— 右边 ——
    P('阿姆斯特丹', 'green', 3200, [280, 1500, 4500, 10000, 12000, 14000], '风车'),
    P('旧金山', 'green', 3200, [280, 1500, 4500, 10000, 12000, 14000], '金门大桥'),
    { ...CC },
    P('东京', 'green', 3400, [300, 1600, 4800, 10500, 12500, 14500], '鸟居'),
    R('肯尼迪机场', '肯尼迪'),
    U('网络公司', '📡'),
    { ...CH },
    P('伦敦', 'darkblue', 3600, [350, 1750, 5000, 11000, 13000, 15000], '大本钟'),
    { type: 'tax', name: '奢侈税', amount: 1000 },
    P('纽约', 'darkblue', 4000, [500, 2000, 6000, 14000, 17000, 20000], '自由女神'),
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
    { text: '前往最近的公用事业。若已有主人，重新掷骰并支付点数 × 100K', fx: { t: 'nearest', kind: 'util' } },
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
  ];

  const CHEST = [
    { text: '前往「起点」，领取 2M', fx: to('起点') },
    { text: '免费机票：飞往「迪拜机场」。经过起点可领取 2M', fx: to('迪拜机场') },
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
  ];
  for (const c of [...CHANCE, ...CHEST]) if (c.fx.t === 'goto') c.fx.pos = BOARD.findIndex((s) => s.name === c.fx.to);

  const RULES = {
    startMoney: 15000,
    goSalary: 2000,
    jailFine: 500,
    maxPlayers: 8,
    houses: 40,
    hotels: 15,
  };

  const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE', '#FF2D55'];
  const TOKENS = ['🚗', '🎩', '🐶', '🚢', '✈️', '🦖', '🐱', '🚀'];

  function fmt(k) {
    const neg = k < 0; k = Math.abs(k);
    let s;
    if (k >= 1000) {
      const m = k / 1000;
      s = (Math.round(m * 100) / 100).toString() + 'M';
    } else s = k + 'K';
    return (neg ? '-' : '') + s;
  }

  const api = { GROUPS, BOARD, LAYOUT, CHANCE, CHEST, RULES, COLORS, TOKENS, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameData = api;
})(typeof window !== 'undefined' ? window : globalThis);
