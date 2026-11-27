// 若已在 Cloudflare Pages 部署 functions/sb/[[path]].js，保持 '/sb' 即可实现国内直连
const SUPABASE_URL ='https://xtgkepaqikpzvmpkoxsa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z2tlcGFxaWtwenZtcGtveHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NzU1MDgsImV4cCI6MjExMTI1MTUwOH0.dsY0P3S-alER-Dg9U_sdAvGR5aw90lrShn2vSLpm_4g';
// 授权管理员邮箱：以此邮箱通过 Supabase OTP 登录后拥有编辑权限。
// 该登录态与「管理员密码」解锁态互相独立，满足任意一种即可编辑。
// 注意：此处仅为前端 UI 显示控制，真正的写权限由 functions/api/admin.js 校验。
const ADMIN_EMAIL = 'tanyan1997@gmail.com';
const GEMINI_KEY_STORAGE = 'onerland_gemini_api_key';

// 纯本地隐私存储键（绝不上云）
const LOCAL_KEYS = {
  ARTISTS: 'onerland_custom_artists_v3',
  FAN_PREF: 'onerland_local_fan_pref_v1',       // 粉籍偏好（唯粉/CP/团粉）
  FOOTPRINTS: 'onerland_local_footprints_v1',   // 个人观演足迹记录
  ANNIVERSARY: 'onerland_local_anniversary_v1', // 本地纪念日配置
  EXPERIENCES: 'onerland_local_venue_exp_v1'    // 本地私密场馆体验日记
};

const SB_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const ARTIST_COLORS = {
  'ONER':     { id: 'oner',    hex: '#DD0514', bg: 'linear-gradient(135deg, #DD0514 0%, #8D0D0E 100%)' },
  '坤音娱乐': { id: 'qins',    hex: '#1E293B', bg: '#1E293B' },
  '岳岳':     { id: 'pinkray', hex: '#9C73EF', bg: '#9C73EF' },
  '木子洋':   { id: 'kwin',    hex: '#F90092', bg: '#F90092' },
  '灵超':     { id: 'didi',    hex: '#32B5E1', bg: '#32B5E1' }
};

const COLOR_METAL_DEFAULT = 'linear-gradient(135deg, #334155 0%, #0f172a 100%)';

const DEFAULT_ARTISTS = [
  { artistId: 'oner', artistName: 'ONER', badgeStyle: ARTIST_COLORS['ONER'].bg, accounts: [] },
  { artistId: 'qins', artistName: '坤音娱乐', badgeStyle: ARTIST_COLORS['坤音娱乐'].bg, accounts: [] },
  { artistId: 'pinkray', artistName: '岳岳', badgeStyle: ARTIST_COLORS['岳岳'].bg, accounts: [] },
  { artistId: 'kwin', artistName: '木子洋', badgeStyle: ARTIST_COLORS['木子洋'].bg, accounts: [] },
  { artistId: 'didi', artistName: '灵超', badgeStyle: ARTIST_COLORS['灵超'].bg, accounts: [] }
];

