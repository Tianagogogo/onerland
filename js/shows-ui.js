function normalizeSeriesKey(rawTitle = '', savedTheme = '') {
  // theme 可能来自手工维护的数据（数字/对象等），统一转字符串，避免 .trim 抛错中断整页渲染。
  const base = String(savedTheme || rawTitle || '').trim();
  if (!base) return '';
  if (/^chill\s*party/i.test(base)) return 'ChillParty 系列';
  const quoteSeries = base.match(/^([「《][^」》]+[」》]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华|见面会|派对)?)/);
  if (quoteSeries) return quoteSeries[1].trim();
  const alphaPrefix = base.match(/^([A-Za-z]{3,20})(?:plus|\+|\s|·|-|_|$)/i);
  if (alphaPrefix) return `${alphaPrefix[1]} 系列`;
  // 合集式专题（如「无限未来·FutureX 2023春夏季全国巡演」）的 theme 往往不带“xx站”后缀，
  // 旧逻辑只认结尾带“站”的标题，导致整组合集在聚合页被漏掉；这里改为按首个分隔符取系列主体。
  const collectionHead = base.match(/^([^·\-—|]{2,16}?)\s*[·\-—|]\s*\S/);
  if (collectionHead) return collectionHead[1].trim();
  const dashMatch = base.match(/^([^·\-—|]+?)\s*[·\-—|]\s*.+站$/);
  if (dashMatch && dashMatch[1].trim().length >= 2) return dashMatch[1].trim();
  return '';
}

// 专题归并键：忽略大小写、全半角、空白、+、连接符与书名号的写法差异，
// 让「CHILL PARTY PLUS+」「CHILL PARTY PLUS」这类同一系列的不同写法能被聚合到一起。
function canonicalSeriesKey(rawKey = '') {
  let text = String(rawKey || '');
  if (typeof text.normalize === 'function') text = text.normalize('NFKC');
  return text.toLowerCase()
    .replace(/[\s+＋·\-—_|/\\]/g, '')
    .replace(/[「」《》]/g, '')
    .replace(/系列$/, '')
    .trim();
}

// 演出记录里用于推导专题的原始文本：往日档案看标题，近期场次看城市/标题。
function getShowSeriesLabel(item, isArchive) {
  return String((isArchive ? item.title : (item.city || item.title)) || '').trim();
}

// 统一入口：任意一条演出记录都能返回所属专题（合集）的归并键。
// theme 优先，theme 解析不出来时回退标题，避免单场/合集内演出在聚合页丢失。
function resolveShowSeriesKey(item, isArchive) {
  if (!item) return '';
  const label = getShowSeriesLabel(item, isArchive);
  const theme = String(item.theme || '').trim();
  return normalizeSeriesKey(label, theme) ||
    String(item.seriesKey || '').trim() ||
    normalizeSeriesKey(label, '') ||
    normalizeSeriesKey(theme, '');
}

function listAllShowRecords() {
  const records = [];
  (Array.isArray(AppState.cloudTickets) ? AppState.cloudTickets : [])
    .forEach(item => records.push({ item, isArchive: false }));
  (Array.isArray(AppState.cloudArchives) ? AppState.cloudArchives : [])
    .forEach(item => records.push({ item, isArchive: true }));
  return records;
}

function isFestivalShow(item) {
  if (!item) return false;
  if (item.subType === 'festival') return true;
  const label = item.city || item.title || '';
  return /音乐节|嘉年华/.test(`${label} ${item.theme || ''}`);
}

function isSameSeries(item, isArchive, seriesKey) {
  const target = canonicalSeriesKey(seriesKey);
  if (!target) return false;
  return canonicalSeriesKey(resolveShowSeriesKey(item, isArchive)) === target;
}

function countSeriesShows(seriesKey) {
  if (!canonicalSeriesKey(seriesKey)) return 0;
  return listAllShowRecords()
    .filter(({ item, isArchive }) => isSameSeries(item, isArchive, seriesKey))
    .length;
}

// 演出日期时间排序键：优先使用档案里记录的精确开场时间，缺失时按当天 00:00 处理。
function getShowSortTimestamp(showDate, showTime) {
  const dateText = String(showDate || '').trim();
  if (!dateText) return NaN;
  if (showTime && !/\d{1,2}:\d{2}/.test(dateText)) {
    const withTime = parseLocalTime(`${dateText.slice(0, 10)} ${showTime}`);
    if (!isNaN(withTime)) return withTime;
  }
  return parseLocalTime(dateText);
}

// 统一的时间线排序：演出日期时间正序，同日多场按具体开场时间、再按记录 ID 次序。
function compareShowChronology(a, b) {
  const aTs = getShowSortTimestamp(a.showDate || a.date, a.showTime || a.time);
  const bTs = getShowSortTimestamp(b.showDate || b.date, b.showTime || b.time);
  const aValid = !isNaN(aTs);
  const bValid = !isNaN(bTs);
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (aValid && bValid && aTs !== bTs) return aTs - bTs;
  const aId = Number(a.cloudId);
  const bId = Number(b.cloudId);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
  return String(a.showDate || a.date || '').localeCompare(String(b.showDate || b.date || ''));
}


// ================= 全局标签切换 =================
function switchMainTab(tabId) {
  const sections = {
    home: 'view-home-page',
    shows: 'view-shows-page',
    footprint: 'view-footprint-page'
  };
  Object.entries(sections).forEach(([id, sel]) => {
    const el = document.getElementById(sel);
    if (el) el.classList.add('hidden');
    const btn = document.getElementById(`top-tab-${id}`) || document.getElementById(`bottom-tab-${id}`);
    if (btn) {
      if (id === tabId) {
        btn.classList.add('obsidian-btn', 'text-white', 'font-semibold');
        btn.classList.remove('text-slate-600');
      } else {
        btn.classList.remove('obsidian-btn', 'text-white', 'font-semibold');
        btn.classList.add('text-slate-600');
      }
    }
  });
  const target = document.getElementById(sections[tabId]);
  if (target) target.classList.remove('hidden');
  if (tabId === 'home' && typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (tabId === 'shows' && typeof renderTourCards === 'function') renderTourCards();
  if (tabId === 'footprint' && typeof renderFootprintPage === 'function') renderFootprintPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= 演出状态机 =================
// 统一计算单场演出的生命周期状态，避免各处零散 if/else 判断不一致。
// 返回 { status, saleTs, showTs, nextRound, futureRounds }
const SHOW_STATUS = {
  UPCOMING_SALE: 'UPCOMING_SALE',
  WAITING_SHOW: 'WAITING_SHOW',
  ONGOING: 'ONGOING',
  ENDED: 'ENDED'
};

// 安全解析日期字符串为时间戳。兼容 "2026-11-27 13:14" / "2026-11-27T13:14" / "2026-12-05"
function parseLocalTime(raw) {
  if (!raw) return NaN;
  const s = String(raw).trim().replace('T', ' ');
  // 显式按本地时区解析，避免 Safari 对 "YYYY-MM-DD HH:mm" 解析失败；
  // 同时兼容 "YYYY/MM/DD"、"YYYY.MM.DD"、"YYYY年M月D日" 等历史/后台录入格式。
  const m = s.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})[日号]?(?:[ ](\d{1,2}):(\d{2}))?/);
  if (!m) return NaN;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4] || 0), Number(m[5] || 0), 0, 0
  ).getTime();
}

