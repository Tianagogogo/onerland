// ================= 全局轻量反馈：Toast + 表单回车提交 =================
let __globalToastTimer = null;

function ensureToastHost() {
  let host = document.getElementById('global-toast-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'global-toast-host';
  host.className = 'global-toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

// type: success | error | info
function showToast(message, type = 'success', duration = 2400) {
  const text = String(message == null ? '' : message).replace(/\s*\n+\s*/g, ' · ').trim();
  if (!text) return;
  const host = ensureToastHost();
  host.innerHTML = '';
  const icon = type === 'error' ? '⚠️' : type === 'info' ? 'ℹ️' : '✅';
  const el = document.createElement('div');
  el.className = `global-toast global-toast--${type}`;
  el.textContent = `${icon} ${text}`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(__globalToastTimer);
  __globalToastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }, duration);
}

function toastError(message, duration = 3200) { return showToast(message, 'error', duration); }
function toastInfo(message) { return showToast(message, 'info'); }

// 成功即收尾：关闭指定弹窗 + 轻量提示（不打断用户已填内容之外的任何操作）
function closeModalWithToast(modalId, message) {
  const modal = modalId ? document.getElementById(modalId) : null;
  if (modal) modal.classList.add('hidden');
  if (message) showToast(message, 'success');
}

// 所有单行输入框回车 = 点击当前弹窗内的主提交按钮（data-enter-submit）
function bindGlobalEnterSubmit() {
  if (window.__globalEnterSubmitBound) return;
  window.__globalEnterSubmitBound = true;
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const el = event.target;
    if (!el || el.tagName !== 'INPUT') return;
    const type = String(el.type || 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'file', 'checkbox', 'radio', 'range', 'color', 'image'].includes(type)) return;
    if (el.disabled || el.readOnly) return;
    const scope = el.closest('[data-enter-scope], [id$="-modal"], form');
    if (!scope) return;
    const btn = scope.querySelector('[data-enter-submit]');
    if (!btn || btn.disabled) return;
    event.preventDefault();
    btn.click();
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindGlobalEnterSubmit);
} else {
  bindGlobalEnterSubmit();
}

// ================= 🎫 计划前往（未来场次标记，不计入已观演总数） =================
const PLANNED_SHOWS_KEY = 'onerland_planned_shows';

function getPlannedShowIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANNED_SHOWS_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(v => String(v)) : [];
  } catch (e) {
    return [];
  }
}

function isShowPlanned(id) {
  if (id == null || id === '') return false;
  return getPlannedShowIds().includes(String(id));
}

// 返回切换后的状态：true = 已加入计划，false = 已取消
function togglePlannedShow(id) {
  if (id == null || id === '') return false;
  const key = String(id);
  const list = getPlannedShowIds();
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  try {
    localStorage.setItem(PLANNED_SHOWS_KEY, JSON.stringify(list));
  } catch (e) { /* 隐私模式下忽略写入失败 */ }
  return list.includes(key);
}

function clearPlannedShows() {
  try { localStorage.removeItem(PLANNED_SHOWS_KEY); } catch (e) { /* ignore */ }
}

// 今天（本地时区的 YYYY-MM-DD）
function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 演出日期 >= 今天 → 未来未开演场次（含今天）
function isShowUpcomingOrToday(dateStr) {
  const ymd = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return ymd >= todayYmd();
}

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
  const prevTarget = (AppState.anniversary && Array.isArray(AppState.anniversary.targets))
    ? (AppState.anniversary.targets[0] || '')
    : '';
  AppState.anniversary = { ...AppState.anniversary, ...patch };
  localStorage.setItem(LOCAL_KEYS.ANNIVERSARY, JSON.stringify(AppState.anniversary));
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderAnniversaryManager === 'function' &&
      !document.getElementById('anniversary-manager-modal')?.classList.contains('hidden')) {
    renderAnniversaryManager();
  }
  // 🔗 首页人物变更 → 与足迹页粉籍/应援色联动（静默同步或弹统一提醒）
  const changedTarget = Object.prototype.hasOwnProperty.call(patch, 'targets')
    || Object.prototype.hasOwnProperty.call(patch, 'fanIdentity');
  if (changedTarget && typeof onHomeFandomTargetChanged === 'function') {
    try { onHomeFandomTargetChanged(prevTarget); } catch (e) { console.warn('粉籍联动失败:', e); }
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

// ================= 站内统一粉籍身份（与找搭子/身份标签共用同一套命名与应援色） =================
function getFanIdentityOptions() {
  return [
    { id: 'group', label: '团粉', target: 'ONER', members: [], accent: ARTIST_COLORS['ONER'].bg, solid: ARTIST_COLORS['ONER'].hex },
    { id: 'solo:岳岳', label: '唯粉(岳岳)', target: '岳岳', members: ['岳岳'], accent: getMemberHex('岳岳'), solid: getMemberHex('岳岳') },
    { id: 'solo:木子洋', label: '唯粉(木子洋)', target: '木子洋', members: ['木子洋'], accent: getMemberHex('木子洋'), solid: getMemberHex('木子洋') },
    { id: 'solo:灵超', label: '唯粉(灵超)', target: '灵超', members: ['灵超'], accent: getMemberHex('灵超'), solid: getMemberHex('灵超') },
    { id: 'cp:岳岳+木子洋', label: '双人(岳岳·木子洋)', target: '岳岳 & 木子洋', members: ['岳岳', '木子洋'], accent: buildCpGradient('岳岳', '木子洋'), solid: getMemberHex('岳岳') },
    { id: 'cp:岳岳+灵超', label: '双人(岳岳·灵超)', target: '岳岳 & 灵超', members: ['岳岳', '灵超'], accent: buildCpGradient('岳岳', '灵超'), solid: getMemberHex('岳岳') },
    { id: 'cp:木子洋+灵超', label: '双人(木子洋·灵超)', target: '木子洋 & 灵超', members: ['木子洋', '灵超'], accent: buildCpGradient('木子洋', '灵超'), solid: getMemberHex('木子洋') }
  ];
}

function getFanIdentityOption(id) {
  return getFanIdentityOptions().find(opt => opt.id === id) || null;
}

// 纪念日卡片配色：优先按所选粉籍身份取色，找不到再回退对象色
function getFanIdentityAccent(identityId, fallbackTargets) {
  const opt = getFanIdentityOption(identityId);
  if (opt) return { bg: opt.accent, solid: opt.solid };
  const targets = Array.isArray(fallbackTargets) && fallbackTargets.length ? fallbackTargets : ['ONER'];
  if (typeof getAnniversaryTargetAccent === 'function') return getAnniversaryTargetAccent(targets);
  return { bg: ARTIST_COLORS['ONER'].bg, solid: ARTIST_COLORS['ONER'].hex };
}

window.getFanIdentityOptions = getFanIdentityOptions;
window.getFanIdentityOption = getFanIdentityOption;
window.getFanIdentityAccent = getFanIdentityAccent;

window.getAnniversaryAccentColor = getAnniversaryAccentColor;
window.getAnniversaryTargetColor = getAnniversaryTargetColor;

// ================= 官方内置纪念日：本机删除 / 一键恢复 =================
const DELETED_BUILTIN_ANNIV_KEY = 'onerland_deleted_builtin_anniversaries';

function getDeletedBuiltinAnniversaryKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(DELETED_BUILTIN_ANNIV_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(v => String(v)) : [];
  } catch (e) {
    return [];
  }
}

function isBuiltinAnniversaryDeleted(builtinKey) {
  return getDeletedBuiltinAnniversaryKeys().includes(String(builtinKey));
}

function refreshAnniversarySurfaces() {
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderAnniversaryManager === 'function' &&
      !document.getElementById('anniversary-manager-modal')?.classList.contains('hidden')) {
    renderAnniversaryManager();
  }
}

