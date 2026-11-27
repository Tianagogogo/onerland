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
    // 桌面顶部与移动端底部两套导航都同步激活态
    ['top', 'bottom'].forEach(prefix => {
      const btn = document.getElementById(`${prefix}-tab-${id}`);
      if (!btn) return;
      btn.classList.add('nav-pill');
      btn.classList.toggle('nav-pill-active', id === tabId);
      btn.classList.toggle('text-slate-600', id !== tabId);
      if (id === tabId) btn.classList.remove('text-slate-600');
    });
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
  // 范围日期取首日，兼容 "2026-12-05 ~ 12-06 (连演2天)" 等后台录入格式。
  const datePart = s.split(/\s*(?:~|～|至|到|—|–)\s*/)[0];
  const m = datePart.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})[日号]?(?:[ ](\d{1,2}):(\d{2}))?/);
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
    if (menu !== except) {
      menu.classList.add('hidden');
      menu.parentElement?.querySelector('[data-map-trigger]')?.classList.remove('is-active');
    }
  });
}

function bindShowMapMenuDismiss() {
  if (bindShowMapMenuDismiss.bound) return;
  bindShowMapMenuDismiss.bound = true;
  document.addEventListener('click', event => {
    // 底部操作栏的地图按钮 / 地图菜单由单选状态机统一管理，避免刚打开又被这里关掉
    if (event.target.closest('[data-footer-tab="map"]')) return;
    if (event.target.closest('[data-footer-panel="map"]')) return;
    document.querySelectorAll('[data-show-map-menu]').forEach(menu => {
      if (!menu.contains(event.target)) {
        menu.classList.add('hidden');
        menu.parentElement?.querySelector('[data-map-trigger]')?.classList.remove('is-active');
      }
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
  trigger.classList.toggle('is-active', willOpen);
  trigger.setAttribute('aria-expanded', String(willOpen));
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
            <img src="${src}" data-cap="${safeTitle} · 时间表 #${i + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)"
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
function submitPrivateNoteForm(showKey, formPrefix, rerenderScope, venue, title, date, artist) {
  const input = document.getElementById(`${formPrefix}-priv-note`);
  const text = (input?.value || '').trim();
  if (!text) return alert('请先填写你的私人观演评语！');
  addPrivateShowNote(showKey, text);
  if (input) input.value = '';

  // 私人评语同步写入本机足迹记录：无条目则新建（自动点亮「+ 足迹」），有则覆盖更新
  const payload = {
    showKey,
    experienceNote: text,
    noteUpdatedAt: new Date().toLocaleString('zh-CN')
  };
  if (venue) payload.venue = venue;
  if (title) payload.title = title;
  if (date) payload.date = date;
  if (artist) payload.artist = artist;
  upsertFootprintEntry(payload);

  // 立即重绘：足迹页、纪念卡、首页时间轴与演出卡片（切过去就能看到）
  if (typeof renderFootprintPage === 'function') renderFootprintPage();
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderUpcomingMiniTimeline === 'function') renderUpcomingMiniTimeline();
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

function removePrivateNoteItem(showKey, noteId, rerenderScope) {
  deletePrivateShowNote(showKey, noteId);
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

// ================= 2. 脱敏票根核验（上传图片 → 等待审核通过 → 解锁评分） =================
// 只保留一个图片上传入口：没有图片就没有任何本地绕过通道。
async function handleTicketProofVerify(event, showKey, formPrefix, rerenderScope, ctx = {}) {
  const file = event?.target?.files?.[0] || null;
  if (event?.target) event.target.value = ''; // 允许重复选择同一张图
  if (!file) return;
  if (!/^image\//i.test(file.type || '')) return alert('请上传图片格式的脱敏票根');

  // 先写入「上传中」锁定态，避免等待期间被误认为已解锁
  markTicketProofSubmitted(showKey, { cloudStatus: 'uploading', fileName: file.name });
  refreshShowCardAfterProof(rerenderScope, ctx.drawerId);

  try {
    const info = await uploadTicketProofToCloud({
      showKey,
      artist: ctx.artist || null,
      city: ctx.city || ctx.venue || null,
      showDate: ctx.showDate || null,
      seatArea: null,
      file
    });
    setProofCloudStatus(showKey, 'pending', {
      ...(info || {}),
      fileName: file.name,
      submittedAt: new Date().toLocaleString('zh-CN')
    });
    alert('✅ 脱敏票根已提交，正在等待审核通过。\n\n审核通过后评分入口才会自动解锁；未通过可重新上传。');
  } catch (e) {
    setProofCloudStatus(showKey, 'upload-failed', { fileName: file.name });
    alert(`⚠️ 票根云端提交失败：${e.message}\n\n评分仍保持锁定，请稍后重新上传。`);
  }
  refreshShowCardAfterProof(rerenderScope, ctx.drawerId);
}

// 审核通过后自动刷新卡片，并保持用户正在查看的抽屉展开
function reopenVisibleTourDrawers(prefixes = []) {
  const openIds = Array.from(document.querySelectorAll('[id]'))
    .filter(el => el.id && prefixes.some(p => el.id.startsWith(p)) && !el.classList.contains('hidden'))
    .map(el => el.id);
  if (!openIds.length) return;
  const showsPage = document.getElementById('view-shows-page');
  if (showsPage && !showsPage.classList.contains('hidden')) renderTourCards();
  openIds.forEach(id => {
    document.getElementById(id)?.classList.remove('hidden');
    const btn = document.querySelector(`[data-tour-toggle="${id}"]`);
    if (btn) { btn.classList.add('is-active'); btn.setAttribute('aria-expanded', 'true'); }
  });
}

function refreshShowCardAfterProof(rerenderScope, drawerId) {
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
  if (!drawerId) return;
  const panel = document.getElementById(drawerId);
  if (panel) panel.classList.remove('hidden');
  const btn = document.querySelector(`[data-tour-toggle="${drawerId}"]`);
  if (btn) {
    btn.classList.add('is-active');
    btn.setAttribute('aria-expanded', 'true');
  }
}

// ================= 3. 场馆体验保存（自动归档到我的足迹） =================
function readSelectLabel(formPrefix, key, fallback = '') {
  const el = document.getElementById(`${formPrefix}-${key}`);
  if (!el) return fallback;
  const opt = el.options?.[el.selectedIndex];
  return (opt?.textContent || el.value || fallback).trim();
}

function submitVenueExperienceForm(venueName, showKey, formPrefix, rerenderScope, ctx = {}) {
  if (!isShowTicketVerified(showKey)) {
    return alert('🔒 本场脱敏票根尚未审核通过，评分入口保持锁定。');
  }

  const objectiveScores = {
    seatArea: (document.getElementById(`${formPrefix}-seatarea`)?.value || '').trim(),
    queueTime: readSelectLabel(formPrefix, 'queue', '10-30分钟'),
    bagCheck: readSelectLabel(formPrefix, 'bag', '严格开包/查相机灯牌'),
    storageType: readSelectLabel(formPrefix, 'storage', '场馆自助寄存柜'),
    acLevel: readSelectLabel(formPrefix, 'ac', '体感适中'),
    seatSpacing: readSelectLabel(formPrefix, 'spacing', '常规间距'),
    viewQuality: readSelectLabel(formPrefix, 'view', '视角尚可'),
    showExperience: readSelectLabel(formPrefix, 'showexp', '声场/舞美正常'),
    experienceNote: (document.getElementById(`${formPrefix}-expnote`)?.value || '').trim()
  };

  try {
    addVerifiedVenueObjectiveScore(venueName, showKey, objectiveScores);

    // 保存即自动点亮「+ 足迹」，并把评分维度 / 座位大区 / 体验记录归档到对应场次
    upsertFootprintEntry({
      showKey,
      title: ctx.showTitle || '',
      date: ctx.showDate || '',
      venue: venueName,
      artist: ctx.artist || 'ONER',
      seatArea: objectiveScores.seatArea,
      venueScores: {
        安检排队: objectiveScores.queueTime,
        安检翻包: objectiveScores.bagCheck,
        寄存方式: objectiveScores.storageType,
        场馆空调: objectiveScores.acLevel,
        座位间距: objectiveScores.seatSpacing,
        视角体验: objectiveScores.viewQuality,
        演出体验: objectiveScores.showExperience
      },
      experienceNote: objectiveScores.experienceNote,
      ratedAt: new Date().toLocaleString('zh-CN')
    });

    if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
    if (typeof renderFootprintPage === 'function' &&
        !document.getElementById('view-footprint-page')?.classList.contains('hidden')) {
      renderFootprintPage();
    }
    refreshShowCardAfterProof(rerenderScope, ctx.drawerId);
    alert('✅ 已保存并归档到「我的足迹」：\n· 七项评分维度\n· 座位大区\n· 个人体验记录\n\n同一场次重复保存会自动覆盖更新，不会产生重复条目。');
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

function buildProofUploadButtonHTML(showKey, formPrefix, rerenderScope, drawerId, ctx, label) {
  const safeShowKey = String(showKey).replace(/['"<>]/g, '');
  const safeVenue = String(ctx.venue || '').replace(/['"<>]/g, '');
  const safeTitle = String(ctx.showTitle || '').replace(/['"<>]/g, '');
  const safeDate = String(ctx.showDate || '').replace(/['"<>]/g, '');
  const safeArtist = String(ctx.artist || 'ONER').replace(/['"<>]/g, '');
  const safeDrawer = String(drawerId || '').replace(/['"<>]/g, '');
  return `
    <label class="tour-action-btn cursor-pointer max-w-full" style="max-width:100%">
      <span class="truncate">${label || '核验票根并解锁评分'}</span>
      <input type="file" accept="image/*" class="hidden"
        onchange="handleTicketProofVerify(event, '${safeShowKey}', '${formPrefix}', '${rerenderScope}', {venue:'${safeVenue}', city:'${safeVenue}', showTitle:'${safeTitle}', showDate:'${safeDate}', artist:'${safeArtist}', drawerId:'${safeDrawer}'})" />
    </label>
  `;
}

function escapeSecurityText(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 演出期间：点选安检严格程度即存本机并立即回显
function pickSecurityLevel(showKey, formPrefix, level) {
  const rec = saveSecurityExperience(showKey, { level });
  const box = document.getElementById(`${formPrefix}-sec-detail`)?.closest('.p-3');
  if (box) {
    box.querySelectorAll('button[onclick^="pickSecurityLevel"]').forEach(btn => {
      const isHit = btn.textContent.trim() === level;
      btn.classList.toggle('is-active', isHit);
    });
  }
  const status = document.getElementById(`${formPrefix}-sec-status`);
  if (status) status.textContent = rec ? `✅ 已保存 · ${rec.updatedAt}` : '尚未填写，选择等级或输入详情后自动保存';
  refreshFootprintAfterSecurity(showKey);
}

// 演出期间：自定义安检详情实时保存（每次输入即写 localStorage）
function updateSecurityDetail(showKey, formPrefix, value) {
  const rec = saveSecurityExperience(showKey, { detail: value });
  const status = document.getElementById(`${formPrefix}-sec-status`);
  if (status) status.textContent = rec ? `✅ 已保存 · ${rec.updatedAt}` : '尚未填写，选择等级或输入详情后自动保存';
}

function refreshFootprintAfterSecurity(showKey) {
  if (typeof renderFootprintPage === 'function') renderFootprintPage();
}

// ================= 安检体验：云端公共投票（匿名聚合，无自由文本） =================
const SECURITY_VOTE_SQL_HINT = `-- 在 Supabase SQL Editor 执行一次即可开启云端共享（缺表时前端自动降级为仅本机）
create table if not exists public.security_votes (
  id bigserial primary key,
  show_key text not null,
  venue text default '',
  level text not null,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
alter table public.security_votes enable row level security;
create policy "security_votes read" on public.security_votes for select using (true);
create policy "security_votes insert" on public.security_votes for insert with check (true);
create policy "security_votes update" on public.security_votes for update using (true) with check (true);
create index if not exists security_votes_show_key_idx on public.security_votes (show_key);`;

function escapeVoteText(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function hydrateSecurityVoteBlocks() {
  const hosts = Array.from(document.querySelectorAll('[data-security-vote]'));
  for (const host of hosts) {
    if (host.dataset.hydrating === '1' || host.dataset.ready === '1') continue;
    const key = host.dataset.showKey;
    if (!key) continue;
    host.dataset.hydrating = '1';
    let stats;
    try {
      stats = await fetchSecurityVoteStats(key);
    } catch (e) {
      stats = { total: 0, degraded: true };
    }
    host.dataset.hydrating = '0';
    if (!document.body.contains(host)) continue;
    renderSecurityVoteBlock(host, stats);
  }
}

function renderSecurityVoteBlock(host, stats) {
  const key = host.dataset.showKey;
  const venue = host.dataset.venue || '';
  const myVote = (stats && stats.myVote) || getMySecurityVote(key) || {};
  const safeKey = escapeVoteText(key);
  const safeVenue = escapeVoteText(venue);
  const total = stats && stats.total ? stats.total : 0;
  const pct = (stats && stats.levelPct) || {};
  const tagCount = (stats && stats.tagCount) || {};
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--fan-theme-solid').trim() || '#0F172A';

  const levelRows = SECURITY_LEVELS.map(level => {
    const value = total ? (pct[level] || 0) : 0;
    const active = myVote.level === level;
    return `
      <button type="button" data-vote-inner
        onclick="castSecurityVoteLevel('${safeKey}', '${safeVenue}', '${escapeVoteText(level)}', event)"
        class="w-full text-left p-2 rounded-lg border transition-colors ${active ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-50 hover:bg-white'}">
        <div class="flex items-center justify-between gap-2 text-[11px]">
          <span class="font-medium text-slate-800">${active ? '✓ ' : ''}${level}</span>
          <span class="font-mono text-slate-600">${value}% · ${(stats.levelCount && stats.levelCount[level]) || 0} 人</span>
        </div>
        <div class="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div class="h-full rounded-full" style="width:${value}%;background:${active ? accent : '#94A3B8'}"></div>
        </div>
      </button>
    `;
  }).join('');

  const tagChips = (window.SECURITY_VOTE_TAGS || []).map(tag => {
    const on = Array.isArray(myVote.tags) && myVote.tags.includes(tag);
    const count = tagCount[tag] || 0;
    return `
      <button type="button" data-vote-inner
        onclick="castSecurityVoteTag('${safeKey}', '${safeVenue}', '${escapeVoteText(tag)}', event)"
        class="tour-action-btn tour-action-btn--mini ${on ? 'is-active' : ''}" aria-pressed="${on}">
        ${on ? '✓ ' : ''}${tag}${count ? ` · ${count}` : ''}
      </button>
    `;
  }).join('');

  const degradedHtml = stats && stats.degraded ? `
    <div class="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1">
      <div class="font-semibold">⚠️ 云端公共投票暂不可用，已自动降级为「仅本机备忘」模式。</div>
      <details class="text-[10px]">
        <summary class="cursor-pointer">查看建表 SQL（开启全员共享）</summary>
        <pre class="mt-1 p-2 rounded bg-white/70 border border-amber-200 overflow-x-auto text-[10px] leading-relaxed whitespace-pre">${escapeVoteText(SECURITY_VOTE_SQL_HINT)}</pre>
      </details>
    </div>
  ` : '';

  host.dataset.ready = '1';
  host.innerHTML = `
    <div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between flex-wrap gap-1">
        <span class="text-[11px] font-semibold text-slate-700">🌐 云端公共安检投票（匿名 · 全员实时可见）</span>
        <span class="text-[10px] text-slate-500">已有 <strong class="text-slate-800">${total}</strong> 人确认</span>
      </div>
      <div class="space-y-1.5">${levelRows}</div>
      <div>
        <div class="text-[11px] text-slate-500 mb-1">🚫 合规提醒标签（可多选，实时统计）：</div>
        <div class="flex flex-wrap gap-1.5 security-tag-row">${tagChips}</div>
      </div>
      <div class="text-[10px] text-slate-400">仅统计票数，不上传任何自由文本、账号或截图；同一浏览器可随时修改自己的一票。</div>
      ${degradedHtml}
    </div>
  `;
}

async function castSecurityVoteLevel(showKey, venue, level, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const mine = getMySecurityVote(showKey) || {};
  const res = await submitSecurityVote(showKey, venue, level, mine.tags || []);
  // 本机镜像一份等级，散场后归档到「场馆体验」与足迹
  if (typeof saveSecurityExperience === 'function') saveSecurityExperience(showKey, { level });
  await refreshSecurityVoteHosts(showKey, res);
}

async function castSecurityVoteTag(showKey, venue, tag, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const mine = getMySecurityVote(showKey) || {};
  if (!mine.level) {
    alert('请先选择一档安检严格程度，再勾选合规标签。');
    return;
  }
  const tags = Array.isArray(mine.tags) ? [...mine.tags] : [];
  const idx = tags.indexOf(tag);
  if (idx >= 0) tags.splice(idx, 1);
  else tags.push(tag);
  const res = await submitSecurityVote(showKey, venue, mine.level, tags);
  await refreshSecurityVoteHosts(showKey, res);
}

async function refreshSecurityVoteHosts(showKey, res) {
  const stats = await fetchSecurityVoteStats(showKey);
  const escapedKey = (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') ? CSS.escape(showKey) : String(showKey).replace(/["\\]/g, '\\$&');
  const hosts = Array.from(document.querySelectorAll(`[data-security-vote][data-show-key="${escapedKey}"]`));
  hosts.forEach(host => {
    host.dataset.ready = '0';
    renderSecurityVoteBlock(host, stats);
  });
  if (res && res.ok === false && res.error) {
    console.warn('security_votes 云端写入失败（已保留本机票）:', res.error);
  }
}

function buildVenueExperienceDrawerHTML(venueName, drawerId, formPrefix, showTitle, rerenderScope, meta = {}) {
  const cleanVenue = normalizeVenueKey(venueName) || '未命名场馆';
  const showKey = buildShowKey(cleanVenue, showTitle);
  const safeShowKey = showKey.replace(/['"<>]/g, '');
  const safeVenueAttr = cleanVenue.replace(/['"<>]/g, '');

  const verified = isShowTicketVerified(showKey);
  const stats = computeVenueExperienceStats(cleanVenue);
  const privateNotes = getPrivateShowNotes(showKey);
  const cloudStatus = getProofCloudStatus(showKey);
  const proofRecord = getVerifiedTicketMap()[showKey] || {};

  // 已提交的场次每次展开都尝试向云端对齐一次复核结果（只会升级为 approved）
  if (cloudStatus === 'pending') syncMyProofStatus(showKey);

  const ctx = {
    venue: cleanVenue,
    city: meta.city || cleanVenue,
    showTitle: String(showTitle || ''),
    showDate: meta.showDate || '',
    artist: meta.artist || 'ONER',
    drawerId
  };

  const escAttr = v => String(v == null ? '' : v).replace(/['"<>]/g, '');
  const safeCtxVenue = escAttr(cleanVenue);
  const safeCtxTitle = escAttr(ctx.showTitle);
  const safeCtxDate = escAttr(ctx.showDate);
  const safeCtxArtist = escAttr(ctx.artist);

  // 演出尚未结束（含连开期间）走「安检体验」；末场次日零点起自动切换为「场馆体验」
  const dateRange = getShowDateRange(ctx.showDate);
  // 只有「待开演 / 正在演出」的巡演卡片才有安检体验阶段；往日档案固定为场馆体验
  const showRunning = rerenderScope === 'archive' ? false : isShowStillRunning(ctx.showDate);
  const securityRecord = getSecurityExperience(showKey);

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
                <div class="h-full rounded-full" style="width:${q.pct}%;background:var(--fan-theme-solid,#334155)"></div>
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

  const securityPanelHtml = `
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5 security-panel">
      <div class="flex items-center justify-between flex-wrap gap-1">
        <span class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
          🛡️ 演出期间安检体验
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold">免票根核验</span>
        </span>
        <span class="text-[11px] text-slate-400">云端全员共享 + 本机私人备忘</span>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">本场仍在演出期间（${dateRange.startDate || ctx.showDate}${dateRange.endDate && dateRange.endDate !== dateRange.startDate ? ` ~ ${dateRange.endDate}` : ''}）。公共区只做四档投票与合规标签统计，任何人不上传自由文本；私人笔记仅存本机，散场次日起自动归档到「场馆体验」与「我的足迹」。</p>

      <div data-security-vote data-show-key="${safeShowKey}" data-venue="${safeCtxVenue}">
        <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">⏳ 正在同步全场安检投票…</div>
      </div>

      <div>
        <label class="text-[11px] text-slate-500 block mb-1">📝 我的私人安检笔记（仅本机保存，不公开 · 散场后自动归档至我的足迹）</label>
        <textarea id="${formPrefix}-sec-detail" rows="3"
          oninput="updateSecurityDetail('${safeShowKey}', '${formPrefix}', this.value)"
          onblur="refreshFootprintAfterSecurity('${safeShowKey}')"
          placeholder="仅自己可见：如翻包细节、寄存位置、入场排队时长、和朋友碰面的经验…"
          class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white">${escapeSecurityText(securityRecord && securityRecord.detail)}</textarea>
      </div>
      <div class="text-[11px] text-slate-400" id="${formPrefix}-sec-status">${securityRecord ? `✅ 已保存 · ${escapeSecurityText(securityRecord.updatedAt)}` : '尚未填写，输入后自动保存在本机'}</div>
    </div>
  `;

  const securityArchiveHtml = `
    <div class="p-3 rounded-xl bg-white border border-slate-300 space-y-1.5 security-panel">
      <div class="flex items-center justify-between flex-wrap gap-1">
        <span class="font-bold text-slate-900">🛡️ 演出期间安检体验归档</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold">本机笔记 + 云端统计</span>
      </div>
      ${securityRecord ? `
        <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span class="text-slate-500">我的严格程度：</span>
          <span class="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 font-semibold text-slate-800">${escapeSecurityText(securityRecord.level || '未选择')}</span>
        </div>
        ${securityRecord.detail
          ? `<p class="whitespace-pre-line text-[11px] text-slate-700">📝 ${escapeSecurityText(securityRecord.detail)}</p>`
          : `<p class="text-[11px] text-slate-400">未填写私人安检笔记。</p>`}
        ${securityRecord.updatedAt ? `<div class="text-[10px] text-slate-400">记录时间：${escapeSecurityText(securityRecord.updatedAt)}</div>` : ''}
      ` : `<p class="text-[11px] text-slate-400">本场演出期间未留下个人安检笔记，可参考下方云端统计。</p>`}
      <div data-security-vote data-show-key="${safeShowKey}" data-venue="${safeCtxVenue}" class="pt-1"></div>
    </div>
  `;

  const lockedPanelHtml = `
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
      <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
        🔒 公开发布客观体验评分需先上传脱敏票根并通过审核
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">请先涂抹掉票根/订单截图上的<strong>订单号、条形码、二维码、姓名与身份证号</strong>，仅保留场次信息。提交后进入「等待审核通过」锁定状态，审核通过前不开放任何评分入口。</p>
      <div class="flex justify-start">
        ${buildProofUploadButtonHTML(showKey, formPrefix, rerenderScope, drawerId, ctx, cloudStatus ? '重新上传脱敏票根' : '核验票根并解锁评分')}
      </div>
      ${cloudStatus === 'uploading' ? `<div class="text-[11px] text-slate-600">⏳ 正在上传脱敏票根…</div>` : ''}
      ${cloudStatus === 'pending' ? `<div class="text-[11px] text-slate-600">⏳ 已提交，等待审核通过（${proofRecord.submittedAt || '刚刚'}）。审核通过后本卡片会自动解锁评分。</div>` : ''}
      ${cloudStatus === 'rejected' ? `<div class="text-[11px] text-rose-600">⚠️ 审核未通过，请重新上传更清晰的脱敏票根。</div>` : ''}
      ${cloudStatus === 'upload-failed' ? `<div class="text-[11px] text-slate-600">⚠️ 上传未成功，评分仍保持锁定，请重新上传。</div>` : ''}
    </div>
  `;

  const scoringPanelHtml = `
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
      <div class="flex items-center justify-between flex-wrap gap-1">
        <span class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
          ✅ 脱敏票根已通过审核 · 可发布客观体验评分
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold" title="脱敏票根已通过审核">🛡️ 已核验票根</span>
        </span>
        <span class="text-[11px] text-slate-500">保存后自动归档到「我的足迹」</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label class="text-[11px] text-slate-500 block mb-1">💺 座位大区</label>
          <input id="${formPrefix}-seatarea" type="text" placeholder="如：内场A区 / 看台203" value="${String(proofRecord.area || '').replace(/"/g, '&quot;')}" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white" />
        </div>
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
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div>
          <label class="text-[11px] text-slate-500 block mb-1">🛅 现场寄存方式</label>
          <select id="${formPrefix}-storage" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
            <option value="场馆自助寄存柜">场馆自助寄存柜</option>
            <option value="现场人工寄存处">现场人工寄存处</option>
            <option value="附近地铁/商圈寄存">附近地铁/商圈寄存</option>
            <option value="无寄存点（需轻装）">无寄存点（需轻装）</option>
          </select>
        </div>
        <div>
          <label class="text-[11px] text-slate-500 block mb-1">❄️ 场馆空调</label>
          <select id="${formPrefix}-ac" class="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
            <option value="冷气很足">冷气很足（建议薄外套）</option>
            <option value="体感适中" selected>体感适中</option>
            <option value="偏闷热">偏闷热/空调弱</option>
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

      <div>
        <label class="text-[11px] text-slate-500 block mb-1">📝 本场个人体验记录（随评分一起归档到足迹）</label>
        <textarea id="${formPrefix}-expnote" rows="2" placeholder="本场最想记下的细节：视线、声场、散场、和谁一起…" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"></textarea>
      </div>

      <div class="flex justify-start">
        <button type="button"
          onclick="submitVenueExperienceForm('${safeVenueAttr}', '${safeShowKey}', '${formPrefix}', '${rerenderScope}', {showTitle:'${String(showTitle || '').replace(/['"<>]/g, '')}', showDate:'${String(meta.showDate || '').replace(/['"<>]/g, '')}', artist:'${String(meta.artist || 'ONER').replace(/['"<>]/g, '')}', drawerId:'${String(drawerId || '').replace(/['"<>]/g, '')}'})"
          class="tour-action-btn font-semibold">
          保存体验评分并归档到足迹
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
      <div class="flex gap-1.5 security-note-row">
        <input id="${formPrefix}-priv-note" type="text" placeholder="记录仅自己看的观演感受、座位号细节、舞台回忆..." class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white security-note-input" />
        <button type="button" onclick="submitPrivateNoteForm('${safeShowKey}', '${formPrefix}', '${rerenderScope}', '${safeCtxVenue}', '${safeCtxTitle}', '${safeCtxDate}', '${safeCtxArtist}')" class="tour-action-btn shrink-0 security-note-submit">仅自己保存</button>
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

  // 散场次日起：本机私人安检笔记自动归档到「我的足迹」对应场次（已有条目则覆盖更新）
  if (!showRunning && securityRecord && (securityRecord.detail || securityRecord.level) && ctx.showDate) {
    try {
      upsertFootprintEntry({
        showKey,
        title: ctx.showTitle || '',
        date: ctx.showDate,
        venue: cleanVenue,
        artist: ctx.artist,
        securityLevel: securityRecord.level || '',
        securityDetail: securityRecord.detail || '',
        securityUpdatedAt: securityRecord.updatedAt || ''
      });
    } catch (e) { /* 归档失败不影响面板展示 */ }
  }

  return `
    <div id="${drawerId}" data-footer-panel="venue" class="hidden p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs space-y-3">
      ${showRunning
        ? `${securityPanelHtml}${privateNotesHtml}`
        : `${securityArchiveHtml}${publicStatsHtml}${verified ? scoringPanelHtml : lockedPanelHtml}${privateNotesHtml}`}
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
    btns.push(`<button type="button" onclick="openSeriesModal('__ALL_FESTIVALS__')" class="text-xs tour-action-btn tour-action-btn--mini font-medium">🎪 全部音乐节聚合（${festCount}场）↗</button>`);
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
            <div class="w-16 poster-square-box shrink-0">
              ${s.posterUrl ? `<img src="${s.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 海报" ${posterImgAttrs(s.posterUrl, stops.indexOf(s))} onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" />` : `<div class="w-full h-full flex items-center justify-center text-[10px] text-slate-400">ONER</div>`}
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

function changeBuddyBiasMode(mode, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const patch = { biasType: mode };
  const cur = getFanPrefState();
  if (mode === 'solo') {
    if (cur.biasMembers.includes('ONER') || cur.biasMembers.length === 0) {
      patch.biasMembers = ['岳岳'];
    } else if (cur.biasMembers.length > 1) {
      patch.biasMembers = [cur.biasMembers[0]];
    }
  } else if (mode === 'cp') {
    let next = cur.biasMembers.filter(m => m !== 'ONER');
    if (next.length === 0) next = ['岳岳', '木子洋'];
    patch.biasMembers = next.slice(0, 2);
  } else if (mode === 'group') {
    if (cur.biasMembers.length === 0) patch.biasMembers = ['ONER'];
  }
  saveFanPrefState(patch);
  renderTourCards();
}

function toggleBuddySoloMember(memberName, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const cur = getFanPrefState();
  let next = [...cur.biasMembers];
  const idx = next.indexOf(memberName);
  
  if (idx >= 0) {
    if (cur.biasType !== 'group' && next.length <= 1) return;
    next.splice(idx, 1);
  } else {
    if (cur.biasType === 'solo') {
      next = [memberName];
    } else if (cur.biasType === 'cp') {
      if (next.length >= 2) next.shift();
      next.push(memberName);
    } else {
      next.push(memberName);
    }
  }
  saveFanPrefState({ biasMembers: next });
  renderTourCards();
}

// 预设搭子标签
const PRESET_BUDDY_TAGS = ['看台邻座', '内场同区', '散场拼车', '酒店拼房', '同城出发', '场馆外打卡', 'i人互拍', '一起喊应援'];
if (!window.selectedBuddyTags) window.selectedBuddyTags = {};

function toggleBuddyPresetTag(cloudId, tag, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (event && event.preventDefault) event.preventDefault();
  if (!window.selectedBuddyTags[cloudId]) window.selectedBuddyTags[cloudId] = [];
  const tags = window.selectedBuddyTags[cloudId];
  const idx = tags.indexOf(tag);
  if (idx >= 0) tags.splice(idx, 1);
  else tags.push(tag);

  // 只更新当前这一组标签按钮，绝不触发整张卡片重绘（否则展开态会被重置）
  const trigger = event && (event.currentTarget || event.target);
  const host = trigger && trigger.closest ? trigger.closest('[data-buddy-tag-group]') : null;
  const on = tags.includes(tag);
  if (host) {
    host.querySelectorAll('[data-buddy-tag]').forEach(btn => {
      const isOn = tags.includes(btn.dataset.buddyTag);
      btn.classList.toggle('colored-pill', isOn);
      btn.classList.toggle('is-active', isOn);
      btn.style.background = isOn ? getBuddyTheme() : '';
      btn.setAttribute('aria-pressed', String(isOn));
    });
    return;
  }
  // 没有事件上下文时的兜底：重绘但恢复展开态
  renderTourCards();
}

function getMergedBuddyEntries(cloudId) {
  const local = getBuddyListByShow(cloudId);
  const cloud = window.buddyCloudCache[cloudId] || [];
  const cloudIds = new Set(cloud.map(x => String(x.id)));
  return [...cloud, ...local.filter(x => !cloudIds.has(String(x.id)))];
}

function isBuddyOwner(entry) {
  const owner = String((entry && (entry.deviceId || entry.ownerId)) || '');
  return Boolean(owner) && owner === String(getDeviceId());
}

function escapeBuddyText(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderBuddyContactRow(label, value) {
  if (!value) return '';
  const safe = escapeBuddyText(value);
  return `<div class="flex items-center gap-1.5 text-[10px] text-slate-600">
    <span class="shrink-0">${label}</span>
    <span class="font-mono break-all">${safe}</span>
    <button type="button" onclick="copyBuddyContact('${safe}', event)" class="tour-action-btn tour-action-btn--mini shrink-0">复制</button>
  </div>`;
}

function renderBuddyOwnerRequests(b) {
  const state = buddyStateFor(b.id);
  const reqs = state.ownerRequests || [];
  if (!reqs.length) return '';
  return `
    <div class="mt-1.5 pt-1.5 border-t border-slate-100 space-y-1.5">
      <div class="text-[10px] font-semibold text-slate-500">📨 收到的互换申请（${reqs.length}）</div>
      ${reqs.map(r => `
        <div class="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
          <div class="flex items-center justify-between gap-1.5">
            <span class="text-[10px] font-semibold text-slate-700">${escapeBuddyText(r.requesterNickname)}</span>
            <span class="text-[9px] text-slate-400">${escapeBuddyText(r.createdAt)}</span>
          </div>
          ${r.note ? `<div class="text-[10px] text-slate-500">备注：${escapeBuddyText(r.note)}</div>` : ''}
          ${r.status === 'accepted'
            ? `<div class="space-y-1 pt-0.5">
                 ${renderBuddyContactRow('对方：', r.contact || '对方未填写')}
                 ${renderBuddyContactRow('我的：', state.myContact || '')}
               </div>`
            : `<div class="flex items-center justify-between gap-1.5 pt-0.5">
                 <span class="text-[9px] text-slate-400">同意后才会互相展示联系方式</span>
                 <button type="button" onclick="acceptBuddyRequestUI('${b.id}', '${r.id}', event)" class="tour-action-btn tour-action-btn--mini shrink-0">✅ 同意并互换</button>
               </div>`}
        </div>
      `).join('')}
    </div>
  `;
}

function renderBuddyEntryCard(cloudId, b, canManage) {
  const bTheme = b.theme || '#64748b';
  const themeSolid = bTheme.includes('gradient') ? (bTheme.match(/#[A-Za-z0-9]{3,6}/)?.[0] || '#64748b') : bTheme;
  const who = (b.nickname ? `${b.nickname} · ` : '') + (b.fandomType || '');
  const state = buddyStateFor(b.id);
  const myReq = state.myRequest;

  let actionHtml = '';
  if (canManage) {
    actionHtml = `
      <div class="flex flex-col gap-1 shrink-0">
        <button type="button" onclick="withdrawBuddyIntent('${cloudId}', '${b.id}', event)" class="tour-action-btn tour-action-btn--mini">撤销</button>
        <button type="button" onclick="markBuddyFound('${cloudId}', '${b.id}', event)" class="tour-action-btn tour-action-btn--mini">已找到</button>
      </div>`;
  } else if (myReq && myReq.status === 'accepted') {
    actionHtml = `<div class="shrink-0">${renderBuddyContactRow('对方：', state.publisherContact || '')}</div>`;
  } else if (myReq && myReq.status === 'pending') {
    actionHtml = `<span class="text-[10px] text-slate-400 shrink-0">⏳ 等待对方同意</span>`;
  } else {
    actionHtml = `<button type="button" onclick="openBuddyRequestModal('${b.id}', '${cloudId}', event)" class="tour-action-btn tour-action-btn--mini shrink-0">👋 申请互换联系方式</button>`;
  }

  const adminDeleteBtn = (typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified)
    ? `<button type="button" onclick="adminDeleteBuddyCard('${b.id}', '${cloudId}', event)"
         class="text-[10px] px-2 py-0.5 rounded-md bg-rose-600 text-white font-semibold shrink-0">🗑️ 管理员删除</button>`
    : '';

  return `
    <div class="p-2.5 rounded-xl bg-white border transition-all hover:shadow-md"
      style="border-color: ${themeSolid}22">
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-1.5 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-md text-white text-[10px] font-bold" style="background: ${bTheme}">${b.biasLabel}</span>
            ${(b.tags || []).map(tg => `
              <span class="px-2 py-0.5 rounded-md border text-[10px] font-medium"
                style="background: ${themeSolid}0D; color: ${themeSolid}; border-color: ${themeSolid}33">#${tg}</span>
            `).join('')}
            <span class="text-[10px] text-slate-400">${who}${who ? ' · ' : ''}${b.createdAt || ''}</span>
          </div>
        </div>
        ${actionHtml}
      </div>
      ${adminDeleteBtn ? `<div class="pt-1.5 flex justify-end">${adminDeleteBtn}</div>` : ''}
      ${canManage ? renderBuddyOwnerRequests(b) : ''}
    </div>
  `;
}

function renderBuddyListHtml(cloudId) {
  const entries = getMergedBuddyEntries(cloudId);
  if (!entries.length) {
    return `<div class="p-4 rounded-xl bg-white border border-dashed border-slate-300 text-[11px] text-slate-400 text-center">选中上方预设标签，即可一键生成你的同场搭子卡片。</div>`;
  }
  return entries.map(b => renderBuddyEntryCard(cloudId, b, isBuddyOwner(b))).join('');
}

function renderBuddyPanel(cloudId) {
  const host = document.querySelector(`[data-buddy-list="${cloudId}"]`);
  if (host) host.innerHTML = renderBuddyListHtml(cloudId);
  const count = document.querySelector(`[data-buddy-count="${cloudId}"]`);
  if (count) count.textContent = String(getMergedBuddyEntries(cloudId).length);
}

function resetBuddyTagButtons(cloudId) {
  const group = document.querySelector(`[data-buddy-card="${cloudId}"] [data-buddy-tag-group]`);
  if (!group) return;
  group.querySelectorAll('[data-buddy-tag]').forEach(btn => {
    btn.classList.remove('colored-pill', 'is-active');
    btn.style.background = '';
    btn.setAttribute('aria-pressed', 'false');
  });
}

async function loadBuddyRequestStates(cloudId) {
  const entries = getMergedBuddyEntries(cloudId).filter(b => !String(b.id).startsWith('tmp-'));
  for (const b of entries.slice(0, 30)) {
    if (isBuddyOwner(b)) {
      const reqs = await fetchBuddyRequests(b.id, b.deviceId || b.ownerId);
      if (reqs.some(r => r.status === 'accepted')) {
        const state = buddyStateFor(b.id);
        if (!state.myContact) state.myContact = await fetchBuddyContact(b.id);
      }
    } else {
      await fetchMyBuddyRequest(b.id);
    }
  }
}

async function refreshBuddyPanel(cloudId) {
  renderBuddyPanel(cloudId);
  const list = await fetchBuddyIntents(cloudId);
  if (list) {
    renderBuddyPanel(cloudId);
    await loadBuddyRequestStates(cloudId);
    renderBuddyPanel(cloudId);
  }
}

function openBuddyRequestModal(buddyId, eventId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (typeof openBuddyRequestDialog === 'function') {
    openBuddyRequestDialog(buddyId, eventId);
    return;
  }
  alert('申请弹窗暂不可用，请刷新页面重试');
}

function openBuddyRequestDialog(buddyId, eventId) {
  window.buddyRequestTarget = { buddyId: String(buddyId), eventId: String(eventId) };
  const modal = document.getElementById('buddy-request-modal');
  if (!modal) { alert('申请弹窗缺失，请刷新页面'); return; }
  modal.classList.remove('hidden');
  const note = document.getElementById('buddy-req-note');
  if (note) { note.value = ''; setTimeout(() => note.focus(), 30); }
  const contact = document.getElementById('buddy-req-contact');
  if (contact) contact.value = '';
}

async function submitBuddyRequestFromModal() {
  const target = window.buddyRequestTarget || {};
  if (!target.buddyId) return;
  const noteEl = document.getElementById('buddy-req-note');
  const contactEl = document.getElementById('buddy-req-contact');
  const note = (noteEl ? noteEl.value : '').trim();

  const entry = getMergedBuddyEntries(target.eventId).find(x => String(x.id) === String(target.buddyId));
  if (!entry) return alert('该搭子信息已失效，请刷新后重试');

  // 同一设备对同一条搭子只能申请一次（先判重，再校验表单内容）
  const state = buddyStateFor(entry.id);
  if (state.myRequest && (state.myRequest.status === 'pending' || state.myRequest.status === 'accepted')) {
    return alert('你已申请过该搭子，请等待对方处理，无需重复提交');
  }
  const fresh = await fetchMyBuddyRequest(entry.id);
  if (fresh && (fresh.status === 'pending' || fresh.status === 'accepted')) {
    return alert('你已申请过该搭子，请等待对方处理，无需重复提交');
  }

  const cooldownKey = `request:${entry.id}`;
  const waitLeft = getBuddyCooldownLeft(cooldownKey);
  if (waitLeft > 0) return alert(`申请太频繁，请 ${waitLeft} 秒后再试`);

  const platformEl = document.getElementById('buddy-req-platform');
  const platform = platformEl ? platformEl.value : '微信号';
  const accountId = (contactEl ? contactEl.value : '').trim().slice(0, 30);
  const check = validateBuddyContactInfo(accountId);
  if (!check.ok) return alert(check.reason);
  const contact = `${platform}：${accountId}`;

  const res = await sendBuddyRequest(entry, note, contact);
  if (!res.ok) {
    if (res.reason === 'self') return alert('这是你自己发布的搭子信息');
    return alert(`申请提交失败（${res.reason}），请稍后再试`);
  }
  markBuddyCooldown(cooldownKey);
  document.getElementById('buddy-request-modal')?.classList.add('hidden');
  if (noteEl) noteEl.value = '';
  if (contactEl) contactEl.value = '';
  renderBuddyPanel(target.eventId);
  alert('申请已发送，等待对方同意后即可互相看到联系方式');
}

async function adminDeleteBuddyCard(buddyId, eventId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (typeof AppState === 'undefined' || !AppState.isAdminPasswordVerified) {
    return alert('需要先使用管理员密码解锁');
  }
  if (!confirm('确认删除这条搭子信息？该操作对所有访客生效。')) return;
  const res = await adminDeleteBuddyIntent(buddyId);
  if (!res.ok) {
    if (res.reason === 'forbidden') return alert('需要先使用管理员密码解锁');
    return alert(`删除失败（${res.reason}），可能受行级权限限制`);
  }
  window.buddyCloudCache[eventId] = (window.buddyCloudCache[eventId] || []).filter(x => String(x.id) !== String(buddyId));
  renderBuddyPanel(eventId);
  alert('已删除该搭子信息');
}

async function acceptBuddyRequestUI(buddyId, requestId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const res = await acceptBuddyRequest(buddyId, requestId);
  if (!res.ok) return alert('同意失败，请稍后重试');
  const state = buddyStateFor(buddyId);
  await fetchBuddyRequests(buddyId, getDeviceId());
  if (!state.myContact) state.myContact = await fetchBuddyContact(buddyId);
  if (window.__buddyActiveEventId) renderBuddyPanel(window.__buddyActiveEventId);
  else renderTourCards();
  alert('已同意，双方联系方式已互相解锁');
}

function copyBuddyContact(value, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const text = String(value || '').trim();
  if (!text) return;
  const done = () => alert('已复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => alert('复制失败，请手动长按复制'));
    return;
  }
  const tmp = document.createElement('textarea');
  tmp.value = text;
  document.body.appendChild(tmp);
  tmp.select();
  try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动复制'); }
  tmp.remove();
}

async function saveLocalBuddyIntent(cloudId, showTitle, event) {
  if (event && event.stopPropagation) event.stopPropagation();

  // 同设备 60 秒冷却（先于其它校验，防止连点刷屏）
  const cooldownKey = `publish:${cloudId}`;
  const waitLeft = getBuddyCooldownLeft(cooldownKey);
  if (waitLeft > 0) return alert(`发布太频繁，请 ${waitLeft} 秒后再试`);

  const tags = window.selectedBuddyTags[cloudId] || [];
  if (tags.length === 0) return alert('请至少选中 1 个预设标签以发布搭子意向！');

  const platformEl = document.getElementById(`buddy-platform-${cloudId}`);
  const contactInput = document.getElementById(`buddy-contact-${cloudId}`);
  const platform = platformEl ? platformEl.value : '小红书号';
  const accountId = (contactInput ? contactInput.value : '').trim().slice(0, 30);

  let contact = '';
  if (accountId) {
    const check = validateBuddyContactInfo(accountId);
    if (!check.ok) return alert(check.reason);
    contact = `${platform}：${accountId}`;
  }

  const pref = getFanPrefState();
  const theme = getBuddyTheme(pref);
  const memberTags = pref.biasType === 'solo' || pref.biasType === 'cp'
    ? (pref.biasMembers || []).filter(m => m !== 'ONER')
    : [];
  const fandomLabel = pref.biasType === 'solo' ? '唯粉' : pref.biasType === 'cp' ? 'CP偏好' : '团粉';
  const biasLabel = memberTags.length ? `${fandomLabel}(${memberTags.join('/')})` : fandomLabel;

  const entry = {
    showTitle,
    nickname: getGuestNickname(),
    fandomType: fandomLabel,
    memberTags,
    biasLabel,
    tags: [...tags],
    contact,
    theme,
    createdAt: new Date().toLocaleDateString()
  };

  let published = false;
  try {
    const res = await publishBuddyIntent(cloudId, entry);
    if (res.ok && res.entry) {
      if (!window.buddyCloudCache[cloudId]) window.buddyCloudCache[cloudId] = [];
      window.buddyCloudCache[cloudId].unshift(res.entry);
      published = true;
    }
  } catch (e) { /* 云端不可用 → 本地兜底 */ }

  if (!published) {
    addBuddyEntryForShow(cloudId, { ...entry, ownerId: getDeviceId(), deviceId: getDeviceId() });
  }

  markBuddyCooldown(cooldownKey);
  window.selectedBuddyTags[cloudId] = [];
  resetBuddyTagButtons(cloudId);
  renderBuddyPanel(cloudId);
  if (contactInput) contactInput.value = '';
}

async function withdrawBuddyIntent(cloudId, entryId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const entry = getMergedBuddyEntries(cloudId).find(x => String(x.id) === String(entryId));
  if (!entry) return;
  if (!isBuddyOwner(entry)) {
    return alert('只能撤销本机设备发布的搭子信息，无法删除他人记录');
  }
  const isCloud = !String(entryId).startsWith('tmp-') && !/^\d{13}$/.test(String(entryId));
  if (isCloud) {
    const res = await deleteBuddyIntent(cloudId, entryId, entry.deviceId || entry.ownerId);
    if (!res.ok && res.reason !== 'local-only') return alert('撤销失败，请稍后重试');
    window.buddyCloudCache[cloudId] = (window.buddyCloudCache[cloudId] || []).filter(x => String(x.id) !== String(entryId));
  } else {
    deleteBuddyEntryForShow(cloudId, entryId);
  }
  renderBuddyPanel(cloudId);
}

async function markBuddyFound(cloudId, entryId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const entry = getMergedBuddyEntries(cloudId).find(x => String(x.id) === String(entryId));
  if (!entry) return;
  if (!isBuddyOwner(entry)) {
    return alert('只能标记本机设备发布的搭子信息为已找到');
  }
  const isCloud = !String(entryId).startsWith('tmp-') && !/^\d{13}$/.test(String(entryId));
  if (isCloud) {
    const res = await markBuddyIntentFound(cloudId, entryId, entry.deviceId || entry.ownerId, 'found');
    if (!res.ok && res.reason !== 'local-only') return alert('操作失败，请稍后重试');
    window.buddyCloudCache[cloudId] = (window.buddyCloudCache[cloudId] || []).filter(x => String(x.id) !== String(entryId));
  } else {
    deleteBuddyEntryForShow(cloudId, entryId);
  }
  renderBuddyPanel(cloudId);
}

function removeLocalBuddyIntent(cloudId, entryId, event) {
  return withdrawBuddyIntent(cloudId, entryId, event);
}

// 搭子卡片配色与全站粉籍主题保持一致（CP 模式仅两位成员官方色）
function getBuddyTheme() {
  return getFanPrefThemeColor();
}

function removeLocalBuddyIntent(cloudId, entryId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  deleteBuddyEntryForShow(cloudId, entryId);
  renderTourCards();
}

// ================= 排练卡底部操作栏：严格单选互斥 =================
// activeFooterTab[cardKey] = 'traffic' | 'venue' | 'buddy' | 'calendar' | 'map' | null
if (!window.activeFooterTab) window.activeFooterTab = {};

function getFooterCardKey(card) {
  return card && card.dataset ? String(card.dataset.showCard || '') : '';
}

function clearFooterTabForCard(card, nextTab) {
  if (!card) return;
  card.querySelectorAll('[data-footer-panel]').forEach(panel => {
    if (panel.dataset.footerPanel !== nextTab) panel.classList.add('hidden');
  });
  card.querySelectorAll('[data-footer-tab]').forEach(btn => {
    if (btn.dataset.footerTab !== nextTab) {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function syncOpenDrawerRegistryFromState() {
  if (!window.openTourDrawers) window.openTourDrawers = new Set();
  window.openTourDrawers.clear();
  Object.entries(window.activeFooterTab || {}).forEach(([cardKey, tab]) => {
    if (!tab || !['traffic', 'venue', 'buddy'].includes(tab)) return;
    const card = document.querySelector(`[data-show-card="${cardKey}"]`);
    const panel = card && card.querySelector(`[data-footer-panel="${tab}"]`);
    if (panel && panel.id) window.openTourDrawers.add(panel.id);
  });
}

function setFooterTab(tab, trigger, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const card = trigger.closest('[data-show-card]');
  if (!card) return;
  const cardKey = getFooterCardKey(card);
  const current = window.activeFooterTab[cardKey] || null;

  // 再次点击当前已激活按钮 → 全部关闭，恢复冷银白液态金属态
  if (current === tab) {
    clearFooterTabForCard(card, null);
    window.activeFooterTab[cardKey] = null;
    syncOpenDrawerRegistryFromState();
    return;
  }

  // 先关掉同卡片内其余 4 个面板与高亮，保证同时只有 1 个亮起应援色
  clearFooterTabForCard(card, tab);
  const panel = card.querySelector(`[data-footer-panel="${tab}"]`);
  if (panel) panel.classList.remove('hidden');
  trigger.classList.add('is-active');
  trigger.setAttribute('aria-expanded', 'true');
  window.activeFooterTab[cardKey] = tab;

  if (tab === 'calendar') {
    const cloudId = trigger.dataset.cloudId;
    const btn = card.querySelector('[data-footer-tab="calendar"]');
    if (cloudId && btn) btn.classList.add('is-active');
    if (cloudId && typeof exportShowICS === 'function') {
      try { exportShowICS(cloudId); } catch (e) { console.warn('日历生成失败', e); }
    }
  }
  if (tab === 'map') {
    bindShowMapMenuDismiss();
    closeShowMapMenus(panel);
  }
  if (tab === 'buddy') {
    const buddyCloudId = card.dataset.showCard;
    window.__buddyActiveEventId = buddyCloudId;
    if (buddyCloudId && typeof refreshBuddyPanel === 'function') refreshBuddyPanel(buddyCloudId);
  }
  syncOpenDrawerRegistryFromState();
}

function clearAllFooterTabs() {
  document.querySelectorAll('[data-show-card]').forEach(card => {
    clearFooterTabForCard(card, null);
  });
  Object.keys(window.activeFooterTab || {}).forEach(k => { window.activeFooterTab[k] = null; });
  syncOpenDrawerRegistryFromState();
}

function bindFooterTabs() {
  if (bindFooterTabs.bound) return;
  bindFooterTabs.bound = true;

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-footer-tab]');
    if (trigger) {
      setFooterTab(trigger.dataset.footerTab, trigger, event);
      return;
    }
    // 点「知道了」或地图菜单项后收起
    if (event.target.closest('[data-footer-close]')) {
      clearAllFooterTabs();
      return;
    }
    // 面板内部交互不打断当前激活态
    if (event.target.closest('[data-footer-panel]')) return;
    // 其它普通抽屉按钮（如档案卡的场馆体验）不参与单选状态清理
    if (event.target.closest('[data-tour-toggle]')) return;
    // 点击页面空白处：清空所有卡片的激活态与弹窗
    clearAllFooterTabs();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeShowMapMenus();
      clearAllFooterTabs();
    }
  });
}

// 重绘后恢复当前卡片的单选激活态（不重复触发日历下载）
function restoreFooterTabs() {
  Object.entries(window.activeFooterTab || {}).forEach(([cardKey, tab]) => {
    if (!tab) return;
    const card = document.querySelector(`[data-show-card="${cardKey}"]`);
    if (!card) return;
    const btn = card.querySelector(`[data-footer-tab="${tab}"]`);
    const panel = card.querySelector(`[data-footer-panel="${tab}"]`);
    if (btn) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-expanded', 'true');
    }
    if (panel) panel.classList.remove('hidden');
  });
  syncOpenDrawerRegistryFromState();
}

// 所有抽屉的展开态保存在组件外层状态里：整卡重绘后依然稳稳停在当前面板
if (!window.openTourDrawers) window.openTourDrawers = new Set();

function toggleTourPanel(button, panelId, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const willOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !willOpen);
  button.classList.toggle('is-active', willOpen);
  button.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) window.openTourDrawers.add(panelId);
  else window.openTourDrawers.delete(panelId);
}

function restoreOpenTourDrawers() {
  if (!window.openTourDrawers || !window.openTourDrawers.size) return;
  window.openTourDrawers.forEach(id => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.remove('hidden');
    const btn = document.querySelector(`[data-tour-toggle="${id}"]`);
    if (btn) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}

function bindTourActionToggles() {
  if (bindTourActionToggles.bound) return;
  bindTourActionToggles.bound = true;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-tour-toggle]');
    if (!button) return;
    // 底部操作栏按钮统一走 setFooterTab 的严格单选逻辑
    if (button.dataset.footerTab) return;
    // 抽屉内部的二级标签 / 子菜单点击一律不参与“展开-收起”判定
    if (event.target.closest('[data-drawer-inner]')) return;
    toggleTourPanel(button, button.dataset.tourToggle, event);
  });
}

function renderTourCards() {
  bindTourActionToggles();
  bindFooterTabs();
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
    const buddyEntries = getMergedBuddyEntries(item.cloudId);
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    const seatUrl = String(item.seatUrl || '').replace(/['"<>']/g, '');
    const st = item.showState;
    const isSale = st.status === SHOW_STATUS.UPCOMING_SALE;
    const showKey = buildShowKey(cleanVenue || safeCity, safeCity);
    const footprintSaved = findFootprintIndex({
      showKey,
      title: safeCity,
      date: item.show_date,
      venue: cleanVenue
    }) >= 0;

    // 距离演出的天数（向上取整，仅精确到天）
    const daysToShow = isNaN(st.showTs)
      ? null
      : Math.max(0, Math.ceil((st.showTs - now) / 86400000));

    // 顶部状态徽章：仅保留抢票预警 / Live 进行中，已开票待演出的小胶囊不再重复展示
    const statusBadge = isSale
      ? `<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold text-white" style="background:var(--fan-theme-solid,#C8102E)">🔥 抢票预警</span>`
      : st.status === SHOW_STATUS.ONGOING
        ? `<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-white/80 border border-slate-300 text-slate-700 animate-pulse">🎤 Live 进行中</span>`
        : '';

    // 通透冷银灰玻璃条：倒计时数字用粉籍应援色
    const timePanel = isSale
      ? `
      <div class="countdown-glass p-2 space-y-1">
        ${item.activeRounds.map(r => `
          <div class="countdown-round flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
            <span class="truncate text-slate-700">🔥 <strong>${r.round_name || '开票'}</strong> · ${r.sale_time} <span class="text-slate-500">(${r.platform || '大麦'})</span></span>
            <span class="countdown-badge countdown-value font-mono font-bold shrink-0" data-time="${r.sale_time}"></span>
          </div>
        `).join('')}
      </div>`
      : st.status === SHOW_STATUS.ONGOING
        ? `<div class="countdown-glass px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-700 font-medium">🎤 今日开演 · Live 进行中</span>
            <span class="countdown-value font-mono font-bold">${String(item.show_date || '').slice(11) || '进行中'}</span>
          </div>`
        : `<div class="countdown-glass px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-600">🎫 已开票 · 筹备中</span>
            <span class="text-slate-500">距开演还有 <strong class="countdown-value font-mono">${daysToShow === null ? '待定' : daysToShow}</strong> 天</span>
          </div>`;

    return `
      <div class="p-4 rounded-2xl metal-card flex flex-col gap-3" data-show-card="${item.cloudId || idx}" style="--fan-theme:${getFanPrefThemeColor()}">
        <div class="flex gap-3.5">
          <div class="w-24 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeCity}" data-cap="${safeCity} · 演出海报" ${posterImgAttrs(item.posterUrl, idx)} onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`}
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <span class="text-[11px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
                <h3 class="font-bold text-base text-slate-900 truncate">${safeCity}</h3>
                ${statusBadge}
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${canEditContent() ? `<button type="button" data-edit-show="${String(item.cloudId == null ? '' : item.cloudId).replace(/"/g, '&quot;')}" data-edit-kind="ticket" class="tour-action-btn tour-action-btn--mini">✏️ 编辑</button>` : ''}
                <button type="button" onclick="recordFootprintFromShow('${safeCity}', '${item.show_date}', '${cleanVenue}', '${item.artist}')" class="tour-action-btn tour-action-btn--mini ${footprintSaved ? 'is-active' : ''}">${footprintSaved ? '✓ 已打卡' : '+ 足迹'}</button>
              </div>
            </div>
            <p class="text-xs text-slate-500 truncate">📍 ${item.venue} ｜ 🗓️ ${item.show_date}</p>
            ${item.prices ? `<p class="text-[11px] text-slate-600">💰 ${item.prices}</p>` : ''}
            ${safeBooth ? `<p class="text-[11px] text-slate-500 truncate" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</p>` : ''}
            <div class="flex items-center gap-1.5 flex-wrap">
              ${(seatUrl || item.hasSeatMap) ? `<button type="button" onclick="openSeatMapForShow('${item.cloudId || ''}', this.dataset.seatUrl || '', '座位图')" data-seat-url="${seatUrl}" class="tour-action-btn tour-action-btn--mini">💺 查看座位图</button>` : ''}
              <button type="button" onclick="requestExternalToolJump('${shiyeLiveUrl}', '视野 live（非官方座位视野工具站）', '${cleanVenue || safeCity}')" class="tour-action-btn tour-action-btn--mini">🔭 视野 live ↗</button>
              ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeCity)}
            </div>
          </div>
        </div>

        ${timePanel}

        <div class="tour-actions-row pt-2 border-t border-slate-200/70">
          <button type="button" data-footer-tab="traffic" data-tour-toggle="guide-drawer-${idx}" class="tour-action-btn" aria-expanded="false">🚇 交通</button>
          <button type="button" data-footer-tab="venue" data-tour-toggle="vexp-tour-drawer-${idx}" class="tour-action-btn" aria-expanded="false">${isShowStillRunning(item.show_date) ? '🛡️ 安检体验' : '📊 场馆体验'}</button>
          <button type="button" data-footer-tab="buddy" data-tour-toggle="buddy-drawer-${idx}" class="tour-action-btn" aria-expanded="false">🤝 找搭子</button>
          <span class="tour-actions-divider" aria-hidden="true"></span>
          <div class="relative">
            <button type="button" data-footer-tab="calendar" data-cloud-id="${item.cloudId}" class="tour-action-btn" aria-expanded="false">📅 日历</button>
            <div data-footer-panel="calendar" class="hidden absolute right-0 bottom-full mb-1.5 z-50 w-48 p-2 rounded-xl bg-white border border-slate-300 shadow-2xl text-[11px] text-slate-700" role="dialog">
              <div class="font-semibold text-slate-900 mb-1">📅 已生成日历提醒</div>
              <div class="text-slate-500 leading-relaxed">已下载 .ics 文件，双击即可导入系统日历；本卡片仅会亮起这一个按钮。</div>
              <button type="button" class="tour-action-btn tour-action-btn--mini mt-1.5 w-full" data-footer-close>知道了</button>
            </div>
          </div>
          <div class="relative">
            <button type="button" data-footer-tab="map" data-map-trigger class="tour-action-btn" aria-expanded="false">📍 地图</button>
            <div data-show-map-menu data-footer-panel="map" data-map-venue="${encodeShowMapValue(cleanVenue || safeCity)}" data-map-city="${encodeShowMapValue(safeCity)}" class="hidden absolute right-0 bottom-full mb-1.5 z-50 w-44 p-1.5 rounded-xl bg-white border border-slate-300 shadow-2xl" role="menu">
              <button type="button" role="menuitem" data-footer-close onclick="launchShowMapApp('amap', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🧭 高德 App</button>
              <button type="button" role="menuitem" data-footer-close onclick="launchShowMapApp('baidu', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🗺️ 百度 App</button>
              <button type="button" role="menuitem" data-footer-close onclick="launchShowMapApp('web', this)" class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-800 hover:bg-slate-100">🌐 网页版地图</button>
            </div>
          </div>
        </div>

        <div id="guide-drawer-${idx}" data-footer-panel="traffic" class="hidden p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <div class="font-bold text-slate-900">🚇 交通与入场指南：</div>
          <div class="whitespace-pre-line">${getShowTransport(item)}</div>
        </div>

        ${buildVenueExperienceDrawerHTML(item.venue, `vexp-tour-drawer-${idx}`, `vexp-tour-${item.cloudId || idx}`, safeCity, 'ticket', { showDate: item.show_date, artist: item.artist, city: safeCity })}

        <div id="buddy-drawer-${idx}" data-drawer-inner data-footer-panel="buddy" data-buddy-card="${item.cloudId}" class="hidden p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-1">
            <span class="font-bold text-slate-900">🤝 同场观演搭子界面 · ${safeCity}</span>
            <span class="text-[11px] text-slate-500">免注册一键发布 · 全站实时可见 · 严禁票务交易</span>
          </div>

          <div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2.5">
            <div class="flex items-center justify-between flex-wrap gap-1.5">
              <span class="font-semibold text-slate-700">我的粉籍属性：</span>
              <div class="inline-flex gap-1.5 flex-wrap">
                ${[['group', '团粉'], ['solo', '唯粉'], ['cp', 'CP偏好']].map(([val, label]) => {
                  const active = pref.biasType === val;
                  return `<button type="button" onclick="changeBuddyBiasMode('${val}', event)" class="tour-action-btn tour-action-btn--mini ${active ? 'is-active' : ''}">${label}</button>`;
                }).join('')}
              </div>
            </div>

            ${pref.biasType !== 'group' ? `
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] text-slate-500">选择成员：</span>
                ${['岳岳', '木子洋', '灵超'].map(m => {
                  const active = pref.biasMembers.includes(m);
                  const color = getMemberHex(m);
                  return `
                    <button type="button" onclick="toggleBuddySoloMember('${m}', event)"
                      class="tour-action-btn tour-action-btn--mini ${active ? 'colored-pill' : ''}"
                      style="${active ? `background:${color};` : ''}">
                      ${active ? '✓ ' : ''}${m}
                    </button>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <div class="space-y-2 pt-1 border-t border-slate-100">
              <span class="text-[11px] font-semibold text-slate-700">我的观演需求（预设标签多选）：</span>
              <div class="flex flex-wrap gap-1.5" data-buddy-tag-group>
                ${PRESET_BUDDY_TAGS.map(tag => {
                  const selected = (window.selectedBuddyTags[item.cloudId] || []).includes(tag);
                  return `
                    <button type="button" data-buddy-tag="${tag}" aria-pressed="${selected}"
                      onclick="toggleBuddyPresetTag('${item.cloudId}', this.dataset.buddyTag, event)"
                      class="tour-action-btn tour-action-btn--mini ${selected ? 'colored-pill is-active' : ''}"
                      style="${selected ? `background:${getBuddyTheme(pref)};` : ''}">
                      ${tag}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="space-y-1 pt-1 border-t border-slate-100">
              <span class="text-[11px] font-semibold text-slate-700">联系方式（选填，仅双方同意后互换）：</span>
              <div class="buddy-contact-row">
                <select id="buddy-platform-${item.cloudId}" class="buddy-platform-select">
                  ${BUDDY_PLATFORMS.map(pf => `<option value="${pf}">${pf}</option>`).join('')}
                </select>
                <input id="buddy-contact-${item.cloudId}" type="text" maxlength="30" autocomplete="off"
                  placeholder="账号 ID（勿填手机号/网址）" class="buddy-contact-input" />
              </div>
              <p class="buddy-safety-hint">⚠️ 严禁填写手机号、身份证号或转账链接，线下见面请核对票根并注意安全</p>
            </div>
          </div>

          <button type="button" onclick="saveLocalBuddyIntent('${item.cloudId}', '${safeCity}', event)"
            class="tour-action-btn w-full font-semibold">
            🚀 一键发布搭子意向
          </button>

          <div class="space-y-1.5 pt-1">
            <div class="text-[11px] font-semibold text-slate-600">📋 本场搭子动态（<span data-buddy-count="${item.cloudId}">${buddyEntries.length}</span>）：全站公开可见</div>
            <div data-buddy-list="${item.cloudId}" class="space-y-1.5">${renderBuddyListHtml(item.cloudId)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  restoreOpenTourDrawers();
  restoreFooterTabs();
  hydrateSecurityVoteBlocks();
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
function getArchiveYear(item) {
  const explicit = String(item?.year || '').trim();
  if (/^\d{4}$/.test(explicit)) return explicit;
  const match = String(item?.showDate || item?.show_date || item?.date || '').match(/\d{4}/);
  return match ? match[0] : '';
}

function updateArchiveFilterOptions() {
  const yearSel = document.getElementById('archive-year-filter');
  if (yearSel) {
    const current = yearSel.value || AppState.activeArchiveYear || 'ALL';
    const years = [...new Set(AppState.cloudArchives.map(getArchiveYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    yearSel.innerHTML = `<option value="all">全部年份</option>` + years.map(y => `<option value="${y}">${y} 年</option>`).join('');
    yearSel.value = years.includes(current) ? current : 'all';
  }

  const citySel = document.getElementById('archive-city-filter');
  if (citySel) {
    const current = citySel.value || AppState.activeArchiveCity || 'ALL';
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
    citySel.innerHTML = `<option value="all">全部城市</option>` + cities.map(c => {
      const safe = String(c.label).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<option value="${safe}" title="${safe}">${safe}（${c.count}场）</option>`;
    }).join('');
    const resolved = /^all$/i.test(current) || cityMap.has(String(current).trim()) ? current : 'all';
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
    if (btn) btn.className = t === type ? 'seg-btn is-active' : 'seg-btn';
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
  updateArchiveFilterOptions();
  // 筛选默认值统一归一：'' / null / 'all' 一律视为「全部」，避免默认状态误过滤掉全部演出。
  const rawYear = document.getElementById('archive-year-filter')?.value;
  const rawCity = document.getElementById('archive-city-filter')?.value;
  const year = (!rawYear || /^all$/i.test(String(rawYear).trim())) ? 'ALL' : String(rawYear).trim();
  const city = (!rawCity || /^all$/i.test(String(rawCity).trim())) ? 'ALL' : String(rawCity).trim();
  AppState.activeArchiveCity = city;
  const archiveType = !AppState.activeArchiveType || /^all$/i.test(String(AppState.activeArchiveType).trim())
    ? 'ALL'
    : AppState.activeArchiveType;

  // 往日演出统一按演出日期时间正序排列，同日多场按开场时间、记录 ID 次级排序。
  const filtered = AppState.cloudArchives
    .filter(a => {
      if (archiveType !== 'ALL' && a.subType !== archiveType) return false;
      if (year !== 'ALL' && getArchiveYear(a) !== year) return false;
      if (city !== 'ALL' && getArchiveCity(a) !== city) return false;
      return true;
    })
    .sort((a, b) => compareShowChronology(b, a)); // 按演出日期降序：最新场次在最前

  if (!filtered.length) {
    const loadErr = getShowLoadErrorText();
    box.innerHTML = loadErr
      ? `<div class="text-xs text-rose-600 py-4">⚠️ 往日演出档案加载失败：${loadErr}。请点击右上角「刷新同步」重试。</div>`
      : `<div class="text-xs text-slate-400 py-4">暂无符合筛选条件的往日演出档案</div>`;
    return;
  }

  const showList = filtered; // 档案页展示完整列表，不再截断
  let html = showList.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.title || '').replace(/['"<>]/g, '');
    const slotPopoverId = `arc-slot-pop-${item.cloudId || idx}`;
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    // 所属专题信息：优先展示数据里的专题名，回退到归一化后的专题键。
    const isFest = isFestivalShow(item);
    const seriesKey = resolveShowSeriesKey(item, true);
    const seriesCount = seriesKey ? countSeriesShows(seriesKey) : 0;
    const hasSeries = Boolean(seriesKey) && (isFest || seriesCount >= 2);
    const jumpTheme = isFest ? '__ALL_FESTIVALS__' : seriesKey;
    const safeJumpTheme = String(jumpTheme).replace(/['"<>]/g, '');
    const footprintSaved = findFootprintIndex({
      showKey: buildShowKey(item.venue, safeTitle),
      title: safeTitle,
      date: item.showDate,
      venue: item.venue
    }) >= 0;
    const venueStats = computeVenueExperienceStats(item.venue);

    return `
      <div class="p-4 rounded-2xl metal-card space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3.5 min-w-0 w-full">
            <div class="w-16 poster-square-box shrink-0">
              ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 往日海报" ${posterImgAttrs(item.posterUrl, idx)} onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">ONER</div>`}
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
                <span class="font-bold text-sm text-slate-900 truncate">${safeTitle}</span>
                ${safeBooth ? `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-medium" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</span>` : ''}
                ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeTitle)}
              </div>
              <p class="text-xs text-slate-500">🗓️ ${item.showDate}${item.showTime ? ` ${item.showTime}` : ''} ｜ 📍 ${item.venue}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end w-full sm:w-auto sm:shrink-0">
            ${hasSeries ? `<button type="button" data-theme="${safeJumpTheme}" onclick="openSeriesModal(this.dataset.theme)" class="tour-action-btn tour-action-btn--mini font-medium">${isFest ? '🎪 音乐节合集' : `🏛️ 专题页${seriesCount > 1 ? ` (${seriesCount}场)` : ''}`} ↗</button>` : ''}
            <button type="button" data-tour-toggle="vexp-arc-drawer-${idx}" class="tour-action-btn tour-action-btn--mini">📊 场馆体验<span class="hidden sm:inline text-[10px] opacity-70 ml-1">${venueStats.total}${venueStats.unlocked ? '' : '/5'}</span></button>
            ${canEditContent() ? `<button type="button" data-edit-show="${String(item.cloudId == null ? '' : item.cloudId).replace(/"/g, '&quot;')}" data-edit-kind="archive" class="tour-action-btn tour-action-btn--mini">✏️ 编辑</button>` : ''}
            <button type="button" onclick="recordFootprintFromShow('${safeTitle}', '${item.showDate}', '${item.venue}', '${item.artist}')" class="tour-action-btn tour-action-btn--mini ${footprintSaved ? 'is-active' : ''}">${footprintSaved ? '✓ 已打卡' : '+ 足迹'}</button>
          </div>
        </div>

        ${buildVenueExperienceDrawerHTML(item.venue, `vexp-arc-drawer-${idx}`, `vexp-arc-${item.cloudId || idx}`, safeTitle, 'archive', { showDate: item.showDate, artist: item.artist, city: getArchiveCity(item) })}
      </div>
    `;
  }).join('');

  box.innerHTML = html;

  restoreOpenTourDrawers();
  hydrateSecurityVoteBlocks();
}
