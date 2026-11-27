// ================= 全局状态与常量 =================
const AppState = {
  activeArtistId: 'ALL',
  activeArchiveType: 'ALL',
  activeArchiveCity: 'ALL',
  isArchiveExpanded: false,
  showLoadError: '',
  editingTicketId: null,
  editingKind: null,
  isAdmin: false,
  isAdminPasswordVerified: false,
  adminToken: '',
  pendingExternalUrl: null,
  cloudTickets: [],
  cloudArchives: [],
  cloudHiddenShowKeys: [],
  footprints: [],
  anniversary: {
    firstMeetDate: '2018-08-30',
    fanNickname: '万能人',
    targets: ['ONER'],
    actionWord: '相识',
    customEvents: [],
    builtinOverrides: {}
  },
  fanPref: {
    biasType: 'group',
    biasMembers: [],
    customTags: [],
    autoFilterShows: false
  }
};

// 立即初始化本地状态，确保首屏逻辑能正确读取持久化数据
getFanPrefState();
try {
  AppState.footprints = JSON.parse(localStorage.getItem(LOCAL_KEYS.FOOTPRINTS) || '[]');
  const savedAnniversary = JSON.parse(localStorage.getItem(LOCAL_KEYS.ANNIVERSARY) || 'null');
  if (savedAnniversary) AppState.anniversary = { ...AppState.anniversary, ...savedAnniversary };
} catch (e) {
  console.warn('Failed to load local footprints/anniversary', e);
}

// 老版本可能存了空昵称/空起始日，这里统一兜底为内置默认值
if (!AppState.anniversary.firstMeetDate) AppState.anniversary.firstMeetDate = '2018-08-30';
if (!AppState.anniversary.fanNickname) AppState.anniversary.fanNickname = '万能人';
if (!AppState.anniversary.actionWord) AppState.anniversary.actionWord = '相识';
if (!Array.isArray(AppState.anniversary.targets) || !AppState.anniversary.targets.length) {
  AppState.anniversary.targets = ['ONER'];
}
if (!Array.isArray(AppState.anniversary.customEvents)) AppState.anniversary.customEvents = [];
if (!AppState.anniversary.builtinOverrides || typeof AppState.anniversary.builtinOverrides !== 'object') {
  AppState.anniversary.builtinOverrides = {};
}
if (!Array.isArray(AppState.footprints)) AppState.footprints = [];


window.AppState = AppState;

// 编辑权限：授权邮箱登录态与管理员密码解锁态互相独立，满足任意一种即可。
function canEditContent() {
  return Boolean(AppState.isAdmin || AppState.isAdminPasswordVerified);
}
window.canEditContent = canEditContent;

window.ARTIST_COLORS = window.ARTIST_COLORS || {
  'ONER': { id: 'ONER', bg: 'linear-gradient(135deg, #DD0514 0%, #8D0D0E 100%)', hex: '#DD0514' },
  '岳岳': { id: 'YUEYUE', bg: '#9C73EF', hex: '#9C73EF' },
  '木子洋': { id: 'MUZIYANG', bg: '#F90092', hex: '#F90092' },
  '灵超': { id: 'LINGCHAO', bg: '#32B5E1', hex: '#32B5E1' },
  '坤音娱乐': { id: 'QINS', bg: '#1e293b', hex: '#1e293b' }
};

// ================= 粉籍应援色（CP 严格双色渐变） =================
// 只有三位成员的官方应援色参与渐变，ONER 红永远不进入 CP 渐变。
const MEMBER_COLOR_FALLBACKS = { '岳岳': '#9C73EF', '木子洋': '#F90092', '灵超': '#32B5E1' };
const ONER_THEME = { first: '#DD0514', second: '#8D0D0E' };

function getMemberHex(name) {
  return ARTIST_COLORS[name]?.hex || MEMBER_COLOR_FALLBACKS[name] || MEMBER_COLOR_FALLBACKS['岳岳'];
}

function isMemberColorName(name) {
  return Boolean(name && name !== 'ONER' && MEMBER_COLOR_FALLBACKS[name]);
}

// CP 粉纯双色规范：不掺第三色，色标收紧到 38% / 62%，中间过渡极短，杜绝粉蓝混出紫色。
const CP_GRADIENT_STOPS = [38, 62];
function makeCpGradient(hex1, hex2, stops = CP_GRADIENT_STOPS) {
  if (String(hex1).toLowerCase() === String(hex2).toLowerCase()) return hex1;
  // 标准兼容回退：linear-gradient(135deg, 成员1色 38%, 成员2色 62%)
  const fallback = `linear-gradient(135deg, ${hex1} ${stops[0]}%, ${hex2} ${stops[1]}%)`;
  const modern = `linear-gradient(135deg in oklab, ${hex1} ${stops[0]}%, ${hex2} ${stops[1]}%)`;
  const supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('background-image', modern);
  return supported ? modern : fallback;
}
function buildCpGradient(firstMember, secondMember) {
  return makeCpGradient(getMemberHex(firstMember), getMemberHex(secondMember));
}

function getFanThemeHexes() {
  const pref = getFanPrefState();
  const members = (pref.biasMembers || []).filter(isMemberColorName);
  if (pref.biasType === 'cp') {
    return [getMemberHex(members[0] || '岳岳'), getMemberHex(members[1] || '木子洋')];
  }
  if (pref.biasType === 'group' || (pref.biasMembers || []).includes('ONER') || !members.length) {
    return [ONER_THEME.first, ONER_THEME.second];
  }
  if (members.length >= 2) return [getMemberHex(members[0]), getMemberHex(members[1])];
  return [getMemberHex(members[0]), getMemberHex(members[0])];
}

function getFanPrefThemeColor() {
  const pref = getFanPrefState();
  const members = (pref.biasMembers || []).filter(isMemberColorName);
  if (pref.biasType === 'cp') return buildCpGradient(members[0] || '岳岳', members[1] || '木子洋');
  if (pref.biasType === 'group' || (pref.biasMembers || []).includes('ONER') || !members.length) {
    return ARTIST_COLORS['ONER'].bg;
  }
  if (members.length >= 2) return buildCpGradient(members[0], members[1]);
  return getMemberHex(members[0]);
}

// 全局主题变量：按钮激活态、倒计时数字、纪念日胶囊统一取这里
function syncGlobalFanTheme() {
  const root = document.documentElement;
  const [c1, c2] = getFanThemeHexes();
  const theme = getFanPrefThemeColor();
  root.style.setProperty('--fan-theme', theme);
  root.style.setProperty('--accent-gradient', theme);
  root.style.setProperty('--fan-theme-solid', c1);
  root.style.setProperty('--fan-theme-alt', c2);
  root.style.setProperty('--footprint-theme', theme);
  root.style.setProperty('--footprint-theme-solid', c1);
}

window.getMemberHex = getMemberHex;
window.buildCpGradient = buildCpGradient;
window.CP_GRADIENT_STOPS = CP_GRADIENT_STOPS;
window.makeCpGradient = makeCpGradient;
window.getFanThemeHexes = getFanThemeHexes;
window.getFanPrefThemeColor = getFanPrefThemeColor;
window.syncGlobalFanTheme = syncGlobalFanTheme;

// ================= 纪念日配置（内置官方 + 用户自定义，年度循环） =================
const BUILTIN_ANNIVERSARIES = [
  { key: 'oner_debut', title: 'ONER 出道纪念日', date: '08-30', official: true },
  { key: 'wannengren_birthday', title: '万能人生日', date: '08-30', official: true },
  { key: 'yueyue_birthday', title: '岳岳生日', date: '07-11', official: true },
  { key: 'muziyang_birthday', title: '木子洋生日', date: '04-21', official: true },
  { key: 'lingchao_birthday', title: '灵超生日', date: '01-09', official: true }
];

const ANNIVERSARY_TARGET_OPTIONS = ['ONER', '岳岳', '木子洋', '灵超'];

function getAnniversaryState() {
  return AppState.anniversary;
}

function saveAnniversaryState(patch = {}) {
  AppState.anniversary = { ...AppState.anniversary, ...patch };
  localStorage.setItem(LOCAL_KEYS.ANNIVERSARY, JSON.stringify(AppState.anniversary));
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderAnniversaryManager === 'function' &&
      !document.getElementById('anniversary-manager-modal')?.classList.contains('hidden')) {
    renderAnniversaryManager();
  }
}

window.getAnniversaryState = getAnniversaryState;
window.saveAnniversaryState = saveAnniversaryState;

function getAnniversaryTargetsLabel(targets) {
  const list = (Array.isArray(targets) ? targets : AppState.anniversary.targets || []).filter(Boolean);
  return list.length ? list.join(' & ') : 'ONER';
}

