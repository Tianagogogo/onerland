// ================= 🚄 出行比价：跨城交通 + 场馆同城 + 周边住宿（零爬虫，纯官方/合规直达） =================
// 设计原则：只做「参数拼装 + 站外直达跳转」，不抓取任何第三方页面内容；
// 机票底价仅在填入官方公开 API Token 后调用官方接口（默认关闭）。

const TRAVELPAYOUTS_TOKEN = ''; // 如已在 Travelpayouts 申请到公开数据 Token，可填入启用参考价

// 出发城市 → 机场三字码 / 主要车站（用于拼接跳转参数）
const TRAVEL_CITIES = [
  { city: '北京', iata: 'BJS', station: '北京南' },
  { city: '上海', iata: 'SHA', station: '上海虹桥' },
  { city: '广州', iata: 'CAN', station: '广州南' },
  { city: '深圳', iata: 'SZX', station: '深圳北' },
  { city: '成都', iata: 'CTU', station: '成都东' },
  { city: '杭州', iata: 'HGH', station: '杭州东' },
  { city: '重庆', iata: 'CKG', station: '重庆西' },
  { city: '武汉', iata: 'WUH', station: '武汉' },
  { city: '西安', iata: 'SIA', station: '西安北' },
  { city: '南京', iata: 'NKG', station: '南京南' },
  { city: '长沙', iata: 'CSX', station: '长沙南' },
  { city: '郑州', iata: 'CGO', station: '郑州东' },
  { city: '沈阳', iata: 'SHE', station: '沈阳北' },
  { city: '大连', iata: 'DLC', station: '大连北' },
  { city: '合肥', iata: 'HFE', station: '合肥南' },
  { city: '天津', iata: 'TSN', station: '天津' },
  { city: '青岛', iata: 'TAO', station: '青岛北' },
  { city: '佛山', iata: 'FUO', station: '佛山西' },
  { city: '济南', iata: 'TNA', station: '济南西' },
  { city: '福州', iata: 'FOC', station: '福州南' },
  { city: '厦门', iata: 'XMN', station: '厦门北' },
  { city: '昆明', iata: 'KMG', station: '昆明南' },
  { city: '贵阳', iata: 'KWE', station: '贵阳北' },
  { city: '南宁', iata: 'NNG', station: '南宁东' },
  { city: '南昌', iata: 'KHN', station: '南昌西' },
  { city: '石家庄', iata: 'SJW', station: '石家庄' },
  { city: '太原', iata: 'TYN', station: '太原南' },
  { city: '哈尔滨', iata: 'HRB', station: '哈尔滨西' },
  { city: '长春', iata: 'CGQ', station: '长春西' },
  { city: '兰州', iata: 'LHW', station: '兰州西' },
  { city: '乌鲁木齐', iata: 'URC', station: '乌鲁木齐' },
  { city: '呼和浩特', iata: 'HET', station: '呼和浩特东' },
  { city: '海口', iata: 'HAK', station: '海口东' },
  { city: '宁波', iata: 'NGB', station: '宁波' },
  { city: '苏州', iata: 'SZV', station: '苏州北' },
  { city: '无锡', iata: 'WUX', station: '无锡东' },
  { city: '温州', iata: 'WNZ', station: '温州南' },
  { city: '常州', iata: 'CZX', station: '常州北' },
  { city: '烟台', iata: 'YNT', station: '烟台' },
  { city: '桂林', iata: 'KWL', station: '桂林北' }
];

const TRAVEL_ORIGIN_KEY = 'onerland_travel_origin_v1';
// 热门出发城市快捷胶囊（点一下就切换出发地）
const TRAVEL_HOT_CITIES = ['北京', '上海', '广州', '深圳', '成都', '杭州', '重庆', '武汉', '西安', '南京', '长沙', '合肥'];
const travelHelperState = { show: null, origin: '北京', depart: '', ret: '', openGroup: '' };

function travelCityMeta(cityName) {
  const name = String(cityName || '').trim();
  const hit = TRAVEL_CITIES.find(c => name.includes(c.city) || c.city.includes(name));
  return hit || { city: name || '北京', iata: '', station: name || '' };
}

function travelPad(n) { return String(n).padStart(2, '0'); }

function travelShiftDate(iso, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T12:00:00`) : new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return `${base.getFullYear()}-${travelPad(base.getMonth() + 1)}-${travelPad(base.getDate())}`;
}

function travelEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTravelOrigin() {
  try {
    const saved = localStorage.getItem(TRAVEL_ORIGIN_KEY);
    if (saved && TRAVEL_CITIES.some(c => c.city === saved)) return saved;
  } catch (e) { /* ignore */ }
  return '北京';
}

function setTravelOrigin(city) {
  try { localStorage.setItem(TRAVEL_ORIGIN_KEY, String(city || '')); } catch (e) { /* ignore */ }
}

// ---------- 四大类一级入口 + 二级平台链接（只保留经验证的官方稳定入口） ----------
// 原则：不拼接易失效的深层参数路径，优先官方首页/移动端首页，让用户在 App 内自行检索；
// 行程关键词用「📋 一键复制」提供，粘贴即用。

// ===== 🏨 场馆地铁沿线高性价比住宿区 =====
const VENUE_METRO_AREAS = [
  { match: ['凯迪拉克', '五棵松'], station: '五棵松站（1 号线）', areas: ['五棵松地铁站周边', '万寿路—公主坟商圈', '玉泉路地铁站周边'] },
  { match: ['北京展览馆', '北展'], station: '动物园站（4 号线）', areas: ['动物园地铁站周边', '西直门地铁站周边', '车公庄—阜成门商圈'] },
  { match: ['国家体育馆', '鸟巢', '水立方'], station: '奥林匹克公园站（8 号线）', areas: ['奥林匹克公园地铁站周边', '北土城地铁站周边', '亚运村商圈'] },
  { match: ['梅赛德斯', '世博'], station: '中华艺术宫站（8 号线）', areas: ['中华艺术宫地铁站周边', '耀华路地铁站周边', '世博大道商圈'] },
  { match: ['东方体育中心'], station: '东方体育中心站（6/8/11 号线）', areas: ['东方体育中心地铁站周边', '三林地铁站周边', '前滩商圈'] },
  { match: ['奥体中心', '西安奥体'], station: '奥体中心站（14 号线）', areas: ['奥体中心地铁站周边', '双寨地铁站周边', '浐灞商圈'] },
  { match: ['凤凰山'], station: '杜家碾站（地铁 5 号线）', areas: ['杜家碾地铁站周边', '韦家碾地铁站周边', '金牛万达商圈'] },
  { match: ['杭州奥体', '大莲花'], station: '奥体中心站（6/7 号线）', areas: ['奥体中心地铁站周边', '博览中心地铁站周边', '钱江世纪城商圈'] },
  { match: ['深圳湾体育', '春茧'], station: '后海站（2/11 号线）', areas: ['后海地铁站周边', '科苑地铁站周边', '海岸城商圈'] },
  { match: ['广州体育馆', '天河体育'], station: '体育西路站（1/3 号线）', areas: ['体育西路地铁站周边', '林和西地铁站周边', '天河城商圈'] },
  { match: ['武汉体育中心'], station: '体育中心站（3 号线）', areas: ['体育中心地铁站周边', '沌阳大道地铁站周边', '经开万达商圈'] },
  { match: ['南京奥体'], station: '奥体中心站（2/10 号线）', areas: ['奥体中心地铁站周边', '元通地铁站周边', '河西万达商圈'] },
  { match: ['合肥', '少荃湖'], station: '少荃湖站（4 号线）', areas: ['少荃湖地铁站周边', '新海公园地铁站周边', '职教城商圈'] }
];

function getVenueMetroAreas(show) {
  const venue = String((show && (show.venue || show.city)) || '').trim();
  const city = String((show && show.city) || venue || '').replace(/[省市]$/g, '');
  const hit = VENUE_METRO_AREAS.find(item => item.match.some(k => venue.includes(k)));
  if (hit) {
    return { station: hit.station, areas: hit.areas.map(a => ({ label: a, keyword: `${city} ${a}` })) };
  }
  const kw = venue.replace(/[（(].*?[)）]/g, '').slice(0, 12) || city;
  return {
    station: `${kw} 附近地铁站`,
    areas: [
      { label: `${kw} 地铁站周边`, keyword: `${city} ${kw} 地铁站 酒店` },
      { label: `${city} 市中心地铁沿线`, keyword: `${city} 市中心 地铁 酒店` },
      { label: `${city} 高铁站商圈`, keyword: `${city} 高铁站 酒店` }
    ]
  };
}

function hotelSearchLinks(city, keyword) {
  const enc = encodeURIComponent;
  return [
    { platform: '携程', url: `https://hotels.ctrip.com/hotels/list?cityName=${enc(city)}&keyword=${enc(keyword)}&order=price` },
    { platform: '美团', url: `https://i.meituan.com/hotel/?cityName=${enc(city)}&keyword=${enc(keyword)}&sort=price_asc` }
  ];
}

