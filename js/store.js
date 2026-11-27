// ================= 全局状态与常量 =================
const AppState = {
  activeArtistId: 'ALL',
  activeAccountId: 'ALL',
  activeArchiveType: 'ALL',
  isArchiveExpanded: false,
  editingTicketId: null,
  editingKind: null,
  isAdmin: false,
  pendingExternalUrl: null,
  cloudTickets: [],
  cloudArchives: [],
  cloudFeeds: [],
  allPosts: [],
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

// ================= 动态/足迹加载占位（暂无云端数据时作为兜底） =================
async function loadAllFeeds() {
  // 当前版本动态模块为纯本地/静态展示，云端动态接口未启用
  // 如有本地 feeds_data.json 数据，可在此解析并写入 AppState.allPosts
  if (typeof renderTimeline === 'function') renderTimeline();
  if (typeof renderFeedBriefCard === 'function') renderFeedBriefCard();
}

// ================= AI Key 状态（暂无对应 UI，先提供空实现避免启动报错） =================
function updateAiKeyStatusUI() {
  const badge = document.getElementById('ai-key-status');
  if (!badge) return;
  const key = localStorage.getItem(GEMINI_KEY_STORAGE);
  badge.textContent = key ? 'AI 已配置' : '未配置';
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=*&order=id.desc`, {
      headers: SB_HEADERS
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];

    const tickets = [];
    const archives = [];

    for (const row of list) {
      const rawTitle = row.title || '';
      const rawPlat = row.platform || '';

      if (rawTitle.startsWith('ARCHIVE|')) {
        const parts = rawTitle.split('|');
        const artist = parts[1] || 'ONER';
        const title = parts[2] || '往日场次';
        const showDate = parts[3] || (row.ticket_time || '').slice(0, 10) || '';
        let meta = {};
        if (rawPlat.startsWith('ARCHIVE:')) {
          try { meta = JSON.parse(rawPlat.slice(8)); } catch (e) { meta = {}; }
        }
        archives.push({
          cloudId: row.id,
          artist,
          title,
          showDate,
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
          theme: meta.theme || '',
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
        if (!rounds.length && row.ticket_time) {
          rounds.push({
            round_name: '开票时间',
            sale_time: row.ticket_time.replace('T', ' '),
            platform: rawPlat.startsWith('META:') ? '大麦' : (rawPlat || '大麦')
          });
        }

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
          theme: meta.theme || '',
          url: row.url || '#',
          source_url: row.url || '#'
        });
      }
    }

    AppState.cloudTickets = tickets;
    AppState.cloudArchives = archives;
  } catch (err) {
    console.warn('loadTourData fallback:', err);
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

function saveDesensitizedTicketProof(showKey, areaLabel) {
  const map = getVerifiedTicketMap();
  map[showKey] = {
    verified: true,
    area: (areaLabel || '已脱敏核验').trim(),
    verifiedAt: new Date().toLocaleDateString()
  };
  localStorage.setItem(VERIFIED_TICKETS_KEY, JSON.stringify(map));
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