function getEventStatus(item, now = Date.now()) {
  const rounds = Array.isArray(item.rounds) ? item.rounds : [];

  // 只保留合法且晚于当前时间的开票轮次
  const futureRounds = rounds
    .map(r => ({ ...r, ts: parseLocalTime(r.sale_time) }))
    .filter(r => !isNaN(r.ts) && r.ts > now)
    .sort((a, b) => a.ts - b.ts);

  // 最近一次已发生的开票时间（用于判断"是否已开票"）
  const pastRounds = rounds
    .map(r => ({ ...r, ts: parseLocalTime(r.sale_time) }))
    .filter(r => !isNaN(r.ts) && r.ts <= now)
    .sort((a, b) => b.ts - a.ts);

  const showTs = parseLocalTime(item.show_date || (item.ticket_time || '').slice(0, 10));

  // 演出时长按 3 小时估算结束时间
  const SHOW_DURATION = 3 * 3600 * 1000;
  const showEndTs = isNaN(showTs) ? NaN : showTs + SHOW_DURATION;

  let status;
  if (!isNaN(showEndTs) && now > showEndTs) {
    status = SHOW_STATUS.ENDED;
  } else if (!isNaN(showTs) && now >= showTs) {
    status = SHOW_STATUS.ONGOING;
  } else if (futureRounds.length) {
    // 还有未来的开票轮次 → 待开票
    status = SHOW_STATUS.UPCOMING_SALE;
  } else if (pastRounds.length) {
    // 所有开票轮次都已过期，但演出还没开始 → 已开票待演出
    status = SHOW_STATUS.WAITING_SHOW;
  } else {
    // 完全没有开票数据：演出未开始，归为待演出（不能凭空造开票倒计时）
    status = SHOW_STATUS.WAITING_SHOW;
  }

  return {
    status,
    saleTs: futureRounds.length ? futureRounds[0].ts : NaN,
    showTs,
    showEndTs,
    futureRounds,
    nextRound: futureRounds.length ? futureRounds[0] : null
  };
}

function requestExternalToolJump(url, siteName, venueName = '') {
  AppState.pendingExternalUrl = url;
  document.getElementById('ext-confirm-site').textContent = siteName;
  document.getElementById('ext-confirm-desc').textContent =
    `即将离开 ONERLAND 前往「${siteName}」检索${venueName ? `【${venueName}】` : ''}座位视野参考（非官方工具站）。请勿在外部页面泄露订单号或支付定金。`;
  document.getElementById('external-jump-modal').classList.remove('hidden');
}

function confirmExternalToolJump() {
  const url = AppState.pendingExternalUrl;
  document.getElementById('external-jump-modal').classList.add('hidden');
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ================= 演出卡片地图唤端菜单 =================
var showMapFallbackState = { timer: null, cleanup: null };

function encodeShowMapValue(value) {
  try {
    return encodeURIComponent(String(value || ''));
  } catch (_) {
    return '';
  }
}

function decodeShowMapValue(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_) {
    return String(value || '');
  }
}

function closeShowMapMenus(except) {
  document.querySelectorAll('[data-show-map-menu]').forEach(menu => {
    if (menu !== except) menu.classList.add('hidden');
  });
}

function bindShowMapMenuDismiss() {
  if (bindShowMapMenuDismiss.bound) return;
  bindShowMapMenuDismiss.bound = true;
  document.addEventListener('click', event => {
    document.querySelectorAll('[data-show-map-menu]').forEach(menu => {
      if (!menu.contains(event.target)) menu.classList.add('hidden');
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeShowMapMenus();
  });
  window.addEventListener('resize', () => closeShowMapMenus());
  window.addEventListener('scroll', () => closeShowMapMenus(), true);
}

function toggleShowMapMenu(event, trigger) {
  event.preventDefault();
  event.stopPropagation();
  const menu = trigger?.parentElement?.querySelector('[data-show-map-menu]');
  if (!menu) return;
  const willOpen = menu.classList.contains('hidden');
  closeShowMapMenus(menu);
  if (willOpen) {
    bindShowMapMenuDismiss();
    menu.classList.remove('hidden');
  }
}

function clearShowMapFallback() {
  if (showMapFallbackState.timer !== null) {
    clearTimeout(showMapFallbackState.timer);
    showMapFallbackState.timer = null;
  }
  if (showMapFallbackState.cleanup) {
    showMapFallbackState.cleanup();
    showMapFallbackState.cleanup = null;
  }
}

function triggerShowMapScheme(url) {
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 1500);
}

function launchShowMapApp(provider, trigger) {
  const menu = trigger?.closest('[data-show-map-menu]');
  const keyword = decodeShowMapValue(menu?.dataset.mapVenue || '') ||
    decodeShowMapValue(menu?.dataset.mapCity || '');
  const city = decodeShowMapValue(menu?.dataset.mapCity || '');
  closeShowMapMenus();
  if (!keyword) return;

  clearShowMapFallback();
  const webUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}${city ? `&city=${encodeURIComponent(city)}` : ''}`;

  if (provider === 'web') {
    const a = document.createElement('a');
    a.href = webUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => a.remove(), 0);
    return;
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const encodedKeyword = encodeURIComponent(keyword);
  const scheme = provider === 'baidu'
    ? `baidumap://map/place/search?query=${encodedKeyword}&region=${encodeURIComponent(city)}&src=onerland.pwa`
    : isIOS
      ? `iosamap://poi?sourceApplication=ONERLAND&keywords=${encodedKeyword}&dev=0`
      : `androidamap://poi?sourceApplication=ONERLAND&keywords=${encodedKeyword}&dev=0`;

  triggerShowMapScheme(scheme);

  const onVisibilityChange = () => {
    if (document.hidden) clearShowMapFallback();
  };
  const onPageHide = () => clearShowMapFallback();
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  showMapFallbackState.cleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
  };
  showMapFallbackState.timer = window.setTimeout(() => {
    const shouldFallback = !document.hidden && document.hasFocus();
    clearShowMapFallback();
    if (shouldFallback) window.location.href = webUrl;
  }, 900);
}