// ===== 🍜 演出地美食 & 同款打卡（成员分流检索 + 访客投稿 + 静默审核） =====
const CHECKIN_MEMBERS = ['ONER全员', '岳岳', '木子洋', '灵超'];
const CHECKIN_CATEGORIES = ['🍜 餐厅美食', '☕ 咖啡甜品', '📸 拍照地标'];
const CHECKIN_PAGE_SIZE_LIMIT = 60;

const checkinState = {
  city: '',
  spots: [],
  pending: [],
  loading: false,
  loaded: false,
  failed: false,
  formOpen: false,
  category: CHECKIN_CATEGORIES[0],
  members: ['ONER全员'],
  proofData: '',
  proofKb: 0,
  pendingOpen: false,
  memberFilter: 'ONER全员',
  adminKeyStale: false
};

function checkinIsAdmin() {
  try {
    return Boolean(typeof canEditContent === 'function' ? canEditContent() : (typeof AppState !== 'undefined' && (AppState.isAdminPasswordVerified || AppState.isAdmin)));
  } catch (e) { return false; }
}

async function checkinRpc(fnName, params) {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) throw new Error('offline');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  if (!res.ok) {
    let info = null;
    let raw = '';
    try { raw = await res.text(); } catch (e) { raw = ''; }
    try { info = raw ? JSON.parse(raw) : null; } catch (e) { info = null; }
    const err = new Error('rpc-failed-' + res.status);
    err.status = res.status;
    err.code = String((info && (info.code || info.error_code)) || '');
    err.detail = String((info && (info.message || info.details || info.hint || info.error)) || '');
    throw err;
  }
  return res.json().catch(() => null);
}

// ---------- 全站统一管理员口令读取（不新造存储 Key） ----------
// 真实来源永远是 store.js 的 setSecurityAdminKey/getSecurityAdminKey（当前会话内存），
// 这里只是把历史遗留的存储键与全局变量作为只读兜底，读到就回写进统一通道。
const CHECKIN_ADMIN_KEY_ALIASES = [
  'onerland_security_admin_key',
  'onerland_admin_key',
  'onerland_admin_password',
  'onerlandAdminKey',
  'admin_key',
  'admin_password'
];
let checkinKeyPrompting = false;

function readLegacyAdminKey() {
  const stores = [];
  try { stores.push(window.localStorage); } catch (e) { /* ignore */ }
  try { stores.push(window.sessionStorage); } catch (e) { /* ignore */ }
  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    if (!store) continue;
    for (let j = 0; j < CHECKIN_ADMIN_KEY_ALIASES.length; j++) {
      try {
        const v = String(store.getItem(CHECKIN_ADMIN_KEY_ALIASES[j]) || '').trim();
        if (v) return v;
      } catch (e) { /* ignore */ }
    }
  }
  const globals = [window.adminPassword, window.admin_password, window.adminKey];
  for (let i = 0; i < globals.length; i++) {
    const v = String(globals[i] || '').trim();
    if (v) return v;
  }
  return '';
}

function syncCheckinAdminKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  try { if (typeof setSecurityAdminKey === 'function') setSecurityAdminKey(k); } catch (e) { /* ignore */ }
  try {
    if (typeof AppState !== 'undefined') AppState.isAdminPasswordVerified = true;
  } catch (e) { /* ignore */ }
  return k;
}

// 统一读取：优先全站内存口令，其次历史存储 / 全局变量
function getCheckinAdminKey() {
  let key = '';
  try { key = typeof getSecurityAdminKey === 'function' ? String(getSecurityAdminKey() || '').trim() : ''; } catch (e) { key = ''; }
  if (!key) key = readLegacyAdminKey();
  return key ? syncCheckinAdminKey(key) : '';
}

// 只在用户明确操作（提交 / 审核 / 重试）时弹一次口令框，避免任何循环
function promptCheckinAdminKey(message) {
  if (checkinKeyPrompting) return '';
  checkinKeyPrompting = true;
  let typed = '';
  try {
    typed = window.prompt(message || '请输入管理员密码（与全站解锁口令一致）：') || '';
  } catch (e) { typed = ''; }
  checkinKeyPrompting = false;
  const key = String(typed || '').trim();
  if (!key) return '';
  return syncCheckinAdminKey(key);
}

function isCheckinAuthError(err) {
  if (!err) return false;
  const status = Number(err.status || 0);
  const code = String(err.code || '');
  const text = `${err.message || ''} ${err.detail || ''}`;
  if (status === 401 || status === 403) return true;
  if (code === '42501' || code === 'PGRST301') return true;
  return /unauthorized|invalid.*(key|password)|口令|密码|permission denied|jwt/i.test(text);
}

// 管理员 RPC 统一通道：自动带 p_admin_key，校验失败只补弹一次口令并重试一次
async function checkinAdminRpc(fnName, params) {
  let key = getCheckinAdminKey();
  if (!key) {
    key = promptCheckinAdminKey();
    if (!key) throw new Error('admin-key-cancelled');
  }
  const build = k => Object.assign({}, params || {}, { p_admin_key: k });
  try {
    return await checkinRpc(fnName, build(key));
  } catch (e) {
    if (!isCheckinAuthError(e)) throw e;
    const next = promptCheckinAdminKey('管理员密码校验未通过（可能已过期），请重新输入全站管理员密码：');
    if (!next) {
      const err = new Error('admin-key-cancelled');
      err.authFailed = true;
      throw err;
    }
    return checkinRpc(fnName, build(next));
  }
}

