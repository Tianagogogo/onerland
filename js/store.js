const AppState = {
  isAdmin: localStorage.getItem('onerland_admin_pin') === ADMIN_PIN,
  activeTab: 'home', // 'home' | 'shows' | 'footprint' | 'feeds'
  activeArtistId: 'ALL',
  activeAccountId: 'ALL',
  activeArchiveType: 'ALL',
  isArchiveExpanded: false,
  editingTicketId: null,
  cloudTickets: [],
  cloudArchives: [],
  allPosts: [],
  artistsConfig: JSON.parse(localStorage.getItem(LOCAL_KEYS.ARTISTS) || 'null') || DEFAULT_ARTISTS,
  // 纯本地隐私状态（绝不上传云端）
  fanPref: JSON.parse(localStorage.getItem(LOCAL_KEYS.FAN_PREF) || 'null') || {
    biasType: 'group', // 'group' | 'solo' | 'cp'
    biasMembers: ['ONER'],
    autoFilterShows: false,
    silentMatchNote: ''
  },
  footprints: JSON.parse(localStorage.getItem(LOCAL_KEYS.FOOTPRINTS) || '[]'),
  anniversary: JSON.parse(localStorage.getItem(LOCAL_KEYS.ANNIVERSARY) || 'null') || {
    firstMeetDate: '2018-08-30',
    fanNickname: '万能人',
    customEvents: [
      { title: 'ONER 出道纪念日', date: '08-30' },
      { title: '岳岳生日', date: '07-11' },
      { title: '木子洋生日', date: '04-21' },
      { title: '灵超生日', date: '01-09' }
    ]
  },
  pendingExternalUrl: ''
};