// 删除单条官方内置纪念日（仅本机隐藏，不动物理默认数据）
function deleteBuiltinAnniversary(builtinKey) {
  const key = String(builtinKey || '');
  if (!key) return { ok: false, message: '缺少纪念日标识' };
  const exists = BUILTIN_ANNIVERSARIES.some(item => String(item.key) === key);
  if (!exists) return { ok: false, message: '该纪念日不是官方内置' };
  const list = getDeletedBuiltinAnniversaryKeys();
  if (!list.includes(key)) list.push(key);
  try { localStorage.setItem(DELETED_BUILTIN_ANNIV_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  refreshAnniversarySurfaces();
  return { ok: true };
}

// 恢复全部官方内置纪念日
function restoreAllBuiltinAnniversaries() {
  try { localStorage.removeItem(DELETED_BUILTIN_ANNIV_KEY); } catch (e) { /* ignore */ }
  refreshAnniversarySurfaces();
  return { ok: true };
}

function getMergedAnniversaryList(now = new Date()) {
  const state = AppState.anniversary;
  const overrides = state.builtinOverrides || {};
  const deletedBuiltins = getDeletedBuiltinAnniversaryKeys();
  const list = [];

  BUILTIN_ANNIVERSARIES.forEach(item => {
    const ov = overrides[item.key] || {};
    if (ov.hidden) return;
    if (deletedBuiltins.includes(String(item.key))) return;
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
window.getDeletedBuiltinAnniversaryKeys = getDeletedBuiltinAnniversaryKeys;
window.isBuiltinAnniversaryDeleted = isBuiltinAnniversaryDeleted;
window.deleteBuiltinAnniversary = deleteBuiltinAnniversary;
window.restoreAllBuiltinAnniversaries = restoreAllBuiltinAnniversaries;
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
        // 统一按「最大边长」限制（长图/竖图不再只卡宽度）
        const longEdge = Math.max(img.width, img.height);
        const ratio = longEdge > maxWidth ? maxWidth / longEdge : 1;
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

// 音乐节时间表长图专用：按「最大边长」限制而非最大宽度，保留密集小字。
// 原图 < 1.2MB 时只转 WebP（原分辨率、q=0.92）；否则最长边压到 2560px。
function compressTimetableImage(file, maxEdge = 2560, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const originalDataUrl = ev.target.result;
      const img = new Image();
      img.onload = () => {
        const longEdge = Math.max(img.width, img.height);
        const needResize = longEdge > maxEdge;
        const ratio = needResize ? maxEdge / longEdge : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let out = '';
        try { out = canvas.toDataURL('image/webp', quality); } catch (e) { out = ''; }
        if (!out || !out.startsWith('data:image/webp')) {
          try { out = canvas.toDataURL('image/jpeg', quality); } catch (e) { out = ''; }
        }
        // 小图直接转格式时，若输出反而更大则保留原图，避免二次损失
        if (out && !needResize && out.length > originalDataUrl.length) out = originalDataUrl;
        resolve(out || originalDataUrl);
      };
      img.onerror = () => resolve(originalDataUrl);
      img.src = originalDataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ================= 海报地址解析：本地静态资源优先 → 外链 → 专属渐变封面 =================
function localPosterFor(item) {
  const map = (typeof window !== 'undefined' && window.POSTER_LOCAL_MAP) || {};
  if (!item) return '';
  const keys = [item.cloudId, item.id, item.localKey];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === undefined || k === null || k === '') continue;
    const hit = map[String(k)];
    if (hit) return hit;
  }
  return '';
}

// 列表页只加载 320px 轻量缩略图；高清原图留给灯箱按需加载
function posterThumbFor(src) {
  const s = String(src || '');
  if (!/^assets\/posters\/[^/]+\.(jpe?g|png|webp)$/i.test(s)) return '';
  return s.replace(/^assets\/posters\//, 'assets/posters/thumb/');
}

function posterHdSrcFor(item, rawUrl) {
  const local = localPosterFor(item);
  if (local) return local;
  return String(rawUrl || (item && (item.posterUrl || item.poster_url || item.poster || item.cover || item.image)) || '');
}

function posterSrcFor(item, rawUrl) {
  const hd = posterHdSrcFor(item, rawUrl);
  const thumb = posterThumbFor(hd);
  return thumb || hd;
}

function escapeAttrValue(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function posterAttrsFor(item, rawUrl, index) {
  const hd = posterHdSrcFor(item, rawUrl);
  const src = posterSrcFor(item, rawUrl);
  // 列表图秒开：eager + sync 解码，避免半截加载；高清地址挂在 data-hd-src
  let attrs = 'loading="eager" fetchpriority="high" decoding="sync"';
  if (hd && hd !== src) attrs += ` data-hd-src="${escapeAttrValue(hd)}"`;
  const remote = String(rawUrl || '');
  if (remote && !/^data:/i.test(remote) && hd !== remote) {
    attrs += ` data-remote-src="${escapeAttrValue(remote)}"`;
  }
  return attrs;
}

// 无海报时的专属渐变文字封面（不再出现灰色 ONER 方块）
function posterPlaceholderHtml(label) {
  const text = String(label || 'ONER').replace(/[<>"]/g, '').slice(0, 16) || 'ONER';
  return `<div class="w-full h-full poster-placeholder"><span class="poster-fallback-label">${text}</span></div>`;
}

// ================= 海报加载策略：仅真实裂图时降级，不做超时掐断 =================
function degradePosterImage(img) {
  if (!img) return;
  const src = String(img.getAttribute('src') || '').trim();
  // 空 src / about:blank 不算加载失败，保持原样（避免误显示裂图封面）
  if (!src || src === 'about:blank') return;
  // 已经成功解码的图片：强制显示，绝不被兜底遮挡
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add('is-loaded');
    img.style.display = 'block';
    img.style.opacity = '1';
    return;
  }
  if (img.dataset.degraded === '1') return;
  // 缩略图失效 → 先换本地高清原图，再回落原始外链，最后才降级
  const hd = String(img.dataset.hdSrc || '').trim();
  if (hd && img.dataset.hdTried !== '1') {
    img.dataset.hdTried = '1';
    img.setAttribute('src', hd);
    return;
  }
  const remote = String(img.dataset.remoteSrc || '').trim();
  if (remote && img.dataset.remoteTried !== '1') {
    img.dataset.remoteTried = '1';
    img.setAttribute('src', remote);
    return;
  }
  img.dataset.degraded = '1';
  const box = img.closest ? img.closest('.poster-square-box') : null;
  if (box) {
    box.classList.add('is-poster-fallback');
    // 用演出标题生成冷银白渐变文字封面，绝不出现浏览器裂图图标
    const raw = String(img.getAttribute('alt') || img.getAttribute('title') || '').trim();
    const label = raw.replace(/\s*[·|].*$/, '').replace(/[<>]/g, '').slice(0, 14) || 'ONER';
    if (!box.querySelector('.poster-fallback-label')) {
      const span = document.createElement('span');
      span.className = 'poster-fallback-label';
      span.textContent = label;
      if (raw) span.title = raw;
      box.appendChild(span);
    }
    box.dataset.fallbackLabel = '1';
  }
  img.style.display = 'none';
}

// 仅当浏览器确实加载失败（onerror）时，才切换为本地渐变封面
function handlePosterImageError(img) {
  degradePosterImage(img);
}

// 海报属性：首屏前 6 张一律 eager 并发下载（开屏期间就开始拉），其余懒加载
function posterImgAttrs(src, index) {
  const isDataUrl = /^data:/i.test(String(src || ''));
  const eager = typeof index === 'number' && index < 6;
  const priority = eager
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy"';
  return `${priority} decoding="async"${isDataUrl ? '' : ' referrerpolicy="no-referrer"'}`;
}

// 首屏海报静默预加载：开屏动画播放期间就进入内存缓存，撤掉遮罩即可见
function preloadPosterImages(urls, limit) {
  const max = typeof limit === 'number' ? limit : 6;
  const seen = new Set();
  (Array.isArray(urls) ? urls : []).slice(0, max).forEach(raw => {
    const url = String(raw || '').trim();
    if (!url || seen.has(url) || /^data:/i.test(url)) return;
    seen.add(url);
    try {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = url;
    } catch (e) { /* ignore */ }
  });
}

// 缓存命中兜底：图片早已 complete 时 onload 可能不触发，这里强制点亮，避免长期透明
function ensurePosterImagesVisible(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('.poster-square-box img').forEach(img => {
    if (img.dataset && img.dataset.degraded === '1') return;
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('is-loaded');
      img.style.display = 'block';
      img.style.opacity = '1';
    }
  });
}
window.ensurePosterImagesVisible = ensurePosterImagesVisible;
window.preloadPosterImages = preloadPosterImages;

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

// ================= 全局图片灯箱（置顶防遮挡 + 双指缩放 / 拖动） =================
const lightboxState = { scale: 1, x: 0, y: 0, src: '', pinchDist: 0, startX: 0, startY: 0, lastX: 0, lastY: 0 };

function applyLightboxTransform() {
  const img = document.getElementById('lightbox-img');
  if (!img) return;
  img.style.transform = `translate(${lightboxState.x}px, ${lightboxState.y}px) scale(${lightboxState.scale})`;
}

function resetLightboxZoom() {
  const img = document.getElementById('lightbox-img');
  lightboxState.scale = 1;
  lightboxState.x = 0;
  lightboxState.y = 0;
  if (img) { img.classList.remove('is-original'); applyLightboxTransform(); }
}

function openLightboxInNewTab() {
  const src = lightboxState.src;
  if (!src) return;
  if (/^data:/i.test(src)) {
    // data: URL 不能被浏览器直接新标签打开，转成 blob URL
    fetch(src).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }).catch(() => window.open(src, '_blank', 'noopener'));
    return;
  }
  window.open(src, '_blank', 'noopener');
}

function bindLightboxGestures() {
  if (window.__lightboxGesturesBound) return;
  window.__lightboxGesturesBound = true;
  const stage = document.getElementById('lightbox-stage');
  const img = document.getElementById('lightbox-img');
  if (!stage || !img) return;

  const distance = touches => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );

  stage.addEventListener('touchstart', event => {
    if (event.touches.length === 2) {
      lightboxState.pinchDist = distance(event.touches);
      lightboxState.startX = lightboxState.x;
      lightboxState.startY = lightboxState.y;
      return;
    }
    if (event.touches.length === 1) {
      lightboxState.lastX = event.touches[0].clientX;
      lightboxState.lastY = event.touches[0].clientY;
    }
  }, { passive: true });

  stage.addEventListener('touchmove', event => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const dist = distance(event.touches);
      if (lightboxState.pinchDist > 0) {
        const next = Math.min(6, Math.max(1, lightboxState.scale * (dist / lightboxState.pinchDist)));
        lightboxState.scale = next;
        applyLightboxTransform();
      }
      return;
    }
    if (event.touches.length === 1 && lightboxState.scale > 1) {
      event.preventDefault();
      const t = event.touches[0];
      lightboxState.x += t.clientX - lightboxState.lastX;
      lightboxState.y += t.clientY - lightboxState.lastY;
      lightboxState.lastX = t.clientX;
      lightboxState.lastY = t.clientY;
      applyLightboxTransform();
    }
  }, { passive: false });

  stage.addEventListener('touchend', event => {
    if (event.touches.length < 2) lightboxState.pinchDist = 0;
    if (event.touches.length === 1) {
      lightboxState.lastX = event.touches[0].clientX;
      lightboxState.lastY = event.touches[0].clientY;
    }
  }, { passive: true });

  // 双击 / 双触点按快速放大到 2 倍
  img.addEventListener('dblclick', event => {
    event.preventDefault();
    lightboxState.scale = lightboxState.scale > 1 ? 1 : 2;
    if (lightboxState.scale === 1) { lightboxState.x = 0; lightboxState.y = 0; }
    applyLightboxTransform();
  });

  // 桌面端滚轮缩放
  stage.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const next = Math.min(6, Math.max(1, lightboxState.scale - event.deltaY * 0.002));
    lightboxState.scale = next;
    if (next === 1) { lightboxState.x = 0; lightboxState.y = 0; }
    applyLightboxTransform();
  }, { passive: false });
}

