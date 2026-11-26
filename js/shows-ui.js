function renderViewThumbs(target) {
  const imgs = target === 'cp' ? cpViewImgs : arcViewImgs;
  const box = document.getElementById(target === 'cp' ? 'cp-view-thumbs' : 'arc-view-thumbs');
  if (!box) return;
  if (!imgs.length) {
    box.innerHTML = `<span class="text-[11px] text-slate-400">暂未上传授权实拍视角图（可点击右上角添加）</span>`;
    return;
  }
  box.innerHTML = imgs.map((item, idx) => `
    <div class="w-24 rounded-lg overflow-hidden border border-slate-300 bg-white shadow-2xs flex flex-col">
      <div class="relative h-16">
        <img src="${item.url}" data-caption="${item.note || '实拍视角'}" onclick="openLightbox(this.src, this.dataset.caption)" class="w-full h-full object-cover cursor-zoom-in" />
        <button type="button" onclick="removeViewImg('${target}', ${idx})" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 text-white text-[10px] leading-none flex items-center justify-center hover:bg-rose-600">✕</button>
      </div>
      <input type="text" value="${item.note || ''}" onchange="updateViewNote('${target}', ${idx}, this.value)" placeholder="区号备注" class="text-[10px] px-1.5 py-1 border-t border-slate-200 bg-white text-slate-700 focus:outline-none" />
    </div>
  `).join('');
}

function updateViewNote(target, idx, val) {
  if (target === 'cp' && cpViewImgs[idx]) cpViewImgs[idx].note = val;
  if (target === 'arc' && arcViewImgs[idx]) arcViewImgs[idx].note = val;
}

function removeViewImg(target, idx) {
  if (target === 'cp') cpViewImgs.splice(idx, 1);
  else arcViewImgs.splice(idx, 1);
  renderViewThumbs(target);
}

async function handleMultiViewUpload(event, target) {
  for (const file of Array.from(event.target.files || [])) {
    try {
      const dataUrl = await compressImageToDataURL(file, 720, 0.68);
      const entry = { url: dataUrl, note: '看台实拍视角' };
      if (target === 'cp') cpViewImgs.push(entry);
      else arcViewImgs.push(entry);
    } catch (e) {}
  }
  event.target.value = '';
  renderViewThumbs(target);
}

function detectStageType(venueName = '', titleName = '', explicitType = 'auto') {
  if (explicitType && explicitType !== 'auto') return explicitType;
  const combined = `${venueName} ${titleName}`.toLowerCase();
  if (/live\s*house|livehouse|omni|疆进酒|mao|育音堂|声音共和|太空间|纽空间|稻香|正火|酒球会|达丰|红节奏|不晚|瓦肆|vas|蜚声/.test(combined)) return 'livehouse';
  if (/音乐节|嘉年华|草坪|公园|广场|度假区|博览园|沙滩|营地/.test(combined)) return 'outdoor';
  return 'arena_3';
}

function showVenueZoneTip(tipText) {
  const box = document.getElementById('vv-zone-tip');
  if (box) box.textContent = tipText;
}