// 📷 浏览器端大图压缩：最长边 ≤960px，Base64 ≤220000 字符，体积目标 <150KB
function compressCheckinImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('未选择图片'));
    if (!/^image\//.test(String(file.type || ''))) return reject(new Error('请选择图片文件'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const maxSide = 960;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) return reject(new Error('图片尺寸异常'));
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('浏览器不支持图片压缩'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        const qualities = [0.78, 0.62, 0.50, 0.42, 0.35];
        let dataUrl = '';
        for (let i = 0; i < qualities.length; i++) {
          dataUrl = canvas.toDataURL('image/jpeg', qualities[i]);
          if (dataUrl.length <= 220000) break;
        }
        if (dataUrl.length > 280000) {
          // 极端长图再降一档分辨率兜底
          const canvas2 = document.createElement('canvas');
          const w2 = Math.max(1, Math.round(cw * 0.75));
          const h2 = Math.max(1, Math.round(ch * 0.75));
          canvas2.width = w2;
          canvas2.height = h2;
          const ctx2 = canvas2.getContext('2d');
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(0, 0, w2, h2);
          ctx2.drawImage(canvas, 0, 0, w2, h2);
          dataUrl = canvas2.toDataURL('image/jpeg', 0.42);
        }
        const base64 = dataUrl.split(',')[1] || '';
        const bytes = Math.round(base64.length * 0.75);
        resolve({ dataUrl, bytes, kb: Math.max(1, Math.round(bytes / 1024)), length: dataUrl.length });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function checkinMembersText(members) {
  const list = Array.isArray(members) ? members.filter(Boolean) : [];
  if (!list.length) return 'ONER全员';
  if (list.includes('ONER全员')) return 'ONER全员';
  return list.join(' · ');
}

function checkinCategoryIcon(category) {
  const s = String(category || '');
  if (s.indexOf('咖啡') >= 0) return '☕';
  if (s.indexOf('拍照') >= 0 || s.indexOf('地标') >= 0) return '📸';
  return '🍜';
}

function checkinProofIsImage(proof) {
  return /^data:image\//i.test(String(proof || ''));
}

function checkinProofIsLink(proof) {
  return /^https?:\/\//i.test(String(proof || ''));
}

// 成员分流检索：自动拼精准搜索词
function checkinMemberKeyword(city, member) {
  const c = String(city || '').trim();
  const m = String(member || 'ONER全员').trim();
  return `${m} ${c} 同款 探店`.replace(/\s+/g, ' ');
}

function setCheckinMemberFilter(member) {
  checkinState.memberFilter = CHECKIN_MEMBERS.includes(member) ? member : 'ONER全员';
  renderCheckinSection();
}

function copyCheckinMemberKeyword() {
  const text = checkinMemberKeyword(checkinState.city, checkinState.memberFilter);
  const ok = () => showToast(`已复制：${text}`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy());
  } else fallbackCopy();
  function fallbackCopy() {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const done = document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) ok(); else toastError('复制失败，请手动选择文字复制');
    } catch (e) { toastError('复制失败，请手动选择文字复制'); }
  }
}

function toggleCheckinForm() {
  checkinState.formOpen = !checkinState.formOpen;
  if (!checkinState.formOpen) {
    checkinState.members = ['ONER全员'];
    checkinState.category = CHECKIN_CATEGORIES[0];
    checkinState.proofData = '';
    checkinState.proofKb = 0;
  }
  renderCheckinSection();
}

function setCheckinCategory(category) {
  checkinState.category = CHECKIN_CATEGORIES.includes(category) ? category : CHECKIN_CATEGORIES[0];
  renderCheckinSection();
}

function toggleCheckinMember(member) {
  if (!CHECKIN_MEMBERS.includes(member)) return;
  if (member === 'ONER全员') {
    checkinState.members = ['ONER全员'];
  } else {
    const rest = checkinState.members.filter(m => m !== 'ONER全员');
    const next = rest.includes(member) ? rest.filter(m => m !== member) : rest.concat(member);
    checkinState.members = next.length ? next : ['ONER全员'];
  }
  renderCheckinSection();
}

async function handleCheckinImage(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  try {
    showToast('🖼️ 正在压缩图片…');
    const out = await compressCheckinImage(file);
    checkinState.proofData = out.dataUrl;
    checkinState.proofKb = out.kb;
    renderCheckinSection();
    showToast(`✅ 已自动压缩至 ${out.kb} KB`);
  } catch (e) {
    toastError(`图片处理失败：${e.message}`);
  } finally {
    if (input) input.value = '';
  }
}

function clearCheckinProof() {
  checkinState.proofData = '';
  checkinState.proofKb = 0;
  renderCheckinSection();
}

async function loadCheckinSpots(city, force) {
  const c = String(city || '').trim();
  if (!c) return;
  if (checkinState.loading) return;
  if (checkinState.loaded && !force && checkinState.city === c) return;
  checkinState.city = c;
  checkinState.loading = true;
  checkinState.failed = false;
  renderCheckinSection();
  try {
    const data = await checkinRpc('get_approved_checkin_spots', { p_city: c });
    const list = Array.isArray(data) ? data : [];
    checkinState.spots = list.slice(0, CHECKIN_PAGE_SIZE_LIMIT);
    if (checkinIsAdmin()) await loadCheckinPending();
  } catch (e) {
    checkinState.failed = true;
    checkinState.spots = [];
  }
  checkinState.loading = false;
  checkinState.loaded = true;
  renderCheckinSection();
}

async function loadCheckinPending() {
  if (!checkinIsAdmin()) { checkinState.pending = []; checkinState.adminKeyStale = false; return; }
  const key = getCheckinAdminKey();
  if (!key) { checkinState.pending = []; checkinState.adminKeyStale = true; return; }
  try {
    const data = await checkinRpc('admin_get_pending_checkin_spots', { p_admin_key: key });
    checkinState.pending = Array.isArray(data) ? data : [];
    checkinState.adminKeyStale = false;
  } catch (e) {
    checkinState.pending = [];
    checkinState.adminKeyStale = isCheckinAuthError(e);
  }
}

// 待审核区「重新输入口令」：一次弹框 → 写入全站统一通道 → 只重拉一次
async function retryCheckinAdminKey() {
  const key = promptCheckinAdminKey('请输入全站管理员密码（与顶部解锁使用同一个）：');
  if (!key) return;
  checkinState.adminKeyStale = false;
  await loadCheckinPending();
  if (checkinState.adminKeyStale) toastError('口令仍未通过校验，请确认与顶部解锁口令一致');
  else showToast('✅ 管理员口令已生效');
  renderCheckinSection();
}

