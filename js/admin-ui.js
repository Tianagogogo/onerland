let adminScheduleImgs = [];

function renderAdminScheduleThumbs() {
  const box = document.getElementById('adm-schedule-thumbs');
  if (!box) return;
  box.innerHTML = adminScheduleImgs.length
    ? adminScheduleImgs.map((src, i) => `
        <div class="relative w-14 h-16 rounded-lg overflow-hidden border border-slate-300 bg-white">
          <img src="${src}" onclick="openLightbox(this.src, '时间表 #${i + 1}')" class="w-full h-full object-cover cursor-zoom-in" />
          <button type="button" onclick="adminScheduleImgs.splice(${i}, 1); renderAdminScheduleThumbs();" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 text-white text-[10px]">✕</button>
        </div>
      `).join('')
    : `<span class="text-[11px] text-slate-400">暂无时间表图片（音乐节可在此上传或贴链接，卡片悬停时段即可弹出查看）</span>`;
}

async function handleAdminScheduleFiles(event) {
  for (const file of Array.from(event.target.files || [])) {
    const dataUrl = await compressImageToDataURL(file, 760, 0.72);
    adminScheduleImgs.push(dataUrl);
  }
  event.target.value = '';
  renderAdminScheduleThumbs();
}

function addAdminScheduleUrl() {
  const inp = document.getElementById('adm-schedule-url');
  const val = (inp?.value || '').trim();
  if (!val) return;
  adminScheduleImgs.push(val);
  inp.value = '';
  renderAdminScheduleThumbs();
}

async function handleAdminPosterFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const dataUrl = await compressImageToDataURL(file, 760, 0.72);
  document.getElementById('adm-poster').value = dataUrl;
  const prev = document.getElementById('adm-poster-preview');
  prev.src = dataUrl;
  prev.classList.remove('hidden');
}

function startEditShow(kind, cloudId) {
  const source = kind === 'archive' ? AppState.cloudArchives : AppState.cloudTickets;
  const item = source.find(x => String(x.cloudId) === String(cloudId));
  if (!item) return;

  AppState.editingTicketId = cloudId;
  AppState.editingKind = kind;
  document.getElementById('hidden-admin-modal').classList.remove('hidden');
  document.getElementById('adm-type').value = kind;
  document.getElementById('adm-artist').value = item.artist || 'ONER';
  document.getElementById('adm-title').value = kind === 'archive' ? (item.title || '') : (item.city || '');
  document.getElementById('adm-date').value = kind === 'archive' ? (item.showDate || '') : ((item.show_date || '').slice(0, 10));
  document.getElementById('adm-body').value = item.venue || '';
  document.getElementById('adm-poster').value = item.posterUrl || '';
  document.getElementById('adm-slot').value = item.slot || '';
  document.getElementById('adm-url').value = (item.url && item.url !== '#') ? item.url : ((item.source_url && item.source_url !== '#') ? item.source_url : '');
  document.getElementById('adm-sale-time').value = ((item.rounds || [])[0]?.sale_time || '').replace(' ', 'T').slice(0, 16);
  document.getElementById('adm-sale-plat').value = (item.rounds || [])[0]?.platform || '大麦';

  adminScheduleImgs = Array.isArray(item.scheduleImgs) ? [...item.scheduleImgs] : [];
  renderAdminScheduleThumbs();
  document.getElementById('adm-submit-btn').textContent = '💾 保存修改';
}

