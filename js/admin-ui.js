let adminScheduleImgs = [];

function renderAdminScheduleThumbs() {
  const box = document.getElementById('adm-schedule-thumbs');
  if (!box) return;
  box.innerHTML = adminScheduleImgs.length
    ? adminScheduleImgs.map((src, i) => `
        <div class="relative w-14 h-16 rounded-lg overflow-hidden border border-slate-300 bg-white">
          <img src="${src}" onclick="openLightbox(this.src, '时间表 #${i + 1}')" class="w-full h-full object-cover cursor-zoom-in" loading="lazy" decoding="async" />
          <button type="button" onclick="adminScheduleImgs.splice(${i}, 1); renderAdminScheduleThumbs();" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 text-white text-[10px]">✕</button>
        </div>
      `).join('')
    : `<span class="text-[11px] text-slate-400">暂无时间表图片（音乐节可在此上传或贴链接，卡片悬停时段即可弹出查看）</span>`;
}

async function handleAdminScheduleFiles(event) {
  const files = Array.from(event.target.files || []);
  let firstDataUrl = '';
  for (const file of files) {
    // 时间表：最长边 2560px、质量 0.92，保留两天拼图里的小字
    const dataUrl = await compressTimetableImage(file, 2560, 0.92);
    adminScheduleImgs.push(dataUrl);
    if (!firstDataUrl) firstDataUrl = dataUrl;
  }
  event.target.value = '';
  renderAdminScheduleThumbs();
  // 自动 OCR：识别时间表里 ONER / 岳岳 / 木子洋 / 灵超 的上台时段并回填
  if (!firstDataUrl || typeof recognizeTimetableSlot !== 'function') return;
  const statusEl = document.getElementById('adm-schedule-ocr-status');
  if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = '🔍 正在识别时间表中的艺人时段…'; }
  try {
    const slot = await recognizeTimetableSlot(firstDataUrl);
    const slotInput = document.getElementById('adm-slot');
    const scheduleSlotInput = document.getElementById('adm-schedule-slot');
    if (slot && slotInput) {
      slotInput.value = slot;
      if (scheduleSlotInput) scheduleSlotInput.value = slot;
      if (statusEl) statusEl.textContent = `✅ 已识别艺人时段：${slot}（可手动微调）`;
    } else if (statusEl) {
      statusEl.textContent = '⚠️ 未识别到明确时段，可手动填写「音乐节演出时段」';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = `⚠️ 时段识别失败：${e.message || '网络异常'}，可手动填写`;
  }
}

function addAdminScheduleUrl() {
  const inp = document.getElementById('adm-schedule-url');
  const val = (inp?.value || '').trim();
  if (!val) return;
  adminScheduleImgs.push(val);
  inp.value = '';
  renderAdminScheduleThumbs();
}

async function handleAdminSeatFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  // 座位图：最大边 1600px、质量 0.86
  const dataUrl = await compressImageToDataURL(file, 1600, 0.86, Infinity);
  const seatInput = document.getElementById('adm-seat');
  if (seatInput) seatInput.value = dataUrl;
  const prev = document.getElementById('adm-seat-preview');
  if (prev) { prev.src = dataUrl; prev.classList.remove('hidden'); }
  event.target.value = '';
}

function clearAdminPoster() {
  const input = document.getElementById('adm-poster');
  if (input) input.value = '';
  const prev = document.getElementById('adm-poster-preview');
  if (prev) { prev.removeAttribute('src'); prev.classList.add('hidden'); }
}

function clearAdminSeat() {
  const input = document.getElementById('adm-seat');
  if (input) input.value = '';
  const prev = document.getElementById('adm-seat-preview');
  if (prev) { prev.removeAttribute('src'); prev.classList.add('hidden'); }
}

async function handleAdminPosterFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  // 海报：最大边 600px、质量 0.80
  const dataUrl = await compressImageToDataURL(file, 600, 0.80, Infinity);
  document.getElementById('adm-poster').value = dataUrl;
  const prev = document.getElementById('adm-poster-preview');
  prev.src = dataUrl;
  prev.classList.remove('hidden');
}

