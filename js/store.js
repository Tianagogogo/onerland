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
    firstMeetDate: '',
    fanNickname: '',
    customEvents: []
  },
  fanPref: {
    biasType: 'group',
    biasMembers: [],
    customTags: [],
    autoFilterShows: false
  }
};

window.AppState = AppState;

// 编辑权限：授权邮箱登录态与管理员密码解锁态互相独立，满足任意一种即可。
function canEditContent() {
  return Boolean(AppState.isAdmin || AppState.isAdminPasswordVerified);
}
window.canEditContent = canEditContent;

window.ARTIST_COLORS = window.ARTIST_COLORS || {
  'ONER': { id: 'ONER', bg: '#1e293b' },
  '岳岳': { id: 'YUEYUE', bg: '#b91c1c' },
  '木子洋': { id: 'MUZIYANG', bg: '#0369a1' },
  '灵超': { id: 'LINGCHAO', bg: '#6d28d9' },
  '坤音娱乐': { id: 'QINS', bg: '#334155' }
};

if (typeof window.updateAuthButtonUI !== 'function') {
  window.updateAuthButtonUI = function updateAuthButtonUI() {
    const btn = document.getElementById('auth-btn') || document.querySelector('[data-auth-btn]');
    if (!btn) return;
    btn.textContent = AppState.isAdmin ? '已登录' : '登录';
  };
}

// SB_HEADERS 统一由 js/config.js 提供（config.js 先于 store.js 加载），此处不再重复声明

// ================= 图片压缩工具 =================
function compressImageToDataURL(file, maxWidth = 800, quality = 0.72) {
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
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
async function loadTourData() {
  if (typeof window.updateAuthButtonUI === 'function') {
    window.updateAuthButtonUI();
  }

  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) {
    if (typeof renderThemeQuickBar === 'function') renderThemeQuickBar();
    if (typeof renderTourCards === 'function') renderTourCards();
    if (typeof updateArchiveYearOptions === 'function') updateArchiveYearOptions();
    if (typeof renderArchiveTimeline === 'function') renderArchiveTimeline();
    if (typeof renderUpcomingMiniTimeline === 'function') renderUpcomingMiniTimeline();
    if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
    return;
  }

  try {
    const list = await fetchTicketRows();

    const tickets = [];
    const archives = [];

    for (const row of list) {
      const rawTitle = row.title || '';
      const rawPlat = row.platform || '';

      // 单条脏数据不能让整页演出消失：逐行隔离解析异常。
      try {
      if (rawTitle.startsWith('ARCHIVE|')) {
        const parts = rawTitle.split('|');
        const artist = parts[1] || 'ONER';
        const title = parts[2] || '往日场次';
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
          prices: meta.prices || '',
          seatUrl: meta.seatUrl || '',
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
        const artist = parts[0] || 'ONER';
        const city = parts[1] || rawTitle || '待定场次';
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

    AppState.cloudTickets = tickets;
    AppState.cloudArchives = archives;
    AppState.showLoadError = '';
  } catch (err) {
    // 请求失败/响应被截断时保留上一次成功的数据，避免整页演出“凭空消失”。
    AppState.showLoadError = (err && err.message) || '网络请求失败';
    console.error('loadTourData failed:', err);
  }

  if (typeof renderThemeQuickBar === 'function') renderThemeQuickBar();
  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof updateArchiveYearOptions === 'function') updateArchiveYearOptions();
  if (typeof renderArchiveTimeline === 'function') renderArchiveTimeline();
  if (typeof renderUpcomingMiniTimeline === 'function') renderUpcomingMiniTimeline();
  if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (typeof renderAdminTodoQueue === 'function') renderAdminTodoQueue();
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
  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof renderLocalFanPrefBox === 'function') renderLocalFanPrefBox();
}

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

// ================= 同场搭子本地记录读写与删除 =================
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
  list.unshift({ id: Date.now(), ...entry });
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

// ================= 2. 脱敏票根核验状态（有票根核验才允许发布客观体验评分） =================
const VERIFIED_TICKETS_KEY = 'onerland_verified_ticket_shows_v1';

function getVerifiedTicketMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(VERIFIED_TICKETS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function isShowTicketVerified(showKey) {
  const map = getVerifiedTicketMap();
  return Boolean(map[showKey]?.verified);
}

function saveDesensitizedTicketProof(showKey, areaLabel, cloudInfo) {
  const map = getVerifiedTicketMap();
  map[showKey] = {
    verified: true,
    area: (areaLabel || '已脱敏核验').trim(),
    verifiedAt: new Date().toLocaleDateString(),
    ...(cloudInfo || {})
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
    throw new Error('未完成本场次票根核验，无法公开发布体验评分');
  }
  const key = normalizeVenueKey(venueName);
  if (!key) return;
  const all = JSON.parse(localStorage.getItem(VENUE_EXP_STORAGE_KEY) || '{}');
  const list = Array.isArray(all[key]) ? all[key] : [];

  list.unshift({
    id: Date.now(),
    venue: key,
    showKey,
    verified: true,
    queueTime: objectiveScores.queueTime,
    bagCheck: objectiveScores.bagCheck,
    storageType: objectiveScores.storageType,
    acLevel: objectiveScores.acLevel,
    seatSpacing: objectiveScores.seatSpacing,
    viewQuality: objectiveScores.viewQuality,
    showExperience: objectiveScores.showExperience,
    createdAt: new Date().toLocaleDateString()
  });

  all[key] = list;
  localStorage.setItem(VENUE_EXP_STORAGE_KEY, JSON.stringify(all));
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
