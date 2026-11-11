// 棋盘与卡片数据（服务器和浏览器共用）
// 金额单位：K（千）。1000K = 1M
(function (root) {
  const GROUPS = {
    brown:    { name: '棕色', color: '#9A6B4B', house: 500 },
    lightblue:{ name: '浅蓝', color: '#6EC6F0', house: 500 },
    pink:     { name: '粉色', color: '#E0609E', house: 1000 },
    orange:   { name: '橙色', color: '#F39237', house: 1000 },
    red:      { name: '红色', color: '#E5484D', house: 1500 },
    yellow:   { name: '黄色', color: '#F5C542', house: 1500 },
    green:    { name: '绿色', color: '#30A46C', house: 2000 },
    darkblue: { name: '深蓝', color: '#3E63DD', house: 2000 },
  };

  const P = (name, group, price, rent) => ({ type: 'prop', name, group, price, rent });
  const R = (name) => ({ type: 'rail', name, price: 2000 });
  const U = (name, icon) => ({ type: 'util', name, price: 1500, icon });

  const BOARD = [
    { type: 'go', name: '起点' },
    P('开罗', 'brown', 600, [20, 100, 300, 900, 1600, 2500]),
    { type: 'chest', name: '命运' },
    P('孟买', 'brown', 600, [40, 200, 600, 1800, 3200, 4500]),
    { type: 'tax', name: '所得税', amount: 2000 },
    R('樟宜机场'),
    P('曼谷', 'lightblue', 1000, [60, 300, 900, 2700, 4000, 5500]),
    { type: 'chance', name: '机会' },
    P('雅加达', 'lightblue', 1000, [60, 300, 900, 2700, 4000, 5500]),
    P('马尼拉', 'lightblue', 1200, [80, 400, 1000, 3000, 4500, 6000]),
    { type: 'jail', name: '监狱' },
    P('吉隆坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500]),
    U('电力公司', '⚡️'),
    P('新加坡', 'pink', 1400, [100, 500, 1500, 4500, 6250, 7500]),
    P('首尔', 'pink', 1600, [120, 600, 1800, 5000, 7000, 9000]),
    R('迪拜机场'),
    P('伊斯坦布尔', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500]),
    { type: 'chest', name: '命运' },
    P('莫斯科', 'orange', 1800, [140, 700, 2000, 5500, 7500, 9500]),
    P('迪拜', 'orange', 2000, [160, 800, 2200, 6000, 8000, 10000]),
    { type: 'parking', name: '免费停车' },
    P('悉尼', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500]),
    { type: 'chance', name: '机会' },
    P('多伦多', 'red', 2200, [180, 900, 2500, 7000, 8750, 10500]),
    P('柏林', 'red', 2400, [200, 1000, 3000, 7500, 9250, 11000]),
    R('希思罗机场'),
    P('罗马', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500]),
    P('马德里', 'yellow', 2600, [220, 1100, 3300, 8000, 9750, 11500]),
    U('自来水公司', '💧'),
    P('巴黎', 'yellow', 2800, [240, 1200, 3600, 8500, 10250, 12000]),
    { type: 'gotojail', name: '入狱' },
    P('上海', 'green', 3000, [260, 1300, 3900, 9000, 11000, 12750]),
    P('香港', 'green', 3000, [260, 1300, 3900, 9000, 11000, 12750]),
    { type: 'chest', name: '命运' },
    P('东京', 'green', 3200, [280, 1500, 4500, 10000, 12000, 14000]),
    R('肯尼迪机场'),
    { type: 'chance', name: '机会' },
    P('伦敦', 'darkblue', 3500, [350, 1750, 5000, 11000, 13000, 15000]),
    { type: 'tax', name: '奢侈税', amount: 1000 },
    P('纽约', 'darkblue', 4000, [500, 2000, 6000, 14000, 17000, 20000]),
  ];

  // 卡片效果：goto 前往 / nearest 最近的 / money 收付钱 / back 后退 / jail 入狱
  // goojf 出狱卡 / repairs 维修费 / each 与每位玩家结算
  const CHANCE = [
    { text: '前往「起点」，领取 2M', fx: { t: 'goto', pos: 0 } },
    { text: '前往「柏林」。经过起点可领取 2M', fx: { t: 'goto', pos: 24 } },
    { text: '前往「吉隆坡」。经过起点可领取 2M', fx: { t: 'goto', pos: 11 } },
    { text: '前往最近的公用事业。若已有主人，重新掷骰并支付点数 × 100K', fx: { t: 'nearest', kind: 'util' } },
    { text: '前往最近的机场。若已有主人，支付双倍租金', fx: { t: 'nearest', kind: 'rail' } },
    { text: '前往最近的机场。若已有主人，支付双倍租金', fx: { t: 'nearest', kind: 'rail' } },
    { text: '银行向你派发股息 500K', fx: { t: 'money', amt: 500 } },
    { text: '出狱许可证：可保留至需要时使用', fx: { t: 'goojf' } },
    { text: '后退 3 格', fx: { t: 'back', n: 3 } },
    { text: '直接入狱，不得经过起点，不得领取 2M', fx: { t: 'jail' } },
    { text: '房屋全面维修：每栋房屋支付 250K，每座酒店支付 1M', fx: { t: 'repairs', house: 250, hotel: 1000 } },
    { text: '超速罚款 150K', fx: { t: 'money', amt: -150 } },
    { text: '飞往「樟宜机场」。经过起点可领取 2M', fx: { t: 'goto', pos: 5 } },
    { text: '前往「纽约」', fx: { t: 'goto', pos: 39 } },
    { text: '你当选董事会主席，向每位玩家支付 500K', fx: { t: 'each', amt: -500 } },
    { text: '你的建筑贷款到期，领取 1.5M', fx: { t: 'money', amt: 1500 } },
  ];

  const CHEST = [
    { text: '前往「起点」，领取 2M', fx: { t: 'goto', pos: 0 } },
    { text: '银行出错，对你有利，领取 2M', fx: { t: 'money', amt: 2000 } },
    { text: '看医生，支付 500K', fx: { t: 'money', amt: -500 } },
    { text: '出售股票，获得 500K', fx: { t: 'money', amt: 500 } },
    { text: '出狱许可证：可保留至需要时使用', fx: { t: 'goojf' } },
    { text: '直接入狱，不得经过起点，不得领取 2M', fx: { t: 'jail' } },
    { text: '假期基金到期，领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '退税，领取 200K', fx: { t: 'money', amt: 200 } },
    { text: '今天是你的生日！每位玩家送你 100K', fx: { t: 'each', amt: 100 } },
    { text: '人寿保险到期，领取 1M', fx: { t: 'money', amt: 1000 } },
    { text: '支付住院费 1M', fx: { t: 'money', amt: -1000 } },
    { text: '支付学费 500K', fx: { t: 'money', amt: -500 } },
    { text: '获得咨询费 250K', fx: { t: 'money', amt: 250 } },
    { text: '街道维修：每栋房屋支付 400K，每座酒店支付 1.15M', fx: { t: 'repairs', house: 400, hotel: 1150 } },
    { text: '你在选美比赛中获得二等奖，领取 100K', fx: { t: 'money', amt: 100 } },
    { text: '你继承了一笔遗产，领取 1M', fx: { t: 'money', amt: 1000 } },
  ];

  const RULES = {
    startMoney: 15000,
    goSalary: 2000,
    jailFine: 500,
    maxPlayers: 8,
    houses: 32,
    hotels: 12,
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

  const api = { GROUPS, BOARD, CHANCE, CHEST, RULES, COLORS, TOKENS, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameData = api;
})(typeof window !== 'undefined' ? window : globalThis);