function findShowForEdit(kind, cloudId, fallback) {
  const editKind = kind === 'archive' ? 'archive' : 'ticket';
  const targetId = String(cloudId == null ? '' : cloudId).trim();
  const sources = [];
  if (editKind === 'archive') sources.push(AppState.cloudArchives, AppState.cloudTickets);
  else sources.push(AppState.cloudTickets, AppState.cloudArchives);
  // 全量合并池兜底（含音乐节 / 巡演合集里拆出来的子场次）
  if (Array.isArray(AppState.shows)) sources.push(AppState.shows);
  const sameId = x => String((x && (x.cloudId != null ? x.cloudId : x.id)) == null ? '' : (x.cloudId != null ? x.cloudId : x.id)) === targetId;
  if (targetId) {
    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      const hit = src.find(sameId);
      if (hit) return { item: hit, editKind };
    }
  }
  // ID 缺失/类型漂移：用按钮所在卡片的标题 + 日期做语义兜底
  const fbTitle = String((fallback && fallback.title) || '').trim();
  const fbDate = String((fallback && fallback.date) || '').slice(0, 10);
  if (fbTitle || fbDate) {
    const norm = v => String(v || '').replace(/\s+/g, '').toUpperCase();
    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      const hit = src.find(x => {
        const t = norm(x && (x.title || x.city));
        const d = String((x && (x.showDate || x.show_date)) || '').slice(0, 10);
        const titleOk = fbTitle ? (t.includes(norm(fbTitle)) || norm(fbTitle).includes(t) && t.length > 1) : true;
        const dateOk = fbDate ? d === fbDate : true;
        return titleOk && dateOk;
      });
      if (hit) return { item: hit, editKind };
    }
  }
  return null;
}

function startEditShow(kind, cloudId, fallback) {
  if (!canEditContent()) {
    if (typeof openAdminUnlockModal === 'function') openAdminUnlockModal();
    else alert('请先通过授权邮箱登录或管理员密码解锁。');
    return;
  }
  const resolved = findShowForEdit(kind, cloudId, fallback);
  if (!resolved) {
    alert('未找到该场次数据，请点击右上角「刷新同步」后重试。');
    return;
  }
  const item = resolved.item;
  const editKind = resolved.editKind;
  const targetId = String(item.cloudId != null ? item.cloudId : (item.id != null ? item.id : (cloudId == null ? '' : cloudId)));

  AppState.editingTicketId = item.cloudId != null ? item.cloudId : targetId;
  AppState.editingKind = editKind;
  AppState.editingId = String(AppState.editingTicketId);
  const adminModalEl = document.getElementById('hidden-admin-modal');
  if (adminModalEl && adminModalEl.dataset) adminModalEl.dataset.editingId = String(AppState.editingTicketId);
  document.getElementById('hidden-admin-modal').classList.remove('hidden');
  document.getElementById('adm-type').value = editKind;
  document.getElementById('adm-artist').value = item.artist || 'ONER';
  document.getElementById('adm-title').value = editKind === 'archive' ? (item.title || '') : (item.city || '');
  document.getElementById('adm-date').value = editKind === 'archive' ? (item.showDate || '') : String(item.show_date || '').slice(0, 10);
  document.getElementById('adm-body').value = item.venue || '';
  document.getElementById('adm-poster').value = item.posterUrl || '';
  if (document.getElementById('adm-transport')) {
    document.getElementById('adm-transport').value = item.transport || '';
  }
  if (document.getElementById('adm-seat')) {
    document.getElementById('adm-seat').value = item.seatUrl || '';
  }
  document.getElementById('adm-slot').value = item.slot || '';
  if (document.getElementById('adm-schedule-slot')) {
    document.getElementById('adm-schedule-slot').value = item.slot || '';
  }
  document.getElementById('adm-seat').value = item.seatUrl || '';
  document.getElementById('adm-prices') && (document.getElementById('adm-prices').value = item.prices || '');
  if (document.getElementById('adm-merch-booth')) {
    document.getElementById('adm-merch-booth').value = item.merchBooth || '';
  }
  document.getElementById('adm-url').value = (item.url && item.url !== '#') ? item.url : ((item.source_url && item.source_url !== '#') ? item.source_url : '');
  const firstRound = Array.isArray(item.rounds) && item.rounds[0] ? item.rounds[0] : {};
  document.getElementById('adm-sale-time').value = String(firstRound.sale_time || '').replace(' ', 'T').slice(0, 16);
  document.getElementById('adm-sale-plat').value = firstRound.platform || '大麦';

  const posterPrev = document.getElementById('adm-poster-preview');
  if (posterPrev) {
    if (item.posterUrl) { posterPrev.src = item.posterUrl; posterPrev.classList.remove('hidden'); }
    else { posterPrev.removeAttribute('src'); posterPrev.classList.add('hidden'); }
  }
  const seatPrev = document.getElementById('adm-seat-preview');
  if (seatPrev) {
    if (item.seatUrl) { seatPrev.src = item.seatUrl; seatPrev.classList.remove('hidden'); }
    else { seatPrev.removeAttribute('src'); seatPrev.classList.add('hidden'); }
  }

  adminScheduleImgs = Array.isArray(item.scheduleImgs) ? [...item.scheduleImgs] : [];
  renderAdminScheduleThumbs();
  const delBtn = document.getElementById('adm-delete-btn');
  if (delBtn) delBtn.classList.remove('hidden');
  document.getElementById('adm-submit-btn').textContent = '💾 保存修改';
}