function exportShowICS(cloudId) {
  const item = AppState.cloudTickets.find(t => String(t.cloudId) === String(cloudId));
  if (!item) return;
  const state = getEventStatus(item);
  // 优先用未来最近一轮开票时间；没有则回退到演出开始时间
  const firstRound = state.nextRound;
  const targetTs = firstRound ? firstRound.ts : state.showTs;
  if (isNaN(targetTs)) return alert('该场次暂无精确时间，无法生成日历');
  const start = new Date(targetTs);
  const end = new Date(start.getTime() + 45 * 60000);
  const fmt = d => {
    // ICS 标准使用 UTC 时间（末尾 Z），各日历客户端会自动换算为本地时区
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  const label = firstRound ? `抢票(${firstRound.round_name})` : '演出开演';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//ONERLAND//Show Reminder//CN',
    'BEGIN:VEVENT',
    `UID:onerland-${item.cloudId}-${firstRound ? 'sale' : 'show'}@onerland.pages.dev`,
    `DTSTAMP:${fmt(new Date())}`,
    `SUMMARY:🎫 ONERLAND提醒：${item.city} - ${label}`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `LOCATION:${item.venue}`,
    `DESCRIPTION:艺人：${item.artist}\\n地点：${item.venue}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:还有15分钟！', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `${item.city}-${label}.ics`;
  a.click();
}

const slotTimers = {};
function openSlotPopover(id) {
  if (slotTimers[id]) { clearTimeout(slotTimers[id]); delete slotTimers[id]; }
  document.querySelectorAll('.slot-hover-popover').forEach(el => { if (el.id !== id) el.classList.add('hidden'); });
  document.getElementById(id)?.classList.remove('hidden');
}
function scheduleCloseSlotPopover(id) {
  slotTimers[id] = setTimeout(() => { document.getElementById(id)?.classList.add('hidden'); }, 220);
}
function toggleSlotPopover(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('hidden')) openSlotPopover(id);
  else el.classList.add('hidden');
}

function buildSlotHoverBadgeHTML(slotText, scheduleImgs, popoverId, titleLabel) {
  const imgs = Array.isArray(scheduleImgs) ? scheduleImgs : [];
  if (!slotText && !imgs.length) return '';
  const hasImgs = imgs.length > 0;
  const safeTitle = String(titleLabel || '').replace(/['"<>]/g, '');

  const popoverHtml = hasImgs ? `
    <div id="${popoverId}"
      onmouseenter="openSlotPopover('${popoverId}')"
      onmouseleave="scheduleCloseSlotPopover('${popoverId}')"
      class="slot-hover-popover hidden absolute left-0 bottom-full pb-2 z-50 w-72 sm:w-80">
      <div class="p-3 rounded-xl bg-white border border-slate-300 shadow-2xl">
        <div class="flex items-center justify-between text-[11px] text-slate-800 font-semibold mb-2">
          <span>🗓️ ${safeTitle} · 时间表（点击看大图）</span>
          <button type="button" onclick="event.stopPropagation(); document.getElementById('${popoverId}').classList.add('hidden')" class="text-slate-400 hover:text-slate-800 px-1">✕</button>
        </div>
        <div class="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar">
          ${imgs.map((src, i) => `
            <img src="${src}" data-cap="${safeTitle} · 时间表 #${i + 1}"
              onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)"
              class="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 bg-slate-50" />
          `).join('')}
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="relative inline-block"
      ${hasImgs ? `onmouseenter="openSlotPopover('${popoverId}')" onmouseleave="scheduleCloseSlotPopover('${popoverId}')"` : ''}>
      <span ${hasImgs ? `onclick="event.stopPropagation(); toggleSlotPopover('${popoverId}')"` : ''}
        class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-medium ${hasImgs ? 'cursor-pointer hover:bg-slate-200' : ''}">
        <span>🗓️ ${slotText || '音乐节时间表'}</span>
        ${hasImgs ? `<span class="text-[10px] px-1 rounded bg-white border border-slate-300">×${imgs.length}</span>` : ''}
      </span>
      ${popoverHtml}
    </div>
  `;
}

// ================= 1. 提交本机私人评语（默认仅自己可见） =================
function submitPrivateNoteForm(showKey, formPrefix, rerenderScope) {
  const input = document.getElementById(`${formPrefix}-priv-note`);
  const text = (input?.value || '').trim();
  if (!text) return alert('请先填写你的私人观演评语！');
  addPrivateShowNote(showKey, text);
  if (input) input.value = '';
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

function removePrivateNoteItem(showKey, noteId, rerenderScope) {
  deletePrivateShowNote(showKey, noteId);
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

// ================= 2. 脱敏票根核验（本地解锁 + 云端待复核） =================
async function handleTicketProofVerify(showKey, formPrefix, rerenderScope, ctx = {}) {
  const fileInput = document.getElementById(`${formPrefix}-proof-file`);
  const areaInput = document.getElementById(`${formPrefix}-proof-area`);
  const areaText = (areaInput?.value || '').trim();
  const file = fileInput?.files?.[0] || null;

  if (!file && !areaText) {
    return alert('请上传已打码订单号/二维码的脱敏票根截图，或填写脱敏区域信息进行核验！');
  }

  // 第一步：本地即时解锁（不等待网络，保证体验）
  saveDesensitizedTicketProof(showKey, areaText || '已核验脱敏票根', { cloudStatus: file ? 'uploading' : 'local-only' });

  if (file) {
    // 第二步：异步上传云端存 pending，供管理员抽查复核
    try {
      const info = await uploadTicketProofToCloud({
        showKey,
        artist: null,
        city: ctx.venue || null,
        showDate: null,
        seatArea: areaText,
        file
      });
      setProofCloudStatus(showKey, 'pending', info || {});
    } catch (e) {
      // 上传失败不影响本地已解锁状态，仅提示
      setProofCloudStatus(showKey, 'upload-failed');
      console.warn('ticket proof upload failed:', e);
    }
  }

  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();

  const cloudStatus = getProofCloudStatus(showKey);
  if (cloudStatus === 'pending') {
    alert('✅ 票根已核验，评分已解锁。\n\n脱敏截图已提交云端复核，通过后将显示「已核验票根」徽章。');
  } else if (cloudStatus === 'upload-failed') {
    alert('✅ 票根已核验，评分已解锁。\n\n（云端复核上传失败，不影响本次评分，可稍后重试）');
  } else {
    alert('✅ 本场脱敏票根已核验（仅记录区域信息，未上传图片）');
  }
}

// ================= 3. 公开发布客观体验评分（不含评语） =================
function submitVenueExperienceForm(venueName, showKey, formPrefix, rerenderScope) {
  if (!isShowTicketVerified(showKey)) {
    return alert('🔒 需先完成本场次「脱敏票根核验」，才能公开发布客观体验评分！');
  }

  const objectiveScores = {
    queueTime: document.getElementById(`${formPrefix}-queue`)?.value || '10-30分钟',
    bagCheck: document.getElementById(`${formPrefix}-bag`)?.value || 'strict',
    storageType: document.getElementById(`${formPrefix}-storage`)?.value || '场馆自助寄存柜',
    acLevel: document.getElementById(`${formPrefix}-ac`)?.value || '体感适中',
    seatSpacing: document.getElementById(`${formPrefix}-spacing`)?.value || '常规间距',
    viewQuality: document.getElementById(`${formPrefix}-view`)?.value || '视角尚可',
    showExperience: document.getElementById(`${formPrefix}-showexp`)?.value || '声场/舞美正常'
  };

  try {
    addVerifiedVenueObjectiveScore(venueName, showKey, objectiveScores);
    if (rerenderScope === 'archive') renderArchiveTimeline();
    else renderTourCards();
    alert('✅ 客观体验评分已发布（你的私人文字评语仍仅保存在本机，未对外公开）。');
  } catch (e) {
    alert(e.message);
  }
}

function renderDistTags(distList) {
  return (distList || [])
    .filter(d => d.count > 0)
    .map(d => `<span class="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-800">${d.label} <strong>${d.pct}%</strong> (${d.count})</span>`)
    .join('');
}

function buildVenueExperienceDrawerHTML(venueName, drawerId, formPrefix, showTitle, rerenderScope) {
  const cleanVenue = normalizeVenueKey(venueName) || '未命名场馆';
  const showKey = `${cleanVenue}::${String(showTitle || '').trim()}`;
  const safeShowKey = showKey.replace(/['"<>]/g, '');
  const safeVenueAttr = cleanVenue.replace(/['"<>]/g, '');

  const verified = isShowTicketVerified(showKey);
  const stats = computeVenueExperienceStats(cleanVenue);
  const privateNotes = getPrivateShowNotes(showKey);

  // 核验徽章：区分「仅本地脱敏」「云端待复核」「云端已通过」「已驳回」
  const cloudStatus = getProofCloudStatus(showKey);
  // 有本地核验记录的场次，后台对齐一次云端复核结果（已通过的会静默升级徽章）
  if (verified) syncMyProofStatus(showKey);
  const proofBadgeHtml = !verified
    ? ''
    : ({
        'approved': `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold" title="脱敏票根已通过管理员复核">🛡️ 已核验票根 · 云端复核通过</span>`,
        'pending': `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-300 font-semibold" title="脱敏票根已提交，等待管理员抽查复核">⏳ 已核验票根 · 待云端复核</span>`,
        'rejected': `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-400 font-semibold" title="复核未通过，可重新上传脱敏票根">⚠️ 票根复核未通过</span>`,
        'upload-failed': `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300 font-medium" title="本地已核验，但云端上传失败">✅ 已核验票根 · 云端上传失败</span>`
      }[cloudStatus] ||
      `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold" title="已完成本地脱敏核验（未上传图片）">✅ 已核验票根 · 本地脱敏</span>`);

  const publicStatsHtml = stats.unlocked
    ? `
      <div class="p-3 rounded-xl bg-white border border-slate-300 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-1">
          <span class="font-bold text-slate-900">📊 公共场馆客观体验聚合（已核验 ${stats.total} 条样本）</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold">样本 ≥ 5 已解锁</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500">🎒 翻包/严检比例</div>
            <div class="text-lg font-bold text-slate-900 mt-0.5">${stats.bagCheckPct}% <span class="text-xs font-normal text-slate-500">(${stats.bagCheckCount}/${stats.total} 场次反馈开包检查)</span></div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <div class="text-[11px] text-slate-500">🛅 寄存方式分布</div>
            <div class="flex flex-wrap gap-1">${renderDistTags(stats.storageDist)}</div>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="text-[11px] font-semibold text-slate-700">⏱️ 安检排队耗时分布：</div>
          ${stats.queueDist.map(q => `
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-20 text-slate-600 shrink-0">${q.label}</span>
              <div class="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div class="h-full bg-slate-800 rounded-full" style="width:${q.pct}%"></div>
              </div>
              <span class="w-16 text-right font-mono text-slate-700 shrink-0">${q.pct}% (${q.count})</span>
            </div>
          `).join('')}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <div class="text-[11px] font-semibold text-slate-700">❄️ 场馆空调体感分布</div>
            <div class="flex flex-wrap gap-1">${renderDistTags(stats.acDist)}</div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <div class="text-[11px] font-semibold text-slate-700">💺 座位间距/站席拥挤分布</div>
            <div class="flex flex-wrap gap-1">${renderDistTags(stats.spacingDist)}</div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <div class="text-[11px] font-semibold text-slate-700">🔭 视角遮挡与视线分布</div>
            <div class="flex flex-wrap gap-1">${renderDistTags(stats.viewDist)}</div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <div class="text-[11px] font-semibold text-slate-700">🎤 演出体验（声场/舞美/散场）</div>
            <div class="flex flex-wrap gap-1">${renderDistTags(stats.showExpDist)}</div>
          </div>
        </div>
      </div>
    `
    : `
      <div class="p-3 rounded-xl bg-white border border-dashed border-slate-300 text-xs text-slate-600">
        📊 <strong>${safeVenueAttr}</strong> 公共客观评分聚合待解锁：当前已收集 <strong>${stats.total} / 5</strong> 条已核验票根样本，还差 <strong>${stats.remaining}</strong> 条即可公开展示客观统计分布（仅统计选项，不包含文字评语）。
      </div>
    `;

  const verifyGateHtml = verified
    ? `
      <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
        <div class="flex items-center justify-between flex-wrap gap-1">
          <span class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
            ✅ 已通过本场脱敏票根核验 · 可公开发布客观体验评分
            ${proofBadgeHtml}
          </span>
          <span class="text-[11px] text-slate-600 font-medium">仅发布客观选项，不含评语</span>
        </div>

        ${cloudStatus === 'rejected' ? `
        <div class="p-2 rounded-lg bg-slate-100 border border-slate-300 text-[11px] text-slate-700">
          管理员复核未通过。你的评分记录仍保留本机，可重新上传更清晰的脱敏票根。
        </div>` : ''}
        ${cloudStatus === 'upload-failed' ? `
        <div class="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
          本地核验已通过，但脱敏图未成功上传云端；不影响你的评分解锁，可稍后重新上传。
        </div>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">⏱️ 安检排队耗时</label>
            <select id="${formPrefix}-queue" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="10分钟内">10分钟内（极快）</option>
              <option value="10-30分钟" selected>10-30分钟（正常）</option>
              <option value="30-60分钟">30-60分钟（较慢）</option>
              <option value="60分钟以上">60分钟以上（拥堵）</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">🎒 安检翻包强度</label>
            <select id="${formPrefix}-bag" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="strict">严格开包/查相机灯牌</option>
              <option value="light">仅过机/简单目视检查</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">🛅 现场寄存方式</label>
            <select id="${formPrefix}-storage" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="场馆自助寄存柜">场馆自助寄存柜</option>
              <option value="现场人工寄存处">现场人工寄存处</option>
              <option value="附近地铁/商圈寄存">附近地铁/商圈寄存</option>
              <option value="无寄存点（需轻装）">无寄存点（需轻装）</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">❄️ 场馆空调</label>
            <select id="${formPrefix}-ac" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="冷气很足（建议薄外套）">冷气很足（建议薄外套）</option>
              <option value="体感适中" selected>体感适中</option>
              <option value="偏闷热/空调弱">偏闷热/空调弱</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">💺 座位间距/站席</label>
            <select id="${formPrefix}-spacing" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="前后排宽敞">前后排宽敞</option>
              <option value="常规间距" selected>常规间距</option>
              <option value="偏窄/站席拥挤">偏窄/站席拥挤</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">🔭 视角体验</label>
            <select id="${formPrefix}-view" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="无遮挡/视线通透">无遮挡/视线通透</option>
              <option value="视角尚可" selected>视角尚可</option>
              <option value="有立柱/栏杆/控台遮挡">有立柱/栏杆/控台遮挡</option>
            </select>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 block mb-1">🎤 演出体验</label>
            <select id="${formPrefix}-showexp" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              <option value="声场清晰·舞美到位">声场清晰·舞美到位</option>
              <option value="声场/舞美正常" selected>声场/舞美正常</option>
              <option value="回声重/散场拥堵">回声重/散场拥堵</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end">
          <button type="button" onclick="submitVenueExperienceForm('${safeVenueAttr}', '${safeShowKey}', '${formPrefix}', '${rerenderScope}')" class="px-3.5 py-1.5 rounded-lg obsidian-btn font-semibold">
            发布客观体验评分
          </button>
        </div>
      </div>
    `
    : `
      <div class="p-3 rounded-xl bg-white border border-slate-300 space-y-2">
        <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
          ${verified ? '⚠️ 票根复核未通过 · 请重新提交脱敏票根' : '🔒 公开发布客观体验评分需先完成「脱敏票根核验」'}
          ${proofBadgeHtml}
        </div>
        <p class="text-[11px] text-slate-500 leading-relaxed">请先涂抹掉票根/订单截图上的<strong>订单号、条形码、二维码、姓名与身份证号</strong>，仅保留演出场次与大区信息；核验后仅允许提交结构化客观评分（不包含评语）。</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <label class="cursor-pointer px-3 py-1.5 rounded-lg liquid-silver-btn font-medium text-center shrink-0">
            上传脱敏票根图
            <input id="${formPrefix}-proof-file" type="file" accept="image/*" class="hidden" />
          </label>
          <input id="${formPrefix}-proof-area" type="text" placeholder="或填写脱敏区域（如：一层看台A区 / 站席中区）" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
          <button type="button" onclick="handleTicketProofVerify('${safeShowKey}', '${formPrefix}', '${rerenderScope}', {venue: '${safeVenueAttr}', showKey: '${safeShowKey}'})" class="px-3 py-1.5 rounded-lg obsidian-btn font-semibold shrink-0">
            核验票根并解锁评分
          </button>
        </div>
      </div>
    `;

  const privateNotesHtml = `
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between flex-wrap gap-1">
        <span class="font-bold text-slate-900">🔒 我的私人观演评语（默认仅自己本机可见）</span>
        <span class="text-[11px] text-slate-400">仅存当前浏览器 · 绝不公开发布</span>
      </div>
      <div class="flex gap-1.5">
        <input id="${formPrefix}-priv-note" type="text" placeholder="记录仅自己看的观演感受、座位号细节、舞台回忆..." class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
        <button type="button" onclick="submitPrivateNoteForm('${safeShowKey}', '${formPrefix}', '${rerenderScope}')" class="px-3 py-1.5 rounded-lg liquid-silver-btn font-semibold shrink-0">仅自己保存</button>
      </div>
      ${privateNotes.length
        ? `<div class="space-y-1.5 pt-1">
            ${privateNotes.map(n => `
              <div class="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs text-slate-800 break-words">${n.text}</p>
                  <span class="text-[10px] text-slate-400">🔒 仅自己可见 · ${n.createdAt}</span>
                </div>
                <button type="button" onclick="removePrivateNoteItem('${safeShowKey}', ${n.id}, '${rerenderScope}')" class="text-[11px] text-slate-500 hover:text-slate-900 hover:underline shrink-0">删除</button>
              </div>
            `).join('')}
          </div>`
        : `<div class="text-[11px] text-slate-400">暂无私人评语（你可以随时写下仅自己可见的观演手账）。</div>`
      }
    </div>
  `;

  return `
    <div id="${drawerId}" class="hidden p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs space-y-3">
      ${publicStatsHtml}
      ${verifyGateHtml}
      ${privateNotesHtml}
    </div>
  `;
}

function renderThemeQuickBar() {
  const bar = document.getElementById('tour-themes-bar');
  if (!bar) return;
  const themeMap = new Map();
  let festCount = 0;

  listAllShowRecords().forEach(({ item, isArchive }) => {
    if (isFestivalShow(item)) { festCount++; return; }
    const seriesKey = resolveShowSeriesKey(item, isArchive);
    const canonKey = canonicalSeriesKey(seriesKey);
    if (!canonKey) return;
    const entry = themeMap.get(canonKey) || { label: seriesKey, count: 0 };
    entry.count += 1;
    themeMap.set(canonKey, entry);
  });

  const btns = [];
  themeMap.forEach(entry => {
    if (entry.count >= 2) {
      const safe = String(entry.label).replace(/['"<>]/g, '');
      btns.push(`<button type="button" data-theme="${safe}" onclick="openSeriesModal(this.dataset.theme)" class="text-xs px-2.5 py-1 rounded-full liquid-silver-btn font-medium">🏛️ ${safe}（${entry.count}场专题）↗</button>`);
    }
  });
  if (festCount > 0) {
    btns.push(`<button type="button" onclick="openSeriesModal('__ALL_FESTIVALS__')" class="text-xs px-2.5 py-1 rounded-full obsidian-btn font-medium">🎪 全部音乐节聚合（${festCount}场）↗</button>`);
  }
  bar.innerHTML = btns.join('');
}

function openSeriesModal(themeKey) {
  const isAllFest = themeKey === '__ALL_FESTIVALS__';
  // 聚合查询统一走 canonicalSeriesKey 匹配，单场（无 theme）与合集内演出都不会再漏掉。
  const matchFn = (item, isArchive) => isAllFest
    ? isFestivalShow(item)
    : isSameSeries(item, isArchive, themeKey);

  const upcoming = AppState.cloudTickets.filter(item => matchFn(item, false)).map(u => ({
    status: '待开演', title: u.city, date: u.show_date, cloudId: u.cloudId, venue: u.venue, posterUrl: u.posterUrl, artist: u.artist
  }));
  const past = AppState.cloudArchives.filter(item => matchFn(item, true)).map(p => ({
    status: '已落幕', title: p.title, date: p.showDate, showTime: p.showTime, cloudId: p.cloudId, venue: p.venue, posterUrl: p.posterUrl, artist: p.artist
  }));
  const stops = [...upcoming, ...past].sort(compareShowChronology);

  document.getElementById('series-modal-title').textContent = isAllFest ? '全部音乐节时光纪念册' : `${themeKey} · 系列专题档案`;
  document.getElementById('series-modal-sub').textContent = `共自动聚合 ${stops.length} 场演出记录（点击海报可查看大图）`;
  document.getElementById('series-modal-body').innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      ${stops.map(s => {
        const safeTitle = String(s.title || '').replace(/['"<>]/g, '');
        return `
          <div class="p-3 rounded-xl bg-white border border-slate-200 flex gap-3 text-xs">
            <div class="w-16 h-16 poster-square-box shrink-0">
              ${s.posterUrl ? `<img src="${s.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 海报" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" />` : `<div class="w-full h-full flex items-center justify-center text-[10px] text-slate-400">ONER</div>`}
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-slate-900 truncate">${safeTitle}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">${s.status}</span>
              </div>
              <p class="text-slate-500">🗓️ ${s.date}${s.showTime ? ` ${s.showTime}` : ''}</p>
              <p class="text-slate-500 truncate">📍 ${s.venue}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  document.getElementById('series-detail-modal').classList.remove('hidden');
}

