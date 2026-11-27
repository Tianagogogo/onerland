// 若已在 Cloudflare Pages 部署 functions/sb/[[path]].js，保持 '/sb' 即可实现国内直连
const SUPABASE_URL ='https://xtgkepaqikpzvmpkoxsa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z2tlcGFxaWtwenZtcGtveHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NzU1MDgsImV4cCI6MjExMTI1MTUwOH0.dsY0P3S-alER-Dg9U_sdAvGR5aw90lrShn2vSLpm_4g';
// 管理员邮箱：以此邮箱通过 Supabase OTP 登录的账号拥有编辑权限
// 注意：此处仅为前端 UI 显示控制，真正的写权限必须由 Supabase RLS 与服务端校验保证
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
  '岳岳':     { id: 'pinkray', hex: '#7C3AED', bg: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)' },
  '木子洋':   { id: 'kwin',    hex: '#DB2777', bg: 'linear-gradient(135deg, #DB2777 0%, #9D174D 100%)' },
  '灵超':     { id: 'didi',    hex: '#0284C7', bg: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' }
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
  { keywords: ['合肥', '少荃'], routes: '🚇 地铁4号线「综保区站」B口步行约8分钟\n🚄 合肥南站：地铁4号线直达（约45分钟）' },
  { keywords: ['疆进酒', 'OMNI SPACE'], routes: '🚇 地铁8号线「天桥站」A口出站步行约4分钟（天桥艺术中心B1）' },
  { keywords: ['北京', '五棵松', '润百颜', '华熙'], routes: '🚇 地铁1号线「五棵松站」B1/B2口步行2分钟\n🚄 北京西站：9号线转1号线（约25分钟）' },
  { keywords: ['上海', '梅赛德斯', '万代南梦宫', '蜚声', '育音堂', '瓦肆'], routes: '🚇 梅奔8号线中华艺术宫站；万代南梦宫13号线江宁路站；蜚声8号线曲阜路站' },
  { keywords: ['广州', '宝能', '声音共和', '太空间'], routes: '🚇 宝能6/7号线萝岗站；太空间/声音共和8号线沙园站或凤凰新村站' },
  { keywords: ['深圳', '大运', '春茧', 'B10', 'HOU LIVE'], routes: '🚇 大运16号线大运中心站；HOU LIVE下沙店9号线B口；B10 2号线侨城北站' },
  { keywords: ['杭州', '奥体', '大麦66', 'CH8'], routes: '🚇 奥体6/7号线奥体中心站；大麦66 5号线杭氧站；CH8 5号线创景路站' },
  { keywords: ['成都', '东安湖', '凤凰山', '正火', '福馆'], routes: '🚇 凤凰山5号线杜家碾站；正火2号线洪河站；福馆1号线锦城广场站' }
];

function findPresetTransport(text) {
  if (!text) return '';
  const hit = VENUE_TRANSPORT_DB.find(item => item.keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase())));
  return hit ? hit.routes : '';
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