function resetAdminForm() {
  AppState.editingTicketId = null;
  AppState.editingKind = null;
  AppState.editingId = '';
  const modalEl = document.getElementById('hidden-admin-modal');
  if (modalEl && modalEl.dataset) modalEl.dataset.editingId = '';
  adminScheduleImgs = [];
  renderAdminScheduleThumbs();
  ['adm-title', 'adm-date', 'adm-body', 'adm-poster', 'adm-seat', 'adm-transport', 'adm-slot', 'adm-schedule-slot', 'adm-merch-booth', 'adm-url', 'adm-sale-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('adm-poster-preview')?.classList.add('hidden');
  document.getElementById('adm-seat-preview')?.classList.add('hidden');
  document.getElementById('adm-delete-btn')?.classList.add('hidden');
  document.getElementById('adm-submit-btn').textContent = '☁️ 同步发布';
}

async function submitAdminQuickPost() {
  if (!canEditContent()) return alert('请先通过授权邮箱登录或管理员密码解锁。');
  // editingId 必须在函数级作用域内声明：之前写在 ticket 分支里，archive（音乐节时间表）保存时会抛
  // ReferenceError: Can't find variable: editingId
  const adminModal = document.getElementById('hidden-admin-modal');
  const editingId = String(
    AppState.editingTicketId
    || (adminModal && adminModal.dataset ? adminModal.dataset.editingId : '')
    || ''
  ).trim();
  const type = document.getElementById('adm-type').value;
  const artist = document.getElementById('adm-artist').value;
  const titleOrPlat = document.getElementById('adm-title').value.trim();
  const dateOrTime = document.getElementById('adm-date').value.trim();
  const venueOrBody = document.getElementById('adm-body').value.trim();
  const posterUrl = document.getElementById('adm-poster').value.trim();
  const seatUrl = (document.getElementById('adm-seat')?.value || '').trim();
  const transportText = (document.getElementById('adm-transport')?.value || '').trim();
  const slotText = (document.getElementById('adm-schedule-slot')?.value
    || document.getElementById('adm-slot')?.value || '').trim();
  const merchBooth = (document.getElementById('adm-merch-booth')?.value || '').trim();
  const url = document.getElementById('adm-url').value.trim();
  const saleTimeRaw = document.getElementById('adm-sale-time').value;
  const salePlat = document.getElementById('adm-sale-plat').value.trim() || '大麦';

  if (!titleOrPlat) return alert('请填写标题！');

  try {
    if (type === 'ticket') {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const rounds = saleTimeRaw ? [{ round_name: '正式开票', sale_time: saleTimeRaw.replace('T', ' '), platform: salePlat }] : [];
      const payload = {
        title: `${artist}|${titleOrPlat}|${venueOrBody || '场馆待补充'}|${showDate}|${slotText}`,
        ticket_time: saleTimeRaw || `${showDate}T19:30`,
        platform: `META:${JSON.stringify({
          rounds,
          posterUrl,
          seatUrl,
          transport: transportText,
          slot: slotText,
          time_slot: slotText,
          merchBooth,
          scheduleImgs: adminScheduleImgs,
          theme: normalizeSeriesKey(titleOrPlat)
        })}`,
        url
      };
      const isPatch = Boolean(editingId) && !editingId.startsWith('local');
      if (isPatch) {
        await adminApi('updateTicket', payload, editingId);
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
          seatUrl: seatUrl || existing?.seatUrl || '',
          transport: transportText || existing?.transport || '',
          slot: slotText,
          time_slot: slotText,
          merchBooth,
          scheduleImgs: adminScheduleImgs,
          viewImgs: existing?.viewImgs || [],
          setlist: existing?.setlist || [],
          theme: normalizeSeriesKey(titleOrPlat)
        })}`,
        url
      };
      const isPatch = Boolean(editingId) && !editingId.startsWith('local');
      if (isPatch) {
        await adminApi('updateTicket', payload, editingId);
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
        <button type="button" data-edit-show="${String(item.id == null ? '' : item.id).replace(/"/g, '&quot;')}" data-edit-kind="${item.kind}" class="px-2 py-1 rounded bg-slate-100 text-slate-800 hover:bg-slate-200 font-medium">编辑</button>
        <button type="button" onclick="adminDeleteItem('${item.table}', ${item.id})" class="px-2 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium">删除</button>
      </div>
    </div>
  `).join('') : `<div class="text-xs text-slate-400 py-3">当前待办队列已清空</div>`;
}

