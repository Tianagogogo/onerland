let isAdmin = localStorage.getItem('onerland_admin_pin') === ADMIN_PIN;
let activeMainTab = 'shows';
let editingTicketId = null;
let isArchiveExpanded = false;
let cloudTickets = [];
let cloudArchives = [];
let cloudFeeds = [];
let activeArchiveType = 'ALL';
let batchParsedItems = [];
let cpScheduleImgs = [];
let arcScheduleImgs = [];
let cpViewImgs = [];
let arcViewImgs = [];
let artistsConfig = loadArtistsConfig();
let activeArtistId = 'ALL';
let activeAccountId = 'ALL';
let allPosts = [];
let tourSchedules = [];
const popoverCloseTimers = {};

function loadArtistsConfig() {
  const saved = localStorage.getItem(STORAGE_ARTISTS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return JSON.parse(JSON.stringify(DEFAULT_ARTISTS));
}

function saveArtistsConfig() {
  localStorage.setItem(STORAGE_ARTISTS_KEY, JSON.stringify(artistsConfig));
}

function getLocalDatetimeString(dateObj = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

function switchMainTab(tab) {
  activeMainTab = tab;
  const showsPage = document.getElementById('view-shows-page');
  const feedsPage = document.getElementById('view-feeds-page');
  const tabShowsBtn = document.getElementById('nav-tab-shows');
  const tabFeedsBtn = document.getElementById('nav-tab-feeds');

  if (tab === 'shows') {
    showsPage.classList.remove('hidden');
    feedsPage.classList.add('hidden');
    tabShowsBtn.className = 'px-3 py-1 rounded-full obsidian-btn font-semibold transition';
    tabFeedsBtn.className = 'px-3 py-1 rounded-full text-slate-600 hover:text-slate-900 font-medium transition';
  } else {
    showsPage.classList.add('hidden');
    feedsPage.classList.remove('hidden');
    tabFeedsBtn.className = 'px-3 py-1 rounded-full obsidian-btn font-semibold transition';
    tabShowsBtn.className = 'px-3 py-1 rounded-full text-slate-600 hover:text-slate-900 font-medium transition';
    renderFeedsSectionOnly();
  }
}

function refreshCurrentTab() {
  if (activeMainTab === 'shows') loadTourData();
  else loadAllFeeds(true);
}

function toggleArtistMenu(e) {
  e.stopPropagation();
  document.getElementById('artist-dropdown-menu').classList.toggle('hidden');
}

document.addEventListener('click', () => {
  const menu = document.getElementById('artist-dropdown-menu');
  if (menu && !menu.classList.contains('hidden')) menu.classList.add('hidden');
});

function selectArtist(id) {
  activeArtistId = id;
  activeAccountId = 'ALL';
  isArchiveExpanded = false;
  document.getElementById('artist-dropdown-menu').classList.add('hidden');
  syncArtistDropdownUI();
  renderTourCards();
  renderArchiveTimeline();
  renderFeedsSectionOnly();
}

function selectAccount(id) {
  activeAccountId = id;
  renderFeedsSectionOnly();
}

function syncAdminUI() {
  const panel = document.getElementById('admin-publisher-panel');
  const btn = document.getElementById('admin-unlock-btn');
  if (isAdmin) {
    panel.classList.remove('hidden');
    btn.classList.add('hidden');
    updateAiKeyStatusUI();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('hidden');
  }
  renderTourCards();
  renderArchiveTimeline();
  renderTimeline();
}

function toggleAdminMode() {
  const pin = prompt('请输入管理员暗码以开启发布与编辑权限：');
  if (pin === ADMIN_PIN) {
    isAdmin = true;
    localStorage.setItem('onerland_admin_pin', ADMIN_PIN);
    syncAdminUI();
  } else if (pin !== null) {
    alert('暗码错误，当前保持访客只读模式。');
  }
}

function lockAdminMode() {
  isAdmin = false;
  localStorage.removeItem('onerland_admin_pin');
  syncAdminUI();
}

function updateAiKeyStatusUI() {
  const hasKey = !!localStorage.getItem(GEMINI_KEY_STORAGE);
  const el = document.getElementById('ai-key-status');
  if (el) {
    el.textContent = hasKey ? '已启用 AI 多模态识图' : '未配置(点此配置)';
    el.className = hasKey ? 'text-emerald-700 font-bold' : '';
  }
}

function configGeminiKey() {
  const current = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  const input = prompt('请输入免费的 Google AI Studio (Gemini) API Key，开启高精度海报与多场次排期表识图（留空确定可清除）：', current);
  if (input === null) return;
  if (input.trim()) {
    localStorage.setItem(GEMINI_KEY_STORAGE, input.trim());
    alert('AI 识图密钥已保存！');
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
  updateAiKeyStatusUI();
}

function openLightbox(src, caption = '') {
  if (!src) return;
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption;
  document.getElementById('image-lightbox').classList.remove('hidden');
}

function extractThemeName(fullTitle, savedTheme = '') {
  if (savedTheme) return savedTheme;
  const m = (fullTitle || '').match(/([「《][^」》]+[」》]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华)?)/);
  return m ? m[1].trim() : '';
}

async function loadTourData() {
  cloudTickets = [];
  cloudArchives = [];
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=*&order=ticket_time.asc`, { headers: SB_HEADERS });
    if (sbRes.ok) {
      const rows = await sbRes.json();
      rows.forEach(r => {
        try {
          const rawTitle = r.title || '';
          const rawTime = r.ticket_time || '';
          const rawPlat = r.platform || '';

          if (rawTitle.startsWith('ARCHIVE|')) {
            const parts = rawTitle.split('|');
            const artist = parts[1] || 'ONER';
            const showTitle = parts[2] || '演出回顾';
            const showDate = parts[3] || rawTime.slice(0, 10);
            let arcData = { subType: 'tour', theme: '', venue: '', posterUrl: '', prices: '', seatUrl: '', slot: '', scheduleImgs: [], viewImgs: [], setlist: [] };
            if (rawPlat.startsWith('ARCHIVE:')) {
              try { arcData = { ...arcData, ...JSON.parse(rawPlat.slice(8)) }; } catch (e) {}
            }
            cloudArchives.push({
              cloudId: r.id,
              artist,
              title: showTitle,
              theme: extractThemeName(showTitle, arcData.theme),
              showDate,
              year: showDate.slice(0, 4),
              url: r.url || '',
              ...arcData
            });
            return;
          }

          const parts = rawTitle.split('|');
          const artist = parts.length > 1 ? parts[0] : 'ONER';
          const cityTitle = parts.length > 1 ? parts[1] : rawTitle;
          const venue = parts.length > 2 ? parts[2] : '场馆待补充';
          const showDate = parts.length > 3 ? parts[3] : rawTime.replace('T', ' ');
          let slotNote = parts.length > 4 ? parts[4] : '';

          let parsedRounds = [];
          let savedTransport = '';
          let savedTheme = '';
          let savedPrices = '';
          let savedStartTime = '';
          let savedPosterUrl = '';
          let savedSeatUrl = '';
          let savedStageType = 'auto';
          let savedScheduleImgs = [];
          let savedViewImgs = [];

          if (rawPlat.startsWith('META:')) {
            try {
              const meta = JSON.parse(rawPlat.slice(5));
              if (Array.isArray(meta.rounds)) parsedRounds = meta.rounds;
              if (meta.transport) savedTransport = meta.transport;
              if (meta.slot) slotNote = meta.slot;
              if (meta.theme) savedTheme = meta.theme;
              if (meta.prices) savedPrices = meta.prices;
              if (meta.startTime) savedStartTime = meta.startTime;
              if (meta.posterUrl) savedPosterUrl = meta.posterUrl;
              if (meta.seatUrl) savedSeatUrl = meta.seatUrl;
              if (meta.stageType) savedStageType = meta.stageType;
              if (Array.isArray(meta.scheduleImgs)) savedScheduleImgs = meta.scheduleImgs;
              if (Array.isArray(meta.viewImgs)) savedViewImgs = meta.viewImgs;
            } catch (e) {}
          } else if (rawPlat.startsWith('ROUNDS:')) {
            try { parsedRounds = JSON.parse(rawPlat.slice(7)); } catch (e) {}
          }

          if (!Array.isArray(parsedRounds) || parsedRounds.length === 0) {
            if (rawPlat && !rawPlat.startsWith('META:')) {
              parsedRounds = [{ round_name: '正式开票', sale_time: rawTime.replace('T', ' '), platform: rawPlat || '大麦' }];
            }
          }

          if (!savedTransport) savedTransport = findPresetTransport(`${cityTitle} ${venue}`);

          cloudTickets.push({
            cloudId: r.id,
            artist,
            city: cityTitle,
            theme: extractThemeName(cityTitle, savedTheme),
            venue,
            show_date: showDate,
            startTime: savedStartTime,
            slot: slotNote,
            prices: savedPrices,
            posterUrl: savedPosterUrl,
            seatUrl: savedSeatUrl,
            stageType: savedStageType,
            scheduleImgs: savedScheduleImgs,
            viewImgs: savedViewImgs,
            source_url: r.url || '#',
            rounds: parsedRounds,
            transport: savedTransport
          });
        } catch (rowErr) {}
      });
    }
  } catch (e) {}

  cloudArchives.sort((a, b) => new Date(b.showDate) - new Date(a.showDate));
  updateArchiveYearOptions();
  tourSchedules = [...cloudTickets];
  renderThemeQuickBar();
  renderTourCards();
  renderArchiveTimeline();
}

async function loadAllFeeds(force = false) {
  let serverPosts = [];
  cloudFeeds = [];
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/feeds?select=*&order=created_at.desc&limit=80`, { headers: SB_HEADERS });
    if (sbRes.ok) {
      const rows = await sbRes.json();
      cloudFeeds = rows.map(r => {
        const meta = ARTIST_META_MAP[r.artist] || { artistId: 'oner', color: COLOR_ONER };
        const matchedArtistObj = artistsConfig.find(a => a.artistName === r.artist);
        const matchedAcc = matchedArtistObj?.accounts.find(acc => acc.name === r.platform);
        const rawContent = r.content || '';
        const pubMatch = rawContent.match(/\[PUB:(\d+)\]/);
        const strippedBody = rawContent
          .replace(/\n?\[IMG:https?:\/\/[^\]]+\]/g, '')
          .replace(/\n?\[PUB:\d+\]/g, '')
          .trim();
        const cleanBody = cleanSocialPostText(strippedBody);
        const realTimestamp = pubMatch ? Number(pubMatch[1]) : new Date(r.created_at).getTime();

        return {
          cloudId: r.id,
          artistId: matchedArtistObj?.artistId || meta.artistId,
          artistName: r.artist,
          accountId: matchedAcc?.id || `${meta.artistId}_cloud`,
          platformName: r.platform,
          platformColor: matchedArtistObj?.badgeStyle || meta.color,
          text: cleanBody,
          link: r.url || '#',
          timestamp: realTimestamp
        };
      });
      serverPosts.push(...cloudFeeds);
      document.getElementById('last-sync').textContent = '社媒已同步 · ' + new Date().toLocaleTimeString();
    }
  } catch (e) {}

  try {
    const res = await fetch('./feeds_data.json?t=' + Date.now());
    if (res.ok) {
      const payload = await res.json();
      if (Array.isArray(payload.posts)) {
        serverPosts.push(...payload.posts.map(p => ({ ...p, text: cleanSocialPostText(p.text || '') })));
      }
    }
  } catch (e) {}

  allPosts = serverPosts.sort((a, b) => b.timestamp - a.timestamp);
  renderFeedsSectionOnly();
}

async function deleteCloudRecord(table, id) {
  if (!isAdmin) return;
  if (!confirm('确定从所有设备删除这条记录吗？')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
  if (table === 'tickets') await loadTourData();
  else await loadAllFeeds(true);
}