function normalizeMonthDay(raw) {
  const text = String(raw || '').trim();
  const md = text.match(/^(\d{1,2})\s*[-\/.]\s*(\d{1,2})$/);
  if (md) {
    const m = Number(md[1]);
    const d = Number(md[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const iso = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (iso) return normalizeMonthDay(`${iso[2]}-${iso[3]}`);
  return '';
}

// 年度循环倒数：今天算 0 天，过了今年这一天就顺延到明年
function getAnnualCountdown(monthDay, now = new Date()) {
  const norm = normalizeMonthDay(monthDay);
  if (!norm) return null;
  const [m, d] = norm.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), m - 1, d);
  if (target.getTime() < today.getTime()) target = new Date(now.getFullYear() + 1, m - 1, d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  return { diffDays, date: norm, targetDate: target, isToday: diffDays === 0 };
}

// 每个纪念日对应的应援色（用于微条数字与胶囊高亮）
const ANNIVERSARY_ACCENT_MAP = {
  lingchao_birthday: '#32B5E1',
  muziyang_birthday: '#F90092',
  yueyue_birthday: '#9C73EF',
  oner_debut: '#DD0514',
  wannengren_birthday: '#DD0514'
};

function getAnniversaryAccentColor(ev) {
  if (ev && ev.builtinKey && ANNIVERSARY_ACCENT_MAP[ev.builtinKey]) {
    return ANNIVERSARY_ACCENT_MAP[ev.builtinKey];
  }
  return getFanThemeHexes()[0] || '#DD0514'; // 自定义纪念日跟随全局粉籍主色
}

// 关联对象激活态应援色：ONER 全团红渐变，其余成员各自官方色
function getAnniversaryTargetColor(member) {
  if (member === 'ONER') return ARTIST_COLORS['ONER'].bg;
  const hex = getMemberHex(member);
  return hex;
}

window.getAnniversaryAccentColor = getAnniversaryAccentColor;
window.getAnniversaryTargetColor = getAnniversaryTargetColor;

function getMergedAnniversaryList(now = new Date()) {
  const state = AppState.anniversary;
  const overrides = state.builtinOverrides || {};
  const list = [];

  BUILTIN_ANNIVERSARIES.forEach(item => {
    const ov = overrides[item.key] || {};
    if (ov.hidden) return;
    const date = normalizeMonthDay(ov.date || item.date);
    const countdown = getAnnualCountdown(date, now);
    if (!countdown) return;
    list.push({
      key: `builtin:${item.key}`,
      builtinKey: item.key,
      title: ov.title || item.title,
      date,
      official: true,
      diffDays: countdown.diffDays
    });
  });

  (state.customEvents || []).forEach((ev, idx) => {
    const date = normalizeMonthDay(ev?.date);
    const countdown = getAnnualCountdown(date, now);
    if (!countdown) return;
    list.push({
      key: ev.key || `custom:${idx}`,
      customKey: ev.key || `custom:${idx}`,
      title: ev.title || '我的纪念日',
      date,
      official: false,
      diffDays: countdown.diffDays
    });
  });

  return list.sort((a, b) => a.diffDays - b.diffDays || String(a.title).localeCompare(b.title, 'zh-Hans-CN'));
}

function addCustomAnniversary(title, date) {
  const cleanTitle = String(title || '').trim();
  const normDate = normalizeMonthDay(date);
  if (!cleanTitle) return { ok: false, message: '请填写纪念日名称' };
  if (!normDate) return { ok: false, message: '请填写正确的月日（如 08-30）' };
  const events = Array.isArray(AppState.anniversary.customEvents) ? [...AppState.anniversary.customEvents] : [];
  const existed = events.findIndex(ev => String(ev.title).trim() === cleanTitle && normalizeMonthDay(ev.date) === normDate);
  if (existed >= 0) {
    events[existed] = { ...events[existed], title: cleanTitle, date: normDate };
  } else {
    events.push({ key: `custom-${Date.now()}`, title: cleanTitle, date: normDate });
  }
  saveAnniversaryState({ customEvents: events });
  return { ok: true, message: existed >= 0 ? '已更新同名纪念日' : '已添加纪念日' };
}

function removeCustomAnniversary(key) {
  const events = (AppState.anniversary.customEvents || []).filter(ev => String(ev.key) !== String(key));
  saveAnniversaryState({ customEvents: events });
}

function updateBuiltinAnniversary(builtinKey, patch = {}) {
  const overrides = { ...(AppState.anniversary.builtinOverrides || {}) };
  const current = overrides[builtinKey] || {};
  overrides[builtinKey] = { ...current, ...patch };
  if (patch.date) overrides[builtinKey].date = normalizeMonthDay(patch.date) || current.date;
  saveAnniversaryState({ builtinOverrides: overrides });
}

function restoreBuiltinAnniversary(builtinKey) {
  const overrides = { ...(AppState.anniversary.builtinOverrides || {}) };
  delete overrides[builtinKey];
  saveAnniversaryState({ builtinOverrides: overrides });
}

window.getAnnualCountdown = getAnnualCountdown;
window.getMergedAnniversaryList = getMergedAnniversaryList;
window.getAnniversaryTargetsLabel = getAnniversaryTargetsLabel;
window.addCustomAnniversary = addCustomAnniversary;
window.removeCustomAnniversary = removeCustomAnniversary;
window.updateBuiltinAnniversary = updateBuiltinAnniversary;
window.restoreBuiltinAnniversary = restoreBuiltinAnniversary;
window.BUILTIN_ANNIVERSARIES = BUILTIN_ANNIVERSARIES;
window.ANNIVERSARY_TARGET_OPTIONS = ANNIVERSARY_TARGET_OPTIONS;


if (typeof window.updateAuthButtonUI !== 'function') {
  window.updateAuthButtonUI = function updateAuthButtonUI() {
    const btn = document.getElementById('auth-btn') || document.querySelector('[data-auth-btn]');
    if (!btn) return;
    btn.textContent = AppState.isAdmin ? '已登录' : '登录';
  };
}

// SB_HEADERS 统一由 js/config.js 提供（config.js 先于 store.js 加载），此处不再重复声明

// ================= 图片压缩工具 =================
function compressImageToDataURL(file, maxWidth = 800, quality = 0.72, maxBytes = 150 * 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const encode = (type, q) => {
          try { return canvas.toDataURL(type, q); } catch (e) { return ''; }
        };
        // 优先 WebP（体积更小），不支持时回退 JPEG
        let out = encode('image/webp', quality);
        if (!out || !out.startsWith('data:image/webp')) out = encode('image/jpeg', quality);

        // 单张控制在 150KB 以内：逐步降质，仍超标则缩尺寸
        let q = quality;
        while (out && out.length * 0.75 > maxBytes && q > 0.45) {
          q -= 0.08;
          const next = encode('image/webp', q) || encode('image/jpeg', q);
          if (!next) break;
          out = next;
        }
        let guard = 0;
        while (out && out.length * 0.75 > maxBytes && canvas.width > 240 && guard < 4) {
          const shrink = document.createElement('canvas');
          shrink.width = Math.round(canvas.width * 0.8);
          shrink.height = Math.round(canvas.height * 0.8);
          shrink.getContext('2d').drawImage(canvas, 0, 0, shrink.width, shrink.height);
          canvas.width = shrink.width;
          canvas.height = shrink.height;
          canvas.getContext('2d').drawImage(shrink, 0, 0);
          out = encode('image/webp', q) || encode('image/jpeg', q);
          guard += 1;
        }
        resolve(out);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ================= 海报加载策略：仅真实裂图时降级，不做超时掐断 =================
function degradePosterImage(img) {
  if (!img || img.dataset.degraded === '1') return;
  img.dataset.degraded = '1';
  const box = img.closest ? img.closest('.poster-square-box') : null;
  if (box) box.classList.add('is-poster-fallback');
  img.style.display = 'none';
}

// 仅当浏览器确实加载失败（onerror）时，才切换为本地渐变封面
function handlePosterImageError(img) {
  degradePosterImage(img);
}

// 海报属性：首屏前 4 张立即加载并提权，其余懒加载；Base64 图片不加跨域属性
function posterImgAttrs(src, index) {
  const isDataUrl = /^data:/i.test(String(src || ''));
  const priority = typeof index === 'number' && index < 4
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy"';
  return `${priority} decoding="async"${isDataUrl ? '' : ' referrerpolicy="no-referrer"'}`;
}

// 座位图/视野大图不随列表预加载，点击时按 id 单独查询云端记录
async function openSeatMapForShow(cloudId, fallbackUrl, caption) {
  const localUrl = fallbackUrl || '';
  if (!cloudId || typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) {
    if (localUrl) openLightbox(localUrl, caption || '座位图');
    else alert('该场次暂未上传座位图');
    return;
  }
  let seatUrl = '';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets?id=eq.${encodeURIComponent(cloudId)}&select=platform`, {
      headers: SB_HEADERS, cache: 'no-store'
    });
    if (res.ok) {
      const rows = await res.json();
      const raw = rows && rows[0] ? String(rows[0].platform || '') : '';
      const jsonText = raw.startsWith('META:') ? raw.slice(5) : raw;
      let meta = {};
      try { meta = JSON.parse(jsonText); } catch (e) { meta = {}; }
      seatUrl = meta.seatUrl || meta.seatMapUrl || meta.seatMap || meta.seat_map || meta.seat_url || '';
    }
  } catch (e) { /* 网络失败走本地兜底 */ }
  const finalUrl = seatUrl || localUrl;
  if (finalUrl) openLightbox(finalUrl, caption || '座位图');
  else alert('该场次暂未上传座位图');
}

// ================= 全局图片灯箱（置顶防遮挡） =================
function openLightbox(src, caption = '') {
  if (!src) return;
  const box = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (!box || !img) return;
  document.body.appendChild(box);
  box.style.zIndex = '9999';
  img.src = src;
  if (cap) cap.textContent = caption;
  box.classList.remove('hidden');
}

// ================= AI Key 状态（暂无对应 UI，先提供空实现避免启动报错） =================
function updateAiKeyStatusUI() {
  const badge = document.getElementById('ai-key-status');
  if (!badge) return;
  const key = localStorage.getItem(GEMINI_KEY_STORAGE);
  badge.textContent = key ? 'AI 已配置' : '未配置';
}
// 演出全量数据（含 base64 海报）响应体较大，网络抖动时可能超时或被截断。
// 失败时自动重试一次，避免偶发失败直接导致整页演出为空。
async function fetchTicketRows() {
  const url = `${SUPABASE_URL}/rest/v1/tickets?select=*&order=id.desc`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: SB_HEADERS, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  throw lastErr;
}
async function loadLocalTourData() {
  const response = await fetch('./tour_data.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`本地演出数据 HTTP ${response.status}`);
  const rows = await response.json();
  // 兼容数组或 {0:...,1:...} 对象两种导出格式
  const list = Array.isArray(rows) ? rows : Object.values(rows || {});
  const localTickets = list.filter(item => item && item.show_date).map((item, index) => ({
    ...item,
    cloudId: item.cloudId || `local-${index + 1}`,
    artist: item.artist || 'ONER',
    city: item.city || item.title || '待定场次',
    venue: item.venue || '场馆待定',
    rounds: Array.isArray(item.rounds) ? item.rounds : [],
    source_url: item.source_url || item.url || ''
  }));
  AppState.cloudTickets = filterHiddenShows(mergeShowRecords(localTickets, [], false), false);
  const localArchives = list.filter(item => item && item.showDate).map((item, index) => ({
    ...item,
    cloudId: item.cloudId || `local-archive-${index + 1}`,
    artist: item.artist || 'ONER',
    year: item.year || String(item.showDate).slice(0, 4),
    subType: item.subType || 'tour'
  }));
  AppState.cloudArchives = filterHiddenShows(mergeShowRecords(localArchives, [], true), true);
  AppState.showLoadError = '';
}

// ================= 本地预置场次的隐藏列表（管理员删除本地场次时使用） =================
const HIDDEN_LOCAL_SHOWS_KEY = 'onerland_hidden_show_keys_v1';

function getHiddenLocalShowKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_LOCAL_SHOWS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function buildLocalShowKey(item, isArchive) {
  if (!item) return '';
  const title = isArchive ? (item.title || item.city) : (item.city || item.title);
  const date = isArchive ? item.showDate : item.show_date;
  return `${item.artist || ''}|${title || ''}|${date || ''}`;
}

function hideLocalShow(item, isArchive) {
  const key = buildLocalShowKey(item, isArchive);
  if (!key) return;
  const keys = getHiddenLocalShowKeys();
  if (!keys.includes(key)) {
    keys.push(key);
    try { localStorage.setItem(HIDDEN_LOCAL_SHOWS_KEY, JSON.stringify(keys)); } catch (e) { /* 存储失败时忽略 */ }
  }
}

function parseHiddenShowKey(key) {
  const parts = String(key || '').split('|');
  if (parts.length < 3) return null;
  const date = String(parts[parts.length - 1] || '').slice(0, 10);
  const label = parts.length >= 3 ? parts[1] : '';
  const trimmed = label.replace(/[「」《》·\s]/g, '');
  return date && trimmed ? { date, label: trimmed } : null;
}

function filterHiddenShows(list, isArchive) {
  const cloudHidden = Array.isArray(AppState.cloudHiddenShowKeys) ? AppState.cloudHiddenShowKeys : [];
  const hidden = [...new Set([...getHiddenLocalShowKeys(), ...cloudHidden])];
  if (!hidden.length) return list;
  const parsed = hidden.map(parseHiddenShowKey).filter(Boolean);
  return (Array.isArray(list) ? list : []).filter(item => {
    const isLocalRecord = String(item && item.cloudId || '').startsWith('local');
    if (!isLocalRecord) return true;
    const exactKey = buildLocalShowKey(item, isArchive);
    if (hidden.includes(exactKey)) return false;
    // 语义兜底：同日期 + 城市/场馆关键字重合也视为已隐藏（兼容日期格式差异）
    const rawDate = isArchive ? item.showDate : item.show_date;
    const dateKey = normalizeShowDateKey(rawDate);
    const label = String((isArchive ? item.title : item.city) || item.venue || '').replace(/[「」《》·\s]/g, '');
    if (!dateKey || !label) return true;
    return !parsed.some(entry => entry.date === dateKey && (
      label.includes(entry.label) || entry.label.includes(label) ||
      (label.slice(0, 2) && entry.label.slice(0, 2) === label.slice(0, 2))
    ));
  });
}

function normalizeShowDateKey(value) {
  const str = String(value || '');
  const m = str.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function mergeShowRecords(localRecords, cloudRecords, isArchive) {
  const keyOf = item => isArchive
    ? `${item.artist || ''}|${item.title || ''}|${item.showDate || ''}`
    : `${item.artist || ''}|${item.city || ''}|${item.show_date || ''}`;

  const dateOf = item => normalizeShowDateKey(isArchive ? item.showDate : item.show_date);
  const geoOf = item => `${item.city || ''}${item.title || ''}${item.venue || ''}`;

  // 同日期 + 城市/场馆关键字重合 → 视为同一场，云端记录为准
  const isSameShow = (a, b) => {
    const da = dateOf(a), db = dateOf(b);
    if (!da || !db || da !== db) return false;
    const ca = String(a.city || a.title || '');
    const cb = String(b.city || b.title || '');
    const cityMatch = Boolean(ca && cb) && (
      ca === cb || ca.includes(cb) || cb.includes(ca) ||
      (ca.length >= 2 && cb.length >= 2 && ca.slice(0, 2) === cb.slice(0, 2))
    );
    const va = String(a.venue || a.title || '');
    const vb = String(b.venue || b.title || '');
    const venueMatch = Boolean(va && vb) && (
      va === vb || va.includes(vb) || vb.includes(va) ||
      (va.length >= 2 && vb.length >= 2 && va.slice(0, 2) === vb.slice(0, 2))
    );
    return cityMatch || venueMatch;
  };

  const merged = new Map();
  (Array.isArray(localRecords) ? localRecords : []).forEach(item => {
    if (item) merged.set(keyOf(item), item);
  });

  (Array.isArray(cloudRecords) ? cloudRecords : []).forEach(cloudItem => {
    if (!cloudItem) return;
    const key = keyOf(cloudItem);
    const localItem = merged.get(key);

    let targetKey = key;
    if (!localItem) {
      // 语义去重：先剔除同日期同场馆的本地旧预置卡片，再写入云端最新记录
      for (const [k, local] of merged.entries()) {
        if (isSameShow(local, cloudItem)) {
          merged.delete(k);
          break;
        }
      }
      merged.set(key, cloudItem);
      return;
    }

    const combined = { ...localItem, ...cloudItem };
    Object.keys(localItem).forEach(field => {
      if ((cloudItem[field] === '' || cloudItem[field] == null) && localItem[field] !== '' && localItem[field] != null) {
        combined[field] = localItem[field];
      }
    });
    merged.set(targetKey, combined);
  });

  // 二次兜底：仍存在同日期 + 同城/同场馆的重复时，优先保留带 cloudId 的云端记录
  const result = [...merged.values()];
  const seen = [];
  result.forEach(item => {
    const dupIdx = seen.findIndex(prev => isSameShow(prev, item));
    if (dupIdx === -1) { seen.push(item); return; }
    const prev = seen[dupIdx];
    const itemIsCloud = item.cloudId != null && !String(item.cloudId).startsWith('local');
    const prevIsCloud = prev.cloudId != null && !String(prev.cloudId).startsWith('local');
    if (itemIsCloud && !prevIsCloud) seen[dupIdx] = item;
  });
  return seen;
}

function renderLoadedTourData() {
  if (typeof renderThemeQuickBar === 'function') renderThemeQuickBar();
  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof updateArchiveYearOptions === 'function') updateArchiveYearOptions();
  if (typeof renderArchiveTimeline === 'function') renderArchiveTimeline();
  if (typeof renderUpcomingMiniTimeline === 'function') renderUpcomingMiniTimeline();
  if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (typeof renderAdminTodoQueue === 'function') renderAdminTodoQueue();
}

async function loadTourData() {
  if (typeof window.updateAuthButtonUI === 'function') {
    window.updateAuthButtonUI();
  }

  // 1) 先无条件加载本地内置完整数据集并立即渲染：无论云端是否可用，首屏绝不出现空状态
  let localTickets = [];
  let localArchives = [];
  try {
    await loadLocalTourData();
    localTickets = Array.isArray(AppState.cloudTickets) ? AppState.cloudTickets.slice() : [];
    localArchives = Array.isArray(AppState.cloudArchives) ? AppState.cloudArchives.slice() : [];
    renderLoadedTourData();
  } catch (localErr) {
    console.warn('Built-in local tour data unavailable', localErr);
  }

  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) {
    renderLoadedTourData();
    return;
  }

  try {
    const list = await fetchTicketRows();
    if (!Array.isArray(list) || !list.length) {
      // 云端无数据：保留本地完整数据集，不进入空状态
      AppState.showLoadError = '';
      renderLoadedTourData();
      return;
    }

    const tickets = [];
    const archives = [];
    const hiddenFromCloud = [];

    for (const row of list) {
      const rawTitle = row.title || '';
      const rawPlat = row.platform || '';

      // 云端隐藏标记行：HIDDEN|艺人|场次标题|日期，跨设备同步隐藏的本地预置场次
      if (rawTitle.startsWith('HIDDEN|')) {
        const key = rawTitle.slice(7);
        if (key) hiddenFromCloud.push(key);
        continue;
      }

      // 单条脏数据不能让整页演出消失：逐行隔离解析异常。
      try {
      if (rawTitle.startsWith('ARCHIVE|')) {
        const parts = rawTitle.split('|');
        let artist = parts[1] || 'ONER';
        const title = parts[2] || '往日场次';

        // 统一修正「极尽声色」巡演艺人标签为 ONER
        if (title.includes('极尽声色')) artist = 'ONER';
        const showDate = parts[3] || (row.ticket_time || '').slice(0, 10) || '';
        let meta = {};
        if (rawPlat.startsWith('ARCHIVE:')) {
          try { meta = JSON.parse(rawPlat.slice(8)); } catch (e) { meta = {}; }
        }
        // 同一天可能有多场（如连开两天），需要保留具体开场时间用于时间线排序。
        const showTimeMatch = String(row.ticket_time || '').match(/[T ](\d{1,2}):(\d{2})/);
        const showTime = showTimeMatch
          ? `${showTimeMatch[1].padStart(2, '0')}:${showTimeMatch[2]}`
          : '';
        const theme = meta.theme == null ? '' : String(meta.theme);
        let seriesKey = theme;
        if (typeof normalizeSeriesKey === 'function') {
          // theme/title 可能是数字或对象等脏数据，解析失败时退回原始专题名，绝不抛出。
          try { seriesKey = normalizeSeriesKey(String(title), theme); } catch (e) { seriesKey = theme; }
        }
        archives.push({
          cloudId: row.id,
          artist,
          title,
          showDate,
          showTime,
          year: showDate.slice(0, 4) || '',
          subType: meta.subType || 'tour',
          venue: meta.venue || '演出现场',
          posterUrl: meta.posterUrl || '',
          transport: meta.transport || '',
          prices: meta.prices || '',
          // 座位图不参与列表渲染，点击「查看座位图」时才作为大图打开/按需查询
          hasSeatMap: Boolean(meta.seatUrl || meta.seatMapUrl || meta.seatMap || meta.seat_map || meta.seat_url),
          seatUrl: meta.seatUrl || meta.seatMapUrl || meta.seatMap || meta.seat_map || meta.seat_url || '',
          slot: meta.slot || '',
          merchBooth: meta.merchBooth || '',
          scheduleImgs: Array.isArray(meta.scheduleImgs) ? meta.scheduleImgs : [],
          viewImgs: Array.isArray(meta.viewImgs) ? meta.viewImgs : [],
          setlist: Array.isArray(meta.setlist) ? meta.setlist : [],
          theme,
          // 所属专题（合集）归并键：时间线卡片据此恢复「专题页」跳转入口。
          seriesKey,
          url: row.url || '#'
        });
      } else {
        const parts = rawTitle.split('|');
        let artist = parts[0] || 'ONER';
        const city = parts[1] || rawTitle || '待定场次';

        // 统一修正「极尽声色」巡演艺人标签为 ONER
        if (city.includes('极尽声色')) artist = 'ONER';
        const venue = parts[2] || '场馆待定';
        const showDate = parts[3] || (row.ticket_time || '').slice(0, 10) || '';
        const slotFromTitle = parts[4] || '';

        let meta = {};
        if (rawPlat.startsWith('META:')) {
          try { meta = JSON.parse(rawPlat.slice(5)); } catch (e) { meta = {}; }
        }

        const rounds = Array.isArray(meta.rounds) ? meta.rounds : [];
        // 注意：不能再用 ticket_time 兜底造一个"开票时间"轮次。
        // 历史数据中 ticket_time 常被写成演出当天时间（如 2026-12-05T19:30），
        // 若当作开票时间会导致"已开完票仍在倒计时"的错觉。
        // 没有 rounds 就如实保持为空，由状态机判定为「已开票·待演出」。

        tickets.push({
          cloudId: row.id,
          artist,
          city,
          venue,
          show_date: showDate,
          rounds,
          posterUrl: meta.posterUrl || '',
          hasSeatMap: Boolean(meta.seatUrl || meta.seatMapUrl || meta.seatMap || meta.seat_map || meta.seat_url),
          seatUrl: meta.seatUrl || meta.seatMapUrl || meta.seatMap || meta.seat_map || meta.seat_url || '',
          prices: meta.prices || '',
          transport: meta.transport || '',
          slot: meta.slot || slotFromTitle || '',
          merchBooth: meta.merchBooth || '',
          scheduleImgs: Array.isArray(meta.scheduleImgs) ? meta.scheduleImgs : [],
          theme: meta.theme == null ? '' : String(meta.theme),
          url: row.url || '#',
          source_url: row.url || '#'
        });
      }
      } catch (rowErr) {
        console.warn('loadTourData: 跳过解析失败的记录', row && row.id, rowErr);
      }
    }

    AppState.cloudHiddenShowKeys = hiddenFromCloud;
    AppState.cloudTickets = filterHiddenShows(mergeShowRecords(localTickets, tickets, false), false);
    AppState.cloudArchives = filterHiddenShows(mergeShowRecords(localArchives, archives, true), true);
    AppState.showLoadError = '';
  } catch (err) {
    try {
      await loadLocalTourData();
    } catch (localErr) {
      console.error('Local tour fallback failed', localErr);
    }
    AppState.showLoadError = (err && err.message) || '网络请求失败';
    console.error('loadTourData failed:', err);
  }

  renderLoadedTourData();
}

// ================= 本地粉籍与自定义标签管理 =================
function getFanPrefState() {
  const defaultPref = {
    biasType: 'group',
    biasMembers: [],
    customTags: [],
    autoFilterShows: false
  };
  try {
    const saved = JSON.parse(localStorage.getItem('onerland_fan_pref_v1') || 'null');
    if (saved && typeof saved === 'object') {
      AppState.fanPref = { ...defaultPref, ...saved };
    } else if (!AppState.fanPref) {
      AppState.fanPref = defaultPref;
    }
  } catch (e) {
    AppState.fanPref = defaultPref;
  }
  return AppState.fanPref;
}

function saveFanPrefState(patch = {}) {
  const cur = getFanPrefState();
  AppState.fanPref = { ...cur, ...patch };
  localStorage.setItem('onerland_fan_pref_v1', JSON.stringify(AppState.fanPref));
  if (typeof syncGlobalFanTheme === 'function') syncGlobalFanTheme();
  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof renderLocalFanPrefBox === 'function') renderLocalFanPrefBox();
}

window.saveFanPrefState = saveFanPrefState;
window.getFanPrefState = getFanPrefState;

function addFanCustomTag(tagText) {
  const clean = (tagText || '').trim();
  if (!clean) return;
  const cur = getFanPrefState();
  const nextTags = [...new Set([...(cur.customTags || []), clean])];
  saveFanPrefState({ customTags: nextTags });
}

function removeFanCustomTag(idx) {
  const cur = getFanPrefState();
  const nextTags = [...(cur.customTags || [])];
  nextTags.splice(idx, 1);
  saveFanPrefState({ customTags: nextTags });
}

// ================= 访客身份：匿名会话优先，缺失时落本地 device_id =================
const DEVICE_ID_KEY = 'onerland_device_id_v1';
const GUEST_NICKNAME_KEY = 'onerland_guest_nickname_v1';

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'device-fallback';
  }
}

function getGuestNickname() {
  try { return localStorage.getItem(GUEST_NICKNAME_KEY) || ''; } catch (e) { return ''; }
}

function saveGuestNickname(name) {
  const clean = String(name || '').trim().slice(0, 16);
  try {
    if (clean) localStorage.setItem(GUEST_NICKNAME_KEY, clean);
    else localStorage.removeItem(GUEST_NICKNAME_KEY);
  } catch (e) { /* 忽略存储失败 */ }
  return clean;
}

// 静默匿名会话：等价 supabase.auth.signInAnonymously()（GoTrue 匿名注册），失败自动降级 device_id
async function ensureGuestIdentity() {
  if (AppState.guestOwnerId) return AppState.guestOwnerId;

  // 已用邮箱登录 → 直接用该账号身份
  const session = typeof getStoredSession === 'function' ? getStoredSession() : null;
  if (session && session.user && (session.user.id || session.user.email)) {
    AppState.guestOwnerId = `user:${session.user.id || session.user.email}`;
    return AppState.guestOwnerId;
  }
  if (AppState.anonymousOwnerId) {
    AppState.guestOwnerId = AppState.anonymousOwnerId;
    return AppState.guestOwnerId;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { anonymous: true }, gotrue_meta_security: {} })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.access_token && data.user && data.user.id) {
        AppState.anonymousOwnerId = `user:${data.user.id}`;
        AppState.guestOwnerId = AppState.anonymousOwnerId;
        AppState.anonymousAccessToken = data.access_token;
        return AppState.guestOwnerId;
      }
    }
  } catch (e) { /* 匿名登录未开启 → 走本地设备标识 */ }

  AppState.guestOwnerId = `device:${getDeviceId()}`;
  return AppState.guestOwnerId;
}

function getGuestOwnerIdSync() {
  return AppState.guestOwnerId || AppState.anonymousOwnerId || `device:${getDeviceId()}`;
}

// ================= 同场搭子：云端公共表 + 本地兜底 =================
// 公共搭子表 public.concert_buddies（所有访客实时可见）
// 字段：event_id / device_id / nickname / fandom_type / member_tags / need_tags / contact_info / status
// 撤销/已找到均以 device_id 为权限边界，避免误删他人记录。
const BUDDY_TABLE = 'concert_buddies';
const BUDDY_STATUS_OPEN = 'open';
const BUDDY_STATUS_FOUND = 'found';
if (!window.buddyCloudCache) window.buddyCloudCache = {};

function buddyHeaders(extra) {
  const headers = Object.assign({
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }, extra || {});
  const token = AppState.anonymousAccessToken || (typeof getStoredSession === 'function' && getStoredSession() ? getStoredSession().access_token : '');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (e) { /* 纯文本 */ }
    return value.split(/[,，/|]/).map(x => x.trim()).filter(Boolean);
  }
  return [];
}

function normalizeBuddyRow(row) {
  const memberTags = toArray(row.member_tags);
  const fandomType = row.fandom_type || '团粉';
  const biasLabel = memberTags.length ? `${fandomType}(${memberTags.join('/')})` : fandomType;
  return {
    id: row.id,
    cloudId: String(row.event_id || ''),
    eventId: String(row.event_id || ''),
    ownerId: row.device_id || '',
    deviceId: row.device_id || '',
    nickname: row.nickname || '',
    biasLabel,
    fandomType,
    memberTags,
    tags: toArray(row.need_tags),
    contact: row.contact_info || '',
    theme: row.theme || '#64748b',
    status: row.status || BUDDY_STATUS_OPEN,
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : ''
  };
}

// 读取同一场次的全部「寻找中」记录（按 event_id 倒序，服务端限制 50 条）
async function fetchBuddyIntents(eventId) {
  try {
    // 公共列表严格脱敏：绝不查询 contact_info
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}?event_id=eq.${encodeURIComponent(eventId)}`
      + `&status=eq.${BUDDY_STATUS_OPEN}`
      + `&select=id,event_id,device_id,nickname,fandom_type,member_tags,need_tags,status,created_at`
      + `&order=event_id.desc,id.desc&limit=50`;
    const res = await fetch(url, { headers: buddyHeaders(), cache: 'no-store' });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    const list = rows.map(normalizeBuddyRow);
    window.buddyCloudCache[eventId] = list;
    return list;
  } catch (e) {
    return null;
  }
}

async function publishBuddyIntent(eventId, entry) {
  const deviceId = getDeviceId();
  const payload = {
    event_id: String(eventId),
    device_id: deviceId,
    nickname: (entry.nickname || getGuestNickname() || '').slice(0, 16) || null,
    fandom_type: entry.fandomType || entry.biasLabel || '团粉',
    member_tags: toArray(entry.memberTags || []),
    need_tags: toArray(entry.tags || []),
    contact_info: (entry.contact || '').slice(0, 30) || null,
    status: BUDDY_STATUS_OPEN
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}`, {
      method: 'POST',
      headers: buddyHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    let rows = null;
    try { rows = await res.json(); } catch (e) { rows = null; }
    const row = Array.isArray(rows) ? rows[0] : rows;
    const normalized = row ? normalizeBuddyRow({ ...payload, id: row.id, created_at: row.created_at }) : { ...entry, ownerId: deviceId, deviceId, id: `tmp-${Date.now()}` };
    normalized.theme = entry.theme || '#64748b';
    return { ok: true, entry: normalized };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// 标记已找到：PATCH status，仍以 device_id 为过滤条件
async function markBuddyIntentFound(eventId, entryId, deviceId, nextStatus) {
  if (!entryId || String(entryId).startsWith('tmp-')) return { ok: false, reason: 'local-only' };
  if (String(deviceId || '') !== String(getDeviceId())) return { ok: false, reason: 'forbidden' };
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}?id=eq.${encodeURIComponent(entryId)}`
      + `&device_id=eq.${encodeURIComponent(getDeviceId())}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: buddyHeaders(),
      body: JSON.stringify({ status: nextStatus || BUDDY_STATUS_FOUND })
    });
    return { ok: res.ok, reason: res.ok ? '' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// 撤销：DELETE，必须带 device_id 过滤，防止误删他人记录
async function deleteBuddyIntent(eventId, entryId, deviceId) {
  if (!entryId || String(entryId).startsWith('tmp-')) return { ok: false, reason: 'local-only' };
  if (String(deviceId || '') !== String(getDeviceId())) return { ok: false, reason: 'forbidden' };
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}?id=eq.${encodeURIComponent(entryId)}`
      + `&device_id=eq.${encodeURIComponent(getDeviceId())}`;
    const res = await fetch(url, { method: 'DELETE', headers: buddyHeaders({ 'Prefer': 'return=minimal' }) });
    return { ok: res.ok, reason: res.ok ? '' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// ================= 搭子联系方式安全校验与冷却 =================
const BUDDY_BANNED_WORDS = ['黄牛', '代拍', '加价', '出票', '收票', '内部票', '兼职', '刷单', '转让票', '代抢'];
const BUDDY_COOLDOWN_KEY = 'onerland_buddy_cooldown_v1';
const BUDDY_PLATFORMS = ['小红书号', '微博ID', '微信号'];

// 前端拦截：手机号 / 网址 / 违规词
function validateBuddyContactInfo(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, reason: '请填写账号 ID' };
  if (/1[3-9]\d{9}/.test(text.replace(/[\s-]/g, ''))) {
    return { ok: false, reason: '包含手机号、网址或违规敏感词，请修改后重试' };
  }
  if (/(https?:\/\/|www\.|\.com|\.cn|\.net|\.top|\.xyz)/i.test(text)) {
    return { ok: false, reason: '包含手机号、网址或违规敏感词，请修改后重试' };
  }
  if (BUDDY_BANNED_WORDS.some(w => text.includes(w))) {
    return { ok: false, reason: '包含手机号、网址或违规敏感词，请修改后重试' };
  }
  return { ok: true };
}

// 60 秒同设备冷却
function getBuddyCooldownLeft(actionKey) {
  try {
    const all = JSON.parse(localStorage.getItem(BUDDY_COOLDOWN_KEY) || '{}');
    const last = Number(all[actionKey] || 0);
    const left = 60000 - (Date.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  } catch (e) {
    return 0;
  }
}

function markBuddyCooldown(actionKey) {
  try {
    const all = JSON.parse(localStorage.getItem(BUDDY_COOLDOWN_KEY) || '{}');
    all[actionKey] = Date.now();
    localStorage.setItem(BUDDY_COOLDOWN_KEY, JSON.stringify(all));
  } catch (e) { /* 忽略 */ }
}

// 管理员全站删除（仅在管理员密码解锁后可用）
async function adminDeleteBuddyIntent(buddyId) {
  if (typeof AppState !== 'undefined' && !AppState.isAdminPasswordVerified) {
    return { ok: false, reason: 'forbidden' };
  }
  try {
    const headers = buddyHeaders({ 'Prefer': 'return=minimal' });
    if (AppState.adminToken) headers['X-Admin-Token'] = AppState.adminToken;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}?id=eq.${encodeURIComponent(buddyId)}`, {
      method: 'DELETE',
      headers
    });
    return { ok: res.ok, reason: res.ok ? '' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// ================= 双向同意解锁联系方式（buddy_requests） =================
// create table if not exists public.buddy_requests (
//   id bigserial primary key,
//   buddy_id bigint not null,
//   event_id text not null,
//   requester_device_id text not null,
//   requester_nickname text,
//   note text,
//   contact text,
//   owner_device_id text not null,
//   status text default 'pending',
//   created_at timestamptz default now()
// );
const BUDDY_REQUESTS_TABLE = 'buddy_requests';
if (!window.buddyState) window.buddyState = {}; // buddyId -> { ownerRequests, myRequest, publisherContact, myContact }

function buddyStateFor(buddyId) {
  const key = String(buddyId);
  if (!window.buddyState[key]) {
    window.buddyState[key] = { ownerRequests: [], myRequest: null, publisherContact: '', myContact: '', loaded: false };
  }
  return window.buddyState[key];
}

// 发布者联系方式（仅在自己申请被同意后按需查询单条）
async function fetchBuddyContact(buddyId) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}?id=eq.${encodeURIComponent(buddyId)}&select=contact_info`;
    const res = await fetch(url, { headers: buddyHeaders(), cache: 'no-store' });
    if (!res.ok) return '';
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? (rows[0].contact_info || '') : '';
  } catch (e) {
    return '';
  }
}

function normalizeBuddyRequest(row) {
  return {
    id: row.id,
    buddyId: String(row.buddy_id || ''),
    eventId: String(row.event_id || ''),
    requesterDeviceId: row.requester_device_id || '',
    requesterNickname: row.requester_nickname || '匿名同好',
    note: row.note || '',
    contact: row.contact || '',
    ownerDeviceId: row.owner_device_id || '',
    status: row.status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).toLocaleString() : ''
  };
}

// 申请者：提交互换申请（pending）
async function sendBuddyRequest(buddy, note, contact) {
  const me = getDeviceId();
  if (String(buddy.deviceId || buddy.ownerId || '') === String(me)) return { ok: false, reason: 'self' };
  const payload = {
    buddy_id: buddy.id,
    event_id: buddy.eventId || buddy.cloudId,
    requester_device_id: me,
    requester_nickname: getGuestNickname() || null,
    note: (note || '').slice(0, 60) || null,
    contact: (contact || '').slice(0, 40) || null,
    owner_device_id: String(buddy.deviceId || buddy.ownerId || ''),
    status: 'pending'
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_REQUESTS_TABLE}`, {
      method: 'POST',
      headers: buddyHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    let rows = null;
    try { rows = await res.json(); } catch (e) { rows = null; }
    const req = Array.isArray(rows) && rows[0] ? normalizeBuddyRequest(rows[0]) : normalizeBuddyRequest(payload);
    buddyStateFor(buddy.id).myRequest = req;
    return { ok: true, request: req };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// 发布者：拉取收到的申请（含申请者联系方式字段，但不渲染给未同意状态）
async function fetchBuddyRequests(buddyId, ownerDeviceId) {
  if (String(ownerDeviceId || '') !== String(getDeviceId())) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_REQUESTS_TABLE}?buddy_id=eq.${encodeURIComponent(buddyId)}`
      + `&owner_device_id=eq.${encodeURIComponent(getDeviceId())}&select=*&order=created_at.desc&limit=30`;
    const res = await fetch(url, { headers: buddyHeaders(), cache: 'no-store' });
    if (!res.ok) return [];
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows.map(normalizeBuddyRequest) : [];
    buddyStateFor(buddyId).ownerRequests = list;
    return list;
  } catch (e) {
    return [];
  }
}

// 发布者：同意申请（status → accepted），带 owner_device_id 过滤
async function acceptBuddyRequest(buddyId, requestId) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_REQUESTS_TABLE}?id=eq.${encodeURIComponent(requestId)}`
      + `&buddy_id=eq.${encodeURIComponent(buddyId)}`
      + `&owner_device_id=eq.${encodeURIComponent(getDeviceId())}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: buddyHeaders(),
      body: JSON.stringify({ status: 'accepted' })
    });
    return { ok: res.ok, reason: res.ok ? '' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message || 'network' };
  }
}

