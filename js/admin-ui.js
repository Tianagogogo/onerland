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
  if (document.getElementById('adm-merch-booth')) {
    document.getElementById('adm-merch-booth').value = item.merchBooth || '';
  }
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
  ['adm-title', 'adm-date', 'adm-body', 'adm-poster', 'adm-slot', 'adm-merch-booth', 'adm-url', 'adm-sale-time'].forEach(id => {
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
  const merchBooth = (document.getElementById('adm-merch-booth')?.value || '').trim();
  const url = document.getElementById('adm-url').value.trim();
  const isPinned = document.getElementById('adm-pin').checked;
  const saleTimeRaw = document.getElementById('adm-sale-time').value;
  const salePlat = document.getElementById('adm-sale-plat').value.trim() || '大麦';

  if (!titleOrPlat) return alert('请填写标题或平台名称！');

  try {
    if (type === 'feed') {
      const content = `${isPinned ? '[PIN] ' : ''}${venueOrBody || titleOrPlat}`;
      await adminApi('createFeed', {
        artist, platform: titleOrPlat, content, url
      });
      await loadAllFeeds();
    } else if (type === 'ticket') {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const rounds = saleTimeRaw ? [{ round_name: '正式开票', sale_time: saleTimeRaw.replace('T', ' '), platform: salePlat }] : [];
      const payload = {
        title: `${artist}|${titleOrPlat}|${venueOrBody || '场馆待补充'}|${showDate}|${slotText}`,
        ticket_time: saleTimeRaw || `${showDate}T19:30`,
        platform: `META:${JSON.stringify({
          rounds,
          posterUrl,
          slot: slotText,
          merchBooth,
          scheduleImgs: adminScheduleImgs,
          theme: normalizeSeriesKey(titleOrPlat)
        })}`,
        url
      };
      const isPatch = Boolean(AppState.editingTicketId);
      if (isPatch) {
        await adminApi('updateTicket', payload, AppState.editingTicketId);
      } else {
        await adminApi('createTicket', payload);
      }
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
          merchBooth,
          scheduleImgs: adminScheduleImgs,
          viewImgs: existing?.viewImgs || [],
          setlist: existing?.setlist || [],
          theme: normalizeSeriesKey(titleOrPlat)
        })}`,
        url
      };
      const isPatch = Boolean(AppState.editingTicketId);
      if (isPatch) {
        await adminApi('updateTicket', payload, AppState.editingTicketId);
      } else {
        await adminApi('createTicket', payload);
      }
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
  try {
    await adminApi('deleteTicket', {}, id);
  } catch (e) {
    alert(`删除失败：${e.message}`);
    return;
  }
  await loadTourData();
  renderAdminTodoQueue();
}

// ================= 脱敏票根复核队列（管理员） =================
let adminProofQueueCache = [];

async function loadProofReviewQueue(status = 'pending') {
  const box = document.getElementById('admin-proof-queue');
  if (!box) return;
  box.innerHTML = `<div class="text-xs text-slate-400 py-3">加载中…</div>`;

  const session = typeof getStoredSession === 'function' ? getStoredSession() : null;
  if (!session || !session.access_token) {
    box.innerHTML = `<div class="text-xs text-rose-500 py-3">登录状态已失效，请重新登录后再试</div>`;
    return;
  }

  try {
    const res = await fetch(`/api/admin?status=${encodeURIComponent(status)}&limit=30`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
    adminProofQueueCache = Array.isArray(data.data) ? data.data : [];
  } catch (e) {
    box.innerHTML = `<div class="text-xs text-rose-500 py-3">加载失败：${e.message}<br><span class="text-slate-400">（确认已在 Cloudflare 配置 SUPABASE_SERVICE_ROLE_KEY 与 ADMIN_EMAIL，并已执行 sql/ticket_proofs.sql）</span></div>`;
    return;
  }

  if (!adminProofQueueCache.length) {
    box.innerHTML = `<div class="text-xs text-slate-400 py-3">${status === 'pending' ? '当前没有待复核票根 🎉' : '该状态下没有记录'}</div>`;
    return;
  }

  box.innerHTML = adminProofQueueCache.map(p => {
    const statusTag = {
      pending: '<span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">待复核</span>',
      approved: '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">已通过</span>',
      rejected: '<span class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">已驳回</span>'
    }[p.review_status] || p.review_status;

    const thumb = p.signed_url
      ? `<a href="${p.signed_url}" target="_blank" rel="noopener" class="shrink-0">
           <img src="${p.signed_url}" alt="脱敏票根" class="w-14 h-14 object-cover rounded border border-slate-200" />
         </a>`
      : `<div class="w-14 h-14 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 shrink-0 text-center leading-tight">无图<br>或链接失效</div>`;

    return `
      <div class="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
        ${thumb}
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${statusTag}
            <span class="text-slate-800 font-medium truncate">${p.show_key || '—'}</span>
          </div>
          <div class="text-[11px] text-slate-500">
            区域：${p.seat_area || '未填'} · 提交：${(p.created_at || '').slice(0, 16).replace('T', ' ')}
            ${p.reviewer_note ? ` · 备注：${p.reviewer_note}` : ''}
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="reviewTicketProof(${p.id}, 'approved')" class="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">通过</button>
            <button type="button" onclick="reviewTicketProof(${p.id}, 'rejected')" class="px-2 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium">驳回</button>
            <button type="button" onclick="reviewTicketProof(${p.id}, 'pending')" class="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">重置</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function reviewTicketProof(id, status) {
  let note = '';
  if (status === 'rejected') {
    const input = prompt('驳回原因（会记录在复核备注，选填）', '票根信息不足以下判断');
    if (input === null) return;
    note = input.trim();
  }
  try {
    await adminApi('reviewProof', { review_status: status, reviewer_note: note }, id);
  } catch (e) {
    alert(`复核失败：${e.message}`);
    return;
  }
  const label = { approved: '已通过', rejected: '已驳回', pending: '已重置为待复核' }[status] || status;
  await loadProofReviewQueue('pending');
  alert(`✅ ${label}`);
}

// 统一调用服务端写接口（functions/api/admin.js），由服务端校验管理员身份
async function adminApi(action, payload = {}, id) {
  const session = typeof getStoredSession === 'function' ? getStoredSession() : null;
  if (!session || !session.access_token) {
    throw new Error('登录状态已失效，请重新登录');
  }
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action, payload, id })
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || !data.ok) {
    const msg = (data && (data.error || data.detail)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.data;
}

// ================= Gemini API Key 本地配置 =================
// 密钥仅保存在本机 localStorage，绝不上传云端
function configGeminiKey() {
  const current = (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
  const masked = current ? `${current.slice(0, 6)}••••${current.slice(-4)}` : '';
  const input = prompt(
    `输入 Gemini API Key（留空并确定可清除）${masked ? `\n当前：${masked}` : ''}`,
    ''
  );
  if (input === null) return;
  const val = input.trim();
  if (!val) {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    if (typeof updateAiKeyStatusUI === 'function') updateAiKeyStatusUI();
    alert('已清除本地 AI 密钥');
    return;
  }
  localStorage.setItem(GEMINI_KEY_STORAGE, val);
  if (typeof updateAiKeyStatusUI === 'function') updateAiKeyStatusUI();
  alert('密钥已保存到本机浏览器，仅用于本地海报识别。');
}