function saveLocalState(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// 4页主导航切换（浏览态与管理态彻底分离）
function switchMainTab(tab) {
  AppState.activeTab = tab;
  const tabs = ['home', 'shows', 'footprint', 'feeds'];
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}-page`);
    if (view) view.classList.toggle('hidden', t !== tab);

    ['top-tab-', 'bottom-tab-'].forEach(prefix => {
      const btn = document.getElementById(`${prefix}${t}`);
      if (!btn) return;
      if (t === tab) {
        btn.classList.add('obsidian-btn', 'text-white', 'font-semibold');
        btn.classList.remove('text-slate-600');
      } else {
        btn.classList.remove('obsidian-btn', 'text-white', 'font-semibold');
        btn.classList.add('text-slate-600');
      }
    });
  });

  if (tab === 'home') renderHomeDashboard();
  if (tab === 'shows') { renderThemeQuickBar(); renderTourCards(); renderArchiveTimeline(); }
  if (tab === 'footprint') renderFootprintPage();
  if (tab === 'feeds') renderFeedsSectionOnly();
}

// 演出名称前缀正则自动归类专题（解决同系列自动聚合）
function extractSeriesPrefix(fullTitle, savedTheme = '') {
  if (savedTheme) return savedTheme.trim();
  const str = (fullTitle || '').trim();
  const bracketMatch = str.match(/^([「《【\[][^」》】\]]+[」》】\]]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华|见面会|音乐会)?)/);
  if (bracketMatch) return bracketMatch[1].trim();
  const dashMatch = str.match(/^([^·\-—|]+?)\s*[·\-—|]\s*.+站$/);
  if (dashMatch && dashMatch[1].length >= 2) return dashMatch[1].trim();
  return '';
}

function cleanSocialPostText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[?(?:图片|视频|微博视频|查看图片|网页链接|直播|超话)\]?/g, '')
    .replace(/复制打开抖音[\s\S]*|小红书App[\s\S]*|长按复制此条消息[\s\S]*/g, '')
    .trim();
}

// 统一加载演出库数据
async function loadTourData() {
  AppState.cloudTickets = [];
  AppState.cloudArchives = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=*&order=ticket_time.asc`, { headers: SB_HEADERS });
    if (res.ok) {
      const rows = await res.json();
      rows.forEach(r => {
        const rawTitle = r.title || '';
        const rawTime = r.ticket_time || '';
        const rawPlat = r.platform || '';

        if (rawTitle.startsWith('ARCHIVE|')) {
          const [, artist = 'ONER', showTitle = '演出回顾', showDate = rawTime.slice(0, 10)] = rawTitle.split('|');
          let arcData = { subType: 'tour', theme: '', venue: '', posterUrl: '', prices: '', seatUrl: '', slot: '', scheduleImgs: [], viewImgs: [], setlist: [] };
          if (rawPlat.startsWith('ARCHIVE:')) {
            try { arcData = { ...arcData, ...JSON.parse(rawPlat.slice(8)) }; } catch (e) {}
          }
          AppState.cloudArchives.push({
            cloudId: r.id, artist, title: showTitle,
            theme: extractSeriesPrefix(showTitle, arcData.theme),
            showDate, year: showDate.slice(0, 4), url: r.url || '', ...arcData
          });
          return;
        }

        const parts = rawTitle.split('|');
        const artist = parts.length > 1 ? parts[0] : 'ONER';
        const cityTitle = parts.length > 1 ? parts[1] : rawTitle;
        const venue = parts.length > 2 ? parts[2] : '场馆待补充';
        const showDate = parts.length > 3 ? parts[3] : rawTime.slice(0, 10);
        let slotNote = parts.length > 4 ? parts[4] : '';
        let meta = { rounds: [], transport: '', theme: '', prices: '', startTime: '', posterUrl: '', seatUrl: '', scheduleImgs: [], viewImgs: [] };

        if (rawPlat.startsWith('META:')) {
          try { meta = { ...meta, ...JSON.parse(rawPlat.slice(5)) }; } catch (e) {}
        } else if (rawPlat) {
          meta.rounds = [{ round_name: '正式开票', sale_time: rawTime.replace('T', ' '), platform: rawPlat }];
        }

        AppState.cloudTickets.push({
          cloudId: r.id, artist, city: cityTitle,
          theme: extractSeriesPrefix(cityTitle, meta.theme),
          venue, show_date: showDate, startTime: meta.startTime || '',
          slot: meta.slot || slotNote, prices: meta.prices || '',
          posterUrl: meta.posterUrl || '', seatUrl: meta.seatUrl || '',
          scheduleImgs: meta.scheduleImgs || [], viewImgs: meta.viewImgs || [],
          source_url: r.url || '#', rounds: meta.rounds || [],
          transport: meta.transport || findPresetTransport(`${cityTitle} ${venue}`)
        });
      });
    }
  } catch (e) {
    console.warn('演出数据离线或加载异常，将优先展示本地缓存', e);
  }

  AppState.cloudArchives.sort((a, b) => new Date(b.showDate) - new Date(a.showDate));
  if (typeof updateArchiveYearOptions === 'function') updateArchiveYearOptions();
  renderHomeDashboard();
  if (AppState.activeTab === 'shows') {
    renderThemeQuickBar(); renderTourCards(); renderArchiveTimeline();
  }
}