// 申请者：查询自己在该搭子上的申请状态
async function fetchMyBuddyRequest(buddyId) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${BUDDY_REQUESTS_TABLE}?buddy_id=eq.${encodeURIComponent(buddyId)}`
      + `&requester_device_id=eq.${encodeURIComponent(getDeviceId())}&select=*&order=created_at.desc&limit=1`;
    const res = await fetch(url, { headers: buddyHeaders(), cache: 'no-store' });
    if (!res.ok) return null;
    const rows = await res.json();
    const req = Array.isArray(rows) && rows[0] ? normalizeBuddyRequest(rows[0]) : null;
    const state = buddyStateFor(buddyId);
    state.myRequest = req;
    if (req && req.status === 'accepted' && !state.publisherContact) {
      state.publisherContact = await fetchBuddyContact(buddyId);
    }
    return req;
  } catch (e) {
    return null;
  }
}

// ================= 同场搭子本地记录读写与删除 =================// ================= 同场搭子本地记录读写与删除 =================
const BUDDY_STORAGE_KEY = 'onerland_local_buddy_intents_v2';

function getBuddyListByShow(cloudId) {
  try {
    const all = JSON.parse(localStorage.getItem(BUDDY_STORAGE_KEY) || '{}');
    return Array.isArray(all[cloudId]) ? all[cloudId] : [];
  } catch (e) {
    return [];
  }
}

function addBuddyEntryForShow(cloudId, entry) {
  const all = JSON.parse(localStorage.getItem(BUDDY_STORAGE_KEY) || '{}');
  const list = Array.isArray(all[cloudId]) ? all[cloudId] : [];
  list.unshift({ id: Date.now(), ownerId: getGuestOwnerIdSync(), ...entry });
  all[cloudId] = list;
  localStorage.setItem(BUDDY_STORAGE_KEY, JSON.stringify(all));
}

function deleteBuddyEntryForShow(cloudId, entryId) {
  const all = JSON.parse(localStorage.getItem(BUDDY_STORAGE_KEY) || '{}');
  const list = Array.isArray(all[cloudId]) ? all[cloudId] : [];
  all[cloudId] = list.filter(x => String(x.id) !== String(entryId));
  localStorage.setItem(BUDDY_STORAGE_KEY, JSON.stringify(all));
}

// ================= 1. 私人观演评语（仅保存在本机浏览器，绝不公开上传） =================
const PRIVATE_NOTE_KEY = 'onerland_private_show_notes_v1';

function getPrivateShowNotes(showKey) {
  try {
    const all = JSON.parse(localStorage.getItem(PRIVATE_NOTE_KEY) || '{}');
    return Array.isArray(all[showKey]) ? all[showKey] : [];
  } catch (e) {
    return [];
  }
}

function addPrivateShowNote(showKey, noteText) {
  const clean = (noteText || '').trim();
  if (!clean) return;
  const all = JSON.parse(localStorage.getItem(PRIVATE_NOTE_KEY) || '{}');
  const list = Array.isArray(all[showKey]) ? all[showKey] : [];
  list.unshift({
    id: Date.now(),
    text: clean,
    createdAt: new Date().toLocaleDateString()
  });
  all[showKey] = list;
  localStorage.setItem(PRIVATE_NOTE_KEY, JSON.stringify(all));
}

function deletePrivateShowNote(showKey, noteId) {
  const all = JSON.parse(localStorage.getItem(PRIVATE_NOTE_KEY) || '{}');
  const list = Array.isArray(all[showKey]) ? all[showKey] : [];
  all[showKey] = list.filter(item => String(item.id) !== String(noteId));
  localStorage.setItem(PRIVATE_NOTE_KEY, JSON.stringify(all));
}

// ================= 0. 演出日期区间解析（单日 / 连开区间） =================
// 兼容：2026-12-12 / 2026-12-26 (周六) / 2026-12-05 ~ 12-06 (连演2天) / 2026/12/05-2026/12/06
function getShowDateRange(raw) {
  const text = String(raw == null ? '' : raw).trim();
  const empty = { startDate: '', endDate: '' };
  if (!text) return empty;
  const pattern = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return empty;

  const toIso = (y, m, d) => {
    const mm = String(Number(m)).padStart(2, '0');
    const dd = String(Number(d)).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const first = matches[0];
  const startDate = toIso(first[1], first[2], first[3]);

  // 区间末场：可能出现「2026-12-05 ~ 12-06」这种省略年份/月份的写法
  let endDate = startDate;
  if (matches.length > 1) {
    const last = matches[matches.length - 1];
    endDate = toIso(last[1], last[2], last[3]);
  } else {
    const tail = text.slice(first.index + first[0].length);
    const tailMatch = tail.match(/^\s*(?:~|～|至|到|—|–|-|－)\s*(\d{1,2})[-/.月](\d{1,2})/);
    if (tailMatch) {
      endDate = toIso(first[1], tailMatch[1], tailMatch[2]);
    }
  }
  if (endDate < startDate) endDate = startDate;
  return { startDate, endDate };
}

function getLocalTodayIso(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 演出尚未结束（含当天与连开期间）→ true：卡片显示「安检体验」
// 末场结束次日起 → false：卡片切换为「场馆体验」
function isShowStillRunning(rawDate, now = new Date()) {
  const { endDate } = getShowDateRange(rawDate);
  const today = getLocalTodayIso(now);
  if (!endDate || !today) return false;
  return today <= endDate;
}

// ================= 0.1 演出期间安检体验（本机存档，免票根核验） =================
const SECURITY_KEY = 'onerland_security_checkin_v1';
const SECURITY_LEVELS = ['宽松放行', '常规安检', '严格翻包', '极严格'];

function getSecurityExperienceMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(SECURITY_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function getSecurityExperience(showKey) {
  const rec = getSecurityExperienceMap()[String(showKey || '')];
  return rec && typeof rec === 'object' ? rec : null;
}

function saveSecurityExperience(showKey, patch = {}) {
  const key = String(showKey || '');
  if (!key) return null;
  const all = getSecurityExperienceMap();
  const prev = all[key] && typeof all[key] === 'object' ? all[key] : {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toLocaleString('zh-CN')
  };
  if (!next.level && !String(next.detail || '').trim()) {
    delete all[key];
    localStorage.setItem(SECURITY_KEY, JSON.stringify(all));
    return null;
  }
  all[key] = next;
  localStorage.setItem(SECURITY_KEY, JSON.stringify(all));

  // 已存在的足迹条目同步安检体验，切到足迹页立即可见（同场次覆盖更新）
  if (typeof findFootprintIndex === 'function' && findFootprintIndex({ showKey: key }) >= 0) {
    upsertFootprintEntry({
      showKey: key,
      securityLevel: next.level || '',
      securityDetail: next.detail || '',
      securityUpdatedAt: next.updatedAt
    });
  }
  return next;
}

window.getShowDateRange = getShowDateRange;
window.getLocalTodayIso = getLocalTodayIso;
window.isShowStillRunning = isShowStillRunning;
window.getSecurityExperience = getSecurityExperience;
window.saveSecurityExperience = saveSecurityExperience;
window.getSecurityExperienceMap = getSecurityExperienceMap;
window.SECURITY_LEVELS = SECURITY_LEVELS;

// ================= 0.2 关联对象应援色主题（时光提醒实时跟随） =================
// 单人 → 该成员官方应援色；多选 → 所选成员官方色的顺滑渐变（绝不混入团红）；含 ONER → 全团红渐变
function getAnniversaryTargetAccent(targets) {
  const list = (Array.isArray(targets) ? targets : [])
    .filter(t => ANNIVERSARY_TARGET_OPTIONS.includes(t));
  if (!list.length || list.includes('ONER')) {
    return { bg: ARTIST_COLORS['ONER'].bg, solid: ARTIST_COLORS['ONER'].hex };
  }
  if (list.length === 1) {
    const hex = getMemberHex(list[0]);
    return { bg: hex, solid: hex };
  }
  const hexes = list.map(m => getMemberHex(m));
  if (hexes.length === 2) return { bg: makeCpGradient(hexes[0], hexes[1]), solid: hexes[0] };
  const stops = hexes.map((hex, i) => {
    const pct = Math.round((i / (hexes.length - 1)) * 100);
    return `${hex} ${pct}%`;
  });
  return { bg: `linear-gradient(135deg, ${stops.join(', ')})`, solid: hexes[0] };
}

window.getAnniversaryTargetAccent = getAnniversaryTargetAccent;

// ================= 0.3 安检体验云端全员共享投票 =================
// 建表 SQL（若云端尚无该表，前端会自动降级为仅本机模式）：
// create table if not exists public.security_votes (
//   id bigserial primary key,
//   show_key text not null,
//   venue text default '',
//   level text not null,
//   tags jsonb default '[]'::jsonb,
//   created_at timestamptz default now()
// );
// alter table public.security_votes enable row level security;
// create policy "security_votes read" on public.security_votes for select using (true);
// create policy "security_votes insert" on public.security_votes for insert with check (true);
// create policy "security_votes update" on public.security_votes for update using (true) with check (true);
// create index if not exists security_votes_show_key_idx on public.security_votes (show_key);
const SECURITY_VOTE_TABLE = 'security_votes';
const SECURITY_VOTE_LOCAL_KEY = 'onerland_security_vote_mine_v1';
const SECURITY_VOTE_TAGS = [
  '禁带灯牌/发光物', '禁带专业相机', '禁带水杯/饮料', '充电宝需合规标识',
  '场外有存包处', '开包翻查极细', '刷证人脸秒过', '排队超过30分钟'
];
const securityVoteCache = new Map();

function getMySecurityVotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(SECURITY_VOTE_LOCAL_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function getMySecurityVote(showKey) {
  const rec = getMySecurityVotes()[String(showKey || '')];
  return rec && typeof rec === 'object' ? rec : null;
}

function setMySecurityVote(showKey, payload) {
  const all = getMySecurityVotes();
  all[String(showKey || '')] = payload;
  localStorage.setItem(SECURITY_VOTE_LOCAL_KEY, JSON.stringify(all));
}

function aggregateSecurityVotes(rows, myVote) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const levelCount = {};
  SECURITY_LEVELS.forEach(l => { levelCount[l] = 0; });
  const tagCount = {};
  SECURITY_VOTE_TAGS.forEach(t => { tagCount[t] = 0; });
  safeRows.forEach(r => {
    const lv = String(r && r.level || '');
    if (levelCount[lv] != null) levelCount[lv] += 1;
    const tags = Array.isArray(r && r.tags) ? r.tags : [];
    tags.forEach(t => { if (tagCount[t] != null) tagCount[t] += 1; });
  });
  const total = safeRows.length;
  return {
    total,
    levelCount,
    levelPct: SECURITY_LEVELS.reduce((acc, l) => {
      acc[l] = total ? Math.round((levelCount[l] / total) * 100) : 0;
      return acc;
    }, {}),
    tagCount,
    myVote: myVote || null,
    degraded: false
  };
}

async function fetchSecurityVoteStats(showKey) {
  const key = String(showKey || '');
  if (!key) return { total: 0, degraded: false, levelCount: {}, levelPct: {}, tagCount: {}, myVote: null };
  const myVote = getMySecurityVote(key);
  if (securityVoteCache.has(key)) return { ...securityVoteCache.get(key), myVote };
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) {
    const empty = aggregateSecurityVotes([], myVote);
    empty.degraded = true;
    return empty;
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}?show_key=eq.${encodeURIComponent(key)}&select=level,tags`;
    const res = await fetch(url, { headers: SB_HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const stats = aggregateSecurityVotes(rows, myVote);
    securityVoteCache.set(key, stats);
    return stats;
  } catch (e) {
    const stats = aggregateSecurityVotes([], myVote);
    stats.degraded = true;
    return stats;
  }
}

