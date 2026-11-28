/* ================= 📣 应援词典：云端 / 本机应援词库 + 1～5 星难度评价 + 长图 / PDF 导出 =================
   规范：
   1) 曲目来自 Supabase fan_chants（匿名只读）；未建表 / 离线时降级到本机 localStorage，管理员仍可增删改；
   2) 应援词正文用 [..] / 【..】 标记，渲染、长图、PDF 统一高亮；
   3) 1～5 星难度评价只存本机 localStorage，匿名、无需登录，再次点击同一星级即取消；
   4) 长图走纯 Canvas 2D（devicePixelRatio ≥ 2），不引用任何跨域图片；
   5) PDF 走原生 window.print() + 专用打印排版，无第三方库。 */

const CHANT_TABLE = 'fan_chants';
const CHANT_LOCAL_KEY = 'onerland_fan_chants_v1';
const CHANT_RATING_KEY = 'onerland_chant_ratings';
const CHANT_RATING_TABLE = 'fan_chant_ratings';
const CHANT_CATEGORIES = ['ONER团歌', '岳岳', '木子洋', '灵超'];

// 1～5 星应援难度评价
const CHANT_STAR_LEVELS = [
  { stars: 1, label: '★ 1星', desc: '超好跟喊' },
  { stars: 2, label: '★★ 2星', desc: '轻松上手' },
  { stars: 3, label: '★★★ 3星', desc: '中等节奏' },
  { stars: 4, label: '★★★★ 4星', desc: '高能密集' },
  { stars: 5, label: '★★★★★ 5星', desc: '地狱级手速/口速' }
];

let chantRatingStats = {};
let chantRatingStatsPromise = null;

const chantState = {
  filter: 'all',
  activeId: '',
  editorId: null,
  loading: false,
  error: ''
};

let chantRemoteSongs = [];
let chantLoadedFromRemote = false;
let chantLoadPromise = null;

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
    const lineText = String(raw || '').trim();
    if (!lineText) return;
    const segments = [];
    const re = /\[([^\]]+)\]|【([^】]+)】/g;
    let last = 0;
    let m;
    while ((m = re.exec(lineText))) {
      if (m.index > last) {
        const plain = lineText.slice(last, m.index);
        if (plain) segments.push({ text: plain, chant: false });
      }
      const marked = m[1] || m[2] || '';
      if (marked) segments.push({ text: marked, chant: true });
      last = m.index + m[0].length;
    }
    if (last < lineText.length) {
      const tail = lineText.slice(last);
      if (tail) segments.push({ text: tail, chant: false });
    }
    if (!segments.length) segments.push({ text: lineText, chant: false });
    lines.push({
      segments,
      chant: segments.some(s => s.chant),
      text: segments.map(s => (s.chant ? `【${s.text}】` : s.text)).join('')
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
  if (line && Array.isArray(line.segments)) {
    const segments = line.segments
      .map(s => ({ text: String(s && s.text || ''), chant: !!(s && s.chant) }))
      .filter(s => s.text);
    if (!segments.length) segments.push({ text: '', chant: false });
    return { segments, chant: segments.some(s => s.chant), text: chantLinePlain({ segments }) };
  }
  const plain = chantLinePlain(line);
  const forced = !!(line && line.chant);
  const segments = forced ? [{ text: plain, chant: true }] : [{ text: plain, chant: false }];
  return { segments, chant: forced, text: plain };
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

function chantNewId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

async function fetchChantRemoteSongs() {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return { ok: false, rows: [] };
  if (typeof fetch !== 'function') return { ok: false, rows: [] };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
  try {
    const fields = 'id,title,category,album,video_url,content,created_at';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${CHANT_TABLE}?select=${fields}&order=created_at.asc`, {
      headers: chantRestHeaders(),
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return { ok: false, rows: [] };
    const rows = await res.json();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { ok: false, rows: [] };
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
    if (!remote.ok) chantState.error = '云端应援词库暂不可用，已切换为本机数据';
    renderChantPage();
    return getChantSongs();
  })();
  return chantLoadPromise;
}

// ===== 云端写入：统一走 /api/admin（service_role + 管理员校验）=====
function chantAdminHeaders() {
  if (typeof getAdminRequestHeaders === 'function') return getAdminRequestHeaders();
  return { 'Content-Type': 'application/json' };
}

async function chantAdminWrite(action, id, payload) {
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: chantAdminHeaders(),
      body: JSON.stringify({ action, id, payload })
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, error: (data && (data.error || data.detail)) || `HTTP ${res.status}` };
    }
    return { ok: true, data: data.data || null };
  } catch (e) {
    return { ok: false, error: e.message || '网络异常' };
  }
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

// 全站匿名聚合：优先 Supabase fan_chant_ratings，未建表 / 离线时静默跳过
async function loadChantRatingStats(force) {
  if (chantRatingStatsPromise && !force) return chantRatingStatsPromise;
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || typeof fetch !== 'function') return null;
  chantRatingStatsPromise = (async () => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${CHANT_RATING_TABLE}?select=chant_id,rating`, {
        headers: chantRestHeaders(),
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return null;
      const rows = await res.json();
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const id = String(row && row.chant_id || '');
        const rating = Number(row && row.rating);
        if (!id || rating < 1 || rating > 5) return;
        const cur = map[id] || { sum: 0, count: 0 };
        cur.sum += rating;
        cur.count += 1;
        map[id] = cur;
      });
      Object.keys(map).forEach(id => {
        chantRatingStats[id] = { avg: map[id].sum / map[id].count, count: map[id].count };
      });
      renderChantPage();
      return chantRatingStats;
    } catch (e) {
      if (timer) clearTimeout(timer);
      return null;
    }
  })();
  return chantRatingStatsPromise;
}