function changeBuddyBiasMode(mode) {
  const cur = getFanPrefState();
  saveFanPrefState({
    biasType: mode,
    biasMembers: mode === 'solo' && !cur.biasMembers.length ? ['岳岳'] : cur.biasMembers
  });
}

function toggleBuddySoloMember(memberName) {
  const cur = getFanPrefState();
  const exists = cur.biasMembers.includes(memberName);
  const next = exists ? cur.biasMembers.filter(m => m !== memberName) : [...cur.biasMembers, memberName];
  saveFanPrefState({ biasType: 'solo', biasMembers: next });
}

function handleAddBuddyTag(cloudId) {
  const inp = document.getElementById(`buddy-tag-input-${cloudId}`);
  const val = (inp?.value || '').trim();
  if (!val) return;
  addFanCustomTag(val);
  if (inp) inp.value = '';
}

function saveLocalBuddyIntent(cloudId, showTitle) {
  const input = document.getElementById(`buddy-note-${cloudId}`);
  const text = (input?.value || '').trim();
  if (!text) return alert('请填写你的观演搭子意向（如：坐标北京，看台同区拼车/互拍）');
  if (/出票|转票|收票|定金|闲鱼|溢价|代抢/.test(text)) {
    return alert('⚠️ 为防范票务诈骗，搭子意向禁止包含“出票/转票/定金/闲鱼”等交易词汇！');
  }
  const pref = getFanPrefState();
  const biasText = pref.biasType === 'solo'
    ? `唯粉(${(pref.biasMembers || []).join('/') || '自选'})`
    : pref.biasType === 'cp'
      ? 'CP偏好'
      : '团粉';

  addBuddyEntryForShow(cloudId, {
    showTitle,
    note: text,
    biasLabel: biasText,
    tags: [...(pref.customTags || [])],
    createdAt: new Date().toLocaleDateString()
  });
  renderTourCards();
}