async function submitSecurityVote(showKey, venue, level, tags) {
  const key = String(showKey || '');
  if (!key || !level) return { ok: false, error: '缺少场次或等级' };
  const cleanTags = (Array.isArray(tags) ? tags : []).filter(t => SECURITY_VOTE_TAGS.includes(t));
  const mine = getMySecurityVote(key);
  const payload = { show_key: key, venue: String(venue || ''), level, tags: cleanTags };
  try {
    let res;
    if (mine && mine.rowId) {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}?id=eq.${encodeURIComponent(mine.rowId)}`, {
        method: 'PATCH',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify([payload])
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json().catch(() => []);
    const rowId = Array.isArray(rows) && rows[0] ? rows[0].id : (mine && mine.rowId);
    setMySecurityVote(key, { level, tags: cleanTags, rowId, at: new Date().toLocaleString('zh-CN') });
    securityVoteCache.delete(key);
    return { ok: true };
  } catch (e) {
    // 云端表缺失或网络异常：保留本机投票，不阻断页面
    setMySecurityVote(key, { level, tags: cleanTags, rowId: mine && mine.rowId, at: new Date().toLocaleString('zh-CN') });
    return { ok: false, error: String(e && e.message || e) };
  }
}

window.SECURITY_VOTE_TAGS = SECURITY_VOTE_TAGS;
window.getMySecurityVote = getMySecurityVote;
window.fetchSecurityVoteStats = fetchSecurityVoteStats;
window.submitSecurityVote = submitSecurityVote;
window.aggregateSecurityVotes = aggregateSecurityVotes;

// ================= 足迹归档（演出 + 场馆体验共用，同场次覆盖更新） =================
function buildShowKey(venueName, showTitle) {
  return `${normalizeVenueKey(venueName) || '未命名场馆'}::${String(showTitle || '').trim()}`;
}

function findFootprintIndex({ showKey, title, date, venue } = {}) {
  const list = Array.isArray(AppState.footprints) ? AppState.footprints : [];
  const safeKey = String(showKey || '');
  const safeDate = String(date || '').slice(0, 10);
  const safeTitle = String(title || '').trim();
  const safeVenue = normalizeVenueKey(venue || '');

  if (safeKey) {
    const byKey = list.findIndex(f => String(f.showKey || '') === safeKey);
    if (byKey >= 0) return byKey;
  }
  if (safeDate) {
    const byTitleDate = list.findIndex(f =>
      String(f.date || '').slice(0, 10) === safeDate && String(f.title || '').trim() === safeTitle);
    if (byTitleDate >= 0) return byTitleDate;
    if (safeVenue) {
      const byVenueDate = list.findIndex(f =>
        String(f.date || '').slice(0, 10) === safeDate && normalizeVenueKey(f.venue || '') === safeVenue);
      if (byVenueDate >= 0) return byVenueDate;
    }
  }
  return -1;
}

// 同场次重复保存只覆盖更新，绝不产生重复足迹条目
function upsertFootprintEntry(payload = {}) {
  const list = Array.isArray(AppState.footprints) ? [...AppState.footprints] : [];
  const idx = findFootprintIndex(payload);
  const cityMatch = `${payload.title || ''} ${payload.venue || ''} ${payload.city || ''}`
    .match(/(北京|上海|广州|深圳|杭州|南京|合肥|西安|成都|重庆|武汉|长沙|苏州|天津|郑州|青岛|厦门|沈阳)/);
  const base = idx >= 0 ? list[idx] : {
    id: Date.now(),
    createdAt: new Date().toLocaleDateString()
  };
  const next = {
    ...base,
    showKey: payload.showKey || base.showKey || '',
    title: payload.title || base.title || '未命名场次',
    date: (payload.date || base.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    venue: payload.venue || base.venue || '',
    city: payload.city || base.city || (cityMatch ? cityMatch[1] : '北京'),
    artist: payload.artist || base.artist || 'ONER',
    updatedAt: new Date().toLocaleString('zh-CN')
  };
  ['seatArea', 'venueScores', 'experienceNote', 'ratedAt', 'noteUpdatedAt', 'securityLevel', 'securityDetail', 'securityUpdatedAt'].forEach(key => {
    if (payload[key] !== undefined) next[key] = payload[key];
  });
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  AppState.footprints = list;
  localStorage.setItem(LOCAL_KEYS.FOOTPRINTS, JSON.stringify(AppState.footprints));
  return next;
}

window.buildShowKey = buildShowKey;
window.findFootprintIndex = findFootprintIndex;
window.upsertFootprintEntry = upsertFootprintEntry;

// ================= 2. 脱敏票根核验状态（上传 → 等待审核通过 → 才解锁评分） =================
const VERIFIED_TICKETS_KEY = 'onerland_verified_ticket_shows_v1';

function getVerifiedTicketMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(VERIFIED_TICKETS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

// 只有云端复核通过才算解锁，未上传图片没有任何本地绕过通道
function isShowTicketVerified(showKey) {
  const record = getVerifiedTicketMap()[showKey];
  return Boolean(record && record.cloudStatus === 'approved');
}

function isShowProofPending(showKey) {
  const status = getVerifiedTicketMap()[showKey]?.cloudStatus;
  return status === 'pending' || status === 'uploading';
}

// 提交脱敏票根：只记录「等待审核」状态，不再本地直接解锁
function markTicketProofSubmitted(showKey, extra = {}) {
  const map = getVerifiedTicketMap();
  map[showKey] = {
    verified: false,
    cloudStatus: 'pending',
    submittedAt: new Date().toLocaleString('zh-CN'),
    ...(extra || {})
  };
  localStorage.setItem(VERIFIED_TICKETS_KEY, JSON.stringify(map));
}

// ---- 云端复核状态（与本地核验并存）----
function getProofCloudStatus(showKey) {
  const map = getVerifiedTicketMap();
  return map[showKey]?.cloudStatus || null;
}

function setProofCloudStatus(showKey, status, extra) {
  const map = getVerifiedTicketMap();
  if (!map[showKey]) return;
  map[showKey].cloudStatus = status;
  if (extra) Object.assign(map[showKey], extra);
  localStorage.setItem(VERIFIED_TICKETS_KEY, JSON.stringify(map));
}

// 上传脱敏票根到云端，settle 后返回结果但不阻塞本地解锁
async function uploadTicketProofToCloud({ showKey, artist, city, showDate, seatArea, file }) {
  if (!file) return null;

  // 压缩到合理尺寸，减少流量与存储占用
  const dataUrl = await compressImageToDataURL(file, 1200, 0.72);  const blob = await (await fetch(dataUrl)).blob();
  const ext = (blob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg');
  const path = `${showKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/ticket-proofs/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': blob.type,
      'x-upsert': 'false'
    },
    body: blob
  });
  if (!upRes.ok) {
    throw new Error(`图片上传失败 HTTP ${upRes.status}`);
  }

  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/ticket_proofs`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      show_key: showKey,
      artist: artist || null,
      city: city || null,
      show_date: showDate || null,
      seat_area: seatArea || null,
      image_url: path,
      review_status: 'pending'
    })
  });
  if (!insRes.ok) {
    throw new Error(`核验记录提交失败 HTTP ${insRes.status}`);
  }
  const rows = await insRes.json();
  return { proofId: rows?.[0]?.id || null, imagePath: path };
}

// 查询某场次已通过复核的人数（用于展示可信度）
async function fetchApprovedProofCount(showKey) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ticket_proofs?show_key=eq.${encodeURIComponent(showKey)}&review_status=eq.approved&select=id`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) return 0;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    return 0;
  }
}