function openLightbox(src, caption = '') {
  if (!src) return;
  const box = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (!box || !img) return;
  document.body.appendChild(box);
  box.style.zIndex = '9999';
  lightboxState.src = src;
  lightboxState.scale = 1;
  lightboxState.x = 0;
  lightboxState.y = 0;
  img.classList.remove('is-original');
  img.style.transform = 'none';
  img.src = src;
  if (cap) cap.textContent = caption;
  if (!lightboxKeepGallery) lightboxGallery = { list: [], idx: 0, base: '' };
  updateLightboxGalleryNav();
  box.classList.remove('hidden');
  bindLightboxGestures();
}

// ================= 灯箱多图画廊（音乐节时间表多张切换） =================
let lightboxGallery = { list: [], idx: 0, base: '' };
let lightboxKeepGallery = false;

function updateLightboxGalleryNav() {
  const nav = document.getElementById('lightbox-gallery-nav');
  if (!nav) return;
  const multi = lightboxGallery.list.length > 1;
  nav.classList.toggle('hidden', !multi);
  const counter = document.getElementById('lightbox-gallery-counter');
  if (counter) counter.textContent = `${lightboxGallery.idx + 1} / ${lightboxGallery.list.length}`;
  const cap = document.getElementById('lightbox-caption');
  if (cap && lightboxGallery.list.length) {
    cap.textContent = `${lightboxGallery.base}${multi ? ` #${lightboxGallery.idx + 1}` : ''}`;
  }
}

function stepLightboxGallery(step) {
  const total = lightboxGallery.list.length;
  if (total <= 1) return;
  lightboxGallery.idx = (lightboxGallery.idx + step + total) % total;
  const img = document.getElementById('lightbox-img');
  if (img) {
    img.classList.remove('is-original');
    img.style.transform = 'none';
    img.src = lightboxGallery.list[lightboxGallery.idx];
  }
  lightboxState.scale = 1;
  lightboxState.x = 0;
  lightboxState.y = 0;
  applyLightboxTransform();
  updateLightboxGalleryNav();
}

function openLightboxGallery(list, startIdx = 0, captionBase = '') {
  const imgs = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!imgs.length) return;
  lightboxGallery = {
    list: imgs,
    idx: Math.min(Math.max(startIdx, 0), imgs.length - 1),
    base: captionBase
  };
  lightboxKeepGallery = true;
  openLightbox(imgs[lightboxGallery.idx], captionBase);
  lightboxKeepGallery = false;
  updateLightboxGalleryNav();
}

window.openLightboxGallery = openLightboxGallery;
window.stepLightboxGallery = stepLightboxGallery;

window.openLightbox = openLightbox;
window.resetLightboxZoom = resetLightboxZoom;
window.openLightboxInNewTab = openLightboxInNewTab;