function removeLocalBuddyIntent(cloudId, entryId) {
  deleteBuddyEntryForShow(cloudId, entryId);
  renderTourCards();
}

function renderTourCards() {
  const container = document.getElementById('tour-grid');
  if (!container) return;

  const now = Date.now();
  const pref = getFanPrefState();
  const { autoFilterShows, biasType, biasMembers } = pref;

  const list = AppState.cloudTickets
    .filter(t => {
      if (AppState.activeArtistId !== 'ALL') {
        const meta = ARTIST_COLORS[t.artist];
        if (meta && meta.id !== AppState.activeArtistId) return false;
      }
      if (autoFilterShows && biasType !== 'group' && biasMembers.length) {
        return biasMembers.includes(t.artist) || t.artist === 'ONER';
      }
      return true;
    })
    .map(item => {
      const state = getEventStatus(item, now);
      return {
        ...item,
        showState: state,
        activeRounds: state.futureRounds,
        nextSaleTs: isNaN(state.saleTs) ? Infinity : state.saleTs,
        sortKey: !isNaN(state.showTs) ? state.showTs : Infinity
      };
    })
    .filter(item => item.showState.status !== SHOW_STATUS.ENDED)
    .sort((a, b) => {
      // 待开票优先（有抢票紧迫感），其次按演出时间由近到远
      const aSale = a.showState.status === SHOW_STATUS.UPCOMING_SALE ? 0 : 1;
      const bSale = b.showState.status === SHOW_STATUS.UPCOMING_SALE ? 0 : 1;
      if (aSale !== bSale) return aSale - bSale;
      if (aSale === 0 && bSale === 0) return a.nextSaleTs - b.nextSaleTs;
      return a.sortKey - b.sortKey;
    });

  if (!list.length) {
    const loadErr = getShowLoadErrorText();
    container.innerHTML = loadErr
      ? `<div class="col-span-full text-xs text-rose-600 py-4">⚠️ 演出数据加载失败：${loadErr}。请点击右上角「刷新同步」重试。</div>`
      : `<div class="col-span-full text-xs text-slate-400 py-4">当前筛选条件下暂无待开演场次。</div>`;
    return;
  }

  container.innerHTML = list.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeCity = String(item.city || '').replace(/['"<>]/g, '');
    const cleanVenue = (item.venue || '').replace(/·/g, ' ').trim();
    const shiyeLiveUrl = `https://shijiao.xingpaste.com/?q=${encodeURIComponent(cleanVenue || safeCity)}`;
    const slotPopoverId = `tour-slot-pop-${item.cloudId || idx}`;
    const buddyEntries = getBuddyListByShow(item.cloudId);
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    const venueStats = computeVenueExperienceStats(item.venue);
    const st = item.showState;
    const isSale = st.status === SHOW_STATUS.UPCOMING_SALE;

    // 距离演出的天数（向上取整，仅精确到天）
    const daysToShow = isNaN(st.showTs)
      ? null
      : Math.max(0, Math.ceil((st.showTs - now) / 86400000));

    // 顶部状态徽章：统一使用黑白灰中性配色
    const statusBadge = isSale
      ? `<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-900 border border-slate-900 text-white">🔥 抢票预警</span>`
      : st.status === SHOW_STATUS.ONGOING
        ? `<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 border border-slate-400 text-slate-900 animate-pulse">🎤 Live 进行中</span>`
        : `<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-white border border-slate-300 text-slate-700">🎫 已开票 · 待演出</span>`;

    // 时间展示：待开票跳秒，待演出只显示天数
    const timePanel = isSale
      ? `
      <div class="space-y-1.5 pt-1">
        ${item.activeRounds.map(r => `
          <div class="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-slate-900 text-slate-50">
            <span class="truncate">🔥 <strong>${r.round_name || '开票'}</strong>：${r.sale_time} <span class="opacity-75">(${r.platform || '大麦'})</span></span>
            <span class="countdown-badge font-mono font-bold text-slate-300 shrink-0" data-time="${r.sale_time}"></span>
          </div>
        `).join('')}
      </div>`
      : st.status === SHOW_STATUS.ONGOING
        ? `<div class="pt-1"><div class="text-xs py-1.5 px-2.5 rounded-lg bg-slate-800 text-slate-50 text-center font-semibold">🎤 今日开演 · Live 进行中</div></div>`
        : `<div class="pt-1">
            <div class="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-slate-900 text-slate-50">
              <span>🎫 已开票，筹备中</span>
              <span class="font-mono font-bold text-slate-300">${daysToShow === null ? '待定' : `距开演还有 ${daysToShow} 天`}</span>
            </div>
          </div>`;

    // 主操作按钮随状态切换
    const primaryCta = isSale
      ? `<button type="button" onclick="exportShowICS(${item.cloudId})" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition">⏰ 抢票提醒</button>`
      : `<button type="button" onclick="document.getElementById('guide-drawer-${idx}').classList.toggle('hidden')" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition">🚇 场馆交通指南</button>`;

    return `
      <div class="p-4 rounded-2xl metal-card flex flex-col justify-between gap-3">
        <div class="flex gap-3.5">
          <div class="w-24 h-24 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeCity}" data-cap="${safeCity} · 演出海报" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`}
          </div>
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
                <h3 class="font-bold text-base text-slate-900">${safeCity}</h3>
                ${statusBadge}
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${canEditContent() ? `<button type="button" onclick="startEditShow('ticket', ${item.cloudId})" class="text-[11px] px-2 py-0.5 rounded-lg liquid-silver-btn font-semibold">✏️ 编辑</button>` : ''}
                <button type="button" onclick="recordFootprintFromShow('${safeCity}', '${item.show_date}', '${item.venue}', '${item.artist}')" class="text-[11px] px-2 py-0.5 rounded-lg liquid-silver-btn font-medium">+ 足迹</button>
              </div>
            </div>
            <p class="text-xs text-slate-500">📍 ${item.venue} ｜ 🗓️ ${item.show_date}</p>
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              ${item.prices ? `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700">💰 ${item.prices}</span>` : ''}
              ${safeBooth ? `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-medium" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</span>` : ''}
              ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeCity)}
            </div>
          </div>
        </div>

        ${timePanel}

        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-200/80 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${primaryCta}
            ${isSale ? `<button type="button" onclick="document.getElementById('guide-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🚇 交通 ▾</button>` : ''}
            <button type="button" onclick="requestExternalToolJump('${shiyeLiveUrl}', '视野 live（非官方座位视野工具站）', '${cleanVenue || safeCity}')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🔭 视野 live ↗</button>
            <button type="button" onclick="document.getElementById('vexp-tour-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">📊 场馆体验 (${venueStats.total}${venueStats.unlocked ? '·已聚合' : '/5'}) ▾</button>
            <button type="button" onclick="document.getElementById('buddy-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg obsidian-btn text-white font-medium">🤝 找搭子 (${buddyEntries.length}) ▾</button>
          </div>

          <div class="flex items-center gap-1.5">
            <button type="button" onclick="exportShowICS(${item.cloudId})" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">📅 日历</button>
            <div class="relative">
              <button type="button" data-map-trigger onclick="toggleShowMapMenu(event, this)" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">地图 ▾</button>
              <div data-show-map-menu data-map-venue="${encodeShowMapValue(cleanVenue || safeCity)}" data-map-city="${encodeShowMapValue(safeCity)}" class="hidden absolute right-0 bottom-full mb-1.5 z-50 w-44 p-1.5 rounded-xl bg-white border border-slate-300 shadow-2xl" role="menu">
                <button type="button" role="menuitem" onclick="launchShowMapApp('amap', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🧭 高德 App</button>
                <button type="button" role="menuitem" onclick="launchShowMapApp('baidu', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🗺️ 百度 App</button>
                <button type="button" role="menuitem" onclick="launchShowMapApp('web', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🌐 网页版地图</button>
              </div>
            </div>
          </div>
        </div>

        <div id="guide-drawer-${idx}" class="hidden p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <div class="font-bold text-slate-900">🚇 交通与入场指南：</div>
          <div class="whitespace-pre-line">${item.transport || '• 建议提前 60–90 分钟到达场馆核验身份证入场\n• 禁止携带打火机、专业长焦相机及超尺寸灯牌'}</div>
        </div>

        ${buildVenueExperienceDrawerHTML(item.venue, `vexp-tour-drawer-${idx}`, `vexp-tour-${item.cloudId || idx}`, safeCity, 'ticket')}

        <div id="buddy-drawer-${idx}" class="hidden p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-1">
            <span class="font-bold text-slate-900">🤝 同场观演搭子界面 · ${safeCity}</span>
            <span class="text-[11px] text-slate-500">隐私保护 · 严禁转票定金</span>
          </div>

          <div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-1.5">
              <span class="font-semibold text-slate-700">默认粉籍属性：</span>
              <div class="inline-flex gap-1">
                <button type="button" onclick="changeBuddyBiasMode('group')" class="px-2 py-0.5 rounded ${pref.biasType === 'group' ? 'obsidian-btn text-white' : 'bg-slate-100 text-slate-700'}">团粉</button>
                <button type="button" onclick="changeBuddyBiasMode('solo')" class="px-2 py-0.5 rounded ${pref.biasType === 'solo' ? 'obsidian-btn text-white' : 'bg-slate-100 text-slate-700'}">唯粉</button>
                <button type="button" onclick="changeBuddyBiasMode('cp')" class="px-2 py-0.5 rounded ${pref.biasType === 'cp' ? 'obsidian-btn text-white' : 'bg-slate-100 text-slate-700'}">CP偏好</button>
              </div>
            </div>

            ${pref.biasType === 'solo' ? `
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] text-slate-500">选择本命：</span>
                ${['岳岳', '木子洋', '灵超'].map(m => `
                  <button type="button" onclick="toggleBuddySoloMember('${m}')"
                    class="px-2 py-0.5 rounded text-[11px] border ${pref.biasMembers.includes(m) ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-300'}">
                    ${m}
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <div class="space-y-1.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] text-slate-500">我的标签：</span>
                ${(pref.customTags || []).length
                  ? pref.customTags.map((tag, tIdx) => `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[11px] text-slate-800">
                        <span>#${tag}</span>
                        <button type="button" onclick="removeFanCustomTag(${tIdx})" class="text-slate-400 hover:text-slate-900 font-bold" title="删除此标签">✕</button>
                      </span>
                    `).join('')
                  : `<span class="text-[11px] text-slate-400">暂无标签（可添加如“散场拼车”“看台A区”）</span>`
                }
              </div>
              <div class="flex gap-1.5">
                <input id="buddy-tag-input-${item.cloudId}" type="text" placeholder="添加新标签（如：i人互拍 / 酒店拼房）" class="flex-1 px-2 py-1 rounded border border-slate-300 bg-white text-[11px]" />
                <button type="button" onclick="handleAddBuddyTag(${item.cloudId})" class="px-2.5 py-1 rounded liquid-silver-btn text-[11px] font-medium">+ 添加标签</button>
              </div>
            </div>
          </div>

          <div class="flex gap-1.5">
            <input id="buddy-note-${item.cloudId}" type="text" placeholder="发布本场搭子说明（如：同城高铁出发，看台一起应援）..." class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
            <button type="button" onclick="saveLocalBuddyIntent(${item.cloudId}, '${safeCity}')" class="px-3 py-1.5 rounded-lg obsidian-btn font-semibold shrink-0">发布搭子</button>
          </div>

          <div class="space-y-1.5">
            <div class="text-[11px] font-semibold text-slate-600">📋 本场搭子动态列表（${buddyEntries.length} 条）：</div>
            ${buddyEntries.length
              ? buddyEntries.map(b => `
                  <div class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start justify-between gap-2">
                    <div class="space-y-1 min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-medium">${b.biasLabel}</span>
                        ${(b.tags || []).map(tg => `<span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600">#${tg}</span>`).join('')}
                        <span class="text-[10px] text-slate-400">${b.createdAt || ''}</span>
                      </div>
                      <p class="text-xs text-slate-800 break-words">${b.note}</p>
                    </div>
                    <button type="button" onclick="removeLocalBuddyIntent(${item.cloudId}, ${b.id})" class="text-[11px] text-slate-500 hover:text-slate-900 hover:underline shrink-0">删除</button>
                  </div>
                `).join('')
              : `<div class="p-2.5 rounded-lg bg-white border border-dashed border-slate-300 text-[11px] text-slate-400 text-center">暂无搭子记录，填写上方意向即可生成第一条同场搭子卡片。</div>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now();
  let needRefresh = false;
  document.querySelectorAll('.countdown-badge').forEach(el => {
    const raw = el.getAttribute('data-time') || '';
    const target = new Date(raw.replace(/-/g, '/')).getTime();
    if (isNaN(target)) { el.textContent = ''; return; }
    const diff = target - now;
    if (diff <= 0) { needRefresh = true; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `剩 ${d}天${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  if (needRefresh) renderTourCards();
}

// ================= 城市提取（数据无独立 city 字段） =================
// 优先从「… · 城市站」标题中取城市，取不到再从场馆字符串中兜底归一化，
// 卡片上的具体场馆展示保持不变，仅筛选维度由场馆改为城市。
const UNKNOWN_CITY = '未知城市';
const KNOWN_CITY_NAMES = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '合肥', '西安', '成都', '重庆', '武汉', '长沙', '苏州', '天津', '郑州', '青岛', '厦门', '沈阳',
  '福州', '济南', '石家庄', '佛山', '大连', '海口', '聊城', '南宁', '昆明', '贵阳', '南昌', '太原', '兰州', '长春', '哈尔滨', '乌鲁木齐', '呼和浩特',
  '银川', '西宁', '拉萨', '宁波', '无锡', '常州', '温州', '珠海', '东莞', '中山', '惠州', '汕头', '泉州', '烟台', '潍坊', '临沂', '洛阳', '徐州',
  '保定', '唐山', '大庆', '吉林', '鞍山', '抚顺', '包头', '鄂尔多斯', '扬州', '镇江', '泰州', '盐城', '湖州', '嘉兴', '绍兴', '金华', '台州',
  '芜湖', '蚌埠', '安庆', '桂林', '柳州', '三亚', '绵阳', '德阳', '宜宾', '遵义', '大理', '丽江', '张家界', '宜昌', '襄阳', '荆州', '株洲',
  '湘潭', '衡阳', '岳阳', '常德', '赣州', '九江', '上饶', '景德镇', '莆田', '漳州', '龙岩', '香港', '澳门', '台北'
];

// 归一化城市名：去掉省市县区等行政区后缀与省名前缀（北京市 → 北京，广东省佛山市 → 佛山）。
function normalizeCityName(raw) {
  let name = String(raw || '').trim();
  if (!name) return '';
  name = name.replace(/^(?:中国|中华人民共和国)/, '');
  const cityMatches = [...name.matchAll(/([\u4e00-\u9fa5]{2,6})市/g)];
  if (cityMatches.length) name = cityMatches[cityMatches.length - 1][1];
  name = name.replace(/^.*?(?:省|自治区)/, '');
  return name.replace(/[省市县区]$/g, '').trim();
}

function extractCityFromVenue(venue) {
  const text = String(venue || '').trim();
  if (!text) return '';
  const cityMatches = [...text.matchAll(/([\u4e00-\u9fa5]{2,6})市/g)];
  if (cityMatches.length) {
    const city = normalizeCityName(cityMatches[cityMatches.length - 1][1]);
    if (city) return city;
  }
  // “合肥·奕空间”“聊城·高新区…”这类「城市·场馆」结构
  const headMatch = text.match(/^([\u4e00-\u9fa5]{2,4})\s*[·\-—|]/);
  if (headMatch) {
    const head = normalizeCityName(headMatch[1]);
    if (head && KNOWN_CITY_NAMES.includes(head)) return head;
  }
  return KNOWN_CITY_NAMES.find(city => text.includes(city)) || '';
}

function extractShowCity(item, isArchive) {
  if (!item) return '';
  const label = String((isArchive ? item.title : (item.city || item.title)) || '');
  // 标题/场次名里最后一个“城市站”最可靠（如「燃点」巡演 · 沈阳站、广东·佛山站）
  const stopMatches = [...label.matchAll(/([\u4e00-\u9fa5]{2,6})站/g)];
  for (let i = stopMatches.length - 1; i >= 0; i--) {
    const candidate = normalizeCityName(stopMatches[i][1]);
    if (!candidate) continue;
    if (/收官|加场|返场|首站|最终|巡演|演出|音乐节|演唱会|开票|预售/.test(candidate)) continue;
    return candidate;
  }
  return extractCityFromVenue(item.venue);
}

function getArchiveCity(item) {
  return extractShowCity(item, true) || UNKNOWN_CITY;
}

// 年份与城市筛选选项都从现有往日演出数据中动态去重生成。
function updateArchiveFilterOptions() {
  const yearSel = document.getElementById('archive-year-filter');
  if (yearSel) {
    const current = yearSel.value || 'ALL';
    const years = [...new Set(AppState.cloudArchives.map(a => a.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    yearSel.innerHTML = `<option value="ALL">全部年份</option>` + years.map(y => `<option value="${y}">${y} 年</option>`).join('');
    yearSel.value = years.includes(current) ? current : 'ALL';
  }

  const citySel = document.getElementById('archive-city-filter');
  if (citySel) {
    const current = AppState.activeArchiveCity || citySel.value || 'ALL';
    const cityMap = new Map();
    AppState.cloudArchives.forEach(a => {
      const city = getArchiveCity(a);
      const entry = cityMap.get(city) || { label: city, count: 0 };
      entry.count += 1;
      cityMap.set(city, entry);
    });
    const cities = [...cityMap.values()].sort((a, b) =>
      (b.count - a.count) || a.label.localeCompare(b.label, 'zh-Hans-CN')
    );
    citySel.innerHTML = `<option value="ALL">全部城市</option>` + cities.map(c => {
      const safe = String(c.label).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<option value="${safe}" title="${safe}">${safe}（${c.count}场）</option>`;
    }).join('');
    const resolved = current === 'ALL' || cityMap.has(String(current).trim()) ? current : 'ALL';
    citySel.value = resolved;
    AppState.activeArchiveCity = resolved;
  }
}

function updateArchiveYearOptions() {
  updateArchiveFilterOptions();
}

function setArchiveTypeFilter(type) {
  AppState.activeArchiveType = type;
  ['ALL', 'tour', 'festival'].forEach(t => {
    const btn = document.getElementById(`arc-filter-${t}`);
    if (btn) btn.className = t === type ? 'px-2.5 py-1 rounded-md obsidian-btn font-medium' : 'px-2.5 py-1 rounded-md text-slate-600';
  });
  renderArchiveTimeline();
}

// 数据加载失败时的可见提示（接口报错不能静默显示成“暂无演出”）。
function getShowLoadErrorText() {
  return String(AppState.showLoadError || '').replace(/[<>]/g, '').trim();
}

function renderArchiveTimeline() {
  const box = document.getElementById('archive-timeline-list');
  if (!box) return;
  // 筛选默认值统一归一：'' / null / 'all' 一律视为「全部」，避免默认状态误过滤掉全部演出。
  const rawYear = document.getElementById('archive-year-filter')?.value;
  const rawCity = document.getElementById('archive-city-filter')?.value;
  const year = (!rawYear || /^all$/i.test(String(rawYear).trim())) ? 'ALL' : rawYear;
  const city = (!rawCity || /^all$/i.test(String(rawCity).trim())) ? 'ALL' : rawCity;
  AppState.activeArchiveCity = city;

  // 往日演出统一按演出日期时间正序排列，同日多场按开场时间、记录 ID 次级排序。
  const filtered = AppState.cloudArchives
    .filter(a => {
      if (AppState.activeArchiveType !== 'ALL' && a.subType !== AppState.activeArchiveType) return false;
      if (year !== 'ALL' && a.year !== year) return false;
      if (city !== 'ALL' && getArchiveCity(a) !== city) return false;
      return true;
    })
    .sort(compareShowChronology);

  if (!filtered.length) {
    const loadErr = getShowLoadErrorText();
    box.innerHTML = loadErr
      ? `<div class="text-xs text-rose-600 py-4">⚠️ 往日演出档案加载失败：${loadErr}。请点击右上角「刷新同步」重试。</div>`
      : `<div class="text-xs text-slate-400 py-4">暂无符合筛选条件的往日演出档案</div>`;
    return;
  }

  const showList = AppState.isArchiveExpanded ? filtered : filtered.slice(0, 3);
  let html = showList.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.title || '').replace(/['"<>]/g, '');
    const slotPopoverId = `arc-slot-pop-${item.cloudId || idx}`;
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    const venueStats = computeVenueExperienceStats(item.venue);
    // 所属专题信息：优先展示数据里的专题名，回退到归一化后的专题键。
    const isFest = isFestivalShow(item);
    const seriesKey = resolveShowSeriesKey(item, true);
    const seriesCount = seriesKey ? countSeriesShows(seriesKey) : 0;
    const hasSeries = Boolean(seriesKey) && (isFest || seriesCount >= 2);
    const seriesLabel = String(item.theme || seriesKey || '').replace(/[<>]/g, '');
    const jumpTheme = isFest ? '__ALL_FESTIVALS__' : seriesKey;
    const safeJumpTheme = String(jumpTheme).replace(/['"<>]/g, '');

    return `
      <div class="p-4 rounded-2xl metal-card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="w-16 h-16 poster-square-box shrink-0">
              ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 往日海报" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">ONER</div>`}
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
                <span class="font-bold text-sm text-slate-900 truncate">${safeTitle}</span>
                ${hasSeries && seriesLabel ? `<span class="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-600 font-medium max-w-[14rem] truncate" title="所属专题：${seriesLabel}">🏛️ ${seriesLabel}</span>` : ''}
                ${safeBooth ? `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-medium" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</span>` : ''}
                ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeTitle)}
              </div>
              <p class="text-xs text-slate-500">🗓️ ${item.showDate}${item.showTime ? ` ${item.showTime}` : ''} ｜ 📍 ${item.venue}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            ${hasSeries ? `<button type="button" data-theme="${safeJumpTheme}" onclick="openSeriesModal(this.dataset.theme)" class="px-2.5 py-1.5 rounded-lg obsidian-btn text-white text-xs font-medium">${isFest ? '🎪 音乐节合集' : `🏛️ 专题页${seriesCount > 1 ? ` (${seriesCount}场)` : ''}`} ↗</button>` : ''}
            <button type="button" onclick="document.getElementById('vexp-arc-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">📊 场馆体验 (${venueStats.total}${venueStats.unlocked ? '·已聚合' : '/5'}) ▾</button>
            ${canEditContent() ? `<button type="button" onclick="startEditShow('archive', ${item.cloudId})" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-semibold">✏️ 编辑</button>` : ''}
            <button type="button" onclick="recordFootprintFromShow('${safeTitle}', '${item.showDate}', '${item.venue}', '${item.artist}')" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">+ 足迹</button>
          </div>
        </div>

        ${buildVenueExperienceDrawerHTML(item.venue, `vexp-arc-drawer-${idx}`, `vexp-arc-${item.cloudId || idx}`, safeTitle, 'archive')}
      </div>
    `;
  }).join('');

  if (filtered.length > 3) {
    html += `
      <button type="button" onclick="AppState.isArchiveExpanded = !AppState.isArchiveExpanded; renderArchiveTimeline();"
        class="w-full py-2.5 rounded-xl liquid-silver-btn text-xs font-semibold">
        ${AppState.isArchiveExpanded ? '🔼 收起部分往日档案' : `📂 展开全部 ${filtered.length} 场往日演出档案 ▾`}
      </button>
    `;
  }
  box.innerHTML = html;
}