// 把自己本机提交过的核验记录与云端状态对齐
// 说明：RLS 只允许 anon 读取 approved 记录，因此这里只能"升级"为 approved，
// 不会误把 pending 覆盖成别的状态。驳回需要管理员侧校验，匿名端拿不到。
async function syncMyProofStatus(showKey) {
  if (!showKey || getProofCloudStatus(showKey) === 'approved') return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ticket_proofs?show_key=eq.${encodeURIComponent(showKey)}&review_status=eq.approved&select=id&limit=1`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length) {
      setProofCloudStatus(showKey, 'approved');
      if (typeof reopenVisibleTourDrawers === 'function') {
        reopenVisibleTourDrawers(['vexp-tour-drawer-', 'vexp-arc-drawer-']);
      }
    }
  } catch (e) {
    /* 静默失败，不影响本地体验 */
  }
}

// ================= 3. 公共场馆客观体验评分（不含评语，仅统计客观选项，样本 >= 5 解锁） =================
const VENUE_EXP_STORAGE_KEY = 'onerland_venue_objective_scores_v3';

function normalizeVenueKey(venueName = '') {
  return (venueName || '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();
}

function getVenueExperienceList(venueName) {
  const key = normalizeVenueKey(venueName);
  if (!key) return [];
  try {
    const all = JSON.parse(localStorage.getItem(VENUE_EXP_STORAGE_KEY) || '{}');
    return Array.isArray(all[key]) ? all[key] : [];
  } catch (e) {
    return [];
  }
}

function addVerifiedVenueObjectiveScore(venueName, showKey, objectiveScores) {
  if (!isShowTicketVerified(showKey)) {
    throw new Error('本场次脱敏票根尚未通过审核，暂不能发布体验评分');
  }
  const key = normalizeVenueKey(venueName);
  if (!key) return null;
  const all = JSON.parse(localStorage.getItem(VENUE_EXP_STORAGE_KEY) || '{}');
  const list = Array.isArray(all[key]) ? all[key] : [];
  // 同一场次重复保存 → 覆盖旧记录，不堆叠重复样本
  const existing = list.find(x => String(x.showKey) === String(showKey));
  const rest = list.filter(x => String(x.showKey) !== String(showKey));
  const record = {
    id: existing?.id || Date.now(),
    venue: key,
    showKey,
    verified: true,
    seatArea: objectiveScores.seatArea || existing?.seatArea || '',
    queueTime: objectiveScores.queueTime,
    bagCheck: objectiveScores.bagCheck,
    storageType: objectiveScores.storageType,
    acLevel: objectiveScores.acLevel,
    seatSpacing: objectiveScores.seatSpacing,
    viewQuality: objectiveScores.viewQuality,
    showExperience: objectiveScores.showExperience,
    experienceNote: objectiveScores.experienceNote || '',
    createdAt: existing?.createdAt || new Date().toLocaleDateString(),
    updatedAt: new Date().toLocaleString('zh-CN')
  };

  all[key] = [record, ...rest];
  localStorage.setItem(VENUE_EXP_STORAGE_KEY, JSON.stringify(all));
  return record;
}

function deleteVenueExperience(venueName, recordId) {
  const key = normalizeVenueKey(venueName);
  if (!key) return;
  const all = JSON.parse(localStorage.getItem(VENUE_EXP_STORAGE_KEY) || '{}');
  const list = Array.isArray(all[key]) ? all[key] : [];
  all[key] = list.filter(x => String(x.id) !== String(recordId));
  localStorage.setItem(VENUE_EXP_STORAGE_KEY, JSON.stringify(all));
}

function buildDistArray(countsMap, total, orderedKeys = null) {
  const keys = orderedKeys
    ? [...orderedKeys, ...Object.keys(countsMap).filter(k => !orderedKeys.includes(k))]
    : Object.keys(countsMap).sort((a, b) => countsMap[b] - countsMap[a]);
  return keys
    .filter(k => (countsMap[k] || 0) > 0 || orderedKeys)
    .map(label => {
      const count = countsMap[label] || 0;
      return { label, count, pct: total ? Math.round((count / total) * 100) : 0 };
    });
}

function computeVenueExperienceStats(venueName) {
  const list = getVenueExperienceList(venueName);
  const total = list.length;
  if (total < 5) {
    return { unlocked: false, total, remaining: 5 - total, list };
  }

  const queueBuckets = { '10分钟内': 0, '10-30分钟': 0, '30-60分钟': 0, '60分钟以上': 0 };
  let bagCheckCount = 0;
  const storageCounts = {};
  const acCounts = {};
  const spacingCounts = {};
  const viewCounts = {};
  const showExpCounts = {};

  list.forEach(item => {
    if (queueBuckets[item.queueTime] !== undefined) queueBuckets[item.queueTime]++;
    if (item.bagCheck === 'strict') bagCheckCount++;
    storageCounts[item.storageType] = (storageCounts[item.storageType] || 0) + 1;
    acCounts[item.acLevel] = (acCounts[item.acLevel] || 0) + 1;
    spacingCounts[item.seatSpacing] = (spacingCounts[item.seatSpacing] || 0) + 1;
    viewCounts[item.viewQuality] = (viewCounts[item.viewQuality] || 0) + 1;
    showExpCounts[item.showExperience] = (showExpCounts[item.showExperience] || 0) + 1;
  });

  return {
    unlocked: true,
    total,
    bagCheckPct: Math.round((bagCheckCount / total) * 100),
    bagCheckCount,
    queueDist: buildDistArray(queueBuckets, total, ['10分钟内', '10-30分钟', '30-60分钟', '60分钟以上']),
    storageDist: buildDistArray(storageCounts, total),
    acDist: buildDistArray(acCounts, total),
    spacingDist: buildDistArray(spacingCounts, total),
    viewDist: buildDistArray(viewCounts, total),
    showExpDist: buildDistArray(showExpCounts, total),
    list
  };
}

// 首屏就把粉籍应援色写入全局 CSS 变量，避免导航/徽章先闪默认红
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncGlobalFanTheme);
  } else {
    syncGlobalFanTheme();
  }
}