// ================= AI Key 状态（暂无对应 UI，先提供空实现避免启动报错） =================
function updateAiKeyStatusUI() {
  const badge = document.getElementById('ai-key-status');
  if (!badge) return;
  const key = localStorage.getItem(GEMINI_KEY_STORAGE);
  badge.textContent = key ? 'AI 已配置' : '未配置';
}
// 演出全量数据（含 base64 海报）响应体较大，网络抖动时可能超时或被截断。
// 失败时自动重试一次，避免偶发失败直接导致整页演出为空。
// 将 Supabase 行解析为站点状态：轻量首屏与完整数据共用同一套解析，避免字段漂移
function buildTourStateFromRows(list) {
    const tickets = [];
    const archives = [];

    for (const row of list) {
      const rawTitle = row.title || '';
      const rawPlat = row.platform || '';

      // 历史隐藏标记行（HIDDEN|...）绝不当成真实演出解析
      if (rawTitle.startsWith('HIDDEN|') || rawTitle.includes('HIDDEN|')) continue;

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
            posterUrl: pickPosterUrl(meta, row),
            transport: pickTransportText(meta, row),
            prices: meta.prices || '',
            hasSeatMap: Boolean(pickSeatMapUrl(meta, row)),
            seatUrl: pickSeatMapUrl(meta, row),
            slot: pickSlotText(meta, row),
            merchBooth: meta.merchBooth || '',
            scheduleImgs: Array.isArray(meta.scheduleImgs) ? meta.scheduleImgs : [],
            viewImgs: Array.isArray(meta.viewImgs) ? meta.viewImgs : [],
            setlist: Array.isArray(meta.setlist) ? meta.setlist : [],
            theme: seriesKey,
            seriesKey,
            url: row.url || '#',
            source_url: row.url || '#'
          });
          continue;
        }

        const parts = rawTitle.split('|');
        if (parts.length < 4) continue;
        let artist = parts[0] || 'ONER';
        const city = parts[1] || '待定场次';
        const venue = parts[2] || '场馆待定';
        const showDateRaw = parts[3] || '';
        const showDate = getShowDateRange(showDateRaw).startDate || showDateRaw || (row.ticket_time || '').slice(0, 10);
        const showDateFull = showDateRaw || showDate;
        const slotFromTitle = parts[4] || '';

        let meta = {};
        const platformText = rawPlat.startsWith('META:') ? rawPlat.slice(5) : rawPlat;
        try { meta = JSON.parse(platformText); } catch (e) { meta = {}; }

        const rounds = Array.isArray(meta.rounds) ? meta.rounds : [];
        if (String(city).includes('极尽声色')) artist = 'ONER';

        tickets.push({
          cloudId: row.id,
          artist,
          city,
          venue,
          show_date: showDateFull,
          rounds,
          posterUrl: pickPosterUrl(meta, row),
          hasSeatMap: Boolean(pickSeatMapUrl(meta, row)),
          seatUrl: pickSeatMapUrl(meta, row),
          prices: meta.prices || '',
          transport: pickTransportText(meta, row),
          slot: pickSlotText(meta, row) || slotFromTitle || '',
          merchBooth: meta.merchBooth || '',
          scheduleImgs: Array.isArray(meta.scheduleImgs) ? meta.scheduleImgs : [],
          theme: meta.theme == null ? '' : String(meta.theme),
          url: row.url || '#',
          source_url: row.url || '#'
        });
      } catch (rowErr) {
        console.warn('loadTourData: 跳过解析失败的记录', row && row.id, rowErr);
      }
    }
  return { tickets, archives };
}

// 轻量抓取：不拉 platform（内含 base64 海报，响应体可达数 MB）
const LITE_ROWS_CACHE_KEY = 'onerland_lite_rows_v1';
async function fetchTicketRowsLite() {
  const url = `${SUPABASE_URL}/rest/v1/tickets?select=id,title,ticket_time,url&order=id.desc`;
  const res = await fetch(url, { headers: SB_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

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
// 本地默认场次已彻底移除：所有演出数据 100% 来自 Supabase 云端表
async function loadLocalTourData() {
  AppState.cloudTickets = [];
  AppState.cloudArchives = [];
  AppState.showLoadError = '';
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

  // 覆盖式去重：同城市已有「带海报 / 连场区间」的完整条目时，过滤掉被其日期覆盖的孤立简写条目
  const rawDateOf = item => String((isArchive ? item.showDate : item.show_date) || '');
  const areaOf = item => String(item.city || item.title || item.venue || '')
    .replace(/[「」《》〈〉·・\s]/g, '')
    .slice(0, 2);
  const spanOf = item => {
    const { startDate, endDate } = getShowDateRange(rawDateOf(item));
    return { startDate, endDate };
  };
  const weightOf = item => {
    const span = spanOf(item);
    let weight = 0;
    if (item.posterUrl) weight += 100;
    if (span.startDate && span.endDate && span.endDate > span.startDate) weight += 50;
    if (Array.isArray(item.rounds) && item.rounds.length > 1) weight += 20;
    if (String(item.city || '').includes('「')) weight += 10;
    return weight;
  };

  const ordered = [...seen].sort((a, b) => weightOf(b) - weightOf(a));
  const kept = [];
  ordered.forEach(item => {
    const area = areaOf(item);
    const { startDate, endDate } = spanOf(item);
    if (!area || !startDate) { kept.push(item); return; }
    const covered = kept.some(full => {
      if (areaOf(full) !== area) return false;
      const fullSpan = spanOf(full);
      if (!fullSpan.startDate) return false;
      if (weightOf(full) <= weightOf(item)) return false;
      return startDate >= fullSpan.startDate && startDate <= fullSpan.endDate;
    });
    if (!covered) kept.push(item);
  });
  return kept;
}

// ================= 隐藏标记行过滤（历史 HIDDEN| 墓碑数据不再当真实演出） =================
// 海报/座位图字段兼容：数据库列、META、多种历史命名都兼容
function pickPosterUrl(meta, row) {
  const m = meta || {};
  const r = row || {};
  return m.posterUrl || m.poster_url || m.poster || m.cover || m.cover_url || m.image
    || r.posterUrl || r.poster_url || r.poster || r.cover || r.cover_url || r.image || '';
}

function pickSeatMapUrl(meta, row) {
  const m = meta || {};
  const r = row || {};
  return m.seatUrl || m.seat_url || m.seatMapUrl || m.seatMap || m.seat_map
    || r.seatUrl || r.seat_url || r.seatMapUrl || r.seatMap || r.seat_map || '';
}

function pickSlotText(meta, row) {
  const m = meta || {};
  const r = row || {};
  return m.slot || m.time_slot || m.schedule_time || m.stage_time || m.performance_time
    || r.slot || r.time_slot || r.schedule_time || r.stage_time || r.performance_time
    || '';
}

function pickTransportText(meta, row) {
  const m = meta || {};
  const r = row || {};
  return m.transport || m.transport_guide || r.transport || r.transport_guide || '';
}

function isHiddenMarkerItem(item) {
  if (!item) return true;
  const artist = String(item.artist || '').trim().toUpperCase();
  if (artist === 'HIDDEN') return true;
  const title = String(item.title || '');
  const city = String(item.city || '');
  const venue = String(item.venue || '');
  return title.startsWith('HIDDEN|') || title.includes('HIDDEN|')
    || city.startsWith('HIDDEN|') || city.includes('HIDDEN|')
    || venue.startsWith('HIDDEN|');
}

function filterVisibleShowRecords(list) {
  return (Array.isArray(list) ? list : []).filter(item => !isHiddenMarkerItem(item));
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

  // 不再合并任何本地预置数据：仅渲染 Supabase 查询到的真实记录
  AppState.cloudTickets = [];
  AppState.cloudArchives = [];
  renderLoadedTourData();

  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) {
    AppState.showLoadError = '暂时加载失败，请稍后点击刷新重试';
    renderLoadedTourData();
    return;
  }

  // ===== 阶段零：先用上次的轻量快照秒出文字（老访客几乎 0 等待） =====
  let liteOk = false;
  try {
    const cached = JSON.parse(localStorage.getItem(LITE_ROWS_CACHE_KEY) || 'null');
    if (Array.isArray(cached) && cached.length) {
      const cachedState = buildTourStateFromRows(cached);
      AppState.cloudTickets = filterVisibleShowRecords(mergeShowRecords([], cachedState.tickets, false));
      AppState.cloudArchives = filterVisibleShowRecords(mergeShowRecords([], cachedState.archives, true));
      liteOk = true;
      renderLoadedTourData();
    }
  } catch (e) { /* 缓存坏了就直接走网络 */ }

  // ===== 阶段一：只取轻量字段（id/title/时间），先把文字与功能渲染出来 =====
  // platform 里塞了大量 base64 海报，整表查询可达 20s+；首屏绝不等它。
  try {
    const liteRows = await fetchTicketRowsLite();
    try { localStorage.setItem(LITE_ROWS_CACHE_KEY, JSON.stringify(liteRows)); } catch (e) { /* 配额满忽略 */ }
    const liteState = buildTourStateFromRows(liteRows);
    AppState.cloudTickets = filterVisibleShowRecords(mergeShowRecords([], liteState.tickets, false));
    AppState.cloudArchives = filterVisibleShowRecords(mergeShowRecords([], liteState.archives, true));
    AppState.showLoadError = '';
    liteOk = true;
    renderLoadedTourData();
  } catch (e) {
    console.warn('loadTourData lite failed:', e);
  }

  // ===== 阶段二：后台补全海报/交通/座位等重字段，到了再就地刷新 =====
  try {
    const list = await fetchTicketRows();
    const fullState = buildTourStateFromRows(list);
    AppState.cloudTickets = filterVisibleShowRecords(mergeShowRecords([], fullState.tickets, false));
    AppState.cloudArchives = filterVisibleShowRecords(mergeShowRecords([], fullState.archives, true));
    AppState.showLoadError = '';
  } catch (err) {
    if (!liteOk) {
      AppState.cloudTickets = [];
      AppState.cloudArchives = [];
      AppState.showLoadError = (err && err.message) || '网络请求失败';
      console.error('loadTourData failed:', err);
    } else {
      console.warn('loadTourData full failed, 保留轻量数据:', err);
    }
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
    note: row.public_note || row.note || '',
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
    public_note: (entry.note || '').slice(0, 60) || null,
    contact_info: (entry.contact || '').slice(0, 30) || null,
    status: BUDDY_STATUS_OPEN
  };
  try {
    let res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}`, {
      method: 'POST',
      headers: buddyHeaders(),
      body: JSON.stringify(payload)
    });
    // 云端还没加 public_note 列时，静默降级：备注只留在本机，绝不因此发不出去
    if (!res.ok && res.status === 400) {
      const fallback = { ...payload };
      delete fallback.public_note;
      res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_TABLE}`, {
        method: 'POST',
        headers: buddyHeaders(),
        body: JSON.stringify(fallback)
      });
    }
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
//   buddy_id uuid not null,
//   buddy_id uuid not null,
//   note text,
//   contact text,
//   sender_device_id text not null,
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

// 云端 buddy_requests 真实列（已通过 REST 探测）：
// id / buddy_id / note / contact / contact_type / sender_device_id / sender_contact / sender_nickname / status / created_at
// 不再假设 event_id、requester_*、owner_device_id 等不存在的列。
function normalizeBuddyRequest(row) {
  return {
    id: row.id,
    buddyId: String(row.buddy_id || ''),
    eventId: '',
    requesterDeviceId: row.sender_device_id || '',
    requesterNickname: row.sender_nickname || '匿名同好',
    note: row.note || '',
    contact: row.sender_contact || row.contact || '',
    ownerDeviceId: '',
    status: row.status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).toLocaleString() : ''
  };
}

