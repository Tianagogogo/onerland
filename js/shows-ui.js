function normalizeSeriesKey(rawTitle = '', savedTheme = '') {
  const base = (savedTheme || rawTitle || '').trim();
  if (!base) return '';
  if (/^chill\s*party/i.test(base)) return 'ChillParty 系列';
  const quoteSeries = base.match(/^([「《][^」》]+[」》]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华|见面会|派对)?)/);
  if (quoteSeries) return quoteSeries[1].trim();
  const alphaPrefix = base.match(/^([A-Za-z]{3,20})(?:plus|\+|\s|·|-|_|$)/i);
  if (alphaPrefix) return `${alphaPrefix[1]} 系列`;
  const dashMatch = base.match(/^([^·\-—|]+?)\s*[·\-—|]\s*.+站$/);
  if (dashMatch && dashMatch[1].trim().length >= 2) return dashMatch[1].trim();
  return '';
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

// ================= 场馆体验客观采集与聚合统计 UI =================
function submitVenueExperienceForm(venueName, formPrefix, rerenderScope) {
  const queueTime = document.getElementById(`${formPrefix}-queue`)?.value || '10-30分钟';
  const bagCheck = document.getElementById(`${formPrefix}-bag`)?.value || 'strict';
  const storageType = document.getElementById(`${formPrefix}-storage`)?.value || '场馆自助寄存柜';
  const showTitle = document.getElementById(`${formPrefix}-show`)?.value || '';
  const note = (document.getElementById(`${formPrefix}-note`)?.value || '').trim();

  addVenueExperience(venueName, {
    queueTime,
    bagCheck,
    storageType,
    showTitle,
    note
  });

  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

function removeVenueExperienceItem(venueName, recordId, rerenderScope) {
  deleteVenueExperience(venueName, recordId);
  if (rerenderScope === 'archive') renderArchiveTimeline();
  else renderTourCards();
}

function buildVenueExperienceDrawerHTML(venueName, drawerId, formPrefix, showTitle, rerenderScope) {
  const cleanVenue = normalizeVenueKey(venueName) || '未命名场馆';
  const stats = computeVenueExperienceStats(cleanVenue);
  const safeVenueAttr = cleanVenue.replace(/['"<>]/g, '');
  const safeShowAttr = String(showTitle || '').replace(/['"<>]/g, '');

  const statsPanelHtml = stats.unlocked
    ? `
      <div class="p-3 rounded-xl bg-white border border-slate-300 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-1">
          <span class="font-bold text-slate-900">📊 场馆客观体验聚合统计（已汇总 ${stats.total} 条样本）</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">样本 ≥ 5 已解锁</span>
        </div>

        <!-- 1. 翻包/严检比例 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500">🎒 翻包/严检比例</div>
            <div class="text-lg font-bold text-slate-900 mt-0.5">${stats.bagCheckPct}% <span class="text-xs font-normal text-slate-500">(${stats.bagCheckCount}/${stats.total} 场次反馈开包检查)</span></div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500">🛅 高频寄存方式</div>
            <div class="mt-1 flex flex-wrap gap-1">
              ${stats.storageDist.map(s => `<span class="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-800">${s.label} <strong>${s.pct}%</strong></span>`).join('')}
            </div>
          </div>
        </div>

        <!-- 2. 安检排队时长分布 -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-semibold text-slate-700">⏱️ 安检排队耗时分布：</div>
          ${stats.queueDist.map(q => `
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-20 text-slate-600 shrink-0">${q.label}</span>
              <div class="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div class="h-full bg-slate-800 rounded-full" style="width:${q.pct}%"></div>
              </div>
              <span class="w-14 text-right font-mono text-slate-700 shrink-0">${q.pct}% (${q.count})</span>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : `
      <div class="p-3 rounded-xl bg-white border border-dashed border-slate-300 flex items-center justify-between flex-wrap gap-2">
        <div class="text-xs text-slate-600">
          📊 <strong>${safeVenueAttr}</strong> 客观统计面板待解锁：当前已收集 <strong>${stats.total} / 5</strong> 条样本，还差 <strong>${stats.remaining}</strong> 条即可展示安检排队分布、翻包比例与寄存统计。
        </div>
      </div>
    `;

  return `
    <div id="${drawerId}" class="hidden p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs space-y-3">
      ${statsPanelHtml}

      <!-- 提交新的客观场馆体验样本 -->
      <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
        <div class="font-bold text-slate-800">✍️ 贡献一条本场馆客观体验（同场馆多场演出自动合并统计）</div>
        <input type="hidden" id="${formPrefix}-show" value="${safeShowAttr}" />
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
        <div class="flex gap-1.5">
          <input id="${formPrefix}-note" type="text" placeholder="补充客观细节（如：东门安检口更快、禁止带长柄伞/充电宝限制）..." class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
          <button type="button" onclick="submitVenueExperienceForm('${safeVenueAttr}', '${formPrefix}', '${rerenderScope}')" class="px-3 py-1.5 rounded-lg obsidian-btn font-semibold shrink-0">提交样本</button>
        </div>
      </div>

      <!-- 原始体验样本列表 -->
      <div class="space-y-1.5">
        <div class="text-[11px] font-semibold text-slate-600">📋 场馆历史样本明细（${stats.total} 条）：</div>
        ${stats.list.length
          ? stats.list.map(r => `
              <div class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start justify-between gap-2">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-medium">⏱️ ${r.queueTime}</span>
                    <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-medium">${r.bagCheck === 'strict' ? '🎒 严格翻包' : '✅ 宽松过检'}</span>
                    <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-medium">🛅 ${r.storageType}</span>
                    ${r.showTitle ? `<span class="text-slate-400">· ${r.showTitle}</span>` : ''}
                  </div>
                  ${r.note ? `<p class="text-xs text-slate-700 break-words">${r.note}</p>` : ''}
                </div>
                <button type="button" onclick="removeVenueExperienceItem('${safeVenueAttr}', ${r.id}, '${rerenderScope}')" class="text-[11px] text-rose-600 hover:underline shrink-0">删除</button>
              </div>
            `).join('')
          : `<div class="p-2 rounded-lg bg-white border border-dashed border-slate-300 text-[11px] text-slate-400 text-center">暂无该场馆体验样本，提交后自动累计。</div>`
        }
      </div>
    </div>
  `;
}

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
    const shiyeLiveUrl = `https://shijiao.xingpaste.com/?q=${encodeURIComponent(cleanVenue || safeCity)}`;
    const amapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(cleanVenue || safeCity)}`;
    const slotPopoverId = `tour-slot-pop-${item.cloudId || idx}`;
    const buddyEntries = getBuddyListByShow(item.cloudId);
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    const venueStats = computeVenueExperienceStats(item.venue);

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
              ${safeBooth ? `<span class="text-[11px] px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 font-medium" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</span>` : ''}
              ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeCity)}
            </div>
          </div>
        </div>

        ${roundsHtml}

        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-200/80 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="document.getElementById('guide-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🚇 交通 ▾</button>
            <button type="button" onclick="requestExternalToolJump('${shiyeLiveUrl}', '视野 live（非官方座位视野工具站）', '${cleanVenue || safeCity}')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🔭 视野 live ↗</button>
            <button type="button" onclick="document.getElementById('vexp-tour-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">📊 场馆体验 (${venueStats.total}${venueStats.unlocked ? '·已聚合' : '/5'}) ▾</button>
            <button type="button" onclick="document.getElementById('buddy-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg obsidian-btn text-white font-medium">🤝 找搭子 (${buddyEntries.length}) ▾</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="exportShowICS(${item.cloudId})" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">📅 日历</button>
            <a href="${amapUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">地图 ↗</a>
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
                        <button type="button" onclick="removeFanCustomTag(${tIdx})" class="text-slate-400 hover:text-rose-600 font-bold" title="删除此标签">✕</button>
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
                    <button type="button" onclick="removeLocalBuddyIntent(${item.cloudId}, ${b.id})" class="text-[11px] text-rose-600 hover:underline shrink-0">删除</button>
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
    const safeBooth = String(item.merchBooth || '').replace(/['"<>]/g, '');
    const venueStats = computeVenueExperienceStats(item.venue);

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
                ${safeBooth ? `<span class="text-[10px] px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 font-medium" title="${safeBooth}">🛍️ 官方小卖部：${safeBooth}</span>` : ''}
                ${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeTitle)}
              </div>
              <p class="text-xs text-slate-500">🗓️ ${item.showDate} ｜ 📍 ${item.venue}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <button type="button" onclick="document.getElementById('vexp-arc-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">📊 场馆体验 (${venueStats.total}${venueStats.unlocked ? '·已聚合' : '/5'}) ▾</button>
            ${AppState.isAdmin ? `<button type="button" onclick="startEditShow('archive', ${item.cloudId})" class="px-2.5 py-1.5 rounded-lg liquid-silver-btn text-xs font-semibold">✏️ 编辑</button>` : ''}
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