// 统一加载社媒动态（支持手动置顶公告标签 [PIN]）
async function loadAllFeeds() {
  let posts = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feeds?select=*&order=created_at.desc&limit=80`, { headers: SB_HEADERS });
    if (res.ok) {
      const rows = await res.json();
      rows.forEach(r => {
        const meta = ARTIST_COLORS[r.artist] || ARTIST_COLORS['ONER'];
        const raw = r.content || '';
        const isPinned = raw.includes('[PIN]');
        const pubMatch = raw.match(/\[PUB:(\d+)\]/);
        const body = cleanSocialPostText(raw.replace(/\[PIN\]/g, '').replace(/\n?\[IMG:[^\]]+\]/g, '').replace(/\n?\[PUB:\d+\]/g, ''));
        posts.push({
          cloudId: r.id,
          artistId: meta.id,
          artistName: r.artist,
          platformName: r.platform || '微博',
          platformColor: meta.bg,
          text: body,
          isPinned,
          link: r.url || '#',
          timestamp: pubMatch ? Number(pubMatch[1]) : new Date(r.created_at).getTime()
        });
      });
    }
  } catch (e) {}

  try {
    const staticRes = await fetch('./feeds_data.json?t=' + Date.now());
    if (staticRes.ok) {
      const payload = await staticRes.json();
      if (Array.isArray(payload.posts)) {
        posts.push(...payload.posts.map(p => ({ ...p, isPinned: false, text: cleanSocialPostText(p.text || '') })));
      }
    }
  } catch (e) {}

  // 手动置顶公告优先，其余按时间倒序
  AppState.allPosts = posts.sort((a, b) => (Number(b.isPinned) - Number(a.isPinned)) || (b.timestamp - a.timestamp));
  renderHomeDashboard();
  if (AppState.activeTab === 'feeds') renderFeedsSectionOnly();
}

// 隐藏管理端路由检测（#admin 或连续点击顶部主标题 5 次）
let titleClickCount = 0;
function handleSecretTitleTap() {
  titleClickCount++;
  setTimeout(() => { titleClickCount = 0; }, 2000);
  if (titleClickCount >= 5) {
    titleClickCount = 0;
    openHiddenAdminDrawer();
  }
}

function openHiddenAdminDrawer() {
  if (!AppState.isAdmin) {
    const pin = prompt('请输入管理员暗码进入独立审核与投喂台：');
    if (pin !== ADMIN_PIN) return;
    AppState.isAdmin = true;
    localStorage.setItem('onerland_admin_pin', ADMIN_PIN);
  }
  const panel = document.getElementById('hidden-admin-modal');
  if (panel) {
    panel.classList.remove('hidden');
    if (typeof renderAdminTodoQueue === 'function') renderAdminTodoQueue();
  }
}
function updateAiKeyStatusUI() {
  const hasKey = Boolean((localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim());
  const el = document.getElementById('ai-key-status');
  if (el) {
    el.textContent = hasKey ? '已配置' : '未配置';
    el.className = hasKey ? 'text-emerald-700 font-bold' : '';
  }
}

function configGeminiKey() {
  const current = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  const input = prompt('请输入 Google AI Studio (Gemini) API Key（留空确定可清除）：', current);
  if (input === null) return;
  if (input.trim()) {
    localStorage.setItem(GEMINI_KEY_STORAGE, input.trim());
    alert('AI 识图密钥已保存！');
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    alert('已清除 AI 识图密钥。');
  }
  updateAiKeyStatusUI();
}
AppState.currentUser = JSON.parse(localStorage.getItem('onerland_otp_user_v1') || 'null');

function updateAuthButtonUI() {
  const btn = document.getElementById('user-auth-btn');
  if (!btn) return;
  btn.textContent = AppState.currentUser ? `👤 ${AppState.currentUser.email.split('@')[0]}` : '👤 登录';
}

function openUserAuthModal() {
  document.getElementById('user-auth-modal')?.classList.remove('hidden');
  const statusEl = document.getElementById('auth-current-status');
  if (statusEl) {
    statusEl.textContent = AppState.currentUser
      ? `当前已登录：${AppState.currentUser.email}`
      : '当前为访客模式（本地纪念/筛选无需登录；核验票根与搭子联系需邮箱验证码登录）';
  }
}

async function sendEmailOTP() {
  const email = (document.getElementById('auth-email-input')?.value || '').trim();
  if (!email || !email.includes('@')) return alert('请输入有效的邮箱地址');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({ email, create_user: true })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    alert('6位验证码已发送至邮箱，请查收！');
  } catch (e) {
    alert(`发送失败：${e.message}（请确认 Supabase Auth 已开启 Email OTP）`);
  }
}

async function verifyEmailOTP() {
  const email = (document.getElementById('auth-email-input')?.value || '').trim();
  const token = (document.getElementById('auth-otp-input')?.value || '').trim();
  if (!email || !token) return alert('请填写邮箱和验证码');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({ email, token, type: 'email' })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    AppState.currentUser = { email, accessToken: data.access_token || '' };
    localStorage.setItem('onerland_otp_user_v1', JSON.stringify(AppState.currentUser));
    updateAuthButtonUI();
    document.getElementById('user-auth-modal')?.classList.add('hidden');
    renderTourCards();
    alert('邮箱验证登录成功！');
  } catch (e) {
    alert(`验证失败：${e.message}`);
  }
}

function logoutEmailUser() {
  AppState.currentUser = null;
  localStorage.removeItem('onerland_otp_user_v1');
  updateAuthButtonUI();
  renderTourCards();
}

function updateAiKeyStatusUI() {
  const hasKey = Boolean((localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim());
  const el = document.getElementById('ai-key-status');
  if (el) el.textContent = hasKey ? '已配置' : '未配置';
}

function configGeminiKey() {
  const current = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  const input = prompt('请输入 Google AI Studio (Gemini) API Key（留空确定可清除）：', current);
  if (input === null) return;
  if (input.trim()) {
    localStorage.setItem(GEMINI_KEY_STORAGE, input.trim());
    alert('AI 识图密钥已保存！');
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
  updateAiKeyStatusUI();
}
// ================= 全局图片灯箱（修复海报点击无法放大） =================
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

// ================= 本地粉籍与自定义标签管理 =================
function getFanPrefState() {
  const defaultPref = {
    biasType: 'group', // 'group' 团粉 | 'solo' 唯粉 | 'cp' CP偏好
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

// ================= 场馆体验客观结构化采集与聚合（样本 >= 5 解锁统计） =================
const VENUE_EXP_STORAGE_KEY = 'onerland_venue_experience_v1';

function normalizeVenueKey(venueName = '') {
  return (venueName || '')
    .replace(/·/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllVenueExperiences() {
  try {
    const raw = JSON.parse(localStorage.getItem(VENUE_EXP_STORAGE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function getVenueExperienceList(venueName) {
  const key = normalizeVenueKey(venueName);
  if (!key) return [];
  const all = getAllVenueExperiences();
  return Array.isArray(all[key]) ? all[key] : [];
}

function addVenueExperience(venueName, record) {
  const key = normalizeVenueKey(venueName);
  if (!key) return;
  const all = getAllVenueExperiences();
  const list = Array.isArray(all[key]) ? all[key] : [];
  list.unshift({
    id: Date.now(),
    venue: key,
    createdAt: new Date().toLocaleDateString(),
    ...record
  });
  all[key] = list;
  localStorage.setItem(VENUE_EXP_STORAGE_KEY, JSON.stringify(all));
}

function deleteVenueExperience(venueName, recordId) {
  const key = normalizeVenueKey(venueName);
  if (!key) return;
  const all = getAllVenueExperiences();
  const list = Array.isArray(all[key]) ? all[key] : [];
  all[key] = list.filter(x => String(x.id) !== String(recordId));
  localStorage.setItem(VENUE_EXP_STORAGE_KEY, JSON.stringify(all));
}

// 聚合计算：仅当样本 >= 5 条时输出分布百分比
function computeVenueExperienceStats(venueName) {
  const list = getVenueExperienceList(venueName);
  const total = list.length;
  if (total < 5) {
    return { unlocked: false, total, remaining: 5 - total, list };
  }

  const queueBuckets = {
    '10分钟内': 0,
    '10-30分钟': 0,
    '30-60分钟': 0,
    '60分钟以上': 0
  };
  let bagCheckCount = 0;
  const storageCounts = {};

  list.forEach(item => {
    if (queueBuckets[item.queueTime] !== undefined) {
      queueBuckets[item.queueTime]++;
    }
    if (item.bagCheck === 'strict') {
      bagCheckCount++;
    }
    const st = item.storageType || '无寄存/未注意';
    storageCounts[st] = (storageCounts[st] || 0) + 1;
  });

  const queueDist = Object.entries(queueBuckets).map(([label, count]) => ({
    label,
    count,
    pct: Math.round((count / total) * 100)
  }));

  const storageDist = Object.entries(storageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 100)
    }));

  return {
    unlocked: true,
    total,
    bagCheckPct: Math.round((bagCheckCount / total) * 100),
    bagCheckCount,
    queueDist,
    storageDist,
    list
  };
}