// 申请者：提交互换申请（pending）
// 只发送云端真实存在的列，并在遇到 PGRST204 未知列时自动剥离后重试。
const BUDDY_REQUEST_COLUMNS = ['buddy_id', 'note', 'contact', 'contact_type', 'sender_device_id', 'sender_contact', 'sender_nickname', 'status'];

async function postBuddyRequestPayload(payload) {
  let body = { ...payload };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${BUDDY_REQUESTS_TABLE}`, {
      method: 'POST',
      headers: buddyHeaders(),
      body: JSON.stringify(body)
    });
    if (res.ok) {
      let rows = null;
      try { rows = await res.json(); } catch (e) { rows = null; }
      return { ok: true, rows, sent: body };
    }
    let row = null;
    try { row = await res.json(); } catch (e) { row = null; }
    const detail = row && typeof row === 'object'
      ? [row.message, row.details, row.hint, row.code].filter(Boolean).join(' | ')
      : '';
    // PGRST204：schema cache 中找不到某列 → 从 payload 里删掉该列重试
    const missing = detail.match(/Could not find the '([^']+)' column/i);
    if (missing && body[missing[1]] !== undefined) {
      delete body[missing[1]];
      continue;
    }
    return { ok: false, status: res.status, detail, sent: body };
  }
  return { ok: false, status: 400, detail: '保存的内容格式不对，请检查后再试', sent: body };
}

async function sendBuddyRequest(buddy, note, contact, context) {
  const me = getDeviceId();
  const contactText = (contact || '').slice(0, 40);
  const [contactPlatform, contactAccount] = contactText.split(/：|:/).map(x => (x || '').trim());
  if (String(buddy.deviceId || buddy.ownerId || '') === String(me)) return { ok: false, reason: 'self' };
  const rawId = buddy.id == null ? '' : String(buddy.id).trim();
  if (!rawId || /^tmp-/.test(rawId)) {
    return { ok: false, reason: '该搭子信息尚未同步到云端，请刷新后重试' };
  }
  const payload = {
    buddy_id: rawId,
    note: (note || '').slice(0, 60) || null,
    contact: contactAccount || contactText || null,
    contact_type: contactPlatform || null,
    sender_device_id: me,
    sender_contact: contactText || null,
    sender_nickname: (getGuestNickname() || '匿名同好').slice(0, 16),
    status: 'pending'
  };
  BUDDY_REQUEST_COLUMNS.forEach(k => { if (payload[k] === undefined) delete payload[k]; });
  try {
    const res = await postBuddyRequestPayload(payload);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, detail: res.detail, sent: res.sent };
    const row = Array.isArray(res.rows) ? res.rows[0] : res.rows;
    const req = row ? normalizeBuddyRequest(row) : normalizeBuddyRequest(res.sent);
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
      + `&select=id,buddy_id,note,contact,contact_type,sender_device_id,sender_contact,sender_nickname,status,created_at&order=created_at.desc&limit=30`;
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
      + `&buddy_id=eq.${encodeURIComponent(buddyId)}`;
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
      + `&sender_device_id=eq.${encodeURIComponent(getDeviceId())}&select=id,buddy_id,note,contact,contact_type,sender_device_id,sender_contact,sender_nickname,status,created_at&order=created_at.desc&limit=1`;
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

// 健壮解析演出结束日：支持 2026-11-20 / 2026-11-20 ~ 11-21 / 2026/11/20-21 等写法
function getShowEndDay(rawDate) {
  const text = String(rawDate == null ? '' : rawDate).replace(/[／.]/g, '/').replace(/\//g, '-');
  const full = [];
  const reFull = /(\d{4})-(\d{1,2})-(\d{1,2})/g;
  let m;
  while ((m = reFull.exec(text)) !== null) {
    full.push({ y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) });
  }
  if (full.length) {
    const baseYear = full[0].y;
    // 区间尾段省略年份：2026-11-20 ~ 11-21
    const tail = text.replace(reFull, ' ');
    const reShort = /(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)/g;
    while ((m = reShort.exec(tail)) !== null) {
      const mo = Number(m[1]);
      const d = Number(m[2]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) full.push({ y: baseYear, mo, d });
    }
    // 只补日期数字：2026/11/20-21
    const lastFull = full[0];
    const reDayOnly = /(?:^|[^0-9])-(\d{1,2})(?![0-9])/g;
    while ((m = reDayOnly.exec(tail)) !== null) {
      const dOnly = Number(m[1]);
      if (dOnly >= 1 && dOnly <= 31) full.push({ y: baseYear, mo: lastFull.mo, d: dOnly });
    }
  }
  if (!full.length) return null;
  const stamps = full.map(o => {
    const dt = new Date(o.y, o.mo - 1, o.d);
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt.getTime();
  }).filter(v => v != null);
  if (!stamps.length) return null;
  return new Date(Math.max.apply(null, stamps));
}

// 全站唯一的「是否已落幕」判定：结束日早于本地今天零点即已落幕
function isShowEnded(show) {
  if (!show) return false;
  const statusRaw = String(
    show.status || (show.showState && show.showState.status) || ''
  ).toLowerCase();
  if (/(ended|已落幕|已结束|已收官|past|finished)/.test(statusRaw)) return true;
  const endDay = getShowEndDay(
    show.end_date || show.endDate || show.show_date || show.showDate || show.date || ''
  );
  if (!endDay) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return endDay.getTime() < todayStart.getTime();
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
window.isShowEnded = isShowEnded;
window.getShowEndDay = getShowEndDay;
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

// ================= 0.3 安检体验：标签投票（首页 + 档案双端同源） =================
// 数据表 public.show_security_votes(id, show_id, visitor_id, tag, created_at)
// UNIQUE (show_id, visitor_id, tag) —— 并发点击也不会重复计票
const SECURITY_VOTE_TABLE = 'show_security_votes';
const SECURITY_TAGS_LOCAL_KEY = 'onerland_security_tags_mine_v2';
const SECURITY_VOTE_TAGS = ['安检严格', '安检宽松', '查相机/长焦', '翻包细致', '过检很快'];
const SECURITY_TAG_META = [
  { tag: '安检严格', emoji: '🔴' },
  { tag: '安检宽松', emoji: '🟢' },
  { tag: '查相机/长焦', emoji: '📷' },
  { tag: '翻包细致', emoji: '👜' },
  { tag: '过检很快', emoji: '⚡' }
];
const securityVoteCache = new Map();

// 管理员口令只保留在当前会话内存中（不落 localStorage），页面刷新后重新输入即可
let __securityAdminKey = '';
function setSecurityAdminKey(k) { __securityAdminKey = String(k || ''); }
function getSecurityAdminKey() { return __securityAdminKey; }

// 🗑️ 管理员清空：tag 为空 → 删整场；传入具体标签 → 只清零该标签
async function adminClearSecurityVotes(showKey, tag) {
  const key = String(showKey || '');
  if (!key) return { ok: false, error: '缺少场次标识' };
  let adminKey = String(getSecurityAdminKey() || '').trim();
  if (!adminKey) {
    let typed = '';
    try {
      typed = window.prompt('请输入管理员密码以确认清空操作：') || '';
    } catch (e) { typed = ''; }
    adminKey = String(typed).trim();
    if (!adminKey) return { ok: false, error: '未填写管理员口令，已取消清空' };
  }
  try {
    // 参数键名必须与 SQL 函数签名 p_show_id / p_admin_key / p_tag 完全一致；
    // show_id 在函数内部用 ::text 比对，前端统一传字符串，避免类型不匹配导致 400
    const data = await securityRpc('admin_clear_security_votes', {
      p_show_id: String(key),
      p_admin_key: adminKey,
      p_tag: tag ? String(tag) : null
    });
    setSecurityAdminKey(adminKey);
    // 本地已选状态与缓存一起清掉，避免清空后仍显示自己投过的标签
    if (tag) setMySecurityTags(key, getMySecurityTags(key).filter(t => t !== String(tag)));
    else setMySecurityTags(key, []);
    securityVoteCache.delete(key);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : '网络异常' };
  }
}
let securityVenueColumnOk = true;

// ---------- 稳定访客指纹：硬件特征 + Canvas 指纹 + UA 哈希 ----------
let cachedDeviceSignature = '';
function hashStringToHex(input) {
  const raw = String(input || '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + code * (i + 7)) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '16px "PingFang SC", "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 220, 60);
    ctx.fillStyle = '#1e293b';
    ctx.fillText('ONERLAND·安检体验·2026', 4, 6);
    ctx.fillStyle = 'rgba(59,130,246,0.55)';
    ctx.beginPath();
    ctx.arc(170, 40, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.quadraticCurveTo(110, 18, 220, 48);
    ctx.stroke();
    return canvas.toDataURL();
  } catch (e) {
    return '';
  }
}

function getDeviceSignature() {
  if (cachedDeviceSignature) return cachedDeviceSignature;
  const pick = v => (v == null ? '' : String(v));
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = info
        ? `${pick(gl.getParameter(info.UNMASKED_VENDOR_WEBGL))}|${pick(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))}`
        : `${pick(gl.getParameter(gl.VENDOR))}|${pick(gl.getParameter(gl.RENDERER))}`;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { gpu = ''; }

  let tz = '';
  try { tz = new Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }

  const dpr = window.devicePixelRatio || 1;
  const sw = Math.round((screen.width || 0) * dpr);
  const sh = Math.round((screen.height || 0) * dpr);
  // 不含浏览器内核标识：同一部手机在微信/Safari/无痕下一致
  const parts = [
    `r${sw}x${sh}`,
    `d${screen.colorDepth || 0}`,
    `p${pick(navigator.platform)}`,
    `c${pick(navigator.hardwareConcurrency)}`,
    `m${pick(navigator.deviceMemory || '')}`,
    `o${pick(navigator.maxTouchPoints)}`,
    `z${tz}`,
    `g${gpu}`,
    `l${pick(navigator.language || '')}`,
    `cv${hashStringToHex(getCanvasFingerprint())}`
  ];
  cachedDeviceSignature = hashStringToHex(parts.join('|'));
  return cachedDeviceSignature;
}

function getSecurityHwHash() {
  return getDeviceSignature();
}

function getVisitorId() {
  try {
    const cached = localStorage.getItem('onerland_visitor_id_v1');
    if (cached && cached.length >= 8) return cached;
    const id = `v-${getDeviceSignature()}`;
    localStorage.setItem('onerland_visitor_id_v1', id);
    return id;
  } catch (e) {
    return `v-${getDeviceSignature()}`;
  }
}

// ---------- 本机已选标签（多标签页 storage 同步） ----------
function getMySecurityTagsMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(SECURITY_TAGS_LOCAL_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function getMySecurityTags(showId) {
  const list = getMySecurityTagsMap()[String(showId || '')];
  return Array.isArray(list) ? list.filter(t => SECURITY_VOTE_TAGS.includes(t)) : [];
}

function setMySecurityTags(showId, tags) {
  const all = getMySecurityTagsMap();
  const key = String(showId || '');
  const clean = (Array.isArray(tags) ? tags : []).filter(t => SECURITY_VOTE_TAGS.includes(t));
  if (clean.length) all[key] = clean;
  else delete all[key];
  try {
    localStorage.setItem(SECURITY_TAGS_LOCAL_KEY, JSON.stringify(all));
  } catch (e) { /* 忽略隐私模式写入失败 */ }
}

function aggregateSecurityTags(rows, myTags, venueRows) {
  const counts = {};
  const venueCounts = {};
  SECURITY_VOTE_TAGS.forEach(t => { counts[t] = 0; venueCounts[t] = 0; });
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const tag = String(r && r.tag || '');
    if (counts[tag] != null) counts[tag] += 1;
  });
  (Array.isArray(venueRows) ? venueRows : []).forEach(r => {
    const tag = String(r && r.tag || '');
    if (venueCounts[tag] != null) venueCounts[tag] += 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    counts,
    venueCounts,
    venueTotal: Object.values(venueCounts).reduce((a, b) => a + b, 0),
    total,
    myTags: Array.isArray(myTags) ? myTags : getMySecurityTags(''),
    degraded: false
  };
}

// ---------- Supabase RPC：数据库层按 出口IP + 硬件指纹 去重 ----------
async function securityRpc(fnName, params) {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) throw new Error('服务暂时不可用，请稍后再试');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  if (!res.ok) {
    // PostgREST 的错误详情都在响应体里：把 message / details / hint / code 一起抛出来，便于定位 400
    let raw = '';
    try { raw = await res.text(); } catch (e) { raw = ''; }
    let info = null;
    try { info = raw ? JSON.parse(raw) : null; } catch (e) { info = null; }
    const detail = info && (info.message || info.error || info.details);
    const parts = [];
    if (detail) parts.push(String(detail).trim());
    if (info && info.details && String(info.details) !== String(detail)) parts.push(String(info.details).trim());
    if (info && info.hint) parts.push(`hint: ${String(info.hint).trim()}`);
    if (info && info.code) parts.push(`code: ${info.code}`);
    const suffix = parts.length ? `：${parts.join(' | ')}` : (raw ? `：${raw.slice(0, 240)}` : '');
    const err = new Error('服务暂时开小差，请稍后再试');
    err.status = res.status;
    err.detail = info;
    throw err;
  }
  return res.json().catch(() => null);
}

function mapSecurityRpcPayload(data, showId) {
  const payload = data && typeof data === 'object' ? data : {};
  const countsRaw = payload.counts || payload.tags || {};
  const venueRaw = payload.venue_counts || {};
  const counts = {};
  const venueCounts = {};
  SECURITY_VOTE_TAGS.forEach(t => {
    counts[t] = Number(countsRaw[t] || 0);
    venueCounts[t] = Number(venueRaw[t] || 0);
  });
  const total = Number(payload.total || Object.values(counts).reduce((a, b) => a + b, 0));
  const venueTotal = Number(payload.venue_total || Object.values(venueCounts).reduce((a, b) => a + b, 0));
  const myTags = Array.isArray(payload.my_tags) ? payload.my_tags.filter(t => SECURITY_VOTE_TAGS.includes(t)) : [];
  if (myTags.length) setMySecurityTags(showId, myTags);
  return { counts, venueCounts, total, venueTotal, myTags, degraded: false };
}

async function fetchSecurityTagStats(showId, venue) {
  const key = String(showId || '');
  const empty = () => ({ counts: SECURITY_VOTE_TAGS.reduce((a, t) => ({ ...a, [t]: 0 }), {}),
    venueCounts: SECURITY_VOTE_TAGS.reduce((a, t) => ({ ...a, [t]: 0 }), {}),
    venueTotal: 0, total: 0, myTags: getMySecurityTags(key), degraded: true });
  if (!key) return empty();
  if (securityVoteCache.has(key)) {
    const cached = securityVoteCache.get(key);
    return { ...cached, myTags: getMySecurityTags(key) };
  }
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return empty();
  try {
    // 首选 RPC：数据库内部用 md5(出口IP:硬件指纹) 做 voter_key，微信/Safari/无痕共用同一票
    const rpcData = await securityRpc('get_security_votes', {
      p_show_id: key,
      p_hw_hash: getDeviceSignature(),
      p_venue: String(venue || '')
    });
    if (rpcData && typeof rpcData === 'object') {
      const stats = mapSecurityRpcPayload(rpcData, key);
      securityVoteCache.set(key, stats);
      return stats;
    }
    throw new Error('暂时没有拿到数据，请稍后点击刷新重试');
  } catch (rpcErr) {
    // RPC 未部署时回退 REST 直读（旧部署不受影响）
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}?show_id=eq.${encodeURIComponent(key)}&select=tag,visitor_id`;
    const res = await fetch(url, { headers: SB_HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const mine = Array.isArray(rows)
      ? rows.filter(r => String(r.visitor_id || '') === getVisitorId()).map(r => String(r.tag || ''))
      : [];
    if (mine.length) setMySecurityTags(key, mine);
    let venueRows = [];
    if (venue) {
      try {
        const vurl = `${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}?venue=eq.${encodeURIComponent(venue)}&select=tag`;
        const vres = await fetch(vurl, { headers: SB_HEADERS, cache: 'no-store' });
        if (vres.ok) venueRows = await vres.json();
      } catch (e) { venueRows = []; }
    }
    const stats = aggregateSecurityTags(rows, mine.length ? mine : getMySecurityTags(key), venueRows);
    securityVoteCache.set(key, stats);
    return stats;
  } catch (e) {
    return empty();
  }
}