function resetAdminForm() {
  AppState.editingTicketId = null;
  AppState.editingKind = null;
  adminScheduleImgs = [];
  renderAdminScheduleThumbs();
  ['adm-title', 'adm-date', 'adm-body', 'adm-poster', 'adm-slot', 'adm-url', 'adm-sale-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('adm-poster-preview')?.classList.add('hidden');
  document.getElementById('adm-submit-btn').textContent = '☁️ 同步发布';
}

async function submitAdminQuickPost() {
  if (!AppState.isAdmin) return;
  const type = document.getElementById('adm-type').value;
  const artist = document.getElementById('adm-artist').value;
  const titleOrPlat = document.getElementById('adm-title').value.trim();
  const dateOrTime = document.getElementById('adm-date').value.trim();
  const venueOrBody = document.getElementById('adm-body').value.trim();
  const posterUrl = document.getElementById('adm-poster').value.trim();
  const slotText = (document.getElementById('adm-slot')?.value || '').trim();
  const url = document.getElementById('adm-url').value.trim();
  const isPinned = document.getElementById('adm-pin').checked;
  const saleTimeRaw = document.getElementById('adm-sale-time').value;
  const salePlat = document.getElementById('adm-sale-plat').value.trim() || '大麦';

  if (!titleOrPlat) return alert('请填写标题或平台名称！');

  try {
    if (type === 'feed') {
      const content = `${isPinned ? '[PIN] ' : ''}${venueOrBody || titleOrPlat}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feeds`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ artist, platform: titleOrPlat, content, url })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAllFeeds();
    } else if (type === 'ticket') {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const rounds = saleTimeRaw ? [{ round_name: '正式开票', sale_time: saleTimeRaw.replace('T', ' '), platform: salePlat }] : [];
      const payload = {
        title: `${artist}|${titleOrPlat}|${venueOrBody || '场馆待补充'}|${showDate}|${slotText}`,
        ticket_time: saleTimeRaw || `${showDate}T19:30`,
        platform: `META:${JSON.stringify({ rounds, posterUrl, slot: slotText, scheduleImgs: adminScheduleImgs, theme: normalizeSeriesKey(titleOrPlat) })}`,
        url
      };
      const isPatch = Boolean(AppState.editingTicketId);
      const endpoint = isPatch ? `${SUPABASE_URL}/rest/v1/tickets?id=eq.${AppState.editingTicketId}` : `${SUPABASE_URL}/rest/v1/tickets`;
      const res = await fetch(endpoint, { method: isPatch ? 'PATCH' : 'POST', headers: SB_HEADERS, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTourData();
    } else {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const existing = AppState.cloudArchives.find(a => String(a.cloudId) === String(AppState.editingTicketId));
      const isFest = Boolean(slotText || adminScheduleImgs.length || /音乐节|嘉年华/.test(titleOrPlat));
      const payload = {
        title: `ARCHIVE|${artist}|${titleOrPlat}|${showDate}`,
        ticket_time: `${showDate}T19:30`,
        platform: `ARCHIVE:${JSON.stringify({
          subType: isFest ? 'festival' : (existing?.subType || 'tour'),
          venue: venueOrBody || '演出现场',
          posterUrl,
          prices: existing?.prices || '',
          seatUrl: existing?.seatUrl || '',
          slot: slotText,
          scheduleImgs: adminScheduleImgs,
          viewImgs: existing?.viewImgs || [],
          setlist: existing?.setlist || [],
          theme: normalizeSeriesKey(titleOrPlat)
        })}`,
        url
      };
      const isPatch = Boolean(AppState.editingTicketId);
      const endpoint = isPatch ? `${SUPABASE_URL}/rest/v1/tickets?id=eq.${AppState.editingTicketId}` : `${SUPABASE_URL}/rest/v1/tickets`;
      const res = await fetch(endpoint, { method: isPatch ? 'PATCH' : 'POST', headers: SB_HEADERS, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTourData();
    }

    resetAdminForm();
    renderAdminTodoQueue();
    alert('已保存并同步至云端！');
  } catch (e) {
    alert(`操作失败：${e.message}`);
  }
}

function renderAdminTodoQueue() {
  const box = document.getElementById('admin-todo-queue');
  if (!box) return;
  const recentItems = [
    ...AppState.cloudTickets.map(t => ({ kind: 'ticket', table: 'tickets', id: t.cloudId, tag: '近期演出', title: `${t.artist} · ${t.city} (${t.show_date})` })),
    ...AppState.cloudArchives.slice(0, 10).map(a => ({ kind: 'archive', table: 'tickets', id: a.cloudId, tag: '往日档案', title: `${a.artist} · ${a.title} (${a.showDate})` }))
  ];

  box.innerHTML = recentItems.length ? recentItems.map(item => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
      <div class="truncate">
        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium mr-1.5">${item.tag}</span>
        <span class="text-slate-800">${item.title}</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="startEditShow('${item.kind}', ${item.id})" class="px-2 py-1 rounded bg-slate-100 text-slate-800 hover:bg-slate-200 font-medium">编辑</button>
        <button type="button" onclick="adminDeleteItem('${item.table}', ${item.id})" class="px-2 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium">删除</button>
      </div>
    </div>
  `).join('') : `<div class="text-xs text-slate-400 py-3">当前待办队列已清空</div>`;
}

async function adminDeleteItem(table, id) {
  if (!confirm('确认删除该条记录？')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
  await loadTourData();
  renderAdminTodoQueue();
}