function renderVenueSvgDiagram(stageType) {
  const container = document.getElementById('vv-svg-container');
  if (!container) return;
  if (stageType === 'livehouse') {
    container.innerHTML = `<svg viewBox="0 0 420 230" class="w-full max-w-md h-auto select-none"><rect x="20" y="12" width="380" height="206" rx="14" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/><rect x="110" y="22" width="200" height="32" rx="6" fill="#1e293b"/><text x="210" y="42" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">STAGE 演出舞台</text><rect x="65" y="62" width="290" height="44" rx="8" fill="#e2e8f0" stroke="#64748b" class="cursor-pointer hover:opacity-80" onclick="showVenueZoneTip('🎯 前区站席（1–5排，距舞台约 2–6 米）：互动感极强，仰视视角，无需望远镜。')"/><text x="210" y="88" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">前区站席（距舞台 2-6m · 互动最佳）</text><rect x="65" y="114" width="290" height="48" rx="8" fill="#f1f5f9" stroke="#94a3b8" class="cursor-pointer hover:opacity-80" onclick="showVenueZoneTip('👁️ 中区黄金站席（距舞台约 7–14 米）：平视舞台中心，声场与视野最均衡。')"/><text x="210" y="142" text-anchor="middle" fill="#334155" font-size="11" font-weight="600">中区声场黄金站席（距舞台 7-14m）</text><rect x="165" y="170" width="90" height="24" rx="4" fill="#cbd5e1" stroke="#64748b"/><text x="210" y="186" text-anchor="middle" fill="#334155" font-size="10">调音台 FOH</text></svg>`;
    showVenueZoneTip('💡 当前为 Livehouse 站席平面结构：点击不同区域查看视野提示。');
  } else if (stageType === 'arena_4') {
    container.innerHTML = `<svg viewBox="0 0 420 230" class="w-full max-w-md h-auto select-none"><rect x="20" y="12" width="380" height="206" rx="30" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" class="cursor-pointer" onclick="showVenueZoneTip('🔭 高层看台（距中心舞台约 45–70 米）：俯瞰全景，建议携带望远镜。')"/><rect x="60" y="34" width="300" height="162" rx="22" fill="#f1f5f9" stroke="#64748b" class="cursor-pointer" onclick="event.stopPropagation(); showVenueZoneTip('⭐ 首层看台（距中心舞台约 25–42 米）：四面台平视黄金视角。')"/><rect x="115" y="64" width="190" height="102" rx="14" fill="#e2e8f0" stroke="#475569" class="cursor-pointer" onclick="event.stopPropagation(); showVenueZoneTip('🔥 内场围栏区（距舞台约 8–20 米）：极近距离视角。')"/><rect x="165" y="92" width="90" height="46" rx="8" fill="#1e293b"/><text x="210" y="119" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="bold">四面中心台</text></svg>`;
    showVenueZoneTip('💡 当前为体育馆四面台结构：点击不同区域查看视野提示。');
  } else if (stageType === 'outdoor') {
    container.innerHTML = `<svg viewBox="0 0 420 230" class="w-full max-w-md h-auto select-none"><rect x="20" y="12" width="380" height="206" rx="14" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/><rect x="100" y="22" width="220" height="34" rx="6" fill="#1e293b"/><text x="210" y="43" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">主舞台 MAIN STAGE</text><rect x="60" y="64" width="300" height="48" rx="8" fill="#e2e8f0" stroke="#64748b" class="cursor-pointer" onclick="showVenueZoneTip('🔥 前排乐迷区（距舞台 5–20 米）：视野无遮挡。')"/><text x="210" y="92" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">前排核心区（距舞台 5-20m）</text><rect x="45" y="120" width="330" height="82" rx="8" fill="#f1f5f9" stroke="#94a3b8" class="cursor-pointer" onclick="showVenueZoneTip('🌿 草坪观演区：建议避开中轴线后方控台正后方。')"/><text x="210" y="164" text-anchor="middle" fill="#334155" font-size="11" font-weight="600">草坪观演区（避开控台正后方视线更佳）</text></svg>`;
    showVenueZoneTip('💡 当前为户外音乐节场地结构：点击不同区域查看视野提示。');
  } else {
    container.innerHTML = `<svg viewBox="0 0 420 230" class="w-full max-w-md h-auto select-none"><path d="M40,40 Q210,10 380,40 L395,195 Q210,222 25,195 Z" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" class="cursor-pointer" onclick="showVenueZoneTip('🔭 高层看台（距舞台约 55–85 米）：俯瞰灯海与灯光矩阵，建议备望远镜。')"/><path d="M72,56 Q210,32 348,56 L360,168 Q210,190 60,168 Z" fill="#f1f5f9" stroke="#64748b" class="cursor-pointer" onclick="event.stopPropagation(); showVenueZoneTip('⭐ 首层看台（距舞台约 30–50 米）：平视舞台，性价比与视野均衡。')"/><rect x="115" y="74" width="190" height="76" rx="10" fill="#e2e8f0" stroke="#475569" class="cursor-pointer" onclick="event.stopPropagation(); showVenueZoneTip('🔥 内场区（距舞台约 10–28 米）：距离最近。')"/><rect x="145" y="24" width="130" height="32" rx="6" fill="#1e293b"/><text x="210" y="44" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="bold">三面台主舞台</text><rect x="180" y="132" width="60" height="14" rx="3" fill="#94a3b8"/><text x="210" y="142" text-anchor="middle" fill="#ffffff" font-size="8">控台</text></svg>`;
    showVenueZoneTip('💡 当前为体育馆三面台结构：点击不同区域查看视野提示。');
  }
}