// 兼容旧调用名：level 版页面已升级为标签版
async function fetchSecurityVoteStats(showKey, venue) {
  const stats = await fetchSecurityTagStats(showKey, venue);
  return { ...stats, myVote: stats.myTags.length ? { tags: stats.myTags } : null };
}

async function securityVoteRequest(path, options) {
  return fetch(`${SUPABASE_URL}/rest/v1/${SECURITY_VOTE_TABLE}${path}`, {
    ...options,
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

async function toggleSecurityTag(showId, venue, tag) {
  const key = String(showId || '');
  if (!key || !SECURITY_VOTE_TAGS.includes(tag)) return { ok: false, error: '参数不合法' };
  const mine = getMySecurityTags(key);
  const active = mine.includes(tag);
  const nextTags = active ? mine.filter(t => t !== tag) : [...mine, tag];
  // 先本地乐观更新：同浏览器多标签页即时一致，页面不等待网络
  setMySecurityTags(key, nextTags);
  securityVoteCache.clear();
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return { ok: false, error: '未配置云端' };

  const hwHash = getDeviceSignature();
  try {
    // 数据库内部完成「有则删、无则插」的 toggle，并保证 UNIQUE(show_id, voter_key, tag)
    const rpcData = await securityRpc('submit_security_vote', {
      p_show_id: key,
      p_tag: tag,
      p_hw_hash: hwHash,
      p_venue: String(venue || '')
    });
    if (rpcData && typeof rpcData === 'object') {
      const stats = mapSecurityRpcPayload(rpcData, key);
      securityVoteCache.set(key, stats);
      return { ok: true, tags: stats.myTags };
    }
    return { ok: true, tags: nextTags };
  } catch (e) {
    // RPC 未部署：回退 REST（用 local:visitor_id 充当 voter_key，保持同一唯一键语义）
    const voterKey = `local:${getVisitorId()}`;
    try {
      if (active) {
        const path = `?show_id=eq.${encodeURIComponent(key)}&tag=eq.${encodeURIComponent(tag)}&voter_key=eq.${encodeURIComponent(voterKey)}`;
        const res = await securityVoteRequest(path, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const payload = { show_id: key, tag, voter_key: voterKey, visitor_id: getVisitorId(), hw_hash: hwHash };
        if (venue) payload.venue = String(venue);
        const insert = body => securityVoteRequest('', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([body])
        });
        let res = await insert(payload);
        if (!res.ok && payload.venue) {
          delete payload.venue;
          res = await insert(payload);
        }
        if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      }
      return { ok: true, tags: nextTags };
    } catch (e2) {
      return { ok: false, tags: nextTags, error: String(e2 && e2.message || e2) };
    }
  }
}

// 兼容旧调用名：等级投票映射为标签投票（严格/宽松）
async function submitSecurityVote(showKey, venue, level, tags) {
  const key = String(showKey || '');
  if (!key) return { ok: false, error: '缺少场次' };
  if (!level) {
    const mine = getMySecurityTags(key);
    for (const t of mine) await toggleSecurityTag(key, venue, t);
    setMySecurityTags(key, []);
    return { ok: true, cancel: true };
  }
  const mapped = level === '宽松放行' ? '安检宽松' : '安检严格';
  const res = await toggleSecurityTag(key, venue, mapped);
  return res.ok ? { ok: true } : res;
}

// 同浏览器多标签页：一个窗口投票，其余窗口毫秒级对齐
function syncSecurityTagsAcrossTabs() {
  securityVoteCache.clear();
  document.querySelectorAll('[data-security-vote]').forEach(host => { host.dataset.ready = '0'; });
  if (typeof refreshAllSecurityVoteHosts === 'function') {
    try { refreshAllSecurityVoteHosts(); } catch (e) { /* ignore */ }
  } else if (typeof hydrateSecurityVoteBlocks === 'function') {
    try { hydrateSecurityVoteBlocks(); } catch (e) { /* ignore */ }
  }
}

if (!window.__securityTagsStorageBound) {
  window.__securityTagsStorageBound = true;
  window.addEventListener('storage', event => {
    if (event.key !== SECURITY_TAGS_LOCAL_KEY && event.key !== 'onerland_visitor_id_v1') return;
    syncSecurityTagsAcrossTabs();
  });
  window.addEventListener('focus', () => {
    if (document.visibilityState === 'visible') syncSecurityTagsAcrossTabs();
  });
}

window.SECURITY_LEVELS = SECURITY_LEVELS;
window.SECURITY_VOTE_TAGS = SECURITY_VOTE_TAGS;
window.SECURITY_TAG_META = SECURITY_TAG_META;
window.getMySecurityTags = getMySecurityTags;
window.setMySecurityTags = setMySecurityTags;
window.fetchSecurityTagStats = fetchSecurityTagStats;
window.toggleSecurityTag = toggleSecurityTag;
window.fetchSecurityVoteStats = fetchSecurityVoteStats;
window.submitSecurityVote = submitSecurityVote;
window.getVisitorId = getVisitorId;
window.getDeviceSignature = getDeviceSignature;
window.getSecurityHwHash = getSecurityHwHash;

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
  ['seatArea', 'venueScores', 'experienceNote', 'ratedAt', 'noteUpdatedAt', 'securityLevel', 'securityDetail', 'securityUpdatedAt', 'buddyName'].forEach(key => {
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

// 🤝 同行搭子昵称：只存本机，绝不上传对方任何联系方式
function updateFootprintBuddy(id, buddyName) {
  const list = Array.isArray(AppState.footprints) ? [...AppState.footprints] : [];
  const idx = list.findIndex(f => String(f.id) === String(id));
  if (idx < 0) return { ok: false };
  const name = String(buddyName || '').trim().slice(0, 20);
  list[idx] = { ...list[idx], buddyName: name, buddyUpdatedAt: new Date().toLocaleString('zh-CN') };
  AppState.footprints = list;
  localStorage.setItem(LOCAL_KEYS.FOOTPRINTS, JSON.stringify(AppState.footprints));
  return { ok: true, entry: list[idx] };
}
window.updateFootprintBuddy = updateFootprintBuddy;

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

// ================= 📤 本机数据一键导出 / 📥 恢复（全部 onerland_ 前缀键） =================
function collectOnerlandLocalData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key.indexOf('onerland_') !== 0) continue;
      data[key] = localStorage.getItem(key);
    }
  } catch (e) { /* 隐私模式可能不可读 */ }
  return data;
}

function setLocalBackupHint(text) {
  const el = document.getElementById('local-backup-hint');
  if (el) el.textContent = text || '';
}

function exportLocalBackup() {
  const data = collectOnerlandLocalData();
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const count = Object.keys(data).length;
  const payload = {
    app: 'onerland',
    schema: 1,
    exportedAt: d.toISOString(),
    count,
    data
  };
  const fileName = `onerland-backup-${stamp}.json`;
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (typeof showToast === 'function') showToast(`已导出 ${count} 项本机数据`);
    setLocalBackupHint(`✅ 已导出 ${count} 项 · ${fileName}`);
  } catch (e) {
    alert('导出失败：' + (e && e.message ? e.message : '未知错误'));
  }
}

