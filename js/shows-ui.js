// 1. 相同前缀自动归一化（例如 chillparty / chillpartyplus / chillpartyplus+ 归为一类）
function normalizeSeriesKey(rawTitle = '', savedTheme = '') {
  const base = (savedTheme || rawTitle || '').trim();
  if (!base) return '';

  if (/^chill\s*party/i.test(base)) {
    return 'ChillParty 系列';
  }

  const quoteSeries = base.match(/^([「《][^」》]+[」》]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华|见面会|派对)?)/);
  if (quoteSeries) return quoteSeries[1].trim();

  const alphaPrefix = base.match(/^([A-Za-z]{3,20})(?:plus|\+|\s|·|-|_|$)/i);
  if (alphaPrefix) return `${alphaPrefix[1]} 系列`;

  const dashMatch = base.match(/^([^·\-—|]+?)\s*[·\-—|]\s*.+站$/);
  if (dashMatch && dashMatch[1].trim().length >= 2) return dashMatch[1].trim();

  return '';
}

// 2. 外部工具站（视野 live）跳转前二次确认
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

function exportShowICS(cloudId) {
  const item = AppState.cloudTickets.find(t => String(t.cloudId) === String(cloudId));
  if (!item) return;
  const firstRound = (item.rounds || [])[0];
  const rawTime = firstRound ? firstRound.sale_time : `${(item.show_date || '').slice(0, 10)} 19:30`;
  const start = new Date(rawTime.replace(/-/g, '/'));
  if (isNaN(start)) return alert('该场次暂无精确时间，无法生成日历');
  const end = new Date(start.getTime() + 45 * 60000);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const label = firstRound ? `抢票(${firstRound.round_name})` : '演出开演';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
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

// 3. 音乐节时间表悬停/点击弹出浮层
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

// 4. 专题快捷栏
function renderThemeQuickBar() {
  const bar = document.getElementById('tour-themes-bar');
  if (!bar) return;
  const themeMap = new Map();
  let festCount = 0;

  [...AppState.cloudTickets, ...AppState.cloudArchives].forEach(item => {
    const label = item.city || item.title || '';
    const isFest = item.subType === 'festival' || /音乐节|嘉年华/.test(`${label} ${item.theme || ''}`);
    if (isFest) { festCount++; return; }
    const seriesKey = normalizeSeriesKey(label, item.theme);
    if (seriesKey) themeMap.set(seriesKey, (themeMap.get(seriesKey) || 0) + 1);
  });

  const btns = [];
  themeMap.forEach((cnt, seriesKey) => {
    if (cnt >= 2) {
      const safe = seriesKey.replace(/['"<>]/g, '');
      btns.push(`<button type="button" data-theme="${safe}" onclick="openSeriesModal(this.dataset.theme)" class="text-xs px-2.5 py-1 rounded-full liquid-silver-btn font-medium">🏛️ ${safe}（${cnt}场专题）↗</button>`);
    }
  });
  if (festCount > 0) {
    btns.push(`<button type="button" onclick="openSeriesModal('__ALL_FESTIVALS__')" class="text-xs px-2.5 py-1 rounded-full obsidian-btn font-medium">🎪 全部音乐节聚合（${festCount}场）↗</button>`);
  }
  bar.innerHTML = btns.join('');
}

function openSeriesModal(themeKey) {
  const isAllFest = themeKey === '__ALL_FESTIVALS__';
  const matchFn = item => {
    const label = item.city || item.title || '';
    if (isAllFest) return item.subType === 'festival' || /音乐节|嘉年华/.test(`${label} ${item.theme || ''}`);
    return normalizeSeriesKey(label, item.theme) === themeKey;
  };

  const upcoming = AppState.cloudTickets.filter(matchFn).map(u => ({
    status: '待开演', title: u.city, date: u.show_date, venue: u.venue, posterUrl: u.posterUrl, artist: u.artist
  }));
  const past = AppState.cloudArchives.filter(matchFn).map(p => ({
    status: '已落幕', title: p.title, date: p.showDate, venue: p.venue, posterUrl: p.posterUrl, artist: p.artist
  }));
  const stops = [...upcoming, ...past].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

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
              <p class="text-slate-500">🗓️ ${s.date}</p>
              <p class="text-slate-500 truncate">📍 ${s.venue}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  document.getElementById('series-detail-modal').classList.remove('hidden');
}

// 5. 本地搭子意向保存（防黄牛敏感词拦截）
function saveLocalBuddyIntent(cloudId, showTitle) {
  const input = document.getElementById(`buddy-note-${cloudId}`);
  const text = (input?.value || '').trim();
  if (!text) return alert('请填写你的观演搭子意向（如：坐标北京，看台同区拼车/互拍）');
  if (/出票|转票|收票|定金|闲鱼|溢价|代抢/.test(text)) {
    return alert('⚠️ 为防范票务诈骗，搭子意向禁止包含“出票/转票/定金/闲鱼”等交易词汇！');
  }
  const key = 'onerland_local_buddy_intents_v1';
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  saved[cloudId] = {
    showTitle,
    note: text,
    biasLabel: AppState.fanPref.biasType === 'solo' ? `唯粉(${AppState.fanPref.biasMembers.join('/')})` : AppState.fanPref.biasType === 'cp' ? 'CP偏好' : '团粉',
    updatedAt: new Date().toLocaleDateString()
  };
  localStorage.setItem(key, JSON.stringify(saved));
  renderTourCards();
}

// 6. 近期演出卡片（有开票倒计时的场次优先排在第一位）
function renderTourCards() {
  const container = document.getElementById('tour-grid');
  if (!container) return;

  const now = Date.now();
  const { autoFilterShows, biasType, biasMembers } = AppState.fanPref;
  const buddyStore = JSON.parse(localStorage.getItem('onerland_local_buddy_intents_v1') || '{}');

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
      const futureRounds = (item.rounds || [])
        .map(r => ({ ...r, ts: new Date((r.sale_time || '').replace(/-/g, '/')).getTime() }))
        .filter(r => !isNaN(r.ts) && r.ts > now)
        .sort((a, b) => a.ts - b.ts);
      return {
        ...item,
        activeRounds: futureRounds,
        nextSaleTs: futureRounds.length ? futureRounds[0].ts : Infinity
      };
    })
    // 核心排序：有未结束开票倒计时的排最前面，并按距离开票最近排序
    .sort((a, b) => {
      const aHas = a.nextSaleTs < Infinity ? 0 : 1;
      const bHas = b.nextSaleTs < Infinity ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      if (aHas === 0 && bHas === 0) return a.nextSaleTs - b.nextSaleTs;
      return (a.show_date || '').localeCompare(b.show_date || '');
    });

  if (!list.length) {
    container.innerHTML = `<div class="col-span-full text-xs text-slate-400 py-4">当前筛选条件下暂无待开演场次。</div>`;
    return;
  }

  container.innerHTML = list.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeCity = String(item.city || '').replace(/['"<>]/g, '');
    const cleanVenue = (item.venue || '').replace(/·/g, ' ').trim();
    const shiyeLiveUrl = `https://www.shiyelive.com/?q=${encodeURIComponent(cleanVenue || safeCity)}`;
    const amapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(cleanVenue || safeCity)}`;
    const slotPopoverId = `tour-slot-pop-${item.cloudId || idx}`;
    const myBuddy = buddyStore[item.cloudId];

    const roundsHtml = item.activeRounds.length ? `
      <div class="space-y-1.5 pt-1">
        ${item.activeRounds.map(r => `
          <div class="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-slate-900 text-white">
            <span class="truncate">🔥 <strong>${r.round_name || '开票'}</strong>：${r.sale_time} <span class="opacity-75">(${r.platform || '大麦'})</span></span>
            <span class="countdown-badge font-mono font-bold text-amber-300 shrink-0" data-time="${r.sale_time}"></span>
          </div>
        `).join('')}
      </div>
    ` : '';

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
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${AppState.isAdmin ? `<button type="button" onclick="startEditShow('ticket', ${item.cloudId})" class="text-[11px] px-2 py-0.5 rounded-lg liquid-silver-btn font-semibold">✏️ 编辑</button>` : ''}
                <button type="button" onclick="recordFootprintFromShow('${safeCity}', '${item.show_date}', '${item.venue}', '${item.artist}')" class="text-[11px] px-2 py-0.5 rounded-lg liquid-silver-btn font-medium">+ 足迹</button>
              </div>
            </div>
            <p class="text-xs text-slate-500">📍 ${item.venue} ｜ 🗓️ ${item.show_date}</p>
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              ${item.prices ? `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700">💰 ${item.prices}</span>` : ''}
              ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeCity)}
            </div>
          </div>
        </div>

        ${roundsHtml}

        <!-- 操作栏：参演指南 / 视野 live / 找搭子 / 日历 / 地图 -->
        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-200/80 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="document.getElementById('guide-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🧭 指南 ▾</button>
            <button type="button" onclick="requestExternalToolJump('${shiyeLiveUrl}', '视野 live（非官方座位视野工具站）', '${cleanVenue || safeCity}')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🔭 视野 live ↗</button>
            <button type="button" onclick="document.getElementById('buddy-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🤝 找搭子 ▾</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="exportShowICS(${item.cloudId})" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">📅 日历</button>
            <a href="${amapUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">地图 ↗</a>
          </div>
        </div>

        <!-- 参演指南折叠抽屉 -->
        <div id="guide-drawer-${idx}" class="hidden p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <div class="font-bold text-slate-900">🚇 交通与入场指南：</div>
          <div class="whitespace-pre-line">${item.transport || '• 建议提前 60–90 分钟到达场馆核验身份证入场\n• 禁止携带打火机、专业长焦相机及超尺寸灯牌'}</div>
        </div>

        <!-- 同场找搭子折叠抽屉 -->
        <div id="buddy-drawer-${idx}" class="hidden p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-900">🤝 同场观演搭子登记（隐私优先 · 本地偏好过滤）</span>
            <span class="text-[11px] text-slate-500">${AppState.currentUser ? `已登录：${AppState.currentUser.email}` : '访客本地模式'}</span>
          </div>
          <p class="text-[11px] text-slate-500">当前本机偏好：<strong>${AppState.fanPref.biasType === 'solo' ? '唯粉模式' : AppState.fanPref.biasType === 'cp' ? 'CP偏好' : '团粉模式'}</strong>（不公开联系方式，严禁出票/转票/定金）。</p>
          ${myBuddy ? `<div class="p-2 rounded-lg bg-white border border-slate-300 text-slate-700">✅ 我的本机登记（${myBuddy.biasLabel}）：${myBuddy.note}</div>` : ''}
          <div class="flex gap-1.5">
            <input id="buddy-note-${item.cloudId}" type="text" value="${myBuddy?.note || ''}" placeholder="输入同行需求（如：散场拼车回高铁站/互拍打卡）..." class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
            <button type="button" onclick="saveLocalBuddyIntent(${item.cloudId}, '${safeCity}')" class="px-3 py-1.5 rounded-lg obsidian-btn font-semibold shrink-0">保存意向</button>
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

function updateArchiveYearOptions() {
  const sel = document.getElementById('archive-year-filter');
  if (!sel) return;
  const years = [...new Set(AppState.cloudArchives.map(a => a.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  sel.innerHTML = `<option value="ALL">全部年份</option>` + years.map(y => `<option value="${y}">${y} 年</option>`).join('');
}

function setArchiveTypeFilter(type) {
  AppState.activeArchiveType = type;
  ['ALL', 'tour', 'festival'].forEach(t => {
    const btn = document.getElementById(`arc-filter-${t}`);
    if (btn) btn.className = t === type ? 'px-2.5 py-1 rounded-md obsidian-btn font-medium' : 'px-2.5 py-1 rounded-md text-slate-600';
  });
  renderArchiveTimeline();
}

// 7. 往日档案卡片（支持海报灯箱、音乐节时间表悬浮大图、管理员编辑）
function renderArchiveTimeline() {
  const box = document.getElementById('archive-timeline-list');
  if (!box) return;
  const year = document.getElementById('archive-year-filter')?.value || 'ALL';
  const filtered = AppState.cloudArchives.filter(a => {
    if (AppState.activeArchiveType !== 'ALL' && a.subType !== AppState.activeArchiveType) return false;
    if (year !== 'ALL' && a.year !== year) return false;
    return true;
  });

  if (!filtered.length) {
    box.innerHTML = `<div class="text-xs text-slate-400 py-4">暂无符合筛选条件的往日演出档案</div>`;
    return;
  }

  const showList = AppState.isArchiveExpanded ? filtered : filtered.slice(0, 3);
  let html = showList.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.title || '').replace(/['"<>]/g, '');
    const slotPopoverId = `arc-slot-pop-${item.cloudId || idx}`;
    return `
      <div class="p-4 rounded-2xl metal-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-16 h-16 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 往日海报" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">ONER</div>`}
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
              <span class="font-bold text-sm text-slate-900 truncate">${safeTitle}</span>
              ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeTitle)}
            </div>
            <p class="text-xs text-slate-500">🗓️ ${item.showDate} ｜ 📍 ${item.venue}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${AppState.isAdmin ? `<button type="button" onclick="startEditShow('archive', ${item.cloudId})" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-semibold">✏️ 编辑</button>` : ''}
          <button type="button" onclick="recordFootprintFromShow('${safeTitle}', '${item.showDate}', '${item.venue}', '${item.artist}')" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">+ 足迹</button>
        </div>
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