const VENUE_TRANSPORT_DB = [
  {
    keywords: ['少荃', '合肥'],
    routes: '🚇 地铁4号线「综保区站」B口出，步行约 8 分钟直达东广场；或「新海公园站」C口步行约 12 分钟\n🚄 合肥南站：地铁4号线直达综保区站（约 35 分钟）；合肥站：地铁3号线至方庙换4号线（约 45 分钟）\n✈️ 新桥国际机场：机场大巴至合肥南站转地铁4号线（约 70 分钟）\n🚗 自驾：场馆东门 P1 停车场，散场建议错峰 20 分钟离场'
  },
  {
    keywords: ['西安奥体', '奥体中心体育馆', '西安'],
    routes: '🚇 地铁14号线「奥体中心站」D口出，步行约 10 分钟至东广场安检口\n🚄 西安北站：地铁14号线直达奥体中心站（约 30 分钟）；西安站：地铁4号线至北客站换14号线（约 50 分钟）\n✈️ 咸阳国际机场：机场城际至北客站换14号线（约 60 分钟），或机场大巴至市区转地铁\n🚗 自驾：奥体中心地下停车场 P2/P3，演出日 16:00 前入场更顺畅'
  },
  {
    keywords: ['疆进酒', 'OMNI SPACE'],
    routes: '🚇 地铁8号线「天桥站」A口出站步行约4分钟（天桥艺术中心B1）'
  },
  {
    keywords: ['五棵松', '润百颜', '华熙', '北京'],
    routes: '🚇 地铁1号线「五棵松站」B1/B2 口出，步行约 2 分钟直达场馆西门\n🚄 北京西站：9号线至军事博物馆换1号线（约 25 分钟）；北京南站：4号线至西单换1号线（约 40 分钟）\n✈️ 首都机场：机场线至东直门换2号线、建国门换1号线（约 70 分钟）；大兴机场：大兴机场线至草桥换10号线、公主坟换1号线（约 75 分钟）\n🚗 自驾：华熙LIVE·五棵松地下停车场，演出日车位紧张，建议地铁前往'
  },
  { keywords: ['上海', '梅赛德斯', '万代南梦宫', '蜚声', '育音堂', '瓦肆'], routes: '🚇 梅奔8号线中华艺术宫站；万代南梦宫13号线江宁路站；蜚声8号线曲阜路站' },
  { keywords: ['广州', '宝能', '声音共和', '太空间'], routes: '🚇 宝能6/7号线萝岗站；太空间/声音共和8号线沙园站或凤凰新村站' },
  { keywords: ['深圳', '大运', '春茧', 'B10', 'HOU LIVE'], routes: '🚇 大运16号线大运中心站；HOU LIVE下沙店9号线B口；B10 2号线侨城北站' },
  { keywords: ['杭州', '奥体', '大麦66', 'CH8'], routes: '🚇 奥体6/7号线奥体中心站；大麦66 5号线杭氧站；CH8 5号线创景路站' },
  { keywords: ['成都', '东安湖', '凤凰山', '正火', '福馆'], routes: '🚇 凤凰山5号线杜家碾站；正火2号线洪河站；福馆1号线锦城广场站' }
];

const GENERIC_TRANSPORT_GUIDE = '🚇 优先地铁前往，出站后跟随场馆指引步行至安检口\n🚄 高铁抵达后建议预留 60 分钟市内通勤时间\n🛡️ 入场提示：提前 60–90 分钟到场核验身份证；禁止携带打火机、专业长焦相机及超尺寸灯牌\n📍 场馆信息待公布，具体路线以主办方最新公告为准';

// 场馆模糊匹配：合并场馆名与城市名，剔除「市/省」等干扰词后按关键词 includes 命中
function normalizeVenueText(...values) {
  return values
    .filter(Boolean)
    .join(' ')
    .replace(/[\s·・,，、/|()（）\[\]【】]/g, '')
    .replace(/[省市]/g, '')
    .toLowerCase();
}

function findPresetTransport(input) {
  let text = '';
  if (input && typeof input === 'object') {
    text = normalizeVenueText(input.venue, input.city, input.title);
  } else {
    text = normalizeVenueText(input);
  }
  if (!text) return '';
  const hit = VENUE_TRANSPORT_DB.find(item => item.keywords.some(kw => text.includes(normalizeVenueText(kw))));
  return hit ? hit.routes : '';
}

// 展示优先级：云端/管理员自定义 transport > 内置场馆词库 > 通用入场兜底
function getShowTransport(show) {
  if (!show) return GENERIC_TRANSPORT_GUIDE;
  const custom = String(show.transport || '').trim();
  if (custom) return custom;
  const preset = findPresetTransport({ venue: show.venue, city: show.city || show.title, title: show.title });
  return preset || GENERIC_TRANSPORT_GUIDE;
}

// 城市经纬度字典（用于本地观演连线轨迹地图）
const CITY_COORDS = {
  '北京': [116.40, 39.90], '上海': [121.47, 31.23], '广州': [113.26, 23.13],
  '深圳': [114.05, 22.54], '杭州': [120.15, 30.28], '南京': [118.79, 32.06],
  '合肥': [117.22, 31.82], '西安': [108.94, 34.34], '成都': [104.06, 30.67],
  '重庆': [106.55, 29.56], '武汉': [114.30, 30.59], '长沙': [112.93, 28.22],
  '苏州': [120.58, 31.30], '天津': [117.20, 39.08], '郑州': [113.62, 34.75],
  '青岛': [120.38, 36.06], '厦门': [118.08, 24.48], '沈阳': [123.43, 41.80]
};