function triggerLocalBackupImport() {
  const input = document.getElementById('local-backup-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function importLocalBackupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let payload = null;
    try { payload = JSON.parse(String(reader.result || '')); } catch (e) { payload = null; }
    if (!payload || payload.app !== 'onerland' || !payload.data || typeof payload.data !== 'object') {
      alert('❌ 备份文件格式不正确，请选择由 ONERLAND 导出的 .json 备份');
      return;
    }
    const entries = Object.entries(payload.data).filter(([k, v]) => k.indexOf('onerland_') === 0 && typeof v === 'string');
    if (!entries.length) {
      alert('❌ 备份文件里没有可恢复的数据');
      return;
    }
    if (!confirm(`将合并恢复 ${entries.length} 项本机数据（同名键以备份为准，其它本机设置保留）。继续吗？`)) return;
    try {
      entries.forEach(([k, v]) => localStorage.setItem(k, v));
    } catch (e) {
      alert('❌ 写入本机存储失败：' + (e && e.message ? e.message : '未知错误'));
      return;
    }
    setLocalBackupHint(`✅ 已恢复 ${entries.length} 项数据，即将刷新…`);
    alert('✅ 数据已成功恢复');
    setTimeout(() => location.reload(), 500);
  };
  reader.onerror = () => alert('❌ 读取备份文件失败，请重试');
  reader.readAsText(file);
}