// 打分写入：匿名尽力同步，失败完全不影响本机体验
async function submitChantRatingRemote(songId, stars) {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || typeof fetch !== 'function') return;
  const visitor = typeof getDeviceId === 'function' ? String(getDeviceId() || '') : '';
  const headers = { ...chantRestHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  try {
    if (stars) {
      await fetch(`${SUPABASE_URL}/rest/v1/${CHANT_RATING_TABLE}?on_conflict=chant_id,visitor_id`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chant_id: String(songId), rating: Number(stars), visitor_id: visitor || 'anonymous' })
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/${CHANT_RATING_TABLE}?chant_id=eq.${encodeURIComponent(String(songId))}&visitor_id=eq.${encodeURIComponent(visitor || 'anonymous')}`, {
        method: 'DELETE',
        headers: chantRestHeaders()
      });
    }
    setTimeout(() => loadChantRatingStats(true), 400);
  } catch (e) { /* 静默兜底 */ }
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
  box.innerHTML = `
    <span class="chant-filter-label">我的难度</span>
    ${options.map(opt => `<button type="button" class="chant-filter-chip ${chantState.filter === opt.key ? 'is-active' : ''}" data-chant-filter="${opt.key}" onclick="setChantFilter('${opt.key}')">${travelEsc(opt.label)}<span class="chant-filter-count">${opt.count}</span></button>`).join('')}
  `;
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
          <span class="chant-song-meta">${travelEsc(song.album || song.category)} · ${travelEsc(song.category)}</span>
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
  return `<div class="chant-admin-toolbar">
    <button type="button" class="chant-add-btn" onclick="openChantEditor()">+ 新增应援词</button>
    <span class="chant-admin-hint">🔓 管理员已解锁 · 可直接增删改</span>
  </div>`;
}

function renderChantPage() {
  const listView = document.getElementById('chant-list-view');
  const detailView = document.getElementById('chant-detail-view');
  const editorView = document.getElementById('chant-editor-view');
  if (!listView || !detailView) return;

  const toolbar = document.getElementById('chant-admin-toolbar');
  if (toolbar) toolbar.innerHTML = chantToolbarHtml();

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

function chantLineHtml(line) {
  const segs = Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant }];
  const inner = segs.map(seg => (seg.chant
    ? `<mark class="chant-hl">${travelEsc(seg.text)}</mark>`
    : travelEsc(seg.text))).join('');
  return line.chant
    ? `<p class="chant-line is-chant"><span class="chant-line-mark">应援</span>${inner}</p>`
    : `<p class="chant-line">${inner}</p>`;
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
      <p class="chant-detail-meta">${travelEsc(song.album || song.category)} · ${travelEsc(song.category)}</p>
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
  box.innerHTML = `
    <form class="chant-editor-card" onsubmit="event.preventDefault(); submitChantEditor();">
      <div class="chant-detail-head">
        <button type="button" class="chant-back-btn" onclick="closeChantEditor()">← 返回列表</button>
        <span class="chant-detail-tip">${isEdit ? '✏️ 编辑应援词' : '+ 新增应援词'}</span>
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
        <label class="chant-form-label" for="chant-form-album">所属专辑 / 备注</label>
        <input id="chant-form-album" class="chant-form-input" type="text" maxlength="80"
          placeholder="选填，如：ONER · 收录曲" value="${song ? travelEsc(song.album) : ''}" />
      </div>
      <div class="chant-form-row">
        <label class="chant-form-label" for="chant-form-video">官方应援视频链接</label>
        <input id="chant-form-video" class="chant-form-input" type="url" maxlength="400"
          placeholder="选填，粘贴 B站 / 微博 / 小红书 / 抖音 视频链接" value="${song ? travelEsc(song.video) : ''}" />
      </div>
      <div class="chant-form-row">
        <label class="chant-form-label" for="chant-form-content">应援词正文 <span class="chant-req">*</span>
          <span class="chant-form-tip">用中括号 [ONER! ONER!] 或【岳岳!】括起来的词会自动高亮为应援词</span>
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
  renderChantPage();
}

function closeChantEditor() {
  chantState.editorId = null;
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
  const id = isEdit ? chantState.editorId : chantNewId();
  const payload = { title, category, album, video_url: video, content };
  const record = normalizeChantRecord({ id, ...payload });

  const remote = await chantAdminWrite(isEdit ? 'updateChant' : 'createChant', id, payload);
  const store = readChantLocalStore();
  let finalId = id;
  if (remote.ok) {
    const rows = Array.isArray(remote.data) ? remote.data : (remote.data ? [remote.data] : []);
    const saved = rows.length ? normalizeChantRecord(rows[0]) : record;
    if (saved.id) finalId = saved.id;
    const idx = chantRemoteSongs.findIndex(s => s.id === id);
    if (idx >= 0) chantRemoteSongs[idx] = saved;
    else chantRemoteSongs.push(saved);
    store.created = store.created.filter(r => String(r.id) !== id);
    delete store.overrides[id];
    store.deleted = store.deleted.filter(x => x !== id);
    writeChantLocalStore(store);
    if (typeof showToast === 'function') showToast(isEdit ? '应援词已更新' : '应援词已新增');
  } else {
    const idx = store.created.findIndex(r => String(r.id) === id);
    if (idx >= 0) store.created[idx] = { ...record };
    else if (isEdit) store.overrides[id] = { ...record };
    else store.created.push({ ...record });
    writeChantLocalStore(store);
    if (typeof showToast === 'function') showToast('已保存到本机（云端应援词表未就绪时自动降级）');
  }
  chantState.editorId = null;
  chantState.activeId = finalId;
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

  const remote = await chantAdminWrite('deleteChant', id, {});
  const store = readChantLocalStore();
  store.created = store.created.filter(r => String(r.id) !== id);
  delete store.overrides[id];
  if (!store.deleted.includes(id)) store.deleted.push(id);
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
  if (remote.ok) {
    if (typeof showToast === 'function') showToast(`已彻底删除「${name}」`);
  } else if (typeof showToast === 'function') {
    showToast(`已从本机彻底删除「${name}」（云端同步失败）`);
  }
}

// ===== 复制 / 长图 / PDF =====
function chantPlainText(song) {
  if (!song) return '';
  const head = `📣 ${song.title} · ${song.album || song.category} · ${song.category}`;
  const body = song.lines.map(line => line.text || line.segments.map(s => s.text).join('')).join('\n');
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
function chantWrapSegments(ctx, segments, maxWidth) {
  const lines = [];
  let current = [];
  let currentWidth = 0;
  const pushLine = () => {
    if (current.length) lines.push(current);
    current = [];
    currentWidth = 0;
  };
  segments.forEach(seg => {
    const chars = Array.from(String(seg.text || ''));
    let buffer = '';
    const flush = () => {
      if (buffer) {
        current.push({ text: buffer, chant: !!seg.chant });
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
  return lines.length ? lines : [[{ text: '', chant: false }]];
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
  const bodyFont = '400 28px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const legendFont = '500 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  measure.font = bodyFont;
  const blocks = song.lines.map(line => ({
    chant: !!line.chant,
    wrapped: chantWrapSegments(measure, Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant }], innerW - 28)
  }));

  const headTop = 92;
  const metaY = headTop + 66;
  const legendY = metaY + 54;
  const bodyStart = legendY + 56;
  const bodyLineH = 48;
  let cursor = bodyStart;
  blocks.forEach(b => {
    cursor += b.chant ? 16 : 0;
    cursor += b.wrapped.length * bodyLineH;
    cursor += 16;
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
  ctx.fillText(`${song.album || song.category} · ${song.category}`, padX, metaY);

  ctx.fillStyle = 'rgba(214, 122, 60, 0.22)';
  chantRoundRect(ctx, padX, legendY - 18, 92, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#9a3b1f';
  ctx.font = legendFont;
  ctx.fillText('应援词', padX + 14, legendY + 4);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('高亮部分为粉丝应援词', padX + 108, legendY + 4);

  ctx.font = bodyFont;
  let y = bodyStart + bodyLineH - 12;
  blocks.forEach(b => {
    if (b.chant) {
      const blockH = b.wrapped.length * bodyLineH + 8;
      ctx.fillStyle = 'rgba(224, 122, 63, 0.14)';
      chantRoundRect(ctx, padX - 14, y - bodyLineH + 4, innerW + 28, blockH, 12);
      ctx.fill();
    }
    b.wrapped.forEach(runs => {
      let x = padX;
      runs.forEach(run => {
        const runW = ctx.measureText(run.text).width;
        if (run.chant && run.text) {
          ctx.fillStyle = 'rgba(224, 122, 63, 0.3)';
          chantRoundRect(ctx, x - 3, y - bodyLineH + 10, runW + 6, bodyLineH - 8, 6);
          ctx.fill();
          ctx.fillStyle = '#9a3412';
        } else {
          ctx.fillStyle = '#374151';
        }
        ctx.fillText(run.text, x, y);
        x += runW;
      });
      y += bodyLineH;
    });
    y += b.chant ? 28 : 16;
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
  const segs = Array.isArray(line.segments) ? line.segments : [{ text: chantLinePlain(line), chant: !!line.chant }];
  const inner = segs.map(seg => (seg.chant
    ? `<span class="chant-print-hl">${travelEsc(seg.text)}</span>`
    : travelEsc(seg.text))).join('');
  return line.chant ? `<p class="chant-print-line is-chant">${inner}</p>` : `<p class="chant-print-line">${inner}</p>`;
}

function buildChantPrintRoot(song) {
  const root = document.createElement('div');
  root.id = 'chant-print-root';
  root.className = 'chant-print-root';
  root.innerHTML = `
    <div class="chant-print-head">
      <div class="chant-print-brand">ONERLAND · 应援词典</div>
      <h1 class="chant-print-title">${travelEsc(song.title)}</h1>
      <p class="chant-print-meta">${travelEsc(song.album || song.category)} · ${travelEsc(song.category)}</p>
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
window.parseChantContent = parseChantContent;

loadChantSongs();
loadChantRatingStats();