async function submitCheckinSpot() {
  const isAdmin = checkinIsAdmin();
  const cityEl = document.getElementById('ci-city');
  const nameEl = document.getElementById('ci-name');
  const noteEl = document.getElementById('ci-note');
  const linkEl = document.getElementById('ci-link');
  const city = String((cityEl && cityEl.value) || checkinState.city || '').trim();
  const name = String((nameEl && nameEl.value) || '').trim();
  const note = String((noteEl && noteEl.value) || '').trim();
  const link = String((linkEl && linkEl.value) || '').trim();
  if (!city) return toastError('请填写所属城市');
  if (!name) return toastError('请填写餐厅 / 地标名称');
  if (name.length > 30) return toastError('名称请控制在 30 字以内');
  if (note.length > 60) return toastError('备注请控制在 60 字以内');
  let proof = checkinState.proofData;
  if (!proof && isAdmin && link) {
    if (!checkinProofIsLink(link)) return toastError('出处链接需以 http(s):// 开头');
    proof = link;
  }
  if (proof && !checkinProofIsImage(proof) && !checkinProofIsLink(proof)) return toastError('出处格式不正确');
  if (proof.length > 280000) return toastError('图片过大，请重新压缩后再提交');
  const deviceId = String(typeof getDeviceId === 'function' ? getDeviceId() : 'local-device');
  const btn = document.getElementById('ci-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 提交中…'; }
  try {
    if (isAdmin) {
      await checkinAdminRpc('admin_create_checkin_spot', {
        p_city: city,
        p_members: checkinState.members,
        p_category: checkinState.category,
        p_spot_name: name,
        p_note: note,
        p_proof_data: proof,
        p_device_id: deviceId
      });
      showToast('✅ 已免审直发，立即公开展示');
    } else {
      await checkinRpc('submit_checkin_spot', {
        p_city: city,
        p_members: checkinState.members,
        p_category: checkinState.category,
        p_spot_name: name,
        p_note: note,
        p_proof_data: proof,
        p_device_id: deviceId
      });
      showToast('🎉 投稿成功！审核通过后将在列表公开展示');
    }
    checkinState.formOpen = false;
    checkinState.proofData = '';
    checkinState.proofKb = 0;
    checkinState.members = ['ONER全员'];
    checkinState.category = CHECKIN_CATEGORIES[0];
    await loadCheckinSpots(city, true);
  } catch (e) {
    const msg = String(e && e.message || '');
    if (msg === 'admin-key-cancelled') toastError('已取消：未提供有效的管理员口令');
    else if (isCheckinAuthError(e) || /Unauthorized/i.test(msg)) toastError('管理员口令未通过校验，请用顶部解锁的同一口令重试');
    else toastError(msg.indexOf('rpc-failed') >= 0 ? '提交失败：后台接口未就绪或已达投稿上限' : `提交失败：${msg}`);
    if (btn) { btn.disabled = false; btn.textContent = isAdmin ? '➕ 免审发布' : '📮 提交审核'; }
  }
}

function openCheckinProof(spotId) {
  const spot = checkinState.spots.concat(checkinState.pending).find(sp => String(sp.id) === String(spotId));
  if (!spot) return;
  const proof = String(spot.proof_data || '');
  if (checkinProofIsImage(proof)) {
    if (typeof openPosterLightbox === 'function') openPosterLightbox(proof, '👀 同款出处');
    else window.open(proof, '_blank', 'noopener');
  } else if (checkinProofIsLink(proof)) {
    window.open(proof, '_blank', 'noopener,noreferrer');
  } else {
    toastError('该打卡点暂无出处');
  }
}

function toggleCheckinPending() {
  checkinState.pendingOpen = !checkinState.pendingOpen;
  renderCheckinSection();
}

async function adminReviewCheckin(spotId) {
  try {
    await checkinAdminRpc('admin_review_checkin_spot', { p_id: String(spotId), p_action: 'approve' });
    showToast('✅ 已通过并公开');
    await loadCheckinSpots(checkinState.city, true);
  } catch (e) {
    if (e && (e.message === 'admin-key-cancelled' || e.authFailed)) return toastError('已取消：未提供有效管理员口令');
    toastError('审核失败，请稍后重试');
  }
}

async function adminRejectCheckin(spotId) {
  try {
    await checkinAdminRpc('admin_review_checkin_spot', { p_id: String(spotId), p_action: 'reject' });
    checkinState.pending = checkinState.pending.filter(sp => String(sp.id) !== String(spotId));
    renderCheckinSection();
    showToast('🗑️ 已驳回并彻底删除');
  } catch (e) {
    if (e && (e.message === 'admin-key-cancelled' || e.authFailed)) return toastError('已取消：未提供有效管理员口令');
    toastError('驳回失败，请稍后重试');
  }
}

async function deleteApprovedCheckin(spotId) {
  try {
    await checkinAdminRpc('admin_review_checkin_spot', { p_id: String(spotId), p_action: 'delete' });
    checkinState.spots = checkinState.spots.filter(sp => String(sp.id) !== String(spotId));
    renderCheckinSection();
    showToast('🗑️ 已删除该打卡点');
  } catch (e) {
    if (e && (e.message === 'admin-key-cancelled' || e.authFailed)) return toastError('已取消：未提供有效管理员口令');
    toastError('删除失败，请稍后重试');
  }
}