// ================= 高清海报灯箱 =================
function openPosterLightbox(src, title) {
  const box = document.getElementById('poster-hd-lightbox');
  const img = document.getElementById('phd-img');
  if (!box || !img || !src) return;
  const loading = document.getElementById('phd-loading');
  const titleEl = document.getElementById('phd-title');
  if (titleEl) {
    titleEl.textContent = String(title || '')
      .replace(/\s*·\s*(海报|往日海报|演出海报|高清海报)$/g, '')
      .trim();
  }
  img.classList.remove('is-ready');
  if (loading) {
    loading.textContent = '高清原图加载中...';
    loading.style.display = 'flex';
  }
  img.setAttribute('src', src);
  box.classList.remove('hidden');
  document.body.classList.add('phd-open');
}

function onPosterLightboxLoaded(img) {
  const loading = document.getElementById('phd-loading');
  if (loading) loading.style.display = 'none';
  if (img) img.classList.add('is-ready');
}

function onPosterLightboxError(img) {
  const loading = document.getElementById('phd-loading');
  if (loading) {
    loading.style.display = 'flex';
    loading.textContent = '高清原图加载失败，可稍后重试';
  }
  if (img) img.classList.remove('is-ready');
}

function closePosterLightbox() {
  const box = document.getElementById('poster-hd-lightbox');
  if (!box || box.classList.contains('hidden')) return;
  box.classList.add('hidden');
  document.body.classList.remove('phd-open');
  const img = document.getElementById('phd-img');
  if (img) {
    img.classList.remove('is-ready');
    img.removeAttribute('src');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePosterLightbox();
});
window.openPosterLightbox = openPosterLightbox;
window.closePosterLightbox = closePosterLightbox;
window.onPosterLightboxLoaded = onPosterLightboxLoaded;
window.onPosterLightboxError = onPosterLightboxError;