async function adminDeleteItem(table, id) {
  if (!canEditContent()) return alert('请先通过授权邮箱登录或管理员密码解锁。');
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

  try {
    const res = await fetch(`/api/admin?status=${encodeURIComponent(status)}&limit=30`, {
      headers: getAdminRequestHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
    adminProofQueueCache = Array.isArray(data.data) ? data.data : [];
  } catch (e) {
    box.innerHTML = `<div class="text-xs text-rose-500 py-3">加载失败：${e.message}<br><span class="text-slate-400">（确认已在 Cloudflare 配置 SUPABASE_SERVICE_ROLE_KEY、ADMIN_EMAIL 或 ADMIN_PASSWORD，并已执行 sql/ticket_proofs.sql）</span></div>`;
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

// 统一调用服务端写接口（functions/api/admin.js），由服务端校验授权邮箱或管理员密码令牌。
async function adminApi(action, payload = {}, id) {
  const headers = getAdminRequestHeaders();
  if (!headers.Authorization && !headers['X-Admin-Token']) {
    throw new Error('请先通过授权邮箱登录或管理员密码解锁');
  }
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload, id })
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (res.status === 401 || res.status === 403) {
    if (headers['X-Admin-Token']) {
      clearAdminToken();
      syncAuthState();
    }
    throw new Error((data && (data.error || data.detail)) || '编辑权限已失效，请重新验证');
  }
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

// ================= ⚡ 一键瘦身历史大图（海报 / 座位图 → WebP） =================
function estimateDataUrlBytes(dataUrl) {
  const str = String(dataUrl || '');
  const idx = str.indexOf(',');
  if (idx < 0) return 0;
  return Math.round((str.length - idx - 1) * 0.75);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

// 将图片源（Base64 或 http 链接）压成 WebP，返回 dataURL；远程图片拉取失败时返回 null
async function compressImageSourceToWebp(src, maxWidth, quality) {
  const isDataUrl = /^data:/i.test(String(src || ''));
  if (!isDataUrl && estimateDataUrlBytes(src) === 0) {
    // 远程图片：先取回二进制，体积不大就直接跳过
    try {
      const resp = await fetch(src, { mode: 'cors', cache: 'force-cache' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!/^image\//i.test(blob.type || '')) return null;
      if (blob.size <= 200 * 1024) return null;
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await drawToWebp(objectUrl, maxWidth, quality);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      return null; // 跨域受限或防盗链，直接跳过，不影响其它记录
    }
  }
  return drawToWebp(src, maxWidth, quality);
}

async function drawToWebp(imgSrc, maxWidth, quality) {
  const img = await loadImageElement(imgSrc);
  const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
  let width = Math.max(1, Math.round(img.width * ratio));
  let height = Math.max(1, Math.round((img.height || img.width) * ratio));

  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  let out = canvas.toDataURL('image/webp', quality);
  if (!out || !out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality);

  // 仍超过 200KB 时继续降质/缩尺寸，保证更新后真的变轻
  let q = quality;
  let guard = 0;
  while (estimateDataUrlBytes(out) > 200 * 1024 && q > 0.45 && guard < 6) {
    q -= 0.08;
    guard += 1;
    out = canvas.toDataURL('image/webp', q) || canvas.toDataURL('image/jpeg', q);
  }
  while (estimateDataUrlBytes(out) > 200 * 1024 && canvas.width > 260 && guard < 12) {
    const shrink = document.createElement('canvas');
    shrink.width = Math.round(canvas.width * 0.8);
    shrink.height = Math.round(canvas.height * 0.8);
    shrink.getContext('2d').drawImage(canvas, 0, 0, shrink.width, shrink.height);
    canvas = shrink;
    out = canvas.toDataURL('image/webp', q) || canvas.toDataURL('image/jpeg', q);
    guard += 1;
  }
  return out;
}

async function bulkCompressLegacyImages() {
  if (!canEditContent()) {
    alert('请先通过管理员密码解锁后再使用该工具。');
    return;
  }
  if (!confirm('将遍历云端所有场次的海报与座位图，把超过 200KB 的图片压缩为 WebP 后写回数据库。\n过程中请勿关闭页面，是否继续？')) return;

  const btn = document.getElementById('adm-compress-btn');
  const statusEl = document.getElementById('adm-compress-status');
  const setStatus = text => { if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = text; } };
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在瘦身…'; }

  let scanned = 0, updated = 0, skipped = 0, failed = 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets?select=id,title,ticket_time,platform,url&order=id.desc`, {
      headers: SB_HEADERS,
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`读取云端场次失败 HTTP ${res.status}`);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    setStatus(`共 ${list.length} 条场次，开始扫描大图…`);

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      scanned += 1;
      const raw = String(row.platform || '');
      const prefix = raw.startsWith('ARCHIVE:') ? 'ARCHIVE:' : 'META:';
      const jsonText = raw.startsWith('ARCHIVE:') ? raw.slice(8) : (raw.startsWith('META:') ? raw.slice(5) : '');
      if (!jsonText) { skipped += 1; continue; }

      let meta = null;
      try { meta = JSON.parse(jsonText); } catch (e) { meta = null; }
      if (!meta || typeof meta !== 'object') { skipped += 1; continue; }

      let changed = false;
      const targets = [
        ['posterUrl', 600, 0.78, '海报'],
        ['seatUrl', 1200, 0.82, '座位图']
      ];
      for (const [field, maxWidth, quality, label] of targets) {
        const src = meta[field];
        if (!src || typeof src !== 'string') continue;
        const isDataUrl = /^data:/i.test(src);
        if (isDataUrl && estimateDataUrlBytes(src) <= 200 * 1024) continue;
        try {
          const next = await compressImageSourceToWebp(src, maxWidth, quality);
          if (next && next !== src && estimateDataUrlBytes(next) < (isDataUrl ? estimateDataUrlBytes(src) : 200 * 1024)) {
            meta[field] = next;
            changed = true;
            setStatus(`第 ${i + 1}/${list.length} 条：${label}已压缩 ${Math.round(estimateDataUrlBytes(src) / 1024)}KB → ${Math.round(estimateDataUrlBytes(next) / 1024)}KB`);
          } else {
            skipped += 1;
          }
        } catch (err) {
          skipped += 1;
        }
      }

      if (!changed) continue;

      try {
        await adminApi('updateTicket', {
          title: row.title,
          ticket_time: row.ticket_time,
          platform: `${prefix}${JSON.stringify(meta)}`,
          url: row.url || ''
        }, row.id);
        updated += 1;
      } catch (err) {
        failed += 1;
        console.warn('瘦身写回失败', row.id, err);
      }
      setStatus(`已处理 ${i + 1}/${list.length} 条 · 更新 ${updated} 条 · 跳过 ${skipped} · 失败 ${failed}`);
    }

    setStatus(`✅ 完成：扫描 ${scanned} 条，更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条。`);
    alert(`⚡ 历史大图瘦身完成\n扫描 ${scanned} 条 · 更新 ${updated} 条 · 跳过 ${skipped} 条 · 失败 ${failed} 条`);
    if (updated > 0 && typeof loadTourData === 'function') await loadTourData();
  } catch (e) {
    setStatus(`❌ 瘦身失败：${e.message || '网络异常'}`);
    alert(`瘦身失败：${e.message || '网络异常'}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ 一键瘦身历史大图'; }
  }
}

// ================= 🗑️ 删除当前编辑的场次（仅云端记录） =================
async function deleteEditingShow() {
  const delModal = document.getElementById('hidden-admin-modal');
  const id = String(
    AppState.editingTicketId
    || (delModal && delModal.dataset ? delModal.dataset.editingId : '')
    || ''
  ).trim();
  if (!id) {
    alert('未获取到当前场次 ID，请关闭弹窗后重新点击「✏️ 编辑」再试。');
    return;
  }
  if (!canEditContent()) {
    alert('请先通过管理员密码解锁后再删除场次。');
    return;
  }
  if (id.startsWith('local')) {
    alert('该场次不是云端记录，无法删除，请刷新同步后重试。');
    return;
  }
  const kind = AppState.editingKind === 'archive' ? 'archive' : 'ticket';
  const source = kind === 'archive' ? AppState.cloudArchives : AppState.cloudTickets;
  const item = source.find(x => String(x.cloudId) === id);
  const label = kind === 'archive'
    ? `${item?.title || ''} ${item?.showDate || ''}`.trim()
    : `${item?.city || ''} ${item?.show_date || ''}`.trim();
  if (!confirm(`确认删除该场次${label ? `：${label}` : ''}？\n删除后不可恢复。`)) return;

  const delBtn = document.getElementById('adm-delete-btn');
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = '⏳ 正在删除…'; }
  try {
    await adminApi('deleteTicket', {}, id);
    alert('✅ 已从云端删除该场次。');
    resetAdminForm();
    document.getElementById('hidden-admin-modal')?.classList.add('hidden');
    await loadTourData();
  } catch (e) {
    alert(`删除失败：${e.message || '网络异常，请稍后重试'}`);
  } finally {
    if (delBtn) { delBtn.disabled = false; delBtn.textContent = '🗑️ 删除该场次'; }
  }
}


// ================= 全站统一【✏️ 编辑】点击委托 =================
// 覆盖顶部大卡片、扁平档案长条、音乐节/巡演合集、管理台待办等所有模板，
// 兼容 data-edit-show / data-show-id / data-id 以及 onclick 内联调用缺失的情况。
function bindGlobalEditDelegation() {
  if (window.__editDelegationBound) return;
  window.__editDelegationBound = true;
  document.addEventListener('click', event => {
    const btn = event.target && event.target.closest
      ? event.target.closest('[data-edit-show], [data-show-id], [data-edit-id], [data-edit-kind]')
      : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const id = btn.dataset.editShow != null ? btn.dataset.editShow
      : (btn.dataset.showId != null ? btn.dataset.showId : (btn.dataset.editId != null ? btn.dataset.editId : ''));
    const kind = btn.dataset.editKind || 'ticket';
    const card = btn.closest('[data-show-card]');
    const fallback = {
      title: btn.dataset.editTitle || (card && card.dataset.showTitle) || '',
      date: btn.dataset.editDate || (card && card.dataset.showDate) || ''
    };
    if (!fallback.title) {
      const textBlock = btn.closest('[data-show-card], .metal-card');
      fallback.title = (textBlock && textBlock.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    }
    startEditShow(kind, id, fallback);
  }, true);
}
window.startEditShow = startEditShow;
window.findShowForEdit = findShowForEdit;
bindGlobalEditDelegation();


// 手动触发时间表 OCR：对当前已上传的第一张时间表图识别艺人时段
async function manualRecognizeTimetableSlot() {
  const statusEl = document.getElementById('adm-schedule-ocr-status');
  const source = (Array.isArray(adminScheduleImgs) && adminScheduleImgs[0]) || '';
  if (!source) {
    alert('请先上传或填入一张音乐节时间表图片');
    return;
  }
  if (typeof recognizeTimetableSlot !== 'function') {
    alert('OCR 模块未加载，请刷新页面后重试');
    return;
  }
  const btn = document.querySelector('button[onclick="manualRecognizeTimetableSlot()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 识别中…'; }
  if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = '🔍 正在识别时间表中的艺人时段…'; }
  try {
    const slot = await recognizeTimetableSlot(source);
    if (slot) {
      document.getElementById('adm-slot').value = slot;
      document.getElementById('adm-schedule-slot').value = slot;
      if (statusEl) statusEl.textContent = `✅ 已识别：${slot}（可手动微调后保存）`;
    } else {
      if (statusEl) statusEl.textContent = '⚠️ 未识别到明确时段，请直接在输入框手动填写';
      alert('未识别到 ONER / 岳岳 / 木子洋 / 灵超 附近的演出时段，请手动填写输入框。');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = `⚠️ 识别失败：${e.message || '网络异常'}，请手动填写`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 手动识别时间段'; }
  }
}
window.manualRecognizeTimetableSlot = manualRecognizeTimetableSlot;
