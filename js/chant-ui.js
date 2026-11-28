/* ================= 📣 应援词典：Supabase 云端应援词库 + 1～5 星难度评价 + 长图 / PDF 导出 =================
   规范：
   1) 曲目只以 Supabase fan_chants 为权威数据源（匿名 SELECT）；读取失败会明确报错，本机草稿仅作待同步副本；
   2) 管理员增删改必须调用 Supabase 管理员校验 RPC；失败直接提示原因，绝不静默写入本机伪装成功；
   3) 本机历史草稿可在管理员解锁后一键上传云端；
   4) 应援词正文用 [..] / 【..】 标记，渲染、长图、PDF 统一高亮；
   5) 1～5 星难度评价本机记录 + vote_chant_star RPC 全站聚合，再次点击同一星级即取消；
   6) 长图走纯 Canvas 2D（devicePixelRatio ≥ 2），不引用任何跨域图片；
   7) PDF 走原生 window.print() + 专用打印排版，无第三方库。 */

const CHANT_TABLE = 'fan_chants';
const CHANT_LOCAL_KEY = 'onerland_fan_chants_v1';
const CHANT_ALBUM_TAG_KEY = 'onerland_chant_album_tags_v1';
const CHANT_ALBUM_TAG_PRESETS = ['过敏', '舞会', '恶浪', '镜象马戏团', 'ONER', '单曲 / 舞台'];
const CHANT_RATING_KEY = 'onerland_chant_ratings';
const CHANT_CATEGORIES = ['ONER团歌', '岳岳', '木子洋', '灵超'];

// 1～5 星应援难度评价
const CHANT_STAR_LEVELS = [
  { stars: 1, label: '★ 1星', desc: '超好跟喊' },
  { stars: 2, label: '★★ 2星', desc: '轻松上手' },
  { stars: 3, label: '★★★ 3星', desc: '中等节奏' },
  { stars: 4, label: '★★★★ 4星', desc: '高能密集' },
  { stars: 5, label: '★★★★★ 5星', desc: '地狱级手速/口速' }
];

// ===== 应援色：直接复用 config.js 的 ARTIST_COLORS，网页 / Canvas / PDF 三端共用 =====
const CHANT_COLOR_TOKENS = (function () {
  const c = (typeof ARTIST_COLORS !== 'undefined' && ARTIST_COLORS) || {};
  const groupBg = String((c['ONER'] && c['ONER'].bg) || 'linear-gradient(135deg, #DD0514 0%, #8D0D0E 100%)');
  const hexes = groupBg.match(/#[0-9a-f]{6}/gi) || [];
  return {
    groupGradient: [hexes[0] || '#DD0514', hexes[1] || hexes[0] || '#8D0D0E'],
    yueyue: (c['岳岳'] && c['岳岳'].hex) || '#9C73EF',
    muziyang: (c['木子洋'] && c['木子洋'].hex) || '#F90092',
    lingchao: (c['灵超'] && c['灵超'].hex) || '#32B5E1',
    members: {
      member_yueyue: ['岳岳', 'PINKRAY', '岳明辉'],
      member_muziyang: ['木子洋', 'KWIN', '李振洋'],
      member_lingchao: ['灵超鹅', '灵超', 'DIDI', '李英超']
    }
  };
})();

const CHANT_MEMBER_ALIASES = (function () {
  const list = [];
  Object.keys(CHANT_COLOR_TOKENS.members).forEach(type => {
    CHANT_COLOR_TOKENS.members[type].forEach(alias => list.push({ alias, type }));
  });
  return list.sort((a, b) => b.alias.length - a.alias.length);
})();

function chantMemberTypeFor(alias) {
  const key = String(alias || '').toLowerCase();
  const hit = CHANT_MEMBER_ALIASES.find(item => item.alias.toLowerCase() === key);
  return hit ? hit.type : '';
}

// 识别行首的演唱者段落标识：岳岳: / ONER 岳岳: / 木子洋: / 灵超鹅: / 合:
function chantExtractSingerHeader(raw) {
  const text = String(raw == null ? '' : raw);
  if (!text) return null;
  const re = /^((?:ONER\s*[·・\-]?\s*)?(?:岳明辉|岳岳|PINKRAY|木子洋|KWIN|李振洋|灵超鹅|灵超|DIDI|李英超|合|全员|ONER))\s*[:：]\s*/i;
  const m = re.exec(text);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, ' ').trim();
  const name = label.replace(/^ONER\s*[·・\-]?\s*/i, '').trim() || label;
  let type = 'group';
  if (!/^(合|全员|ONER)$/i.test(name)) {
    type = chantMemberTypeFor(name) || 'group';
  }
  return { label, type, rest: text.slice(m[0].length) };
}

// 把一段文字按成员人名拆成带 type 的片段（人名优先于团红）
function chantExpandSegment(text, chant) {
  const src = String(text == null ? '' : text);
  if (!src) return [];
  const pattern = CHANT_MEMBER_ALIASES.map(item => item.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(pattern, 'gi');
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), chant: !!chant, type: chant ? 'chant' : 'normal' });
    out.push({ text: m[0], chant: !!chant, type: chantMemberTypeFor(m[0]) || (chant ? 'chant' : 'normal') });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), chant: !!chant, type: chant ? 'chant' : 'normal' });
  return out.filter(seg => seg.text);
}

let chantRatingStats = {};
let chantRatingStatsPromise = null;

const chantState = {
  filter: 'all',
  albumFilter: 'all',
  activeId: '',
  editorId: null,
  loading: false,
  error: ''
};

let chantRemoteSongs = [];
let chantLoadedFromRemote = false;
let chantLoadPromise = null;
let chantImportDrafts = [];

function chantIsAdmin() {
  return typeof canEditContent === 'function'
    ? canEditContent()
    : (typeof AppState !== 'undefined' && Boolean(AppState.isAdmin || AppState.isAdminPasswordVerified));
}

// ===== 正文解析：[..] / 【..】 为粉丝应援词 =====
function parseChantContent(text) {
  const rawLines = String(text == null ? '' : text).split(/\r?\n/);
  const lines = [];
  rawLines.forEach(raw => {
    const rawLine = String(raw || '').trim();
    if (!rawLine) return;
    const singer = chantExtractSingerHeader(rawLine);
    const lineText = singer ? singer.rest.trim() : rawLine;
    const segments = [];
    const re = /\[([^\]]+)\]|【([^】]+)】/g;
    let last = 0;
    let m;
    while ((m = re.exec(lineText))) {
      if (m.index > last) {
        const plain = lineText.slice(last, m.index);
        if (plain) segments.push(...chantExpandSegment(plain, false));
      }
      const marked = m[1] || m[2] || '';
      if (marked) segments.push(...chantExpandSegment(marked, true));
      last = m.index + m[0].length;
    }
    if (last < lineText.length) {
      const tail = lineText.slice(last);
      if (tail) segments.push(...chantExpandSegment(tail, false));
    }
    if (!segments.length && lineText) segments.push({ text: lineText, chant: false, type: 'normal' });
    let plainText = '';
    let opened = false;
    segments.forEach(seg => {
      if (seg.chant && !opened) { plainText += '【'; opened = true; }
      if (!seg.chant && opened) { plainText += '】'; opened = false; }
      plainText += seg.text;
    });
    if (opened) plainText += '】';
    lines.push({
      segments,
      chant: segments.some(s => s.chant),
      text: plainText,
      singer: singer ? singer.label : '',
      singerType: singer ? singer.type : ''
    });
  });
  return lines;
}

function chantLinePlain(line) {
  if (!line) return '';
  if (typeof line === 'string') return line;
  if (Array.isArray(line.segments)) return line.segments.map(s => s.text).join('');
  return String(line.text || '');
}

function normalizeChantLine(line) {
  const singer = line && line.singer ? String(line.singer) : '';
  const singerType = line && line.singerType ? String(line.singerType) : '';
  if (line && Array.isArray(line.segments)) {
    const segments = [];
    line.segments.forEach(seg => {
      const txt = String(seg && seg.text || '');
      if (!txt) return;
      const chant = !!(seg && seg.chant);
      const type = String(seg && seg.type || '');
      if (/^member_(yueyue|muziyang|lingchao)$/.test(type)) segments.push({ text: txt, chant, type });
      else if (type === 'normal' || type === 'chant') segments.push({ text: txt, chant, type });
      else segments.push(...chantExpandSegment(txt, chant));
    });
    if (!segments.length) segments.push({ text: '', chant: false, type: 'normal' });
    return { segments, chant: segments.some(s => s.chant), text: chantLinePlain({ segments }), singer, singerType };
  }
  const plain = chantLinePlain(line);
  const forced = !!(line && line.chant);
  const segments = plain ? chantExpandSegment(plain, forced) : [{ text: '', chant: forced, type: forced ? 'chant' : 'normal' }];
  return { segments, chant: forced, text: plain, singer, singerType };
}

function normalizeChantRecord(row) {
  const r = row || {};
  const id = String(r.id || '').trim();
  const content = String(r.content != null ? r.content : (r.body || '')).trim();
  const lines = Array.isArray(r.lines) && r.lines.length
    ? r.lines.map(normalizeChantLine)
    : parseChantContent(content);
  const category = CHANT_CATEGORIES.includes(String(r.category || '').trim()) ? String(r.category).trim() : 'ONER团歌';
  return {
    id,
    title: String(r.title || '').trim(),
    category,
    album: String(r.album || r.note || '').trim(),
    video: String(r.video_url || r.video || '').trim(),
    content,
    lines
  };
}

