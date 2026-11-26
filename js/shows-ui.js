// 规范化专题前缀：例如 chillparty / chillpartyplus / chillpartyplus+ 归入同一系列前缀
function normalizeSeriesKey(rawTitle = '', savedTheme = '') {
  const base = (savedTheme || rawTitle || '').trim();
  if (!base) return '';

  const bracketMatch = base.match(/^([「《【\[]?chillparty(?:\s*plus\+?)?)/i);
  if (bracketMatch) {
    const clean = bracketMatch[1].replace(/^[「《【\[]+/, '').trim();
    return clean.toLowerCase().startsWith('chillparty') ? 'ChillParty 系列' : clean;
  }

  const quoteSeries = base.match(/^([「《][^」》]+[」》]\s*(?:巡回演唱会|演唱会|巡演|音乐节|嘉年华|见面会|派对)?)/);
  if (quoteSeries) return quoteSeries[1].trim();

  const prefixMatch = base.match(/^([A-Za-z0-9_-]{3,24})/);
  if (prefixMatch && !/^\d+$/.test(prefixMatch[1])) {
    return prefixMatch[1].trim();
  }

  const dashMatch = base.match(/^([^·\-—|]+?)\s*[·\-—|]\s*.+站$/);
  if (dashMatch && dashMatch[1].trim().length >= 2) return dashMatch[1].trim();

  return '';
}

function requestExternalToolJump(url, siteName, venueName = '') {
  AppState.pendingExternalUrl = url;
  document.getElementById('ext-confirm-site').textContent = siteName;
  document.getElementById('ext-confirm-desc').textContent =
    `即将前往「${siteName}」查看${venueName ? `【${venueName}】` : ''}相关座位视角参考（非官方工具站）。请勿在外部页面填写订单号或支付定金。`;
  document.getElementById('external-jump-modal').classList.remove('hidden');
}

function confirmExternalToolJump() {
  const url = AppState.pendingExternalUrl;
  document.getElementById('external-jump-modal').classList.add('hidden');
  if (url) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) location.href = url;
  }
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

function renderThemeQuickBar() {
  const bar = document.getElementById('tour-themes-bar');
  if (!bar) return;
  const themeMap = new Map();
  let festCount = 0;

  [...AppState.cloudTickets, ...AppState.cloudArchives].forEach(item => {
    const label = item.city || item.title || '';
    const isFest = item.subType === 'festival' || /音乐节|嘉年华/.test(`${label} ${item.theme || ''}`);
    if (isFest) {
      festCount++;
      return;
    }
    const seriesKey = normalizeSeriesKey(label, item.theme);
    if (seriesKey) {
      themeMap.set(seriesKey, (themeMap.get(seriesKey) || 0) + 1);
    }
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
              ${s.posterUrl ? `<img src="${s.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 海报" onclick="openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" />` : `<div class="w-full h-full flex items-center justify-center text-[10px] text-slate-400">ONER</div>`}
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

function renderTourCards() {
  const container = document.getElementById('tour-grid');
  if (!container) return;

  const { autoFilterShows, biasType, biasMembers } = AppState.fanPref;
  const list = AppState.cloudTickets.filter(t => {
    if (AppState.activeArtistId !== 'ALL') {
      const meta = ARTIST_COLORS[t.artist];
      if (meta && meta.id !== AppState.activeArtistId) return false;
    }
    if (autoFilterShows && biasType !== 'group' && biasMembers.length) {
      return biasMembers.includes(t.artist) || t.artist === 'ONER';
    }
    return true;
  });

  if (!list.length) {
    container.innerHTML = `<div class="col-span-full text-xs text-slate-400 py-4">当前筛选条件下暂无待开演场次。</div>`;
    return;
  }

  container.innerHTML = list.map((item, idx) => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeCity = String(item.city || '').replace(/['"<>]/g, '');
    const cleanVenue = (item.venue || '').replace(/·/g, ' ').trim();
    const shijiaoLiveUrl = `https://www.shijiao.live/search?q=${encodeURIComponent(cleanVenue || safeCity)}`;
    const amapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(cleanVenue || safeCity)}`;

    const activeRounds = (item.rounds || []).filter(r => {
      const ts = new Date((r.sale_time || '').replace(/-/g, '/')).getTime();
      return isNaN(ts) || ts > Date.now();
    });

    const roundsHtml = activeRounds.length ? `
      <div class="space-y-1.5 pt-1">
        ${activeRounds.map(r => `
          <div class="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-300">
            <span class="truncate"><strong>${r.round_name || '开票'}</strong>：${r.sale_time} <span class="text-slate-500">(${r.platform || '大麦'})</span></span>
            <span class="countdown-badge font-mono font-bold text-slate-900 shrink-0" data-time="${r.sale_time}"></span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="p-4 rounded-2xl metal-card flex flex-col justify-between gap-3">
        <div class="flex gap-3.5">
          <div class="w-24 h-24 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeCity}" data-cap="${safeCity} · 海报" onclick="openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`}
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
            ${item.prices ? `<p class="text-[11px] text-slate-700">💰 票价：${item.prices}</p>` : ''}
          </div>
        </div>

        ${roundsHtml}

        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-200/80 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="document.getElementById('guide-drawer-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🧭 参演指南 ▾</button>
            <button type="button" onclick="requestExternalToolJump('${shijiaoLiveUrl}', '视角 Live', '${cleanVenue || safeCity}')" class="px-2.5 py-1 rounded-lg liquid-silver-btn font-medium">🔭 视角 Live ↗</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="exportShowICS(${item.cloudId})" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">📅 存日历</button>
            <a href="${amapUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700">地图 ↗</a>
          </div>
        </div>

        <div id="guide-drawer-${idx}" class="hidden p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <div class="font-bold text-slate-900">🚇 交通与入场指南：</div>
          <div class="whitespace-pre-line">${item.transport || '• 建议提前 60–90 分钟到达场馆核验身份证入场\n• 禁止携带打火机、专业长焦相机及超尺寸灯牌'}</div>
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
  let html = showList.map(item => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.title || '').replace(/['"<>]/g, '');
    return `
      <div class="p-4 rounded-2xl metal-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-16 h-16 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 往日海报" onclick="openLightbox(this.src, this.dataset.cap)" class="cursor-zoom-in" title="点击查看大图" />` : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">ONER</div>`}
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] px-2 py-0.5 rounded text-white font-semibold" style="background:${badge}">${item.artist}</span>
              <span class="font-bold text-sm text-slate-900 truncate">${safeTitle}</span>
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