function checkinRowsHtml(list, adminSide) {
  if (!list.length) return '';
  return list.map(sp => {
    const proof = String(sp.proof_data || '');
    const hasProof = checkinProofIsImage(proof) || checkinProofIsLink(proof);
    const members = checkinMembersText(sp.members);
    return `
      <div class="checkin-row">
        <div class="checkin-main">
          <div class="checkin-name">${checkinCategoryIcon(sp.category)} ${travelEsc(sp.spot_name || '未命名打卡点')}</div>
          <div class="checkin-tags">
            <span class="checkin-tag is-member">${travelEsc(members)}</span>
            <span class="checkin-tag">${travelEsc(sp.category || '🍜 餐厅美食')}</span>
          </div>
          ${sp.note ? `<div class="checkin-note">${travelEsc(sp.note)}</div>` : ''}
        </div>
        <div class="checkin-side">
          ${hasProof ? `<button type="button" class="checkin-mini-btn" onclick="openCheckinProof('${travelEsc(sp.id)}')">👀 查看出处</button>` : ''}
          ${adminSide ? `<button type="button" class="checkin-mini-btn is-danger" onclick="${adminSide === 'pending' ? 'adminRejectCheckin' : 'deleteApprovedCheckin'}('${travelEsc(sp.id)}')">🗑️ ${adminSide === 'pending' ? '驳回删除' : '删除'}</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function buildCheckinFormHtml(isAdmin, city) {
  if (!checkinState.formOpen) return '';
  const proof = checkinState.proofData;
  const cats = CHECKIN_CATEGORIES.map(cat =>
    `<button type="button" class="checkin-chip ${checkinState.category === cat ? 'is-active' : ''}" onclick="setCheckinCategory('${travelEsc(cat)}')">${travelEsc(cat)}</button>`
  ).join('');
  const mems = CHECKIN_MEMBERS.map(m =>
    `<button type="button" class="checkin-chip ${checkinState.members.includes(m) ? 'is-active' : ''}" onclick="toggleCheckinMember('${travelEsc(m)}')">${travelEsc(m)}</button>`
  ).join('');
  return `
    <div class="checkin-form">
      <div class="checkin-form-row">
        <input id="ci-city" class="checkin-input" type="text" maxlength="12" value="${travelEsc(city)}" placeholder="所属城市" />
        <input id="ci-name" class="checkin-input" type="text" maxlength="30" placeholder="餐厅 / 地标名称（必填，30 字内）" />
      </div>
      <div class="checkin-form-block">
        <div class="checkin-form-label">关联成员（可多选）</div>
        <div class="checkin-chip-row">${mems}</div>
      </div>
      <div class="checkin-form-block">
        <div class="checkin-form-label">分类</div>
        <div class="checkin-chip-row">${cats}</div>
      </div>
      <input id="ci-note" class="checkin-input" type="text" maxlength="60" placeholder="备注说明（选填，60 字内，如：必点菜 / 拍照机位）" />
      <div class="checkin-proof-box">
        <label class="checkin-upload-btn">
          📷 上传同款截图（自动压缩）
          <input type="file" accept="image/*" class="hidden" onchange="handleCheckinImage(this)" />
        </label>
        ${checkinState.proofKb ? `<span class="checkin-proof-tip">✅ 已自动压缩至 ${checkinState.proofKb} KB <button type="button" class="checkin-link-btn" onclick="clearCheckinProof()">移除</button></span>` : ''}
        ${proof && checkinProofIsImage(proof) ? `<img src="${proof}" alt="同款截图预览" class="checkin-proof-thumb" onclick="openCheckinProofPreview()" />` : ''}
      </div>
      ${isAdmin ? `<input id="ci-link" class="checkin-input" type="url" maxlength="300" placeholder="或填写外部视频出处链接（选填，https:// 开头）" />` : ''}
      <div class="checkin-form-actions">
        <button type="button" id="ci-submit-btn" class="checkin-submit" onclick="submitCheckinSpot()">${isAdmin ? '➕ 免审发布' : '📮 提交审核'}</button>
      </div>
    </div>`;
}

function openCheckinProofPreview() {
  if (checkinState.proofData && typeof openPosterLightbox === 'function') {
    openPosterLightbox(checkinState.proofData, '👀 同款截图预览');
  }
}

function renderCheckinSection() {
  const box = document.getElementById('checkin-spots-box');
  if (!box) return;
  const isAdmin = checkinIsAdmin();
  const city = String(checkinState.city || box.dataset.city || '').trim();
  const spots = checkinState.spots;
  const pending = isAdmin ? checkinState.pending : [];
  const keyword = checkinMemberKeyword(city, checkinState.memberFilter);
  const memberChips = CHECKIN_MEMBERS.map(m =>
    `<button type="button" class="checkin-chip ${checkinState.memberFilter === m ? 'is-active' : ''}" onclick="setCheckinMemberFilter('${travelEsc(m)}')">${travelEsc(m)}</button>`
  ).join('');

  box.innerHTML = `
    <div class="checkin-member-bar">
      <div class="checkin-member-title">🔎 成员同款检索 <span class="checkin-member-sub">· 自动拼精准关键词</span></div>
      <div class="checkin-chip-row">${memberChips}</div>
      <div class="checkin-keyword">${travelEsc(keyword)}</div>
      <div class="checkin-member-actions">
        <a class="checkin-action-primary" href="https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}" target="_blank" rel="noopener noreferrer">↗️ 跳转小红书搜索</a>
        <button type="button" class="checkin-action-ghost" onclick="copyCheckinMemberKeyword()">📋 复制关键词</button>
      </div>
    </div>

    <div class="checkin-list-head">
      <span>📍 ${travelEsc(city)} · 已通过审核的同款打卡（${spots.length}）</span>
    </div>
    ${checkinState.loading
      ? `<div class="checkin-empty">⏳ 正在加载同款打卡点…</div>`
      : spots.length
        ? `<div class="checkin-list">${checkinRowsHtml(spots, isAdmin ? 'approved' : '')}</div>`
        : `<div class="checkin-empty">${checkinState.failed ? '暂时无法加载打卡点，稍后再看看～' : '还没有已通过审核的同款打卡点，欢迎下方投稿～'}</div>`}

    <button type="button" class="checkin-toggle-form" onclick="toggleCheckinForm()">
      ${checkinState.formOpen ? '✕ 收起表单' : (isAdmin ? '➕ 录入同款打卡点（免审直发）' : '➕ 推荐同款打卡点（需审核）')}
    </button>
    ${buildCheckinFormHtml(isAdmin, city)}

    ${isAdmin ? `
      <div class="checkin-admin">
        <button type="button" class="checkin-admin-head" onclick="toggleCheckinPending()">
          ⏳ 待审核同款投稿（${pending.length} 条） <span>${checkinState.pendingOpen ? '▴' : '▾'}</span>
        </button>
        ${checkinState.adminKeyStale ? `<div class="checkin-empty">🔑 管理员口令未通过校验，<button type="button" class="checkin-link-btn" onclick="retryCheckinAdminKey()">点此重新输入</button></div>` : ''}
        ${checkinState.pendingOpen ? (pending.length
          ? `<div class="checkin-list">${pending.map(sp => `
              <div class="checkin-row is-pending">
                <div class="checkin-main">
                  <div class="checkin-name">${checkinCategoryIcon(sp.category)} ${travelEsc(sp.spot_name || '未命名')}</div>
                  <div class="checkin-tags">
                    <span class="checkin-tag is-member">${travelEsc(checkinMembersText(sp.members))}</span>
                    <span class="checkin-tag">${travelEsc(sp.city || '')}</span>
                    <span class="checkin-tag">${travelEsc(sp.category || '')}</span>
                  </div>
                  ${sp.note ? `<div class="checkin-note">${travelEsc(sp.note)}</div>` : ''}
                  ${checkinProofIsImage(String(sp.proof_data || '')) ? `<img src="${sp.proof_data}" class="checkin-proof-thumb" alt="待审核截图" onclick="openCheckinProof('${travelEsc(sp.id)}')" />` : ''}
                </div>
                <div class="checkin-side">
                  ${sp.proof_data ? `<button type="button" class="checkin-mini-btn" onclick="openCheckinProof('${travelEsc(sp.id)}')">👀 查看</button>` : ''}
                  <button type="button" class="checkin-mini-btn is-ok" onclick="adminReviewCheckin('${travelEsc(sp.id)}')">✅ 通过并公开</button>
                  <button type="button" class="checkin-mini-btn is-danger" onclick="adminRejectCheckin('${travelEsc(sp.id)}')">🗑️ 驳回删除</button>
                </div>
              </div>`).join('')}</div>`
          : `<div class="checkin-empty">暂无待审核投稿</div>`) : ''}
      </div>` : ''}
  `;
}

// 🍜 同款打卡独立弹窗：顶部三张官方/站外入口卡
function buildCheckinQuickLinks(city) {
  const c = String(city || '').trim() || '当地';
  const enc = encodeURIComponent;
  return [
    { label: '大众点评 · 城市必吃榜', desc: `${c} 本地特色美食排行`, url: `https://www.dianping.com/search/keyword/0/0_${enc(`${c} 必吃榜`)}` },
    { label: '小红书 · 城市美食', desc: `${c} 探店与排队攻略`, url: `https://www.xiaohongshu.com/search_result?keyword=${enc(`${c} 必吃`)}` },
    { label: '小红书 · 成员同款打卡', desc: '按成员分流检索同款探店', url: `https://www.xiaohongshu.com/search_result?keyword=${enc(`ONER ${c} 同款 探店`)}`, memberSearch: true }
  ];
}

function buildTravelGroups() {
  const show = travelHelperState.show || {};
  const dest = travelCityMeta(show.city);
  const origin = travelCityMeta(travelHelperState.origin);
  const venue = String(show.venue || dest.city || '').trim() || dest.city;
  const depart = travelHelperState.depart;
  const back = travelHelperState.ret;
  const enc = encodeURIComponent;
  const keyword = `${origin.city} → ${dest.city}${depart || back ? ` ${depart || ''}${back ? `至${back}` : ''}` : ''}${venue ? ` ${venue}` : ''}`.trim();

  return {
    origin,
    dest,
    venue,
    keyword: keyword.replace(/\s+/g, ' '),
    groups: [
      {
        id: 'flights',
        icon: '✈️',
        title: '机票',
        hint: `${origin.city} → ${dest.city}${depart ? ` · ${depart}` : ''}`,
        links: [
          { label: '携程机票', desc: '移动端 H5 机票首页', url: 'https://m.ctrip.com/html5/flight/swift/index' },
          { label: '去哪儿机票', desc: '多航司比价 / 中转', url: 'https://flight.qunar.com/' },
          { label: '飞猪机票', desc: '阿里系运价与优惠', url: 'https://h5.m.taobao.com/trip/flight/search/index.html' }
        ]
      },
      {
        id: 'trains',
        icon: '🚄',
        title: '高铁',
        hint: `${origin.station || origin.city} → ${dest.station || dest.city}${depart ? ` · ${depart}` : ''}`,
        links: [
          { label: '铁路 12306 官方', desc: '官方余票与正晚点（移动端自适应）', url: 'https://www.12306.cn/index/' },
          { label: '携程火车票', desc: '余票 / 票价对比', url: 'https://m.ctrip.com/webapp/train/' },
          { label: '去哪儿火车票', desc: '车次耗时 / 中转组合', url: 'https://train.qunar.com/' }
        ]
      },
      {
        id: 'local',
        icon: '🚇',
        title: '同城交通',
        hint: `${venue} · 地铁 / 打车`,
        links: [
          {
            label: '高德地图 · 路线 / 打车',
            desc: `${venue} · 公交地铁优先（可唤醒 App）`,
            url: `https://uri.amap.com/navigation?to=,,${enc(venue)}&mode=bus&src=onerland&callnative=1`
          },
          {
            label: '百度地图 · 地铁换乘',
            desc: `${venue} · 公交/地铁耗时（可唤醒 App）`,
            url: `https://api.map.baidu.com/direction?destination=${enc(venue)}&mode=transit&output=html&src=webapp.onerland.onerland`
          }
        ]
      },
      {
        id: 'hotels',
        icon: '🏨',
        title: '酒店',
        hint: `${venue} 周边${show.date ? ` · ${String(show.date).slice(0, 10)} 入住` : ''}`,
        links: [
          { label: '携程酒店', desc: '移动端酒店首页', url: 'https://m.ctrip.com/webapp/hotel/' },
          { label: '去哪儿酒店', desc: '酒店比价', url: 'https://hotel.qunar.com/' },
          ...(() => {
            const metro = getVenueMetroAreas(show);
            return metro.areas.slice(0, 3).map(area => {
              const links = hotelSearchLinks(dest.city, area.keyword);
              return {
                label: `🚇 ${area.label}`,
                desc: `${metro.station} · 低价优先`,
                url: links[0].url,
                extraLinks: links.slice(1).map(x => ({ platform: `${area.label.replace('周边', '')} · ${x.platform}`, url: x.url }))
              };
            });
          })()
        ],
        extraHtml: `<div class="text-[10px] text-slate-500 px-1">🚇 场馆地铁沿线住宿区：点开即按低价优先筛选，可在携程 / 美团之间对比同站价格。</div>`
      },
    ]
  };
}

function travelLinkButtons(list) {
  const flat = [];
  (list || []).forEach(item => {
    flat.push(item);
    (item.extraLinks || []).forEach(x => flat.push({ label: x.platform, desc: '同关键词 · 低价优先', url: x.url }));
  });
  return flat.map(item => `
    <a class="travel-link" href="${travelEsc(item.url)}" ${item.memberSearch ? 'data-travel-member="1"' : ''} target="_blank" rel="noopener noreferrer">
      <span class="travel-link-label">${travelEsc(item.label)} <span class="travel-link-arrow">↗</span></span>
      <span class="travel-link-desc">${travelEsc(item.desc)}</span>
    </a>
  `).join('');
}

function ensureTravelModal() {
  let modal = document.getElementById('travel-helper-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'travel-helper-modal';
  modal.className = 'travel-modal hidden';
  modal.innerHTML = `
    <div class="travel-shell" role="dialog" aria-modal="true" aria-label="出行比价">
      <div class="travel-head">
        <div class="travel-title-wrap">
          <div class="travel-title">🚄 出行比价</div>
          <div class="travel-sub" id="travel-sub"></div>
        </div>
        <button type="button" class="travel-close" data-travel-close aria-label="关闭">✕</button>
      </div>
      <div class="travel-controls">
        <label class="travel-field">
          <span>出发城市</span>
          <select id="travel-origin" class="travel-select"></select>
        </label>
        <label class="travel-field">
          <span>去程日期</span>
          <input id="travel-depart" type="date" />
        </label>
        <label class="travel-field">
          <span>返程日期</span>
          <input id="travel-return" type="date" />
        </label>
      </div>
      <div class="travel-hot-cities" id="travel-hot-cities"></div>
      <div class="travel-body" id="travel-body"></div>
      <div class="travel-foot">
        全部为官方/正规平台直达链接，新标签页打开；本站不抓取任何第三方页面数据，也不参与任何交易。<br />
        📱 手机浏览器打开可自动拉起对应 App；若在微信内打开，点右上角「在默认浏览器打开」即可一键唤醒 App。
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const originSelect = modal.querySelector('#travel-origin');
  TRAVEL_CITIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.city;
    opt.textContent = `${c.city}（${c.iata || '—'} · ${c.station || c.city}）`;
    originSelect.appendChild(opt);
  });

  const hotBox = modal.querySelector('#travel-hot-cities');
  hotBox.innerHTML = TRAVEL_HOT_CITIES.map(city =>
    `<button type="button" class="travel-hot-chip" data-hot-city="${travelEsc(city)}">${travelEsc(city)}</button>`
  ).join('');
  hotBox.addEventListener('click', event => {
    const chip = event.target.closest('[data-hot-city]');
    if (!chip) return;
    event.preventDefault();
    travelHelperState.origin = travelCityMeta(chip.dataset.hotCity).city;
    setTravelOrigin(travelHelperState.origin);
    renderTravelHelper();
    loadTravelFlightPrices();
  });

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-travel-close]')) {
      closeTravelHelper();
    }
  });

  originSelect.addEventListener('change', event => {
    const val = String(event.target.value || '').trim();
    const meta = travelCityMeta(val);
    travelHelperState.origin = meta.city;
    setTravelOrigin(meta.city);
    renderTravelHelper();
  });
  modal.querySelector('#travel-depart').addEventListener('change', event => {
    travelHelperState.depart = event.target.value || travelHelperState.depart;
    renderTravelHelper();
    loadTravelFlightPrices();
  });
  modal.querySelector('#travel-return').addEventListener('change', event => {
    travelHelperState.ret = event.target.value || travelHelperState.ret;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeTravelHelper();
  });
  return modal;
}

function renderTravelHelper() {
  const modal = ensureTravelModal();
  const show = travelHelperState.show || {};
  const data = buildTravelGroups();
  const sub = modal.querySelector('#travel-sub');
  const titleParts = [];
  const title = String(show.title || '').trim();
  const city = String(show.city || '').trim();
  if (title && title !== city) titleParts.push(title);
  if (city) titleParts.push(city);
  if (show.venue && show.venue !== city) titleParts.push(show.venue);
  const dateText = String(show.date || '').slice(0, 10);
  if (dateText) titleParts.push(dateText);
  sub.textContent = titleParts.join(' · ');

  const body = modal.querySelector('#travel-body');
  body.innerHTML = data.groups.map(group => {
    const open = travelHelperState.openGroup === group.id;
    return `
      <section class="travel-group ${open ? 'is-open' : ''}" data-group="${group.id}">
        <button type="button" class="travel-group-head" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleTravelGroup('${group.id}')">
          <span class="travel-group-icon">${travelEsc(group.icon)}</span>
          <span class="travel-group-title">${travelEsc(group.title)}</span>
          <span class="travel-group-hint">${travelEsc(group.hint)}</span>
          <span class="travel-group-count">${group.links.length}</span>
          <span class="travel-group-chev">▾</span>
        </button>
        <div class="travel-group-panel ${open ? '' : 'hidden'}">
          <button type="button" class="travel-copy-btn" data-copy-key="${travelEsc(group.id)}">📋 一键复制行程关键词</button>
          <div class="travel-link-grid">${travelLinkButtons(group.links)}</div>
          ${group.extraHtml || ''}
          ${(group.links || []).some(l => l.extraLinks && l.extraLinks.length) ? `<div class="text-[10px] text-slate-400 px-1">同一住宿区也可切到：${[...new Set([].concat(...(group.links || []).map(l => (l.extraLinks || []).map(x => x.platform))))].join(' / ') || '—'} 比价</div>` : ''}
        </div>
      </section>
    `;
  }).join('');
  body.querySelectorAll('[data-copy-key]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      copyTravelKeywords(btn.dataset.copyKey);
    });
  });

  const originSelectEl = modal.querySelector('#travel-origin');
  if (originSelectEl) originSelectEl.value = travelHelperState.origin;
  modal.querySelectorAll('[data-hot-city]').forEach(chip => {
    chip.classList.toggle('is-active', chip.dataset.hotCity === travelHelperState.origin);
  });
  modal.querySelector('#travel-depart').value = travelHelperState.depart;
  modal.querySelector('#travel-return').value = travelHelperState.ret;
}

// 手风琴：点开一个大类会收起其它大类（保持弹窗紧凑）
function toggleTravelGroup(id) {
  const next = travelHelperState.openGroup === id ? '' : id;
  travelHelperState.openGroup = next;
  const modal = document.getElementById('travel-helper-modal');
  if (!modal) return;
  modal.querySelectorAll('.travel-group').forEach(sec => {
    const on = sec.dataset.group === next;
    sec.classList.toggle('is-open', on);
    const head = sec.querySelector('.travel-group-head');
    if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
    sec.querySelector('.travel-group-panel')?.classList.toggle('hidden', !on);
  });
}

// 复制行程关键词：优先 Clipboard API，失败退回 textarea 方案
function copyTravelKeywords(groupId) {
  const data = buildTravelGroups();
  const group = data.groups.find(g => g.id === groupId);
  let text = data.keyword;
  if (group) text = `${group.icon} ${group.title}：${data.keyword}`;
  const done = () => showToast(`已复制：${text}`);
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done(); else toastError('复制失败，请手动选择文字复制');
    } catch (e) {
      toastError('复制失败，请手动选择文字复制');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

// 可选的官方公开数据参考价（未配置 Token 时完全跳过，不发任何请求）
async function loadTravelFlightPrices() {
  const slot = document.getElementById('travel-price-slot');
  if (!slot) return;
  if (!TRAVELPAYOUTS_TOKEN) { slot.innerHTML = ''; return; }
  const origin = travelCityMeta(travelHelperState.origin);
  const dest = travelCityMeta((travelHelperState.show || {}).city);
  if (!origin.iata || !dest.iata) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="travel-price-loading">⏳ 正在获取官方公开参考底价…</div>`;
  try {
    const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin.iata}&destination=${dest.iata}&departure_at=${travelHelperState.depart}&currency=cny&token=${encodeURIComponent(TRAVELPAYOUTS_TOKEN)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data && data.data) ? data.data.slice(0, 3) : [];
    if (!rows.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="travel-price-list">
        ${rows.map(r => `
          <div class="travel-price-item">
            <span>${travelEsc(String(r.departure_at || '').slice(0, 10))}</span>
            <strong>¥${travelEsc(r.price || '—')}</strong>
            <span>${travelEsc(r.airline || '')}${r.flight_number ? ` ${travelEsc(r.flight_number)}` : ''}</span>
          </div>
        `).join('')}
      </div>
      <div class="travel-price-note">参考价来自 Travelpayouts 官方公开数据，最终以出票平台为准。</div>
    `;
  } catch (e) {
    slot.innerHTML = '';
  }
}

// ================= 🍜 同款打卡：独立弹窗（与出行比价同级） =================
function highlightCheckinMemberBar() {
  const bar = document.querySelector('#checkin-spots-box .checkin-member-bar');
  if (!bar) return;
  try { bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
  const first = bar.querySelector('.checkin-chip');
  if (first) first.classList.add('is-hint');
  setTimeout(() => { if (first) first.classList.remove('is-hint'); }, 1200);
}

function ensureCheckinModal() {
  let modal = document.getElementById('checkin-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'checkin-modal';
  modal.className = 'travel-modal checkin-modal hidden';
  modal.innerHTML = `
    <div class="travel-shell checkin-shell" role="dialog" aria-modal="true" aria-label="同款打卡">
      <div class="travel-head">
        <div class="travel-title-wrap">
          <div class="travel-title" id="checkin-title">🍜 同款打卡</div>
          <div class="travel-sub" id="checkin-sub"></div>
        </div>
        <button type="button" class="travel-close" data-checkin-close aria-label="关闭">✕</button>
      </div>
      <div class="travel-body checkin-modal-body" id="checkin-body">
        <div class="checkin-quick-head">🍜 三张直达卡 · 城市必吃 / 成员同款</div>
        <div class="travel-link-grid checkin-quick-links" id="checkin-quick-links"></div>
        <div class="food-spot-box checkin-standalone-box" id="checkin-spots-box">
          <div class="checkin-empty">⏳ 正在加载同款打卡点…</div>
        </div>
      </div>
      <div class="travel-foot">
        美食与打卡信息由站外平台提供，新标签页打开；同款投稿经审核后公开展示，仅保存在本站数据库。<br />
        📱 手机浏览器打开可自动拉起对应 App；若在微信内打开，点右上角「在默认浏览器打开」体验更完整。
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-checkin-close]')) {
      closeCheckinHelper();
      return;
    }
    const memberLink = event.target.closest('[data-travel-member]');
    if (memberLink) {
      event.preventDefault();
      event.stopPropagation();
      highlightCheckinMemberBar();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeCheckinHelper();
  });
  return modal;
}

function renderCheckinHelper() {
  const modal = ensureCheckinModal();
  const show = checkinState.show || {};
  const city = String(checkinState.city || show.city || '').trim();
  const sub = modal.querySelector('#checkin-sub');
  const parts = [];
  if (city) parts.push(city);
  if (show.venue && show.venue !== city) parts.push(show.venue);
  const dateText = String(show.date || '').slice(0, 10);
  if (dateText) parts.push(dateText);
  parts.push('仅保存在本机浏览记录，投稿经审核后公开');
  if (sub) sub.textContent = parts.join(' · ');

  const titleEl = modal.querySelector('#checkin-title');
  if (titleEl) titleEl.textContent = city ? `🍜 同款打卡 · ${city}` : '🍜 同款打卡';

  const quick = modal.querySelector('#checkin-quick-links');
  if (quick) quick.innerHTML = travelLinkButtons(buildCheckinQuickLinks(city));

  const box = document.getElementById('checkin-spots-box');
  if (box) box.dataset.city = city;
  renderCheckinSection();
}

// 从演出标题 / 场馆里扒出“真城市名”（避免把巡演标题当成城市塞进检索词）
function checkinCityName(src) {
  const data = src || {};
  const explicit = String(data.city || '').trim();
  if (explicit && /^[\u4e00-\u9fa5]{2,6}$/.test(explicit) && travelCityMeta(explicit).city === explicit) return explicit;
  const text = `${explicit} ${data.title || ''} ${data.venue || ''}`.trim();
  if (typeof detectFootprintCity === 'function') {
    try {
      const hit = detectFootprintCity({ city: '', title: text, venue: data.venue || '' });
      if (hit && hit !== '未知城市') return hit;
    } catch (e) { /* ignore */ }
  }
  const stop = text.match(/([\u4e00-\u9fa5]{2,6})站/);
  if (stop) {
    const c = stop[1].replace(/[省市县区]$/g, '');
    if (c && !/收官|加场|返场|首站|最终|巡演|演出|音乐节|演唱会|开票|预售/.test(c)) return c;
  }
  const known = Object.keys(typeof CITY_TO_PROVINCE !== 'undefined' ? CITY_TO_PROVINCE : {})
    .sort((a, b) => b.length - a.length)
    .find(c => text.includes(c));
  return known || travelCityMeta(explicit).city || explicit;
}

function openCheckinHelper(show) {
  const src = show || {};
  const rawDate = String(src.date || src.show_date || '').slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  checkinState.show = {
    city: src.city || '',
    venue: src.venue || '',
    date,
    title: src.title || src.city || ''
  };
  const cityName = checkinCityName(src);
  checkinState.show.city = cityName;
  checkinState.city = cityName;
  checkinState.spots = [];
  checkinState.pending = [];
  checkinState.loaded = false;
  checkinState.loading = false;
  checkinState.failed = false;
  checkinState.formOpen = false;
  checkinState.pendingOpen = false;
  checkinState.proofData = '';
  checkinState.proofKb = 0;
  checkinState.members = ['ONER全员'];
  checkinState.category = CHECKIN_CATEGORIES[0];
  checkinState.memberFilter = 'ONER全员';

  const modal = ensureCheckinModal();
  modal.classList.remove('hidden');
  document.body.classList.add('checkin-modal-open');
  renderCheckinHelper();
  const body = modal.querySelector('#checkin-body');
  if (body) body.scrollTop = 0;
  loadCheckinSpots(checkinState.city, true);
}

function openCheckinFromButton(btn) {
  if (!btn) return;
  openCheckinHelper({
    city: btn.dataset.city || '',
    venue: btn.dataset.venue || '',
    date: btn.dataset.date || '',
    title: btn.dataset.title || ''
  });
}

function closeCheckinHelper() {
  const modal = document.getElementById('checkin-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('checkin-modal-open');
}

function openTravelHelper(show) {
  const src = show || {};
  const rawDate = String(src.date || src.show_date || '').slice(0, 10);
  // 只接受规范日期，避免脏数据把跳转参数带偏
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  travelHelperState.show = {
    city: src.city || '',
    venue: src.venue || '',
    date,
    title: src.title || src.city || ''
  };
  travelHelperState.origin = getTravelOrigin();
  travelHelperState.depart = date ? travelShiftDate(date, -1) : travelShiftDate('', 1);
  travelHelperState.ret = date ? travelShiftDate(date, 1) : travelShiftDate('', 2);

  travelHelperState.openGroup = '';
  ensureTravelModal().classList.remove('hidden');
  document.body.classList.add('travel-modal-open');
  renderTravelHelper();
  loadTravelFlightPrices();
}

function openTravelHelperFromButton(btn) {
  if (!btn) return;
  openTravelHelper({
    city: btn.dataset.city || '',
    venue: btn.dataset.venue || '',
    date: btn.dataset.date || '',
    title: btn.dataset.title || ''
  });
}

function closeTravelHelper() {
  const modal = document.getElementById('travel-helper-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('travel-modal-open');
}

window.openCheckinHelper = openCheckinHelper;
window.openCheckinFromButton = openCheckinFromButton;
window.closeCheckinHelper = closeCheckinHelper;
window.openTravelHelper = openTravelHelper;
window.openTravelHelperFromButton = openTravelHelperFromButton;
window.closeTravelHelper = closeTravelHelper;
window.toggleTravelGroup = toggleTravelGroup;
window.copyTravelKeywords = copyTravelKeywords;
window.compressCheckinImage = compressCheckinImage;
window.toggleCheckinForm = toggleCheckinForm;
window.setCheckinCategory = setCheckinCategory;
window.toggleCheckinMember = toggleCheckinMember;
window.handleCheckinImage = handleCheckinImage;
window.clearCheckinProof = clearCheckinProof;
window.submitCheckinSpot = submitCheckinSpot;
window.openCheckinProof = openCheckinProof;
window.openCheckinProofPreview = openCheckinProofPreview;
window.setCheckinMemberFilter = setCheckinMemberFilter;
window.copyCheckinMemberKeyword = copyCheckinMemberKeyword;
window.toggleCheckinPending = toggleCheckinPending;
window.adminReviewCheckin = adminReviewCheckin;
window.adminRejectCheckin = adminRejectCheckin;
window.deleteApprovedCheckin = deleteApprovedCheckin;
window.renderCheckinSection = renderCheckinSection;
window.retryCheckinAdminKey = retryCheckinAdminKey;
window.getCheckinAdminKey = getCheckinAdminKey;