function openVenueViewModal(sourceType, itemId) {
  const list = sourceType === 'archive' ? cloudArchives : tourSchedules;
  const item = list.find(x => String(x.cloudId) === String(itemId));
  if (!item) return;
  const title = item.city || item.title || '演出现场';
  const venue = item.venue || '演出现场';
  const stageType = detectStageType(venue, title, item.stageType || 'auto');

  document.getElementById('vv-modal-title').textContent = `${venue} · 场馆视角参考`;
  document.getElementById('vv-modal-subtitle').textContent = `关联场次：${title} ｜ 艺人：${item.artist || 'ONER'}`;
  document.getElementById('vv-stage-switcher').value = stageType;
  renderVenueSvgDiagram(stageType);

  const photosGrid = document.getElementById('vv-photos-grid');
  const photos = Array.isArray(item.viewImgs) ? item.viewImgs : [];
  photosGrid.innerHTML = photos.length
    ? photos.map((p, idx) => `<div class="rounded-lg overflow-hidden border border-slate-200 bg-slate-50"><img src="${p.url}" data-caption="${venue} · ${p.note || '视角 #' + (idx + 1)}" onclick="openLightbox(this.src, this.dataset.caption)" class="w-full h-32 object-cover cursor-zoom-in" /><div class="px-2.5 py-1.5 text-[11px] text-slate-700 font-medium truncate">${p.note || `视角参考 #${idx + 1}`}</div></div>`).join('')
    : `<div class="col-span-full text-xs text-slate-400 py-3">暂未上传该场馆的授权实拍视角图。</div>`;

  const cleanVenueKw = venue.replace(/·/g, ' ').trim();
  document.getElementById('vv-external-links').innerHTML = `
    <a href="https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(cleanVenueKw + ' 视角')}" target="_blank" class="px-3 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">📕 小红书搜「${cleanVenueKw} 视角」↗</a>
    <a href="https://www.douyin.com/search/${encodeURIComponent(cleanVenueKw + ' 演唱会视角')}" target="_blank" class="px-3 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">🎵 抖音搜现场实拍视角 ↗</a>
    <a href="https://uri.amap.com/search?keyword=${encodeURIComponent(cleanVenueKw)}" target="_blank" class="px-3 py-1.5 rounded-lg liquid-silver-btn text-xs font-medium">🗺️ 高德地图看场馆周边 ↗</a>
  `;
  document.getElementById('venue-view-modal').classList.remove('hidden');
}

function renderScheduleThumbs(target) {
  const imgs = target === 'cp' ? cpScheduleImgs : arcScheduleImgs;
  const box = document.getElementById(target === 'cp' ? 'cp-schedule-thumbs' : 'arc-schedule-thumbs');
  if (!box) return;
  box.innerHTML = imgs.length
    ? imgs.map((src, idx) => `<div class="relative w-16 h-20 rounded-lg overflow-hidden border border-slate-300 bg-white shadow-2xs"><img src="${src}" data-caption="时间表图片 #${idx + 1}" onclick="openLightbox(this.src, this.dataset.caption)" class="w-full h-full object-cover cursor-zoom-in" /><button type="button" onclick="removeScheduleImg('${target}', ${idx})" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 text-white text-[10px] leading-none flex items-center justify-center hover:bg-rose-600">✕</button></div>`).join('')
    : `<span class="text-[11px] text-slate-400">暂未添加时间表图片</span>`;
}

function removeScheduleImg(target, idx) {
  if (target === 'cp') cpScheduleImgs.splice(idx, 1);
  else arcScheduleImgs.splice(idx, 1);
  renderScheduleThumbs(target);
}

async function handleMultiScheduleUpload(event, target) {
  for (const file of Array.from(event.target.files || [])) {
    try {
      const dataUrl = await compressImageToDataURL(file, 720, 0.68);
      if (target === 'cp') cpScheduleImgs.push(dataUrl);
      else arcScheduleImgs.push(dataUrl);
    } catch (e) {}
  }
  event.target.value = '';
  renderScheduleThumbs(target);
}

function addScheduleImageByUrl(target) {
  const inputEl = document.getElementById(target === 'cp' ? 'cp-schedule-url-input' : 'arc-schedule-url-input');
  const url = inputEl.value.trim();
  if (!url) return alert('请先输入图片链接！');
  if (target === 'cp') cpScheduleImgs.push(url);
  else arcScheduleImgs.push(url);
  inputEl.value = '';
  renderScheduleThumbs(target);
}

function openSlotPopover(popoverId) {
  if (popoverCloseTimers[popoverId]) { clearTimeout(popoverCloseTimers[popoverId]); delete popoverCloseTimers[popoverId]; }
  document.querySelectorAll('.slot-hover-popover').forEach(el => { if (el.id !== popoverId) el.classList.add('hidden'); });
  document.getElementById(popoverId)?.classList.remove('hidden');
}

function scheduleCloseSlotPopover(popoverId) {
  popoverCloseTimers[popoverId] = setTimeout(() => { document.getElementById(popoverId)?.classList.add('hidden'); }, 220);
}

function toggleSlotPopover(popoverId) {
  const el = document.getElementById(popoverId);
  if (!el) return;
  if (el.classList.contains('hidden')) openSlotPopover(popoverId);
  else el.classList.add('hidden');
}

function buildSlotHoverBadgeHTML(slotText, scheduleImgs, popoverId, titleLabel) {
  if (!slotText && (!scheduleImgs || !scheduleImgs.length)) return '';
  const imgs = Array.isArray(scheduleImgs) ? scheduleImgs : [];
  const hasImgs = imgs.length > 0;
  const safeTitle = String(titleLabel || '').replace(/['"<>]/g, '');
  const popoverHtml = hasImgs ? `<div id="${popoverId}" onmouseenter="openSlotPopover('${popoverId}')" onmouseleave="scheduleCloseSlotPopover('${popoverId}')" class="slot-hover-popover hidden absolute left-0 bottom-full pb-2 z-50 w-72 sm:w-96"><div class="p-3 rounded-xl bg-white border border-slate-300 shadow-2xl"><div class="flex items-center justify-between text-[11px] text-slate-800 font-semibold mb-2"><span>🗓️ ${safeTitle} · 时间表（共 ${imgs.length} 张）</span><button type="button" onclick="event.stopPropagation(); document.getElementById('${popoverId}').classList.add('hidden')" class="text-slate-400 hover:text-slate-800 px-1">✕</button></div><div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto no-scrollbar">${imgs.map((src, i) => `<img src="${src}" data-caption="${safeTitle} · 时间表 #${i + 1}" onclick="event.stopPropagation(); openLightbox(this.src, this.dataset.caption)" class="w-full h-28 object-cover rounded-lg border border-slate-200 cursor-zoom-in bg-slate-50" />`).join('')}</div></div></div>` : '';
  return `<div class="relative inline-block" ${hasImgs ? `onmouseenter="openSlotPopover('${popoverId}')" onmouseleave="scheduleCloseSlotPopover('${popoverId}')"` : ''}><span ${hasImgs ? `onclick="event.stopPropagation(); toggleSlotPopover('${popoverId}')"` : ''} class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-medium ${hasImgs ? 'cursor-pointer hover:bg-slate-200' : ''}"><span>🎤 ${slotText || '音乐节时间表'}</span>${hasImgs ? `<span class="text-[10px] px-1 rounded bg-white text-slate-700 border border-slate-300">时间表×${imgs.length}</span>` : ''}</span>${popoverHtml}</div>`;
}

function renderThemeQuickBar() {
  const bar = document.getElementById('tour-themes-bar');
  const tourThemeCounts = new Map();
  let festivalTotalCount = 0;
  [...tourSchedules, ...cloudArchives].forEach(item => {
    const label = item.city || item.title || '';
    const isFest = item.subType === 'festival' || /音乐节|嘉年华/.test(`${label} ${item.theme || ''}`);
    if (isFest) festivalTotalCount++;
    else if (item.theme) tourThemeCounts.set(item.theme, (tourThemeCounts.get(item.theme) || 0) + 1);
  });
  const buttons = [];
  tourThemeCounts.forEach((count, theme) => {
    if (count >= 2) {
      const safeTheme = String(theme).replace(/['"<>]/g, '');
      buttons.push(`<button type="button" data-theme="${safeTheme}" onclick="openThemeDetailModal(this.dataset.theme)" class="text-xs px-2.5 py-1 rounded-full liquid-silver-btn font-medium transition">🏛️ ${safeTheme}（${count}站专题）↗</button>`);
    }
  });
  if (festivalTotalCount > 0) {
    buttons.push(`<button type="button" onclick="openAllFestivalsModal()" class="text-xs px-2.5 py-1 rounded-full obsidian-btn font-medium transition">🎪 全部音乐节聚合（${festivalTotalCount}场）↗</button>`);
  }
  bar.innerHTML = buttons.join('');
}

function openAllFestivalsModal() {
  const upcomingFests = tourSchedules.filter(u => /音乐节|嘉年华/.test(`${u.city} ${u.theme || ''}`)).map(u => ({
    status: (u.rounds || []).some(r => new Date(r.sale_time.replace(/-/g, '/')).getTime() > Date.now()) ? 'selling' : 'upcoming',
    title: u.city, date: u.show_date, venue: u.venue, slot: u.slot || '', posterUrl: u.posterUrl || '', scheduleImgs: u.scheduleImgs || [], setlist: [], artist: u.artist
  }));
  const pastFests = cloudArchives.filter(p => p.subType === 'festival' || /音乐节|嘉年华/.test(`${p.title} ${p.theme || ''}`)).map(p => ({
    status: 'past', title: p.title, date: p.showDate, venue: p.venue, slot: p.slot || '', posterUrl: p.posterUrl || '', scheduleImgs: p.scheduleImgs || [], setlist: p.setlist || [], artist: p.artist
  }));
  const allFests = [...upcomingFests, ...pastFests].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const coverPoster = allFests.find(f => f.posterUrl)?.posterUrl || '';
  const posterEl = document.getElementById('theme-modal-poster');
  if (coverPoster) { posterEl.src = coverPoster; posterEl.classList.remove('hidden'); } else posterEl.classList.add('hidden');
  document.getElementById('theme-modal-badge').textContent = '🎪 音乐节时光纪念册';
  document.getElementById('theme-modal-title').textContent = '全部音乐节演出聚合档案';
  document.getElementById('theme-modal-subtitle').textContent = `共收录 ${allFests.length} 场音乐节（待演 ${upcomingFests.length} 场 · 已落幕 ${pastFests.length} 场）`;
  document.getElementById('theme-modal-body').innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${allFests.map(fest => {
    const statusPill = fest.status === 'selling' ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-white font-semibold">🔥 售票中</span>` : fest.status === 'upcoming' ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300 font-semibold">⏳ 待开演</span>` : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">🏛️ 已落幕</span>`;
    const safeName = String(fest.title || '').replace(/['"<>]/g, '');
    return `<div class="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between gap-2.5 text-xs"><div class="flex gap-3">${fest.posterUrl ? `<img src="${fest.posterUrl}" data-cap="${safeName} · 海报" onclick="openLightbox(this.src, this.dataset.cap)" class="w-16 h-24 object-cover rounded-lg border border-slate-200 cursor-zoom-in shrink-0" />` : ''}<div class="space-y-1.5 min-w-0 flex-1"><div class="flex items-start justify-between gap-1.5"><span class="font-bold text-sm text-slate-900 leading-snug">${safeName}</span>${statusPill}</div><p class="text-[11px] text-slate-500">🎤 ${fest.artist} ｜ 🗓️ ${fest.date}</p><p class="text-[11px] text-slate-500 truncate">📍 ${fest.venue}</p>${fest.slot ? `<span class="inline-block text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-medium">⏰ ${fest.slot}</span>` : ''}</div></div>${(fest.scheduleImgs && fest.scheduleImgs.length) ? `<div class="flex items-center gap-1.5 flex-wrap pt-1"><span class="text-[11px] text-slate-500">时间表：</span>${fest.scheduleImgs.map((sUrl, sIdx) => `<img src="${sUrl}" data-cap="${safeName} · 时间表 #${sIdx + 1}" onclick="openLightbox(this.src, this.dataset.cap)" class="w-10 h-12 object-cover rounded border border-slate-300 cursor-zoom-in" />`).join('')}</div>` : ''}${(fest.setlist && fest.setlist.length) ? `<div class="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700"><div class="font-semibold text-slate-800 mb-0.5">🎵 歌单：</div><div class="line-clamp-2">${fest.setlist.join(' / ')}</div></div>` : ''}</div>`;
  }).join('')}</div>`;
  document.getElementById('theme-detail-modal').classList.remove('hidden');
}

function openThemeDetailModal(themeName) {
  const upcoming = tourSchedules.filter(t => t.theme === themeName).map(u => ({ status: (u.rounds || []).some(r => new Date(r.sale_time.replace(/-/g, '/')).getTime() > Date.now()) ? 'selling' : 'upcoming', title: u.city, date: u.show_date, startTime: u.startTime || '', venue: u.venue, prices: u.prices || '', posterUrl: u.posterUrl || '', seatUrl: u.seatUrl || '', transport: u.transport || '', url: u.source_url && u.source_url !== '#' ? u.source_url : '', artist: u.artist }));
  const past = cloudArchives.filter(a => a.theme === themeName).map(p => ({ status: 'past', title: p.title, date: p.showDate, startTime: '', venue: p.venue, prices: p.prices || '', posterUrl: p.posterUrl || '', seatUrl: p.seatUrl || '', transport: '', url: p.url || '', artist: p.artist }));
  const allStops = [...upcoming, ...past].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sampleArtist = allStops[0]?.artist || 'ONER';
  const mainPoster = past.find(p => p.posterUrl)?.posterUrl || upcoming.find(u => u.posterUrl)?.posterUrl || '';
  const posterEl = document.getElementById('theme-modal-poster');
  if (mainPoster) { posterEl.src = mainPoster; posterEl.classList.remove('hidden'); } else posterEl.classList.add('hidden');
  document.getElementById('theme-modal-badge').textContent = '🏛️ 巡演时光纪念册';
  document.getElementById('theme-modal-title').textContent = themeName;
  document.getElementById('theme-modal-subtitle').textContent = `关联艺人：${sampleArtist} ｜ 共收录 ${allStops.length} 站（近期待演 ${upcoming.length} 站 · 已落幕 ${past.length} 站）`;
  document.getElementById('theme-modal-body').innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">${allStops.map((stop, idx) => {
    const statusPill = stop.status === 'selling' ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-white font-semibold">🔥 售票中</span>` : stop.status === 'upcoming' ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300 font-semibold">⏳ 待开演</span>` : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">🏛️ 已落幕</span>`;
    const shortName = stop.title.replace(themeName, '').replace(/^[·\s]+/, '') || stop.title;
    const displayPoster = stop.posterUrl || mainPoster;
    return `<div class="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-400 shadow-2xs transition flex flex-col justify-between gap-2.5 text-xs"><div class="flex gap-3">${displayPoster ? `<img src="${displayPoster}" data-cap="${shortName} · 演出海报" onclick="openLightbox(this.src, this.dataset.cap)" class="w-16 h-24 object-cover rounded-lg border border-slate-200 cursor-zoom-in shrink-0" />` : ''}<div class="space-y-1.5 min-w-0 flex-1"><div class="flex items-start justify-between gap-1.5"><span class="font-bold text-sm text-slate-900 leading-snug">${shortName}</span>${statusPill}</div><div class="text-slate-500 space-y-0.5"><p>🗓️ ${stop.date} ${stop.startTime ? `· ⏰ ${stop.startTime}` : ''}</p><p class="truncate">📍 ${stop.venue}</p></div>${stop.prices ? `<div class="text-[11px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded inline-block">💰 ${stop.prices}</div>` : ''}</div></div><div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap"><div class="flex items-center gap-1.5">${stop.seatUrl ? `<button type="button" data-src="${stop.seatUrl}" data-cap="${shortName} · 座位图" onclick="openLightbox(this.dataset.src, this.dataset.cap)" class="px-2 py-0.5 rounded liquid-silver-btn text-[11px]">💺 座位图</button>` : ''}${stop.transport ? `<button type="button" onclick="document.getElementById('theme-tr-${idx}').classList.toggle('hidden')" class="px-2 py-0.5 rounded liquid-silver-btn text-[11px]">🚇 交通</button>` : ''}</div>${stop.url ? `<a href="${stop.url}" target="_blank" class="text-[11px] text-slate-500 hover:text-slate-900">原帖 ↗</a>` : ''}</div>${stop.transport ? `<div id="theme-tr-${idx}" class="hidden p-2 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">${stop.transport}</div>` : ''}</div>`;
  }).join('')}</div>`;
  document.getElementById('theme-detail-modal').classList.remove('hidden');
}

function updateArchiveYearOptions() {
  const selectEl = document.getElementById('archive-year-filter');
  const currentVal = selectEl.value;
  const years = [...new Set(cloudArchives.map(a => a.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  selectEl.innerHTML = `<option value="ALL">全部年份</option>` + years.map(y => `<option value="${y}">${y} 年</option>`).join('');
  if (years.includes(currentVal)) selectEl.value = currentVal;
}

function setArchiveTypeFilter(type) {
  activeArchiveType = type;
  ['ALL', 'tour', 'festival'].forEach(t => {
    const btn = document.getElementById(`arc-filter-${t}`);
    if (btn) btn.className = t === type ? 'px-2.5 py-1 rounded-md obsidian-btn font-medium transition' : 'px-2.5 py-1 rounded-md text-slate-600 hover:bg-slate-100 transition';
  });
  renderArchiveTimeline();
}

function toggleArchiveExpand() {
  isArchiveExpanded = !isArchiveExpanded;
  renderArchiveTimeline();
}

function buildArchiveVerticalCardHTML(item) {
  const matchedArtist = artistsConfig.find(a => a.artistName.toLowerCase() === (item.artist || '').toLowerCase());
  const artistBadgeBg = matchedArtist?.badgeStyle || COLOR_METAL_DEFAULT;
  const isFest = item.subType === 'festival';
  const slotPopoverId = `arc-slot-pop-${item.cloudId}`;
  const safeTitle = String(item.title || '').replace(/['"<>]/g, '');
  const safeTheme = String(item.theme || '').replace(/['"<>]/g, '');
  const hasValidVenue = item.venue && !item.venue.includes('待补充');
  const sameThemeCount = safeTheme ? [...tourSchedules, ...cloudArchives].filter(x => x.theme === item.theme).length : 0;
  const setlistHtml = (item.setlist || []).length > 0 ? `<div class="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs font-bold text-slate-800 mb-1.5">🎤 现场演唱歌单（共 ${item.setlist.length} 首）：</div><ol class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 list-decimal list-inside">${item.setlist.map(song => `<li class="truncate">${song}</li>`).join('')}</ol></div>` : '';

  return `<div class="p-4 sm:p-5 rounded-2xl metal-card flex flex-col sm:flex-row gap-4">${item.posterUrl ? `<div class="sm:w-32 shrink-0"><img src="${item.posterUrl}" alt="${safeTitle}" data-cap="${safeTitle} · 官宣海报" onclick="openLightbox(this.src, this.dataset.cap)" class="w-full h-44 object-cover rounded-xl border border-slate-300 cursor-zoom-in shadow-2xs" /></div>` : ''}<div class="flex-1 min-w-0 flex flex-col justify-between gap-2"><div><div class="flex items-start justify-between gap-2"><div class="flex items-center gap-2 flex-wrap"><span class="text-xs px-2 py-0.5 rounded text-white font-semibold" style="background:${artistBadgeBg}">${item.artist}</span><span class="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-300">${isFest ? '🎪 音乐节' : '🏟️ 巡演/Livehouse'}</span><h3 class="font-bold text-base text-slate-900">${safeTitle}</h3></div><div class="flex items-center gap-2 shrink-0">${isFest ? `<button type="button" onclick="openAllFestivalsModal()" class="text-xs text-slate-700 hover:underline font-medium">全部音乐节 ↗</button>` : ''}${(!isFest && safeTheme && sameThemeCount >= 2) ? `<button type="button" data-theme="${safeTheme}" onclick="openThemeDetailModal(this.dataset.theme)" class="text-xs text-slate-700 hover:underline font-medium">巡演专题 ↗</button>` : ''}${item.url ? `<a href="${item.url}" target="_blank" class="text-xs text-slate-500 hover:text-slate-900">原帖 ↗</a>` : ''}${isAdmin ? `<button type="button" onclick="deleteCloudRecord('tickets', ${item.cloudId})" class="text-xs text-rose-600 hover:underline">删除</button>` : ''}</div></div><p class="text-xs text-slate-500 mt-1.5">🗓️ ${item.showDate} ｜ 📍 ${item.venue}</p><div class="flex items-center gap-2 flex-wrap mt-2.5">${!isFest && item.prices ? `<span class="text-xs px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 font-medium">💰 票价：${item.prices}</span>` : ''}${!isFest && item.seatUrl ? `<button type="button" data-src="${item.seatUrl}" data-cap="${safeTitle} · 场馆座位图" onclick="openLightbox(this.dataset.src, this.dataset.cap)" class="text-xs px-2.5 py-1 rounded-lg liquid-silver-btn font-medium transition">💺 座位图</button>` : ''}${hasValidVenue ? `<button type="button" onclick="openVenueViewModal('archive', ${item.cloudId})" class="text-xs px-2.5 py-1 rounded-lg liquid-silver-btn font-medium transition">🔭 场馆视角</button>` : ''}${isFest ? buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeTitle) : ''}</div>${isFest ? setlistHtml : ''}</div></div></div>`;
}

function renderArchiveTimeline() {
  const container = document.getElementById('archive-timeline-list');
  const sectionEl = container.closest('section');
  const currentArtistObj = artistsConfig.find(a => a.artistId === activeArtistId);
  const selectedYear = document.getElementById('archive-year-filter').value;
  const filtered = cloudArchives.filter(item => {
    if (activeArtistId !== 'ALL' && currentArtistObj && (!item.artist || item.artist.toLowerCase() !== currentArtistObj.artistName.toLowerCase())) return false;
    if (activeArchiveType !== 'ALL' && item.subType !== activeArchiveType) return false;
    if (selectedYear !== 'ALL' && item.year !== selectedYear) return false;
    return true;
  });

  if (!filtered.length) {
    const hasAnyForArtist = activeArtistId === 'ALL' || cloudArchives.some(item => item.artist && currentArtistObj && item.artist.toLowerCase() === currentArtistObj.artistName.toLowerCase());
    if (activeArtistId !== 'ALL' && !hasAnyForArtist) sectionEl.classList.add('hidden');
    else { sectionEl.classList.remove('hidden'); container.innerHTML = `<div class="text-sm text-slate-400 py-4">暂无符合筛选条件的往日演出记录</div>`; }
    return;
  }
  sectionEl.classList.remove('hidden');

  const featured = filtered[0];
  const rest = filtered.slice(1);
  let html = buildArchiveVerticalCardHTML(featured);
  if (rest.length > 0) {
    html += `<div class="pt-1 space-y-3"><button type="button" onclick="toggleArchiveExpand()" class="w-full py-2.5 px-4 rounded-xl liquid-silver-btn text-xs font-semibold flex items-center justify-center gap-2 transition"><span>${isArchiveExpanded ? `🔼 收起其余 ${rest.length} 场往日演出` : `📂 展开其余 ${rest.length} 场往日演出回顾（竖行列表展示）▾`}</span></button>${isArchiveExpanded ? `<div class="space-y-3">${rest.map(item => buildArchiveVerticalCardHTML(item)).join('')}</div>` : ''}</div>`;
  }
  container.innerHTML = html;
}

function toggleTransportDrawer(idx) {
  document.getElementById(`transport-box-${idx}`)?.classList.toggle('hidden');
}

function renderTourCards() {
  const container = document.getElementById('tour-grid');
  const sectionEl = container.closest('section');
  const currentArtistObj = artistsConfig.find(a => a.artistId === activeArtistId);
  const filteredTours = tourSchedules.filter(t => {
    if (activeArtistId === 'ALL' || !currentArtistObj) return true;
    return t.artist && t.artist.toLowerCase() === currentArtistObj.artistName.toLowerCase();
  });

  if (!filteredTours.length) {
    if (activeArtistId !== 'ALL') sectionEl.classList.add('hidden');
    else { sectionEl.classList.remove('hidden'); container.innerHTML = `<div class="text-sm text-slate-400">暂无近期演出日程（管理员可点击「🎫 手动新增演出 / 海报识图」添加）</div>`; }
    return;
  }
  sectionEl.classList.remove('hidden');

  container.innerHTML = filteredTours.map((item, idx) => {
    const matchedArtist = artistsConfig.find(a => a.artistName.toLowerCase() === (item.artist || '').toLowerCase());
    const artistBadgeBg = matchedArtist?.badgeStyle || COLOR_METAL_DEFAULT;
    const navKeyword = (item.venue && !item.venue.includes('待')) ? item.venue : item.city;
    const amapSearchUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(navKeyword)}`;
    const slotPopoverId = `cp-slot-pop-${item.cloudId || idx}`;
    const safeCity = String(item.city || '').replace(/['"<>]/g, '');
    const safeTheme = String(item.theme || '').replace(/['"<>]/g, '');
    const isFest = /音乐节|嘉年华/.test(`${item.city} ${item.theme || ''}`);
    const hasValidVenue = item.venue && !item.venue.includes('待补充');
    const sameThemeCount = safeTheme ? [...tourSchedules, ...cloudArchives].filter(x => x.theme === item.theme).length : 0;

    const activeRounds = (item.rounds || []).filter(r => {
      const targetTs = new Date(r.sale_time.replace(/-/g, '/')).getTime();
      return isNaN(targetTs) || targetTs > Date.now();
    });
    const hasActiveSale = activeRounds.length > 0;
    const statusBadgeHtml = hasActiveSale ? `<span class="text-[11px] px-2 py-0.5 rounded-full obsidian-btn text-white font-semibold">🔥 售票倒计时中</span>` : `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/90 text-slate-800 border border-slate-300 font-semibold">⏳ 待开演（售票已结束）</span>`;

    const roundsHtml = hasActiveSale ? activeRounds.map(r => {
      const isPrio = /优先|特权|会员/.test(r.round_name);
      const isPresale = /预售/.test(r.round_name);
      const badgeStyleClass = isPrio ? 'bg-slate-200/80 text-slate-900 border border-slate-300 font-medium' : isPresale ? 'bg-slate-100 text-slate-800 border border-slate-300 font-medium' : 'bg-white text-slate-900 border border-slate-300 font-medium';
      return `<div class="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg ${badgeStyleClass}"><span class="truncate"><strong>${r.round_name}</strong>：${r.sale_time} <span class="opacity-80">(${r.platform})</span></span><div class="flex items-center gap-2 shrink-0"><span class="countdown-badge font-mono font-bold text-slate-900" data-time="${r.sale_time}"></span><button type="button" onclick="downloadICS('${safeCity}-${String(r.round_name || '').replace(/['"<>]/g, '')}', '${r.sale_time}', '${String(r.platform || '').replace(/['"<>]/g, '')}', '${item.source_url || ''}')" class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200">📅</button></div></div>`;
    }).join('') : '';

    return `<div class="p-4 rounded-xl metal-card flex flex-col justify-between gap-3"><div class="flex gap-3.5">${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeCity}" data-cap="${safeCity} · 演出海报" onclick="openLightbox(this.src, this.dataset.cap)" class="w-20 h-28 object-cover rounded-lg border border-slate-300 cursor-zoom-in shrink-0 shadow-2xs" />` : ''}<div class="flex-1 min-w-0"><div class="flex items-start justify-between gap-2"><div class="flex items-center gap-2 flex-wrap">${item.artist ? `<span class="text-xs px-2 py-0.5 rounded text-white font-semibold shrink-0" style="background:${artistBadgeBg}">${item.artist}</span>` : ''}<span class="font-bold text-base text-slate-900">${safeCity}</span>${statusBadgeHtml}</div><div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">${isFest ? `<button type="button" onclick="openAllFestivalsModal()" class="text-xs text-slate-700 hover:underline font-medium">全部音乐节 ↗</button>` : ''}${(!isFest && safeTheme && sameThemeCount >= 2) ? `<button type="button" data-theme="${safeTheme}" onclick="openThemeDetailModal(this.dataset.theme)" class="text-xs text-slate-700 hover:underline font-medium">专题页 ↗</button>` : ''}${item.source_url && item.source_url !== '#' ? `<a href="${item.source_url}" target="_blank" class="text-xs text-slate-500 hover:text-slate-900">原帖 ↗</a>` : ''}${(isAdmin && item.cloudId) ? `<button type="button" onclick="editExistingTicket(${item.cloudId})" class="text-xs text-slate-800 hover:underline font-semibold">✏️ 编辑</button>` : ''}${(isAdmin && item.cloudId) ? `<button type="button" onclick="archiveExistingTicket(${item.cloudId})" class="text-xs text-slate-600 hover:underline">归档</button>` : ''}${(isAdmin && item.cloudId) ? `<button type="button" onclick="deleteCloudRecord('tickets', ${item.cloudId})" class="text-xs text-rose-600 hover:underline">删除</button>` : ''}</div></div><p class="text-xs text-slate-500 mt-1.5">📍 ${item.venue} ｜ 🗓️ ${item.show_date} ${item.startTime ? `｜ ⏰ ${item.startTime}` : ''}</p><div class="flex items-center justify-between gap-2 mt-2 flex-wrap"><div class="flex items-center gap-1.5 flex-wrap">${item.prices ? `<span class="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-medium">💰 ${item.prices}</span>` : ''}${item.seatUrl ? `<button type="button" data-src="${item.seatUrl}" data-cap="${safeCity} · 场馆座位图" onclick="openLightbox(this.dataset.src, this.dataset.cap)" class="text-[11px] px-2 py-0.5 rounded-md liquid-silver-btn font-medium transition">💺 座位图</button>` : ''}${hasValidVenue ? `<button type="button" onclick="openVenueViewModal('ticket', ${item.cloudId})" class="text-[11px] px-2 py-0.5 rounded-md liquid-silver-btn font-medium transition">🔭 场馆视角</button>` : ''}${buildSlotHoverBadgeHTML(item.slot, item.scheduleImgs, slotPopoverId, safeCity)}</div><div class="flex items-center gap-2"><button type="button" onclick="toggleTransportDrawer(${idx})" class="text-[11px] px-2 py-0.5 rounded-md liquid-silver-btn font-medium transition">🚇 交通攻略 ▾</button><a href="${amapSearchUrl}" target="_blank" class="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 transition">导航 ↗</a></div></div><div id="transport-box-${idx}" class="hidden mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 leading-relaxed whitespace-pre-line"><div class="font-semibold text-slate-900 mb-1">🚇 交通枢纽 → ${item.venue}：</div>${item.transport || '该场地暂未录入预设路线，可点击右侧「导航 ↗」使用高德地图规划路线。'}</div></div></div>${roundsHtml ? `<div class="space-y-1.5">${roundsHtml}</div>` : ''}</div>`;
  }).join('');
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now();
  let needReRender = false;
  document.querySelectorAll('.countdown-badge').forEach(el => {
    const target = new Date(el.getAttribute('data-time').replace(/-/g, '/')).getTime();
    if (isNaN(target)) return;
    const diff = target - now;
    if (diff <= 0) { needReRender = true; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `剩 ${d}天${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  });
  if (needReRender) renderTourCards();
}

function downloadICS(title, timeStr, platform, url) {
  const start = new Date(timeStr.replace(/-/g, '/'));
  if (isNaN(start)) return alert('时间格式暂不支持导出日历');
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:🎫 抢票提醒：${title} (${platform})`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `DESCRIPTION:售票平台：${platform}\\n直达链接：${url || ''}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:还有15分钟开票！', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `${title}-开票提醒.ics`;
  a.click();
}