// ===== 专辑 Tag：预设 + 管理员新建 + 曲库已有专辑动态合并 =====
function readChantAlbumTagStore() {
  try {
    const raw = localStorage.getItem(CHANT_ALBUM_TAG_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.map(t => String(t || '').trim()).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function writeChantAlbumTagStore(tags) {
  try {
    localStorage.setItem(CHANT_ALBUM_TAG_KEY, JSON.stringify(Array.from(new Set(tags))));
    return true;
  } catch (e) {
    return false;
  }
}

function getAvailableAlbumTags() {
  const out = [];
  const seen = new Set();
  const add = value => {
    const tag = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    out.push(tag);
  };
  CHANT_ALBUM_TAG_PRESETS.forEach(add);
  readChantAlbumTagStore().forEach(add);
  try {
    getChantSongs().forEach(song => add(song.album));
  } catch (e) { /* 曲库尚未加载时仅展示预设 */ }
  return out;
}

function saveChantAlbumTag(tag) {
  const value = String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!value) return '';
  const tags = readChantAlbumTagStore();
  if (!tags.includes(value)) tags.push(value);
  writeChantAlbumTagStore(tags);
  return value;
}

function getChantAlbumFilterTags(songs) {
  const out = [];
  const seen = new Set();
  (Array.isArray(songs) ? songs : []).forEach(song => {
    const tag = String(song && song.album || '').trim();
    if (tag && !seen.has(tag)) { seen.add(tag); out.push(tag); }
  });
  return out;
}

// ===== 本机降级存储：created / overrides / deleted =====
function readChantLocalStore() {
  try {
    const raw = localStorage.getItem(CHANT_LOCAL_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { created: [], overrides: {}, deleted: [] };
    return {
      created: Array.isArray(data.created) ? data.created : [],
      overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {},
      deleted: Array.isArray(data.deleted) ? data.deleted.map(String) : []
    };
  } catch (e) {
    return { created: [], overrides: {}, deleted: [] };
  }
}

function writeChantLocalStore(store) {
  try {
    localStorage.setItem(CHANT_LOCAL_KEY, JSON.stringify({
      created: store.created || [],
      overrides: store.overrides || {},
      deleted: store.deleted || []
    }));
    return true;
  } catch (e) {
    return false;
  }
}

function applyChantOverlay(baseList) {
  const store = readChantLocalStore();
  const deleted = new Set(store.deleted);
  const list = (Array.isArray(baseList) ? baseList : [])
    .filter(item => item && item.id && !deleted.has(item.id))
    .map(item => (store.overrides[item.id] ? normalizeChantRecord(store.overrides[item.id]) : item));
  store.created.forEach(row => {
    const song = normalizeChantRecord(row);
    if (!song.id || deleted.has(song.id)) return;
    const idx = list.findIndex(x => x.id === song.id);
    if (idx >= 0) list[idx] = song;
    else list.push(song);
  });
  return list
    .map(normalizeChantRecord)
    .filter(s => s.id && s.title);
}

function getChantSongs() {
  return applyChantOverlay(chantRemoteSongs);
}

function getChantSong(id) {
  const key = String(id || '');
  return getChantSongs().find(s => s.id === key) || null;
}

// ===== 云端读取（匿名 SELECT）=====
function chantRestHeaders() {
  if (typeof SB_HEADERS !== 'undefined') return SB_HEADERS;
  return {
    apikey: typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '',
    Authorization: `Bearer ${typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''}`
  };
}

function chantRemoteErrorText(status, raw, code) {
  let info = null;
  try { info = raw ? JSON.parse(raw) : null; } catch (e) { info = null; }
  const msg = String((info && (info.message || info.details || info.hint || info.error)) || raw || '').trim();
  const errCode = String(code || (info && (info.code || info.error_code)) || '');
  let hint = '';
  if (status === 404 || errCode === '42P01' || errCode === 'PGRST205') {
    hint = '（fan_chants 表不存在，请先在 Supabase SQL Editor 执行 supabase/fan_chants.sql）';
  } else if (errCode === 'PGRST202') {
    hint = '（云端 RPC 未部署，请先在 Supabase SQL Editor 执行 supabase/fan_chants.sql）';
  } else if (status === 401 || status === 403 || errCode === '28000' || errCode === '42501') {
    hint = '（管理员口令校验失败或权限不足）';
  } else if (status >= 500) {
    hint = '（Supabase 服务端异常，请稍后重试）';
  }
  return `HTTP ${status}${errCode ? ` / ${errCode}` : ''}${msg ? `：${msg}` : ''}${hint}`;
}

async function fetchChantRemoteSongs() {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return { ok: false, rows: [], error: '未配置 SUPABASE_URL' };
  if (typeof fetch !== 'function') return { ok: false, rows: [], error: '当前浏览器不支持网络请求' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
  try {
    const fields = 'id,title,category,album,video_url,content,created_at';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${CHANT_TABLE}?select=${fields}&order=created_at.asc`, {
      headers: chantRestHeaders(),
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, rows: [], error: chantRemoteErrorText(res.status, raw) };
    }
    const rows = await res.json();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    if (timer) clearTimeout(timer);
    const reason = e && e.name === 'AbortError' ? '请求超时（4.5 秒）' : (e && e.message) || '网络异常';
    return { ok: false, rows: [], error: `无法访问 Supabase：${reason}` };
  }
}

async function loadChantSongs(force) {
  if (chantLoadPromise && !force) return chantLoadPromise;
  chantState.loading = true;
  chantState.error = '';
  renderChantPage();
  chantLoadPromise = (async () => {
    const remote = await fetchChantRemoteSongs();
    chantLoadedFromRemote = !!remote.ok;
    chantRemoteSongs = remote.ok ? remote.rows.map(normalizeChantRecord) : [];
    chantState.loading = false;
    if (!remote.ok) {
      chantState.error = `云端应援词库读取失败：${remote.error || '未知错误'}。当前只显示本机草稿，其他设备与访客看不到云端数据。`;
      if (typeof toastError === 'function') toastError(chantState.error, 5200);
    }
    renderChantPage();
    return getChantSongs();
  })();
  return chantLoadPromise;
}

// ===== 云端写入：必须走 Supabase 管理员校验 RPC，失败不改本机 =====
function chantResolveAdminKey(promptIfMissing) {
  let key = '';
  try {
    if (typeof getSecurityAdminKey === 'function') key = String(getSecurityAdminKey() || '').trim();
  } catch (e) { key = ''; }
  if (!key && typeof getCheckinAdminKey === 'function') {
    try { key = String(getCheckinAdminKey() || '').trim(); } catch (e) { key = ''; }
  }
  if (!key && promptIfMissing && typeof promptCheckinAdminKey === 'function') {
    try { key = String(promptCheckinAdminKey('请输入全站管理员密码（与 /api/admin 解锁口令一致）：') || '').trim(); } catch (e) { key = ''; }
  }
  return key;
}

async function chantRpc(fnName, params) {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) throw new Error('未配置 SUPABASE_URL');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...chantRestHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    const err = new Error(chantRemoteErrorText(res.status, raw));
    err.status = res.status;
    let info = null;
    try { info = raw ? JSON.parse(raw) : null; } catch (e) { info = null; }
    err.code = String((info && (info.code || info.error_code)) || '');
    err.detail = String((info && (info.message || info.details || info.hint || info.error)) || raw || '');
    throw err;
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

function chantIsUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function chantLocalDraftCount() {
  const store = readChantLocalStore();
  return store.created.length + Object.keys(store.overrides).length;
}

async function chantAdminWrite(action, id, payload) {
  const key = chantResolveAdminKey(true);
  if (!key) return { ok: false, error: '需要管理员密码才能写入云端，已取消' };

  const p = payload || {};
  const common = {
    p_admin_key: key,
    p_title: String(p.title || ''),
    p_category: String(p.category || ''),
    p_content: String(p.content || ''),
    p_album: String(p.album || '') || null,
    p_video_url: String(p.video_url || '') || null
  };

  try {
    let data = null;
    if (action === 'createChant') {
      data = await chantRpc('admin_create_fan_chant', common);
    } else if (action === 'updateChant') {
      if (!chantIsUuid(id)) return { ok: false, error: '这是本机草稿 ID，请用「一键同步上传」创建云端记录后再编辑' };
      data = await chantRpc('admin_update_fan_chant', { ...common, p_id: id });
    } else if (action === 'deleteChant') {
      if (!chantIsUuid(id)) return { ok: false, error: '这是本机草稿 ID，请直接删除本机草稿' };
      data = await chantRpc('admin_delete_fan_chant', { p_admin_key: key, p_id: id });
    } else {
      return { ok: false, error: `未知的应援词操作：${action}` };
    }
    return { ok: true, data: data || null };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : '云端写入失败' };
  }
}

// 管理员：把本机历史草稿逐条上传云端，失败项保留并明确提示
async function syncLocalChantsToCloud() {
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再同步应援词');
    return;
  }
  const store = readChantLocalStore();
  const created = store.created.slice();
  const overrides = Object.entries(store.overrides || {});
  const total = created.length + overrides.length;
  if (!total) {
    if (typeof toastInfo === 'function') toastInfo('本机没有待上传的应援词草稿');
    return;
  }
  if (!chantResolveAdminKey(true)) {
    if (typeof toastError === 'function') toastError('未填写管理员密码，已取消同步');
    return;
  }
  if (!confirm(`确认把本机 ${total} 条应援词草稿上传到 Supabase 云端？失败项会保留在本机并显示原因。`)) return;

  const syncBtn = document.querySelector('.chant-sync-btn');
  const syncLabel = syncBtn ? syncBtn.textContent : '';
  if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = '☁️ 正在上传…'; }

  let okCount = 0;
  const failures = [];
  const remainingCreated = [];
  const remainingOverrides = {};

  for (const row of created) {
    const song = normalizeChantRecord(row);
    if (!song.title || !song.content) {
      remainingCreated.push(row);
      failures.push(`${song.title || '未命名'}：缺少歌名或正文`);
      continue;
    }
    const remote = await chantAdminWrite('createChant', '', {
      title: song.title,
      category: song.category,
      album: song.album,
      video_url: song.video,
      content: song.content
    });
    if (remote.ok) okCount += 1;
    else {
      remainingCreated.push(row);
      failures.push(`${song.title}：${remote.error}`);
    }
  }

  for (const [id, row] of overrides) {
    const song = normalizeChantRecord(row);
    if (!song.title || !song.content) {
      remainingOverrides[id] = row;
      failures.push(`${song.title || id}：缺少歌名或正文`);
      continue;
    }
    if (!chantIsUuid(id)) {
      const remote = await chantAdminWrite('createChant', '', {
        title: song.title,
        category: song.category,
        album: song.album,
        video_url: song.video,
        content: song.content
      });
      if (remote.ok) okCount += 1;
      else {
        remainingOverrides[id] = row;
        failures.push(`${song.title}：${remote.error}`);
      }
      continue;
    }
    const remote = await chantAdminWrite('updateChant', id, {
      title: song.title,
      category: song.category,
      album: song.album,
      video_url: song.video,
      content: song.content
    });
    if (remote.ok) okCount += 1;
    else {
      remainingOverrides[id] = row;
      failures.push(`${song.title}：${remote.error}`);
    }
  }

  writeChantLocalStore({ created: remainingCreated, overrides: remainingOverrides, deleted: store.deleted });
  await loadChantSongs(true);
  renderChantPage();

  if (failures.length) {
    if (typeof toastError === 'function') {
      toastError(`已上传 ${okCount} 条，失败 ${failures.length} 条：${failures[0]}`, 7000);
    }
  } else if (typeof showToast === 'function') {
    showToast(`☁️ 已把 ${okCount} 条本机应援词上传到云端`);
  }
  if (syncBtn) { syncBtn.disabled = false; syncBtn.textContent = syncLabel || '☁️ 将本机本地应援词一键同步上传到云端'; }
}

// ===== 1～5 星难度评价（个人本机 + 全站匿名聚合兜底）=====
function getChantRatingMap() {
  try {
    const raw = localStorage.getItem(CHANT_RATING_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function saveChantRatingMap(map) {
  try {
    localStorage.setItem(CHANT_RATING_KEY, JSON.stringify(map || {}));
    return true;
  } catch (e) {
    return false;
  }
}

function getChantRating(songId) {
  const map = getChantRatingMap();
  const val = Number(map[String(songId || '')]);
  return val >= 1 && val <= 5 ? val : 0;
}

function setChantRating(songId, stars) {
  const id = String(songId || '');
  const num = Number(stars);
  if (!id || num < 1 || num > 5) return 0;
  const map = getChantRatingMap();
  const next = Number(map[id]) === num ? 0 : num;
  if (next) map[id] = next;
  else delete map[id];
  saveChantRatingMap(map);
  return next;
}

function chantStarText(stars) {
  const n = Math.max(0, Math.min(5, Number(stars) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function chantStarDesc(stars) {
  const meta = CHANT_STAR_LEVELS.find(d => d.stars === Number(stars));
  return meta ? meta.desc : '';
}

function chantCommunityStats(songId) {
  const item = chantRatingStats[String(songId || '')];
  if (!item || !item.count) return null;
  return { avg: Math.round(item.avg * 10) / 10, count: item.count };
}

// 全站匿名聚合：统一走 get_chant_star_stats RPC，不直接读表暴露 visitor_id
async function loadChantRatingStats(force) {
  if (chantRatingStatsPromise && !force) return chantRatingStatsPromise;
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || typeof fetch !== 'function') return null;
  chantRatingStatsPromise = (async () => {
    try {
      const rows = await chantRpc('get_chant_star_stats', {});
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const id = String(row && row.chant_id || '');
        const avg = Number(row && row.avg_rating);
        const count = Number(row && row.rating_count);
        if (!id || !count || !isFinite(avg)) return;
        chantRatingStats[id] = { avg, count };
      });
      renderChantPage();
      return chantRatingStats;
    } catch (e) {
      // 统计失败不阻断曲库；详情页仍可显示本机个人评分
      return null;
    }
  })();
  return chantRatingStatsPromise;
}

// 打分写入：走访客 vote_chant_star RPC，失败明确提示（本机个人评分仍保留）
async function submitChantRatingRemote(songId, stars) {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || typeof fetch !== 'function') return;
  if (!chantIsUuid(songId)) return;
  const visitor = typeof getDeviceId === 'function' ? String(getDeviceId() || '') : '';
  try {
    await chantRpc('vote_chant_star', {
      p_chant_id: String(songId),
      p_rating: Number(stars) || 0,
      p_visitor_id: visitor || 'anonymous'
    });
    setTimeout(() => loadChantRatingStats(true), 400);
  } catch (e) {
    if (typeof toastError === 'function') toastError(`星级云端同步失败：${e && e.message ? e.message : '未知错误'}`, 5200);
  }
}

// ===== 列表 =====
// 有效难度：优先我的评分，其次全站平均（四舍五入）
function chantEffectiveRating(song) {
  const mine = getChantRating(song.id);
  if (mine) return mine;
  const stats = chantCommunityStats(song.id);
  return stats ? Math.round(stats.avg) : 0;
}

function renderChantFilterBar() {
  const box = document.getElementById('chant-difficulty-filter');
  if (!box) return;
  const songs = getChantSongs();
  const options = [
    { key: 'all', label: '全部难度', count: songs.length },
    { key: 'easy', label: '1-2星 轻松', count: songs.filter(s => { const r = chantEffectiveRating(s); return r >= 1 && r <= 2; }).length },
    { key: 'mid', label: '3星 适中', count: songs.filter(s => chantEffectiveRating(s) === 3).length },
    { key: 'hard', label: '4-5星 高难', count: songs.filter(s => chantEffectiveRating(s) >= 4).length }
  ];
  const albumTags = getChantAlbumFilterTags(songs);
  const albumOptions = [{ key: 'all', label: '全部专辑', count: songs.length }].concat(
    albumTags.map(tag => ({ key: tag, label: `💿 ${tag}`, count: songs.filter(s => String(s.album || '') === tag).length }))
  );
  box.innerHTML = `
    <div class="chant-filter-group">
      <span class="chant-filter-label">我的难度</span>
      ${options.map(opt => `<button type="button" class="chant-filter-chip ${chantState.filter === opt.key ? 'is-active' : ''}" data-chant-filter="${opt.key}" onclick="setChantFilter('${opt.key}')">${travelEsc(opt.label)}<span class="chant-filter-count">${opt.count}</span></button>`).join('')}
    </div>
    <div class="chant-filter-group chant-album-filter-group">
      <span class="chant-filter-label">专辑</span>
      ${albumOptions.map(opt => `<button type="button" class="chant-filter-chip ${chantState.albumFilter === opt.key ? 'is-active' : ''}" data-chant-album="${travelEsc(opt.key)}" onclick="setChantAlbumFilter(this.dataset.chantAlbum)">${travelEsc(opt.label)}<span class="chant-filter-count">${opt.count}</span></button>`).join('')}
    </div>
  `;
}

function chantAlbumBadgeHtml(album) {
  const tag = String(album || '').trim();
  return tag ? `<span class="chant-album-badge">💿 ${travelEsc(tag)}</span>` : '';
}

function chantAlbumMetaHtml(song) {
  const album = String(song && song.album || '').trim();
  const category = String(song && song.category || '').trim();
  if (!album) return category ? `<span>${travelEsc(category)}</span>` : '';
  return chantAlbumBadgeHtml(album)
    + (category && category !== album ? `<span class="chant-meta-sep">·</span><span>${travelEsc(category)}</span>` : '');
}

function chantAlbumMetaText(song) {
  const album = String(song && song.album || '').trim();
  const category = String(song && song.category || '').trim();
  return album ? `💿 ${album}${category && category !== album ? ` · ${category}` : ''}` : category;
}

function chantSongCardHtml(song) {
  const mine = getChantRating(song.id);
  const stats = chantCommunityStats(song.id);
  const badgeText = mine ? `★ ${mine}` : (stats ? `★ ${stats.avg.toFixed(1)}` : '');
  const badgeTitle = mine
    ? `我的难度评价：${chantStarText(mine)}（${mine}星 · ${chantStarDesc(mine)}）`
    : (stats ? `全站综合难度：★ ${stats.avg.toFixed(1)}（${stats.count}人评价）` : '');
  const chantCount = song.lines.filter(l => l.chant).length;
  const admin = chantIsAdmin();
  const idAttr = travelEsc(song.id);
  return `
    <div class="chant-song-card" data-chant-card="${idAttr}">
      <button type="button" class="chant-song-open" onclick="openChantSong('${idAttr}')">
        <span class="chant-song-main">
          <span class="chant-song-title">${travelEsc(song.title)}</span>
          <span class="chant-song-meta">${chantAlbumMetaHtml(song)}</span>
          <span class="chant-song-sub">🎯 ${chantCount} 处跟喊点${song.video ? ' · 🎬 官方应援视频' : ''}</span>
        </span>
      </button>
      ${badgeText ? `<span class="chant-song-level is-star" title="${travelEsc(badgeTitle)}">${travelEsc(badgeText)}</span>` : ''}
      ${admin ? `<span class="chant-card-admin">
        <button type="button" class="chant-mini-btn" title="编辑这首应援词" onclick="event.stopPropagation(); openChantEditor('${idAttr}')">✏️ 编辑</button>
        <button type="button" class="chant-mini-btn is-danger" title="彻底删除这首应援词" onclick="event.stopPropagation(); deleteChantSong('${idAttr}')">🗑️ 删除</button>
      </span>` : ''}
    </div>`;
}

function chantToolbarHtml() {
  if (!chantIsAdmin()) return '';
  const pending = chantLocalDraftCount();
  return `<div class="chant-admin-toolbar">
    <button type="button" class="chant-add-btn" onclick="openChantEditor()">+ 新增应援词</button>
    ${pending ? `<button type="button" class="chant-sync-btn" onclick="syncLocalChantsToCloud()">☁️ 将本机本地应援词一键同步上传到云端（${pending}）</button>` : ''}
    <span class="chant-admin-hint">🔓 管理员已解锁 · 写入 Supabase 云端</span>
  </div>`;
}

function renderChantPage() {
  const listView = document.getElementById('chant-list-view');
  const detailView = document.getElementById('chant-detail-view');
  const editorView = document.getElementById('chant-editor-view');
  if (!listView || !detailView) return;

  const toolbar = document.getElementById('chant-admin-toolbar');
  if (toolbar) toolbar.innerHTML = chantToolbarHtml();

  const syncStatus = document.getElementById('chant-sync-status');
  if (syncStatus) {
    if (chantState.error) {
      syncStatus.className = 'chant-sync-alert';
      syncStatus.innerHTML = `⚠️ ${travelEsc(chantState.error)}`;
    } else {
      syncStatus.className = 'hidden';
      syncStatus.innerHTML = '';
    }
  }

  if (chantState.editorId !== null && editorView) {
    listView.classList.add('hidden');
    detailView.classList.add('hidden');
    editorView.classList.remove('hidden');
    renderChantEditor(chantState.editorId);
    return;
  }
  if (editorView) editorView.classList.add('hidden');

  if (chantState.activeId) {
    const song = getChantSong(chantState.activeId);
    if (song) {
      listView.classList.add('hidden');
      detailView.classList.remove('hidden');
      if (!detailView.dataset.song || detailView.dataset.song !== song.id) renderChantDetail(song);
      return;
    }
    chantState.activeId = '';
  }

  detailView.classList.add('hidden');
  listView.classList.remove('hidden');
  renderChantFilterBar();

  const songs = getChantSongs();
  const filtered = songs.filter(song => {
    if (chantState.albumFilter !== 'all' && String(song.album || '') !== chantState.albumFilter) return false;
    if (chantState.filter === 'all') return true;
    const rating = chantEffectiveRating(song);
    if (chantState.filter === 'easy') return rating >= 1 && rating <= 2;
    if (chantState.filter === 'mid') return rating === 3;
    if (chantState.filter === 'hard') return rating >= 4;
    return true;
  });
  const grid = document.getElementById('chant-song-grid');
  if (!grid) return;
  if (chantState.loading && !songs.length) {
    grid.innerHTML = `<div class="chant-empty">⏳ 正在同步应援词库…</div>`;
    return;
  }
  grid.innerHTML = filtered.length
    ? filtered.map(chantSongCardHtml).join('')
    : `<div class="chant-empty">${songs.length
      ? '该难度区间下还没有曲目，去详情页给歌曲打个星级吧～'
      : '应援词库还是空的：管理员解锁后点「+ 新增应援词」录入第一首吧～'}</div>`;
}

function setChantFilter(key) {
  chantState.filter = String(key || 'all');
  renderChantPage();
}

function setChantAlbumFilter(key) {
  chantState.albumFilter = String(key || 'all');
  renderChantPage();
}

function openChantSong(songId) {
  chantState.activeId = String(songId || '');
  chantState.editorId = null;
  renderChantPage();
  const box = document.getElementById('view-chant-page');
  if (box && typeof box.scrollIntoView === 'function') {
    try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
  }
}

function closeChantDetail() {
  chantState.activeId = '';
  renderChantPage();
}

// ===== 详情 =====
function chantStarChipsHtml(song) {
  const mine = getChantRating(song.id);
  return CHANT_STAR_LEVELS.map(d => `
    <button type="button" class="chant-level-chip chant-star-chip ${mine === d.stars ? 'is-active' : ''}" aria-pressed="${mine === d.stars ? 'true' : 'false'}"
      data-chant-stars="${d.stars}" title="${travelEsc(d.desc)}"
      onclick="toggleChantRating('${travelEsc(song.id)}', ${d.stars})">${'★'.repeat(d.stars)}<span class="chant-star-suffix"> ${d.stars}星</span></button>`).join('');
}

function chantRatingHintHtml(song) {
  const mine = getChantRating(song.id);
  if (!mine) return '你觉得这首应援有多难？点击上方星级评价';
  return `我的难度评价：${chantStarText(mine)}（${mine}星 · ${chantStarDesc(mine)}）`;
}

function chantCommunityLineHtml(song) {
  const stats = chantCommunityStats(song.id);
  if (!stats) return '';
  return `全站综合难度：★ ${stats.avg.toFixed(1)}（${stats.count}人评价）`;
}

function chantSegmentHtml(seg) {
  const type = String(seg && seg.type || '');
  if (/^member_(yueyue|muziyang|lingchao)$/.test(type)) {
    const key = type.replace('member_', '');
    return `<span class="chant-member chant-member-${key}">${travelEsc(seg.text)}</span>`;
  }
  return travelEsc(seg.text);
}

// 团红渐变 mark 内再嵌套成员专属色 span；相邻应援片段合并到同一个 mark，避免断色
function chantSegmentsHtml(segments) {
  let html = '';
  let opened = false;
  (segments || []).forEach(seg => {
    if (seg.chant && !opened) { html += '<mark class="chant-hl">'; opened = true; }
    else if (!seg.chant && opened) { html += '</mark>'; opened = false; }
    html += chantSegmentHtml(seg);
  });
  if (opened) html += '</mark>';
  return html;
}

function chantSingerClass(type) {
  const raw = String(type || '');
  if (!raw || raw === 'group') return 'is-group';
  return `is-${raw.replace('member_', '')}`;
}

function chantSingerTagHtml(line) {
  if (!line || !line.singer) return '';
  return `<p class="chant-singer"><span class="chant-singer-tag ${chantSingerClass(line.singerType)}">${travelEsc(line.singer)}</span></p>`;
}

function chantLineHtml(line) {
  const segs = Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant, type: line.chant ? 'chant' : 'normal' }];
  const inner = chantSegmentsHtml(segs);
  const singer = chantSingerTagHtml(line);
  const hasBody = segs.some(seg => String(seg && seg.text || '').trim());
  if (!hasBody) return singer;
  const body = `<span class="chant-line-body">${inner}</span>`;
  return singer + (line.chant
    ? `<p class="chant-line is-chant"><span class="chant-line-mark">应援</span>${body}</p>`
    : `<p class="chant-line">${body}</p>`);
}

function chantLinesHtml(song) {
  return song.lines.map(chantLineHtml).join('');
}

function chantVideoUrl(song) {
  const url = String(song && song.video || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function renderChantDetail(song) {
  const box = document.getElementById('chant-detail-view');
  if (!box) return;
  box.dataset.song = song.id;
  const admin = chantIsAdmin();
  const video = chantVideoUrl(song);
  const safeId = travelEsc(song.id);
  box.innerHTML = `
    <div class="chant-detail-card">
      <div class="chant-detail-head">
        <button type="button" class="chant-back-btn" onclick="closeChantDetail()">← 返回曲目</button>
        <span class="chant-detail-tip">💾 难度评价只存本机 · 无需登录</span>
      </div>
      ${admin ? `<div class="chant-admin-row">
        <button type="button" class="chant-mini-btn" onclick="openChantEditor('${safeId}')">✏️ 编辑</button>
        <button type="button" class="chant-mini-btn is-danger" onclick="deleteChantSong('${safeId}')">🗑️ 删除</button>
      </div>` : ''}
      <h3 class="chant-detail-title">${travelEsc(song.title)}</h3>
      <p class="chant-detail-meta">${chantAlbumMetaHtml(song)}</p>
      ${video ? `<a class="chant-video-link" href="${travelEsc(video)}" target="_blank" rel="noopener noreferrer">🎬 官方应援视频 ↗</a>` : ''}
      <div class="chant-level-row chant-star-row" id="chant-level-row">${chantStarChipsHtml(song)}</div>
      <p class="chant-level-hint" id="chant-rating-hint">${travelEsc(chantRatingHintHtml(song))}</p>
      <p class="chant-level-hint chant-community-hint" id="chant-rating-community">${travelEsc(chantCommunityLineHtml(song))}</p>
      <div class="chant-detail-legend">
        <span class="chant-legend-swatch"></span> 高亮部分为粉丝应援词
      </div>
      <div class="chant-lyrics">${chantLinesHtml(song)}</div>
      <div class="chant-detail-actions">
        <button type="button" class="chant-action-btn" onclick="copyChantLyrics('${safeId}')">📋 复制本首应援词</button>
        <button type="button" class="chant-action-btn is-primary" onclick="saveChantLongImage('${safeId}')">🖼️ 保存长图</button>
        <button type="button" class="chant-action-btn" onclick="exportChantPdf('${safeId}')">📄 导出 PDF</button>
      </div>
    </div>
  `;
}

function toggleChantRating(songId, stars) {
  const next = setChantRating(songId, stars);
  const song = getChantSong(songId);
  if (next) {
    if (typeof showToast === 'function') showToast(`已评价：${chantStarText(next)}（${next}星 · ${chantStarDesc(next)}）`);
  } else if (typeof showToast === 'function') {
    showToast('已取消该曲的难度评价');
  }
  submitChantRatingRemote(songId, next);
  if (song) {
    const row = document.getElementById('chant-level-row');
    const hint = document.getElementById('chant-rating-hint');
    if (row) row.innerHTML = chantStarChipsHtml(song);
    if (hint) hint.textContent = chantRatingHintHtml(song);
  }
  renderChantFilterBar();
}

// ===== Word (.docx) / PDF 导入：按需懒加载解析库，不阻塞首屏 =====
let chantDocxLibPromise = null;
let chantPdfLibPromise = null;

function loadChantScriptOnce(src, globalCheck) {
  return new Promise((resolve, reject) => {
    if (typeof globalCheck === 'function' && globalCheck()) return resolve();
    const found = Array.from(document.scripts).find(s => s.src === src);
    if (found) {
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', () => reject(new Error('解析库加载失败')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('解析库加载失败，请检查网络'));
    document.head.appendChild(script);
  });
}

function loadChantMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!chantDocxLibPromise) {
    chantDocxLibPromise = loadChantScriptOnce(
      'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
      () => Boolean(window.mammoth)
    ).then(() => window.mammoth).catch(err => { chantDocxLibPromise = null; throw err; });
  }
  return chantDocxLibPromise;
}

function loadChantPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!chantPdfLibPromise) {
    chantPdfLibPromise = loadChantScriptOnce(
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      () => Boolean(window.pdfjsLib)
    ).then(() => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }
      return window.pdfjsLib;
    }).catch(err => { chantPdfLibPromise = null; throw err; });
  }
  return chantPdfLibPromise;
}

// 原生 ZIP 解压兜底：mammoth CDN 不可用时直接读 word/document.xml
async function chantReadZipEntry(arrayBuffer, targetName) {
  const view = new DataView(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 docx 文件');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === targetName) {
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtraLen = view.getUint16(localOff + 28, true);
      const start = localOff + 30 + localNameLen + localExtraLen;
      const data = u8.subarray(start, start + compSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8 && typeof DecompressionStream === 'function') {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).text();
      }
      throw new Error('暂不支持该 docx 压缩格式');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('docx 中未找到正文');
}

function chantDocxXmlToText(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = Array.from(doc.getElementsByTagName('w:p'));
  return paras.map(p => {
    let out = '';
    Array.from(p.getElementsByTagName('w:r')).forEach(r => {
      const txt = Array.from(r.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      if (!txt) return;
      const rPr = r.getElementsByTagName('w:rPr')[0];
      let emph = false;
      if (rPr) {
        const b = rPr.getElementsByTagName('w:b')[0];
        if (b && b.getAttribute('w:val') !== '0' && b.getAttribute('w:val') !== 'false') emph = true;
        const hl = rPr.getElementsByTagName('w:highlight')[0];
        if (hl && hl.getAttribute('w:val') && hl.getAttribute('w:val') !== 'none') emph = true;
        const color = rPr.getElementsByTagName('w:color')[0];
        const val = color ? String(color.getAttribute('w:val') || '').toLowerCase() : '';
        if (val && val !== 'auto' && val !== '000000' && val !== 'ffffff') emph = true;
      }
      out += emph && txt.trim() ? `[${txt}]` : txt;
    });
    return out;
  }).filter(t => t.trim()).join('\n');
}

function chantDocxHtmlPara(p) {
  let out = '';
  Array.from(p.childNodes).forEach(node => {
    if (node.nodeType === 3) { out += node.nodeValue || ''; return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const style = String(node.getAttribute('style') || '');
    const emph = tag === 'strong' || tag === 'b' || /color\s*:|background|highlight/i.test(style);
    const txt = node.textContent || '';
    if (!txt) return;
    out += emph && txt.trim() ? `[${txt}]` : txt;
  });
  return out.trim();
}

async function chantParseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  // 原生解压优先：能精确读到 w:b / w:color / w:highlight，彩色应援句不会丢标记
  try {
    const xml = await chantReadZipEntry(arrayBuffer, 'word/document.xml');
    const nativeText = chantDocxXmlToText(xml);
    if (nativeText && nativeText.trim()) return nativeText;
  } catch (e) { /* 继续走 mammoth 兜底 */ }
  const mammoth = await loadChantMammoth();
  if (!mammoth) throw new Error('无法解析该 docx 文件');
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: ['b => strong', 'strong => strong']
  });
  const doc = new DOMParser().parseFromString(result.value || '', 'text/html');
  return Array.from(doc.querySelectorAll('p, li')).map(chantDocxHtmlPara).filter(Boolean).join('\n');
}

const CHANT_PDF_RADICAL_MAP = {
  '⺦': '丬', '⺰': '纟', '⻅': '见', '⻈': '讠', '⻉': '贝', '⻋': '车', '⻐': '钅', '⻓': '长',
  '⻔': '门', '⻙': '韦', '⻚': '页', '⻛': '风', '⻜': '飞', '⻠': '饣', '⻢': '马', '⻥': '鱼',
  '⻦': '鸟', '⻧': '卤', '⻨': '麦', '⻩': '黄', '⻪': '黾', '⻫': '齐', '⻬': '齐', '⻭': '齿',
  '⻮': '齿', '⻯': '龙', '⻰': '龙', '⻲': '龟', '⻳': '龟'
};

function chantNormalizePdfText(raw) {
  let line = String(raw || '');
  try { line = line.normalize('NFKC'); } catch (e) { /* ignore */ }
  line = line.replace(/[\u2e80-\u2eff]/g, ch => CHANT_PDF_RADICAL_MAP[ch] || ch);
  line = line.replace(/\s+/g, ' ').trim();
  // PDF 常把每个汉字拆成独立文本项，合并汉字之间的空格（含部首区异体字）
  for (let i = 0; i < 3; i += 1) {
    line = line.replace(/([\u3400-\u9fff\u3005-\u3007\u2e80-\u2eff])\s+(?=[\u3400-\u9fff\u3005-\u3007\u2e80-\u2eff])/g, '$1');
  }
  const letters = line.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters === 'TOTHETOP') return 'TO THE TOP';
  if (letters === 'ONER') return 'ONER';
  if (letters === 'ONERLAND') return 'ONERLAND';
  return line;
}

function chantCleanPdfLine(raw) {
  let line = chantNormalizePdfText(raw);
  if (!line) return '';
  if (/^[★☆✦✧✩✪✫✬✭✮✯✰·•●○◇◆\s]+$/.test(line)) return '';
  if (/^(TO\s+THE\s+TOP|ONER|ONERLAND|ONER\s*LAND|应援词典|歌词本|歌单|目录)$/i.test(line)) return '';
  const headerLetters = line.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!/[\u3400-\u9fff]/.test(line) && /^(ONER|ONERLAND|TOTHETOP){1,3}$/.test(headerLetters) && headerLetters.length >= 4) return '';
  if (/^\d{1,3}$/.test(line)) return '';
  if (/^第?\s*\d+\s*页$/.test(line) || /^PAGE\s*\d+(\s*\/\s*\d+)?$/i.test(line)) return '';
  return line;
}

function chantCleanImportedTitle(raw) {
  let title = chantNormalizePdfText(raw);
  const quoted = title.match(/[《〈]([^》〉]+)[》〉]/);
  if (quoted) title = quoted[1];
  title = title
    .replace(/^[★☆✦✧✩✪✫✬✭✮✯✰\s]+/, '')
    .replace(/[★☆✦✧✩✪✫✬✭✮✯✰\s]+$/, '')
    .replace(/^[#＃\d０-９]+\s*[.、)）]?\s*/, '')
    .replace(/^第\s*[\d０-９]+\s*[首曲页]\s*[·:：-]?\s*/, '')
    .trim();
  return title.slice(0, 60);
}

function chantPickPdfTitle(rows) {
  const cleanRows = (rows || []).filter(row => row.text);
  if (!cleanRows.length) return '';
  const maxSize = cleanRows.reduce((max, row) => Math.max(max, Number(row.size || 0)), 0);
  let firstUsable = '';
  for (let i = 0; i < Math.min(cleanRows.length, 8); i += 1) {
    const row = cleanRows[i];
    const title = chantCleanImportedTitle(row.text);
    if (!title || title.length < 2 || title.length > 36) continue;
    if (chantLooksLikeSlogan(title)) continue;
    if (/^(歌词|应援词|应援|目录|歌单|曲目|正文)$/i.test(title)) continue;
    if (/[。；;]$/.test(title) && title.length > 12) continue;
    if (!firstUsable) firstUsable = title;
    if (maxSize && Number(row.size || 0) >= maxSize * 0.82) return title;
  }
  return firstUsable;
}

// 多页 PDF：逐页独立解析成歌曲草稿，绝不把整本混成一条
async function chantParsePdfPages(file) {
  const pdfjs = await loadChantPdfJs();
  if (!pdfjs) throw new Error('PDF 解析库未就绪');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  const total = Math.min(pdf.numPages, 60);
  for (let i = 1; i <= total; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const rows = [];
    (textContent.items || []).forEach(item => {
      if (!item || !String(item.str || '').trim()) return;
      const tr = item.transform || [];
      const x = Number(tr[4] || 0);
      const y = Number(tr[5] || 0);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [], size: 0 }; rows.push(row); }
      row.items.push({ x, str: String(item.str) });
      row.size = Math.max(row.size, Number(item.height || 0));
    });
    rows.sort((a, b) => b.y - a.y);
    const cleanedRows = rows.map(row => {
      const text = row.items
        .sort((a, b) => a.x - b.x)
        .map(it => it.str)
        .join(' ')
        .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
      return { text: chantCleanPdfLine(text), size: row.size, y: row.y };
    }).filter(row => row.text);
    if (!cleanedRows.length) continue;

    const title = chantPickPdfTitle(cleanedRows);
    const titleIndex = cleanedRows.findIndex(row => chantCleanImportedTitle(row.text) === title);
    const bodyRows = cleanedRows.filter((row, idx) => idx !== titleIndex && row.text);
    const content = chantNormalizeImportedText(bodyRows.map(row => row.text).join('\n'));
    if (!content.trim()) continue;
    pages.push({
      pageNo: i,
      title: title || `第 ${i} 页曲目`,
      content
    });
  }
  return pages;
}

async function chantParsePdf(file) {
  const pages = await chantParsePdfPages(file);
  if (!pages.length) return '';
  if (pages.length === 1) return `${pages[0].title}\n${pages[0].content}`;
  return pages.map(p => `${p.title}\n${p.content}`).join('\n\n');
}

function chantMemberNameCount(text) {
  return CHANT_MEMBER_ALIASES.filter(item => new RegExp(item.alias, 'i').test(text)).length;
}

const CHANT_IMPORT_TOKEN_RE = /O[\s\-－]*N[\s\-－]*E[\s\-－]*R(?![A-Za-z])|PINKRAY(?![A-Za-z])|KWIN(?![A-Za-z])|D[\s\-－]*I[\s\-－]*D[\s\-－]*I(?![A-Za-z])|岳明辉|木子洋|灵超鹅|灵超|李振洋|李英超|万能人/gi;

function chantTokenMatches(text) {
  const re = new RegExp(CHANT_IMPORT_TOKEN_RE.source, 'gi');
  const matches = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[0]) matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return matches;
}

function chantLooksLikeSlogan(line) {
  const text = String(line || '').trim();
  if (!text || /[\[\]【】]/.test(text)) return false;
  if (text.length > 50) return false;
  const compact = text.replace(/[\s\-·・_—–－]/g, '');
  const matches = chantTokenMatches(text);
  const memberCount = chantMemberNameCount(compact);
  const hasGroup = /ONER/i.test(compact);
  const hasFandom = /万能人|万能人们/.test(compact);
  const hasCheer = /(hey|oh|go|come\s*on|加油|应援)/i.test(text);
  const repeated = matches.length >= 2;
  const stripped = compact
    .toUpperCase()
    .replace(/ONER|PINKRAY|KWIN|DIDI|岳明辉|木子洋|灵超鹅|灵超|李振洋|李英超|万能人/g, '')
    .replace(/[!！?？,，、.。~～…\s]/g, '');
  const nameOnly = stripped.length <= 2 && (hasGroup || memberCount > 0 || hasFandom);
  return (hasGroup && memberCount >= 1)
    || memberCount >= 2
    || hasFandom
    || ((hasGroup || memberCount >= 1 || hasFandom) && (hasCheer || /[!！]/.test(text) || nameOnly || repeated))
    || nameOnly;
}

// 混合歌词行只包裹真正的人名 / 口号片段，避免整行歌词都被染红
function chantWrapDetectedChants(line) {
  const text = String(line || '').trim();
  if (!text || /[\[\]【】]/.test(text)) return text;
  const matches = chantTokenMatches(text);
  if (!matches.length) return text;
  const merged = [];
  matches.forEach(match => {
    const last = merged[merged.length - 1];
    if (last && /^[\s!！?？、,，.。~～…·・-]*$/.test(text.slice(last.end, match.start))) {
      last.end = match.end;
      last.text = text.slice(last.start, last.end);
    } else {
      merged.push({ ...match });
    }
  });
  merged.forEach(m => {
    while (m.end < text.length && /[!！?？~～…]/.test(text[m.end])) m.end += 1;
    m.text = text.slice(m.start, m.end);
  });
  const leftover = merged.reduce((acc, m, idx) => {
    const prevEnd = idx === 0 ? 0 : merged[idx - 1].end;
    return acc + text.slice(prevEnd, m.start);
  }, '') + text.slice(merged[merged.length - 1].end);
  if (!leftover.replace(/[\s!！?？、,，.。~～…·・-]/g, '')) {
    return `[${text}]`;
  }
  let out = '';
  let cursor = 0;
  merged.forEach(m => {
    out += text.slice(cursor, m.start);
    out += `[${text.slice(m.start, m.end).trim()}]`;
    cursor = m.end;
  });
  out += text.slice(cursor);
  return out;
}

// 把识别出的纯文本规范成 [应援内容] 结构
function chantNormalizeImportedText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(raw => {
      let line = String(raw || '')
        .replace(/^[\s　]+|[\s　]+$/g, '')
        .replace(/(?:\(|（)\s*(?:应援|喊|口号)\s*[:：]\s*([^)）]+)(?:\)|）)/gi, '[$1]')
        .replace(/^(?:应援|喊|口号)\s*[:：]\s*(.+)$/i, '[$1]')
        .replace(/\s+/g, ' ');
      if (!line) return '';
      line = chantNormalizePdfText(line);
      if (!/[\[\]【】]/.test(line) && chantLooksLikeSlogan(line)) line = chantWrapDetectedChants(line);
      return line;
    })
    .filter(Boolean)
    .join('\n');
}

function chantApplyImportedText(text) {
  const normalized = chantNormalizeImportedText(text);
  const lines = normalized.split('\n').filter(Boolean);
  if (!lines.length) throw new Error('未提取到可用文字');
  const titleEl = document.getElementById('chant-form-title');
  const contentEl = document.getElementById('chant-form-content');
  let bodyLines = lines.slice();
  if (titleEl && !titleEl.value.trim() && lines.length > 1) {
    const first = lines[0];
    if (first.length <= 30 && !/[\[\]【】]/.test(first) && !chantLooksLikeSlogan(first)) {
      titleEl.value = first.replace(/^[#＃\d０-９.、\s]+/, '').trim();
      bodyLines = lines.slice(1);
    }
  }
  if (contentEl) contentEl.value = bodyLines.join('\n');
  if (typeof showToast === 'function') showToast('已识别并填入正文，可核对微调后保存');
}

async function handleChantImportFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  const name = String(file.name || '').toLowerCase();
  if (!/\.(docx|pdf)$/.test(name)) {
    if (typeof toastError === 'function') toastError('仅支持 .docx 或 .pdf 文件');
    input.value = '';
    return;
  }
  const btn = document.getElementById('chant-import-btn');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在解析…'; }
  try {
    if (name.endsWith('.pdf')) {
      const pages = await chantParsePdfPages(file);
      if (!pages.length) throw new Error('未提取到可用歌词');
      if (pages.length > 1) {
        chantShowImportPreview(pages);
      } else {
        chantApplyImportedText(`${pages[0].title}\n${pages[0].content}`);
      }
    } else {
      const text = await chantParseDocx(file);
      chantApplyImportedText(text);
    }
  } catch (e) {
    if (typeof toastError === 'function') toastError(`解析失败：${e && e.message ? e.message : '请检查文件或网络后重试'}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label || '📄 导入 Word / PDF 自动识别'; }
    input.value = '';
  }
}

// ===== 多页 PDF 拆分预览 / 批量入库 =====
function chantImportPreviewHtml() {
  if (!chantImportDrafts.length) return '';
  const selected = chantImportDrafts.filter(d => d.selected).length;
  return `
    <div class="chant-import-preview">
      <div class="chant-import-preview-head">
        <div class="chant-import-preview-title">📚 逐页拆分确认</div>
        <div class="chant-import-preview-sub">共识别出 <b>${chantImportDrafts.length}</b> 首歌曲，每页对应 1 首 · 已选 <b>${selected}</b> 首</div>
      </div>
      <div class="chant-import-album">
        <div class="chant-import-album-label">💿 专辑 Tag（批量统一归类，可新建）</div>
        ${chantAlbumTagPickerHtml('batch', '')}
      </div>
      <div class="chant-import-preview-list">
        ${chantImportDrafts.map((draft, idx) => `
          <label class="chant-import-draft ${draft.selected ? 'is-selected' : ''}">
            <input type="checkbox" class="chant-import-draft-check" ${draft.selected ? 'checked' : ''}
              onchange="toggleChantImportDraft(${idx}, this.checked)" />
            <span class="chant-import-draft-page">P${draft.pageNo}</span>
            <input type="text" class="chant-import-draft-title" maxlength="60" value="${travelEsc(draft.title)}"
              placeholder="第 ${draft.pageNo} 页曲名"
              oninput="updateChantImportDraftTitle(${idx}, this.value)" />
            <span class="chant-import-draft-meta">${draft.content.split('\n').length} 行 · ${draft.content.length} 字</span>
          </label>`).join('')}
      </div>
      <div class="chant-import-preview-actions">
        <button type="button" class="chant-action-btn is-primary" id="chant-batch-btn" onclick="submitChantBatchImport()">✅ 批量导入全部歌曲</button>
        <button type="button" class="chant-action-btn" onclick="clearChantImportDrafts()">✕ 取消拆分</button>
      </div>
    </div>`;
}

function chantShowImportPreview(pages) {
  chantImportDrafts = (pages || []).map(page => ({
    pageNo: Number(page.pageNo || 0),
    title: String(page.title || '').trim(),
    content: String(page.content || '').trim(),
    selected: true
  }));
  if (chantState.editorId === null) chantState.editorId = '';
  renderChantPage();
  const editor = document.getElementById('chant-editor-view');
  if (editor && typeof editor.scrollIntoView === 'function') {
    try { editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
  }
  if (typeof showToast === 'function') showToast(`已按页拆分出 ${chantImportDrafts.length} 首歌曲，请核对后批量导入`);
}

function updateChantImportDraftTitle(index, value) {
  const draft = chantImportDrafts[index];
  if (!draft) return;
  draft.title = String(value || '');
}

function toggleChantImportDraft(index, checked) {
  const draft = chantImportDrafts[index];
  if (!draft) return;
  draft.selected = Boolean(checked);
  const row = document.querySelectorAll('.chant-import-draft')[index];
  if (row) row.classList.toggle('is-selected', draft.selected);
  const sub = document.querySelector('.chant-import-preview-sub');
  if (sub) {
    const selected = chantImportDrafts.filter(d => d.selected).length;
    sub.innerHTML = `共识别出 <b>${chantImportDrafts.length}</b> 首歌曲，每页对应 1 首 · 已选 <b>${selected}</b> 首`;
  }
}

function clearChantImportDrafts() {
  chantImportDrafts = [];
  renderChantPage();
}

async function chantBatchCreateOne(draft, category, album) {
  const payload = {
    title: String(draft.title || '').trim().slice(0, 60),
    category,
    album: String(album || '').trim().slice(0, 80),
    video_url: '',
    content: String(draft.content || '').trim()
  };
  const remote = await chantAdminWrite('createChant', '', payload);
  if (!remote.ok) return { ok: false, error: remote.error };

  const rows = Array.isArray(remote.data) ? remote.data : (remote.data ? [remote.data] : []);
  const saved = rows.length ? normalizeChantRecord(rows[0]) : null;
  if (!saved || !saved.id) return { ok: false, error: '云端未返回新建记录，请刷新后核对' };

  const idx = chantRemoteSongs.findIndex(s => s.id === saved.id);
  if (idx >= 0) chantRemoteSongs[idx] = saved;
  else chantRemoteSongs.push(saved);
  return { ok: true, remote: true, record: saved };
}

async function submitChantBatchImport() {
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('管理员状态已失效，请重新解锁');
    return;
  }
  if (!chantResolveAdminKey(true)) {
    if (typeof toastError === 'function') toastError('未填写管理员密码，无法写入云端');
    return;
  }
  const categoryEl = document.querySelector('input[name="chant-category"]:checked');
  const category = categoryEl ? String(categoryEl.value || '') : '';
  const albumEl = document.getElementById('chant-batch-album');
  const album = String(albumEl ? albumEl.value : '').trim();
  if (!CHANT_CATEGORIES.includes(category)) {
    if (typeof toastError === 'function') toastError('请先选择分类归属');
    return;
  }
  const drafts = chantImportDrafts.filter(d => d.selected);
  if (!drafts.length) {
    if (typeof toastError === 'function') toastError('请至少勾选一首歌曲');
    return;
  }
  const invalid = drafts.find(d => !String(d.title || '').trim() || !String(d.content || '').trim());
  if (invalid) {
    if (typeof toastError === 'function') toastError(`第 ${invalid.pageNo} 页缺少歌名或正文，请补充后再导入`);
    return;
  }
  const btn = document.getElementById('chant-batch-btn');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在批量入库…'; }

  let remoteCount = 0;
  const failures = [];
  const failedDrafts = [];
  try {
    for (const draft of drafts) {
      const saved = await chantBatchCreateOne(draft, category, album);
      if (saved.ok) remoteCount += 1;
      else {
        failedDrafts.push(draft);
        failures.push(`第 ${draft.pageNo} 页《${draft.title}》：${saved.error || '云端写入失败'}`);
      }
    }
    chantImportDrafts = failedDrafts;
    chantState.editorId = null;
    chantState.activeId = '';
    renderChantPage();
    if (failures.length) {
      if (typeof toastError === 'function') {
        toastError(`已入库 ${remoteCount} 首，失败 ${failures.length} 首：${failures[0]}`, 8000);
      }
    } else if (typeof showToast === 'function') {
      showToast(`✅ 已批量导入 ${remoteCount} 首歌曲到 Supabase 云端`);
    }
  } catch (e) {
    if (typeof toastError === 'function') toastError(`批量导入失败：${e && e.message ? e.message : '请稍后重试'}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label || '✅ 批量导入全部歌曲'; }
  }
}

// ===== 专辑 Tag 选择器（编辑表单 / 多页 PDF 批量预览共用）=====
function chantAlbumChipHtml(tag, selected, scope) {
  return `<button type="button" class="chant-album-chip ${selected ? 'is-active' : ''}" data-album-tag="${travelEsc(tag)}" onclick="chantSelectAlbumTag('${scope}', this.dataset.albumTag)">💿 ${travelEsc(tag)}</button>`;
}

function chantAlbumTagPickerHtml(scope, selected) {
  const tags = getAvailableAlbumTags();
  const value = String(selected || '');
  const hiddenId = scope === 'batch' ? 'chant-batch-album' : 'chant-form-album';
  return `
    <div class="chant-album-tags" id="chant-album-tags-${scope}">
      ${tags.map(tag => chantAlbumChipHtml(tag, tag === value, scope)).join('')}
      <button type="button" class="chant-album-add" onclick="toggleChantAlbumCreate('${scope}')">+ 新建专辑Tag</button>
    </div>
    <div class="chant-album-create hidden" id="chant-album-create-${scope}">
      <input type="text" class="chant-album-create-input" id="chant-new-album-input-${scope}" maxlength="80"
        placeholder="输入新专辑 Tag" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmChantAlbumTag('${scope}');}" />
      <button type="button" class="chant-album-create-confirm" onclick="confirmChantAlbumTag('${scope}')">确认</button>
      <button type="button" class="chant-album-create-cancel" onclick="toggleChantAlbumCreate('${scope}', false)">取消</button>
    </div>
    <input type="hidden" id="${hiddenId}" value="${travelEsc(value)}" />`;
}

function chantSelectAlbumTag(scope, tag) {
  const hidden = document.getElementById(scope === 'batch' ? 'chant-batch-album' : 'chant-form-album');
  if (!hidden) return;
  const value = String(tag || '').trim();
  const next = hidden.value === value ? '' : value;
  hidden.value = next;
  const wrap = document.getElementById(`chant-album-tags-${scope}`);
  if (!wrap) return;
  wrap.querySelectorAll('[data-album-tag]').forEach(chip => {
    chip.classList.toggle('is-active', chip.dataset.albumTag === next);
  });
}

function toggleChantAlbumCreate(scope, force) {
  const row = document.getElementById(`chant-album-create-${scope}`);
  if (!row) return;
  const show = typeof force === 'boolean' ? force : row.classList.contains('hidden');
  row.classList.toggle('hidden', !show);
  if (show) {
    const input = document.getElementById(`chant-new-album-input-${scope}`);
    if (input) setTimeout(() => input.focus(), 20);
  }
}

function confirmChantAlbumTag(scope) {
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再新建专辑 Tag');
    return;
  }
  const input = document.getElementById(`chant-new-album-input-${scope}`);
  const tag = String(input ? input.value : '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!tag) {
    if (typeof toastError === 'function') toastError('请输入专辑 Tag 名称');
    if (input) input.focus();
    return;
  }
  saveChantAlbumTag(tag);
  const wrap = document.getElementById(`chant-album-tags-${scope}`);
  if (wrap) {
    const exists = Array.from(wrap.querySelectorAll('[data-album-tag]')).some(chip => chip.dataset.albumTag === tag);
    if (!exists) {
      const add = wrap.querySelector('.chant-album-add');
      if (add) add.insertAdjacentHTML('beforebegin', chantAlbumChipHtml(tag, false, scope));
    }
  }
  chantSelectAlbumTag(scope, tag);
  if (input) input.value = '';
  toggleChantAlbumCreate(scope, false);
  if (typeof showToast === 'function') showToast(`已新建并选中专辑 Tag「${tag}」`);
}

// ===== 新增 / 编辑表单 =====
function renderChantEditor(songId) {
  const box = document.getElementById('chant-editor-view');
  if (!box) return;
  const isEdit = Boolean(songId);
  const song = isEdit ? getChantSong(songId) : null;
  if (isEdit && !song) {
    box.innerHTML = `<div class="chant-empty">这首应援词可能已被删除，请返回列表刷新。</div>`;
    return;
  }
  const category = song ? song.category : CHANT_CATEGORIES[0];
  box.innerHTML = `${chantImportPreviewHtml()}
    <form class="chant-editor-card" onsubmit="event.preventDefault(); submitChantEditor();">
      <div class="chant-detail-head">
        <button type="button" class="chant-back-btn" onclick="closeChantEditor()">← 返回列表</button>
        <span class="chant-detail-tip">${isEdit ? '✏️ 编辑应援词' : '+ 新增应援词'}</span>
      </div>
      <div class="chant-import-row">
        <button type="button" class="chant-import-btn" id="chant-import-btn" onclick="document.getElementById('chant-import-file').click()">📄 导入 Word / PDF 自动识别</button>
        <input type="file" id="chant-import-file" class="chant-import-file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onchange="handleChantImportFile(this)" />
        <span class="chant-import-tip">自动提取文字与加粗应援句，可再手动微调</span>
      </div>
      <div class="chant-form-row">
        <label class="chant-form-label" for="chant-form-title">歌曲名称 <span class="chant-req">*</span></label>
        <input id="chant-form-title" class="chant-form-input" type="text" maxlength="60" required
          placeholder="如：九天狂龙" value="${song ? travelEsc(song.title) : ''}" />
      </div>
      <div class="chant-form-row">
        <span class="chant-form-label">分类归属 <span class="chant-req">*</span></span>
        <div class="chant-form-radios">
          ${CHANT_CATEGORIES.map(cat => `<label class="chant-radio">
            <input type="radio" name="chant-category" value="${cat}" ${cat === category ? 'checked' : ''} />
            <span>${cat}</span>
          </label>`).join('')}
        </div>
      </div>
      <div class="chant-form-row">
        <span class="chant-form-label">所属专辑 Tag</span>
        ${chantAlbumTagPickerHtml('editor', song ? song.album : '')}
      </div>
      <div class="chant-form-row">
        <label class="chant-form-label" for="chant-form-video">官方应援视频链接</label>
        <input id="chant-form-video" class="chant-form-input" type="url" maxlength="400"
          placeholder="选填，粘贴 B站 / 微博 / 小红书 / 抖音 视频链接" value="${song ? travelEsc(song.video) : ''}" />
      </div>
      <div class="chant-form-row">
        <label class="chant-form-label" for="chant-form-content">应援词正文 <span class="chant-req">*</span>
          <span class="chant-form-tip">用中括号 [ONER! ONER!] 或【岳岳!】括起来的词会套用团红渐变；岳岳 / 木子洋 / 灵超自动点亮成员专属应援色</span>
        </label>
        <textarea id="chant-form-content" class="chant-form-textarea" rows="9" required
          placeholder="示例：黑夜降临 [ONER! ONER!] 冲破迷雾 [岳岳! 木子洋! 灵超!]">${song ? travelEsc(song.content) : ''}</textarea>
      </div>
      <div class="chant-form-actions">
        <button type="submit" class="chant-action-btn is-primary">💾 保存应援词</button>
        <button type="button" class="chant-action-btn" onclick="closeChantEditor()">取消</button>
      </div>
    </form>
  `;
}

function openChantEditor(songId) {
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再编辑应援词');
    return;
  }
  chantState.editorId = songId ? String(songId) : '';
  chantState.activeId = '';
  chantImportDrafts = [];
  renderChantPage();
}

function closeChantEditor() {
  chantState.editorId = null;
  chantImportDrafts = [];
  renderChantPage();
}

async function submitChantEditor() {
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('管理员状态已失效，请重新解锁');
    return;
  }
  const titleEl = document.getElementById('chant-form-title');
  const albumEl = document.getElementById('chant-form-album');
  const videoEl = document.getElementById('chant-form-video');
  const contentEl = document.getElementById('chant-form-content');
  const categoryEl = document.querySelector('input[name="chant-category"]:checked');
  const title = String(titleEl ? titleEl.value : '').trim();
  const content = String(contentEl ? contentEl.value : '').trim();
  const category = categoryEl ? String(categoryEl.value || '') : '';
  const album = String(albumEl ? albumEl.value : '').trim();
  const video = String(videoEl ? videoEl.value : '').trim();
  if (!title) {
    if (typeof toastError === 'function') toastError('请填写歌曲名称');
    if (titleEl) titleEl.focus();
    return;
  }
  if (!CHANT_CATEGORIES.includes(category)) {
    if (typeof toastError === 'function') toastError('请选择分类归属');
    return;
  }
  if (!content) {
    if (typeof toastError === 'function') toastError('请填写应援词正文');
    if (contentEl) contentEl.focus();
    return;
  }
  if (video && !/^https?:\/\//i.test(video)) {
    if (typeof toastError === 'function') toastError('视频链接需以 http:// 或 https:// 开头');
    return;
  }

  const isEdit = Boolean(chantState.editorId);
  const originalId = isEdit ? String(chantState.editorId) : '';
  const isRemoteEdit = isEdit && chantIsUuid(originalId);
  const payload = { title, category, album, video_url: video, content };

  const remote = await chantAdminWrite(isRemoteEdit ? 'updateChant' : 'createChant', originalId, payload);
  if (!remote.ok) {
    if (typeof toastError === 'function') toastError(`保存失败：${remote.error || '云端写入失败'}`, 7000);
    return;
  }

  const rows = Array.isArray(remote.data) ? remote.data : (remote.data ? [remote.data] : []);
  const saved = rows.length ? normalizeChantRecord(rows[0]) : null;
  let finalId = saved && saved.id ? saved.id : originalId;
  if (saved && saved.id) {
    const idx = chantRemoteSongs.findIndex(s => s.id === saved.id);
    if (idx >= 0) chantRemoteSongs[idx] = saved;
    else chantRemoteSongs.push(saved);
  }

  const store = readChantLocalStore();
  if (originalId) {
    store.created = store.created.filter(r => String(r.id) !== originalId);
    delete store.overrides[originalId];
  }
  store.deleted = store.deleted.filter(x => x !== originalId && x !== finalId);
  writeChantLocalStore(store);

  if (typeof showToast === 'function') showToast(isRemoteEdit ? '应援词已更新到云端' : '应援词已新增到云端');
  chantState.editorId = null;
  chantState.activeId = finalId;
  chantImportDrafts = [];
  if (!saved || !saved.id) await loadChantSongs(true);
  renderChantPage();
}

async function deleteChantSong(songId) {
  const id = String(songId || '');
  if (!id) return;
  if (!chantIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再删除应援词');
    return;
  }
  const song = getChantSong(id);
  const name = song ? song.title : '';
  if (!confirm(`确认彻底删除「${name || '这首'}」的应援词？删除后无法恢复。`)) return;

  if (!chantIsUuid(id)) {
    const store = readChantLocalStore();
    store.created = store.created.filter(r => String(r.id) !== id);
    delete store.overrides[id];
    writeChantLocalStore(store);
    chantState.activeId = '';
    chantState.editorId = null;
    renderChantPage();
    if (typeof showToast === 'function') showToast(`已删除本机草稿「${name}」（该记录从未上云）`);
    return;
  }

  const remote = await chantAdminWrite('deleteChant', id, {});
  if (!remote.ok) {
    if (typeof toastError === 'function') toastError(`删除失败：${remote.error || '云端写入失败'}`, 7000);
    return;
  }

  const store = readChantLocalStore();
  store.created = store.created.filter(r => String(r.id) !== id);
  delete store.overrides[id];
  store.deleted = store.deleted.filter(x => x !== id);
  writeChantLocalStore(store);
  chantRemoteSongs = chantRemoteSongs.filter(s => s.id !== id);

  const ratings = getChantRatingMap();
  if (ratings[id]) {
    delete ratings[id];
    saveChantRatingMap(ratings);
  }
  delete chantRatingStats[id];
  chantState.activeId = '';
  chantState.editorId = null;
  renderChantPage();
  if (typeof showToast === 'function') showToast(`已从云端彻底删除「${name}」`);
}

// ===== 复制 / 长图 / PDF =====
function chantPlainText(song) {
  if (!song) return '';
  const head = `📣 ${song.title} · ${chantAlbumMetaText(song)}`;
  const body = song.lines.map(line => {
    const prefix = line.singer ? `${line.singer}: ` : '';
    return prefix + (line.text || line.segments.map(s => s.text).join(''));
  }).join('\n');
  return `${head}\n\n${body}\n\nONERLAND · ONER时光典藏纪念册`;
}

function copyChantLyrics(songId) {
  const song = getChantSong(songId);
  if (!song) return;
  const text = chantPlainText(song);
  const done = () => { if (typeof showToast === 'function') showToast('已复制本首应援词'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyChant(text, done));
  } else {
    fallbackCopyChant(text, done);
  }
}

function fallbackCopyChant(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok && typeof done === 'function') done();
    else if (typeof toastError === 'function') toastError('复制失败，请手动选择文字复制');
  } catch (e) {
    if (typeof toastError === 'function') toastError('复制失败，请手动选择文字复制');
  }
}

// 按字符折行，保留每段的应援高亮标记
function chantWrapSegments(ctx, segments, maxWidth, fontFor) {
  const lines = [];
  let current = [];
  let currentWidth = 0;
  const pushLine = () => {
    if (current.length) lines.push(current);
    current = [];
    currentWidth = 0;
  };
  segments.forEach(seg => {
    if (typeof fontFor === 'function') ctx.font = fontFor(seg);
    const chars = Array.from(String(seg.text || ''));
    let buffer = '';
    const flush = () => {
      if (buffer) {
        current.push({ text: buffer, chant: !!seg.chant, type: seg.type || (seg.chant ? 'chant' : 'normal') });
        buffer = '';
      }
    };
    chars.forEach(ch => {
      const w = ctx.measureText(ch).width;
      if (currentWidth + w > maxWidth && (buffer || current.length)) {
        flush();
        pushLine();
      }
      buffer += ch;
      currentWidth += w;
    });
    flush();
  });
  pushLine();
  return lines.length ? lines : [[{ text: '', chant: false, type: 'normal' }]];
}

function chantRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildChantLongImage(song) {
  if (!song) return '';
  const dpr = Math.max(2, Math.min(3, Math.round((window.devicePixelRatio || 1) * 1.5)));
  const W = 900;
  const padX = 64;
  const innerW = W - padX * 2;
  const measure = document.createElement('canvas').getContext('2d');

  const titleFont = '700 44px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const metaFont = '400 24px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const bodyFont = '450 32px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const bodyBoldFont = '700 32px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const singerFont = '700 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const legendFont = '500 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const fontFor = seg => ((seg && (seg.chant || /^member_/.test(String(seg.type || '')))) ? bodyBoldFont : bodyFont);
  const singerColor = type => {
    const key = String(type || '').replace('member_', '');
    return CHANT_COLOR_TOKENS[key] || CHANT_COLOR_TOKENS.groupGradient[1];
  };

  measure.font = bodyFont;
  const blocks = song.lines.map(line => ({
    chant: !!line.chant,
    singer: String(line.singer || ''),
    singerType: String(line.singerType || ''),
    wrapped: chantWrapSegments(measure, Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant, type: line.chant ? 'chant' : 'normal' }], innerW - 10, fontFor)
  }));

  const headTop = 92;
  const metaY = headTop + 66;
  const legendY = metaY + 54;
  const bodyStart = legendY + 56;
  const bodyLineH = 54;
  const singerH = 34;
  let cursor = bodyStart;
  blocks.forEach(b => {
    if (b.singer) cursor += 16 + singerH + 10;
    cursor += b.wrapped.length * bodyLineH;
    cursor += b.chant ? 24 : 18;
  });
  const footY = cursor + 24;
  const H = Math.round(footY + 78);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdfdfb');
  bg.addColorStop(0.55, '#f7f7f4');
  bg.addColorStop(1, '#eef0f3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#c0392b';
  ctx.fillRect(padX, headTop - 34, 64, 6);

  ctx.fillStyle = '#1f2937';
  ctx.font = titleFont;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(song.title, padX, headTop + 20);

  ctx.fillStyle = '#6b7280';
  ctx.font = metaFont;
  ctx.fillText(chantAlbumMetaText(song), padX, metaY);

  const legendGrad = ctx.createLinearGradient(padX, 0, padX + 92, 0);
  legendGrad.addColorStop(0, CHANT_COLOR_TOKENS.groupGradient[0]);
  legendGrad.addColorStop(1, CHANT_COLOR_TOKENS.groupGradient[1]);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = legendGrad;
  chantRoundRect(ctx, padX, legendY - 18, 92, 30, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = CHANT_COLOR_TOKENS.groupGradient[1];
  ctx.font = legendFont;
  ctx.fillText('应援词', padX + 14, legendY + 4);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('高亮部分为粉丝应援词', padX + 108, legendY + 4);

  ctx.font = bodyFont;
  let y = bodyStart;
  blocks.forEach(b => {
    if (b.singer) {
      y += 16;
      const color = singerColor(b.singerType);
      ctx.font = singerFont;
      const tagW = Math.min(innerW, ctx.measureText(b.singer).width + 28);
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = color;
      chantRoundRect(ctx, padX, y, tagW, singerH, singerH / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(b.singer, padX + 14, y + 23);
      y += singerH + 10;
    }
    b.wrapped.forEach(runs => {
      let x = padX;
      let lineW = 0;
      runs.forEach(run => {
        const member = /^member_(yueyue|muziyang|lingchao)$/.test(String(run.type || ''));
        ctx.font = (run.chant || member) ? bodyBoldFont : bodyFont;
        lineW += ctx.measureText(run.text).width;
      });
      const baseline = y + Math.round(bodyLineH * 0.72);
      if (b.chant && lineW > 0) {
        ctx.fillStyle = 'rgba(221, 5, 20, 0.08)';
        chantRoundRect(ctx, padX - 5, y + 3, Math.min(innerW + 10, lineW + 10), bodyLineH - 6, 8);
        ctx.fill();
      }
      runs.forEach(run => {
        const member = /^member_(yueyue|muziyang|lingchao)$/.test(String(run.type || ''));
        ctx.font = (run.chant || member) ? bodyBoldFont : bodyFont;
        const runW = ctx.measureText(run.text).width;
        if (member) {
          const key = String(run.type).replace('member_', '');
          ctx.fillStyle = CHANT_COLOR_TOKENS[key] || '#1e293b';
        } else if (run.chant) {
          const g = ctx.createLinearGradient(x, 0, x + Math.max(runW, 1), 0);
          g.addColorStop(0, CHANT_COLOR_TOKENS.groupGradient[0]);
          g.addColorStop(1, CHANT_COLOR_TOKENS.groupGradient[1]);
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = '#1e293b';
        }
        ctx.fillText(run.text, x, baseline);
        x += runW;
      });
      y += bodyLineH;
    });
    y += b.chant ? 24 : 18;
  });

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, footY - 8);
  ctx.lineTo(W - padX, footY - 8);
  ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = '400 20px "PingFang SC", "Hiragino Sans GB", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ONERLAND · ONER时光典藏纪念册', W / 2, footY + 30);
  ctx.textAlign = 'left';

  try {
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function chantDataUrlToFile(dataUrl, fileName) {
  try {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(parts[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  } catch (e) {
    return null;
  }
}

function saveChantLongImage(songId) {
  const song = getChantSong(songId);
  if (!song) return;
  const dataUrl = buildChantLongImage(song);
  if (!dataUrl) {
    if (typeof toastError === 'function') toastError('长图生成失败，请刷新页面后重试');
    return;
  }
  window.__chantImageDataUrl = dataUrl;
  window.__chantImageName = `ONERLAND-应援词-${song.title}-${Date.now()}.png`;
  openChantImageModal(dataUrl, song);
}

function openChantImageModal(dataUrl, song) {
  document.getElementById('chant-image-modal')?.remove();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canShareFiles = typeof navigator.canShare === 'function' && typeof File === 'function';
  const modal = document.createElement('div');
  modal.id = 'chant-image-modal';
  modal.className = 'ticket-save-overlay chant-image-overlay';
  modal.innerHTML = `
    <div class="ticket-save-card chant-image-card" role="dialog" aria-modal="true" aria-label="应援词长图已生成">
      <button type="button" class="ticket-save-close" aria-label="关闭" onclick="closeChantImageModal()">✕</button>
      <div class="ticket-save-title">🖼️ 应援词长图已生成 · ${travelEsc(song ? song.title : '')}</div>
      <div class="ticket-save-imgbox chant-image-box">
        <img src="${dataUrl}" alt="ONERLAND 应援词长图" style="width:100%;display:block;border-radius:14px;-webkit-touch-callout:default" />
      </div>
      <p class="ticket-save-hint">📱 长按图片即可保存到相册${isIOS ? '（Safari：长按后选「存储到“照片”」）' : '；桌面端可右键「将图像存储为…」'}</p>
      <div class="ticket-save-actions">
        ${canShareFiles ? `<button type="button" class="ticket-save-share" onclick="shareChantImage()">📤 系统分享 / 存图</button>` : `<button type="button" class="ticket-save-share" onclick="downloadChantImage()">⬇️ 下载长图</button>`}
        <button type="button" class="ticket-save-done" onclick="closeChantImageModal()">完成</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', ev => { if (ev.target === modal) closeChantImageModal(); });
  document.body.appendChild(modal);
}

function closeChantImageModal() {
  const el = document.getElementById('chant-image-modal');
  if (!el) return;
  el.classList.add('is-hiding');
  setTimeout(() => el.remove(), 200);
}

function downloadChantImage() {
  const dataUrl = window.__chantImageDataUrl;
  if (!dataUrl) return;
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = window.__chantImageName || `ONERLAND-应援词-${Date.now()}.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    if (typeof toastError === 'function') toastError('下载失败，请长按图片保存');
  }
}

async function shareChantImage() {
  const dataUrl = window.__chantImageDataUrl;
  if (!dataUrl) return;
  const file = chantDataUrlToFile(dataUrl, window.__chantImageName || `ONERLAND-应援词-${Date.now()}.png`);
  if (!file || typeof navigator.share !== 'function') {
    downloadChantImage();
    if (typeof showToast === 'function') showToast('当前浏览器不支持直接分享，已尝试下载长图');
    return;
  }
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      downloadChantImage();
      return;
    }
    await navigator.share({ files: [file], title: 'ONERLAND 应援词长图' });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    downloadChantImage();
    if (typeof toastError === 'function') toastError('分享未完成，已尝试下载长图');
  }
}

// ===== PDF =====
function chantPrintLineHtml(line) {
  const segs = Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant, type: line.chant ? 'chant' : 'normal' }];
  let inner = '';
  let opened = false;
  segs.forEach(seg => {
    if (seg.chant && !opened) { inner += '<span class="chant-print-hl">'; opened = true; }
    else if (!seg.chant && opened) { inner += '</span>'; opened = false; }
    const type = String(seg.type || '');
    if (/^member_(yueyue|muziyang|lingchao)$/.test(type)) {
      inner += `<span class="chant-print-member chant-print-member-${type.replace('member_', '')}">${travelEsc(seg.text)}</span>`;
    } else {
      inner += travelEsc(seg.text);
    }
  });
  if (opened) inner += '</span>';
  const singer = line.singer
    ? `<p class="chant-print-singer"><span class="chant-singer-tag ${chantSingerClass(line.singerType)}">${travelEsc(line.singer)}</span></p>`
    : '';
  const hasBody = segs.some(seg => String(seg && seg.text || '').trim());
  if (!hasBody) return singer;
  const body = `<span class="chant-print-body">${inner}</span>`;
  return singer + (line.chant
    ? `<p class="chant-print-line is-chant"><span class="chant-print-mark">应援</span>${body}</p>`
    : `<p class="chant-print-line">${body}</p>`);
}

function buildChantPrintRoot(song) {
  const root = document.createElement('div');
  root.id = 'chant-print-root';
  root.className = 'chant-print-root';
  root.innerHTML = `
    <div class="chant-print-head">
      <div class="chant-print-brand">ONERLAND · 应援词典</div>
      <h1 class="chant-print-title">${travelEsc(song.title)}</h1>
      <p class="chant-print-meta">${travelEsc(chantAlbumMetaText(song))}</p>
    </div>
    <div class="chant-print-legend"><span class="chant-print-swatch"></span> 高亮部分为粉丝应援词</div>
    <div class="chant-print-lines">${song.lines.map(chantPrintLineHtml).join('')}</div>
    <div class="chant-print-foot">ONERLAND · ONER时光典藏纪念册 · 本页仅供线下应援学习使用</div>
  `;
  return root;
}

function cleanupChantPrint() {
  document.body.classList.remove('chant-printing');
  document.body.style.overflow = '';
  document.getElementById('chant-print-root')?.remove();
  window.removeEventListener('afterprint', cleanupChantPrint);
}

function exportChantPdf(songId) {
  const song = getChantSong(songId);
  if (!song) return;
  cleanupChantPrint();
  const modal = document.getElementById('chant-image-modal');
  if (modal) modal.classList.add('is-hiding');
  const root = buildChantPrintRoot(song);
  document.body.appendChild(root);
  document.body.classList.add('chant-printing');
  window.addEventListener('afterprint', cleanupChantPrint);
  if (typeof showToast === 'function') {
    showToast('已打开打印面板：桌面选「另存为 PDF」，iOS 双指放大后存储到「文件」');
  }
  setTimeout(() => {
    try {
      window.print();
    } catch (e) {
      if (typeof toastError === 'function') toastError('当前浏览器不支持直接打印，请换用系统浏览器');
      cleanupChantPrint();
      return;
    }
    setTimeout(cleanupChantPrint, 60000);
  }, 120);
}

// ===== 居中毛玻璃浮窗：把同一份应援词典区块搬进浮窗，关闭后原样归还 =====
function ensureChantModal() {
  let modal = document.getElementById('chant-dict-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'chant-dict-modal';
  modal.className = 'travel-modal chant-dict-modal hidden';
  modal.innerHTML = `
    <div class="travel-shell chant-dict-shell" role="dialog" aria-modal="true" aria-label="应援词典">
      <div class="travel-head">
        <div class="travel-title-wrap">
          <div class="travel-title">📣 应援词典</div>
          <div class="travel-sub">进场前速查 · 应援口令与跟喊节奏</div>
        </div>
        <button type="button" class="travel-close" data-chant-close aria-label="关闭">✕</button>
      </div>
      <div class="travel-body chant-dict-body" id="chant-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-chant-close]')) closeChantDictModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    if (document.getElementById('chant-image-modal')) return;
    closeChantDictModal();
  }, true);
  return modal;
}

function openChantDictModal() {
  const modal = ensureChantModal();
  const body = modal.querySelector('#chant-modal-body');
  const page = document.getElementById('view-chant-page');
  if (body && page) {
    body.appendChild(page);
    page.classList.remove('hidden');
  }
  modal.classList.remove('hidden');
  document.body.classList.add('travel-modal-open');
  chantState.activeId = '';
  chantState.editorId = null;
  renderChantPage();
  if (!chantLoadPromise) loadChantSongs();
  setTimeout(() => {
    const scroller = modal.querySelector('.chant-dict-body');
    if (scroller) scroller.scrollTop = 0;
  }, 30);
}

function closeChantDictModal() {
  const modal = document.getElementById('chant-dict-modal');
  const page = document.getElementById('view-chant-page');
  const home = document.getElementById('chant-page-home');
  if (page && home) {
    home.appendChild(page);
    page.classList.add('hidden');
  }
  chantState.activeId = '';
  chantState.editorId = null;
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('travel-modal-open');
}

window.renderChantPage = renderChantPage;
window.setChantFilter = setChantFilter;
window.openChantSong = openChantSong;
window.closeChantDetail = closeChantDetail;
window.toggleChantRating = toggleChantRating;
window.copyChantLyrics = copyChantLyrics;
window.saveChantLongImage = saveChantLongImage;
window.openChantImageModal = openChantImageModal;
window.closeChantImageModal = closeChantImageModal;
window.shareChantImage = shareChantImage;
window.downloadChantImage = downloadChantImage;
window.exportChantPdf = exportChantPdf;
window.getChantRatingMap = getChantRatingMap;
window.getChantRating = getChantRating;
window.loadChantRatingStats = loadChantRatingStats;
window.openChantDictModal = openChantDictModal;
window.closeChantDictModal = closeChantDictModal;
window.openChantEditor = openChantEditor;
window.closeChantEditor = closeChantEditor;
window.submitChantEditor = submitChantEditor;
window.deleteChantSong = deleteChantSong;
window.getChantSongs = getChantSongs;
window.loadChantSongs = loadChantSongs;
window.syncLocalChantsToCloud = syncLocalChantsToCloud;
window.parseChantContent = parseChantContent;
window.parseChantTokens = parseChantContent;
window.handleChantImportFile = handleChantImportFile;
window.submitChantBatchImport = submitChantBatchImport;
window.updateChantImportDraftTitle = updateChantImportDraftTitle;
window.toggleChantImportDraft = toggleChantImportDraft;
window.clearChantImportDrafts = clearChantImportDrafts;
window.CHANT_COLOR_TOKENS = CHANT_COLOR_TOKENS;

loadChantSongs();
loadChantRatingStats();
