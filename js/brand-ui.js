/* ================= 💼 商务档案：代言 / 品牌合作一览 =================
   规范：
   1) 数据优先读 Supabase brand_endorsements（匿名只读）；未建表 / 离线时降级本机 localStorage；
   2) 写操作复用全站统一管理员口令（/api/admin），失败自动降级本机，访客只读；
   3) 状态只有「🟢 正在合作中 / ⚪ 合作已结束」两种，默认合作中置顶、官宣日期倒序；
   4) 颜色直接复用 config.js 的 ARTIST_COLORS（团红渐变 + 三位成员专属应援色）。 */

const BRAND_TABLE = 'brand_endorsements';
const BRAND_LOCAL_KEY = 'onerland_brand_endorsements_v1';
const BRAND_CATEGORIES = ['ONER全员', '岳岳', '木子洋', '灵超'];
const BRAND_STATUSES = [
  { key: 'active', label: '🟢 正在合作中' },
  { key: 'ended', label: '⚪ 合作已结束' }
];

const brandState = {
  status: 'all',
  category: 'all',
  editorId: null,
  loading: false,
  error: ''
};

let brandRemoteRows = [];
let brandLoadPromise = null;
let brandLoadedRemote = false;

function brandEsc(v) {
  if (typeof travelEsc === 'function') return travelEsc(v);
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function brandIsAdmin() {
  return typeof canEditContent === 'function'
    ? canEditContent()
    : (typeof AppState !== 'undefined' && Boolean(AppState.isAdmin || AppState.isAdminPasswordVerified));
}

function brandCategoryColor(category) {
  const colors = (typeof ARTIST_COLORS !== 'undefined' && ARTIST_COLORS) || {};
  const key = category === 'ONER全员' ? 'ONER' : category;
  const item = colors[key] || colors['ONER'] || {};
  return {
    bg: item.bg || 'linear-gradient(135deg, #DD0514 0%, #8D0D0E 100%)',
    hex: item.hex || '#DD0514'
  };
}

function brandIsActiveValue(value) {
  if (value === false || value === 0) return false;
  if (value === true || value === 1) return true;
  const text = String(value == null ? '' : value).toLowerCase();
  return !(text === 'false' || text === '0' || text === 'no' || text === 'ended');
}

function normalizeBrandRecord(row) {
  const r = row || {};
  const category = BRAND_CATEGORIES.includes(String(r.category || '').trim())
    ? String(r.category).trim()
    : BRAND_CATEGORIES[0];
  const activeRaw = r.isActive !== undefined ? r.isActive : r.is_active;
  return {
    id: String(r.id || '').trim(),
    brand: String(r.brand || r.name || '').trim(),
    title: String(r.title || r.role || '').trim(),
    category,
    isActive: brandIsActiveValue(activeRaw),
    announceDate: String(r.announce_date || r.announceDate || '').trim().slice(0, 10),
    period: String(r.period || '').trim(),
    note: String(r.note || '').trim(),
    officialUrl: String(r.official_url || r.officialUrl || '').trim(),
    createdAt: String(r.created_at || r.createdAt || '').trim()
  };
}

function brandNewId() {
  return `local-brand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===== 本机降级存储：created / overrides / deleted =====
function readBrandLocalStore() {
  try {
    const raw = localStorage.getItem(BRAND_LOCAL_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { created: [], overrides: {}, deleted: [] };
    return {
      created: Array.isArray(data.created) ? data.created : [],
      overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {},
      deleted: Array.isArray(data.deleted) ? data.deleted.map(String) : []
    };
  } catch (e) {
    return { created: [], overrides: {}, deleted: [] };
  }
}

function writeBrandLocalStore(store) {
  try {
    localStorage.setItem(BRAND_LOCAL_KEY, JSON.stringify({
      created: store.created || [],
      overrides: store.overrides || {},
      deleted: store.deleted || []
    }));
    return true;
  } catch (e) {
    return false;
  }
}

function applyBrandOverlay(baseList) {
  const store = readBrandLocalStore();
  const deleted = new Set(store.deleted);
  const list = (Array.isArray(baseList) ? baseList : [])
    .filter(item => item && item.id && !deleted.has(item.id))
    .map(item => (store.overrides[item.id] ? normalizeBrandRecord(store.overrides[item.id]) : item));
  store.created.forEach(row => {
    const item = normalizeBrandRecord(row);
    if (!item.id || deleted.has(item.id)) return;
    const idx = list.findIndex(x => x.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
  });
  return list
    .map(normalizeBrandRecord)
    .filter(item => item.id && item.brand);
}

function brandSortValue(item) {
  return String(item.announceDate || item.createdAt || '').replace(/[^0-9]/g, '').slice(0, 8);
}

function sortBrands(list) {
  return (list || []).slice().sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const diff = brandSortValue(b).localeCompare(brandSortValue(a));
    if (diff) return diff;
    return String(a.brand).localeCompare(String(b.brand));
  });
}

function getBrands() {
  return sortBrands(applyBrandOverlay(brandRemoteRows));
}

function getBrand(id) {
  const key = String(id || '');
  return getBrands().find(item => item.id === key) || null;
}

// ===== 云端读取（匿名 SELECT）=====
function brandRestHeaders() {
  if (typeof SB_HEADERS !== 'undefined') return SB_HEADERS;
  return {
    apikey: typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '',
    Authorization: `Bearer ${typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''}`
  };
}

async function fetchBrandRemote() {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return { ok: false, rows: [] };
  if (typeof fetch !== 'function') return { ok: false, rows: [] };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${BRAND_TABLE}?select=*`, {
      headers: brandRestHeaders(),
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) return { ok: false, rows: [] };
    const rows = await res.json();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, rows: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadBrands(force) {
  if (brandLoadPromise && !force) return brandLoadPromise;
  brandState.loading = true;
  brandState.error = '';
  renderBrandPage();
  brandLoadPromise = (async () => {
    const result = await fetchBrandRemote();
    if (result.ok) {
      brandRemoteRows = result.rows;
      brandLoadedRemote = true;
    } else {
      brandState.error = brandLoadedRemote ? '云端同步失败，正在展示本机缓存' : '';
    }
    brandState.loading = false;
    renderBrandPage();
  })();
  try {
    await brandLoadPromise;
  } finally {
    brandLoadPromise = null;
  }
}

// ===== 管理员写入（复用 /api/admin 统一口令）=====
async function brandAdminWrite(action, id, payload) {
  if (typeof fetch !== 'function') return { ok: false };
  const headers = typeof getAdminRequestHeaders === 'function'
    ? getAdminRequestHeaders()
    : { 'Content-Type': 'application/json' };
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, id: id || undefined, payload: payload || {} })
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (e) {
    return { ok: false };
  }
}

// ===== 筛选与卡片 =====
function brandStatusMatches(item, status) {
  if (status === 'active') return item.isActive;
  if (status === 'ended') return !item.isActive;
  return true;
}

function brandCategoryMatches(item, category) {
  return category === 'all' || item.category === category;
}

function brandFilteredList() {
  return getBrands().filter(item => brandStatusMatches(item, brandState.status)
    && brandCategoryMatches(item, brandState.category));
}

function brandStatusCount(status) {
  return getBrands().filter(item => brandStatusMatches(item, status)
    && brandCategoryMatches(item, brandState.category)).length;
}

function brandCategoryCount(category) {
  return getBrands().filter(item => brandCategoryMatches(item, category)
    && brandStatusMatches(item, brandState.status)).length;
}

function renderBrandFilters() {
  const box = document.getElementById('brand-filter-bar');
  if (!box) return;
  const statusOptions = [{ key: 'all', label: '全部' }].concat(BRAND_STATUSES);
  const categoryOptions = [{ key: 'all', label: '全部' }].concat(BRAND_CATEGORIES.map(c => ({ key: c, label: c })));
  box.innerHTML = `
    <div class="brand-filter-block">
      <span class="brand-filter-label">合作状态</span>
      <div class="brand-filter-row">
        ${statusOptions.map(opt => `<button type="button" class="brand-filter-chip ${brandState.status === opt.key ? 'is-active' : ''}"
          data-brand-status="${brandEsc(opt.key)}" onclick="setBrandStatusFilter('${brandEsc(opt.key)}')">${brandEsc(opt.label)}<span class="brand-filter-count">${brandStatusCount(opt.key)}</span></button>`).join('')}
      </div>
    </div>
    <div class="brand-filter-block">
      <span class="brand-filter-label">合作对象</span>
      <div class="brand-filter-row">
        ${categoryOptions.map(opt => {
          const color = opt.key === 'all' ? { hex: '#475569' } : brandCategoryColor(opt.key);
          return `<button type="button" class="brand-filter-chip brand-filter-member ${brandState.category === opt.key ? 'is-active' : ''}"
            style="--brand-accent:${brandEsc(color.hex)}" data-brand-category="${brandEsc(opt.key)}"
            onclick="setBrandCategoryFilter('${brandEsc(opt.key)}')">${brandEsc(opt.label)}<span class="brand-filter-count">${brandCategoryCount(opt.key)}</span></button>`;
        }).join('')}
      </div>
    </div>
  `;
}

function brandBadgeHtml(item) {
  const color = brandCategoryColor(item.category);
  return `<span class="brand-badge" style="background:${brandEsc(color.bg)}">${brandEsc(item.category)}</span>`;
}

function brandStatusChipHtml(item) {
  return item.isActive
    ? `<span class="brand-status is-active">🟢 正在合作中</span>`
    : `<span class="brand-status is-ended">⚪ 合作已结束</span>`;
}

function brandMetaText(item) {
  const date = item.announceDate || '待补充';
  const period = item.period || '长期合作';
  return `官宣：${date} · 合作周期：${period}`;
}

function brandOfficialUrl(item) {
  const url = String(item.officialUrl || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function brandCardHtml(item) {
  const admin = brandIsAdmin();
  const idAttr = brandEsc(item.id);
  const official = brandOfficialUrl(item);
  return `
    <article class="brand-card ${item.isActive ? 'is-active' : 'is-ended'}" data-brand-card="${idAttr}">
      <div class="brand-card-head">
        <div class="brand-identity">
          ${brandBadgeHtml(item)}
          <div class="brand-name-wrap">
            <h3 class="brand-name">${brandEsc(item.brand)}</h3>
            <p class="brand-role">${brandEsc(item.title || '品牌合作')}</p>
          </div>
        </div>
        ${brandStatusChipHtml(item)}
      </div>
      <p class="brand-meta">📅 ${brandEsc(brandMetaText(item))}</p>
      ${item.note ? `<p class="brand-note">📝 ${brandEsc(item.note)}</p>` : ''}
      <div class="brand-card-foot">
        ${official ? `<a class="brand-official-link" href="${brandEsc(official)}" target="_blank" rel="noopener noreferrer">🔗 官方链接 ↗</a>` : '<span class="brand-official-empty">暂无官方链接</span>'}
        ${admin ? `<div class="brand-card-admin">
          <button type="button" class="brand-mini-btn" onclick="openBrandEditor('${idAttr}')">✏️ 编辑</button>
          <button type="button" class="brand-mini-btn" onclick="toggleBrandStatus('${idAttr}')">🔄 ${item.isActive ? '标记已结束' : '恢复合作中'}</button>
          <button type="button" class="brand-mini-btn is-danger" onclick="deleteBrand('${idAttr}')">🗑️ 删除</button>
        </div>` : ''}
      </div>
    </article>`;
}

function renderBrandPage() {
  const body = document.getElementById('brand-modal-body');
  if (!body) return;
  if (brandState.editorId !== null) {
    renderBrandEditor(brandState.editorId);
    return;
  }
  const items = brandFilteredList();
  const all = getBrands();
  body.innerHTML = `
    <div class="brand-toolbar">
      <div class="brand-toolbar-copy">
        <span class="brand-toolbar-title">📌 代言与合作记录</span>
        <span class="brand-toolbar-sub">正在合作置顶 · 历史商务按官宣时间回顾</span>
      </div>
      ${brandIsAdmin() ? `<div class="brand-admin-toolbar">
        <button type="button" class="brand-add-btn" onclick="openBrandEditor()">+ 新增商务合作</button>
        <span class="brand-admin-hint">🔓 管理员已解锁</span>
      </div>` : ''}
    </div>
    <div class="brand-filter-bar" id="brand-filter-bar"></div>
    ${brandState.loading && !all.length ? '<div class="brand-empty">⏳ 正在同步商务档案…</div>' : (items.length
      ? `<div class="brand-grid">${items.map(brandCardHtml).join('')}</div>`
      : `<div class="brand-empty">${all.length
        ? '当前筛选下没有商务记录，换个状态或合作对象看看吧～'
        : (brandIsAdmin()
          ? '商务档案还是空的：点「+ 新增商务合作」记录第一条代言吧～'
          : '商务档案整理中，敬请期待～')}</div>`)}
    ${brandState.error ? `<p class="brand-sync-note">⚠️ ${brandEsc(brandState.error)}</p>` : ''}
  `;
  renderBrandFilters();
}

function setBrandStatusFilter(key) {
  brandState.status = ['all', 'active', 'ended'].includes(String(key || '')) ? String(key) : 'all';
  renderBrandPage();
}

function setBrandCategoryFilter(key) {
  brandState.category = ['all'].concat(BRAND_CATEGORIES).includes(String(key || '')) ? String(key) : 'all';
  renderBrandPage();
}

// ===== 新增 / 编辑 =====
function renderBrandEditor(itemId) {
  const body = document.getElementById('brand-modal-body');
  if (!body) return;
  const isEdit = Boolean(itemId);
  const item = isEdit ? getBrand(itemId) : null;
  if (isEdit && !item) {
    body.innerHTML = '<div class="brand-empty">这条商务记录可能已被删除，请返回列表刷新。</div>';
    return;
  }
  const category = item ? item.category : BRAND_CATEGORIES[0];
  const active = item ? item.isActive : true;
  const url = item ? item.officialUrl : '';
  body.innerHTML = `
    <form class="brand-editor-card" onsubmit="event.preventDefault(); submitBrandEditor();">
      <div class="brand-editor-head">
        <button type="button" class="brand-back-btn" onclick="closeBrandEditor()">← 返回商务列表</button>
        <span class="brand-editor-tip">${isEdit ? '✏️ 编辑商务合作' : '+ 新增商务合作'}</span>
      </div>
      <div class="brand-form-row">
        <label class="brand-form-label" for="brand-form-name">品牌名称 <span class="brand-req">*</span></label>
        <input id="brand-form-name" class="brand-form-input" type="text" maxlength="60" required
          placeholder="如：某品牌官方旗舰店" value="${item ? brandEsc(item.brand) : ''}" />
      </div>
      <div class="brand-form-row">
        <label class="brand-form-label" for="brand-form-title">合作头衔 <span class="brand-req">*</span></label>
        <input id="brand-form-title" class="brand-form-input" type="text" maxlength="40" required
          placeholder="如：品牌代言人 / 品牌挚友 / 星推官" value="${item ? brandEsc(item.title) : ''}" />
      </div>
      <div class="brand-form-row">
        <span class="brand-form-label">合作对象 <span class="brand-req">*</span></span>
        <div class="brand-form-radios">
          ${BRAND_CATEGORIES.map(cat => {
            const color = brandCategoryColor(cat);
            return `<label class="brand-radio" style="--brand-accent:${brandEsc(color.hex)}">
              <input type="radio" name="brand-category" value="${brandEsc(cat)}" ${cat === category ? 'checked' : ''} />
              <span>${brandEsc(cat)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>
      <div class="brand-form-row">
        <span class="brand-form-label">当前状态 <span class="brand-req">*</span></span>
        <div class="brand-form-radios">
          ${BRAND_STATUSES.map(st => `<label class="brand-radio brand-radio-status">
            <input type="radio" name="brand-status" value="${st.key}" ${((st.key === 'active') === active) ? 'checked' : ''} />
            <span>${brandEsc(st.label)}</span>
          </label>`).join('')}
        </div>
      </div>
      <div class="brand-form-grid">
        <div class="brand-form-row">
          <label class="brand-form-label" for="brand-form-date">官宣日期</label>
          <input id="brand-form-date" class="brand-form-input" type="date" value="${item ? brandEsc(item.announceDate) : ''}" />
        </div>
        <div class="brand-form-row">
          <label class="brand-form-label" for="brand-form-period">合作周期说明</label>
          <input id="brand-form-period" class="brand-form-input" type="text" maxlength="60"
            placeholder="如：2026.08 - 2027.08 / 长期合作" value="${item ? brandEsc(item.period) : ''}" />
        </div>
      </div>
      <div class="brand-form-row">
        <label class="brand-form-label" for="brand-form-note">合作备注</label>
        <textarea id="brand-form-note" class="brand-form-textarea" rows="3" maxlength="300"
          placeholder="选填，如主推产品线 / 合作内容">${item ? brandEsc(item.note) : ''}</textarea>
      </div>
      <div class="brand-form-row">
        <label class="brand-form-label" for="brand-form-url">官方链接 URL</label>
        <input id="brand-form-url" class="brand-form-input" type="url" maxlength="400"
          placeholder="选填，官方旗舰店 / 官宣微博 / 活动页（无返佣，纯官方入口）" value="${brandEsc(url)}" />
      </div>
      <div class="brand-form-actions">
        <button type="submit" class="brand-action-btn is-primary">💾 保存商务合作</button>
        <button type="button" class="brand-action-btn" onclick="closeBrandEditor()">取消</button>
      </div>
    </form>`;
}

function openBrandEditor(itemId) {
  if (!brandIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再编辑商务档案');
    return;
  }
  brandState.editorId = itemId ? String(itemId) : '';
  renderBrandPage();
  const body = document.getElementById('brand-modal-body');
  if (body) body.scrollTop = 0;
}

function closeBrandEditor() {
  brandState.editorId = null;
  renderBrandPage();
}

async function submitBrandEditor() {
  if (!brandIsAdmin()) {
    if (typeof toastError === 'function') toastError('管理员状态已失效，请重新解锁');
    return;
  }
  const nameEl = document.getElementById('brand-form-name');
  const titleEl = document.getElementById('brand-form-title');
  const dateEl = document.getElementById('brand-form-date');
  const periodEl = document.getElementById('brand-form-period');
  const noteEl = document.getElementById('brand-form-note');
  const urlEl = document.getElementById('brand-form-url');
  const categoryEl = document.querySelector('input[name="brand-category"]:checked');
  const statusEl = document.querySelector('input[name="brand-status"]:checked');
  const brand = String(nameEl ? nameEl.value : '').trim();
  const title = String(titleEl ? titleEl.value : '').trim();
  const category = categoryEl ? String(categoryEl.value || '') : '';
  const isActive = statusEl ? statusEl.value === 'active' : true;
  const announceDate = String(dateEl ? dateEl.value : '').trim().slice(0, 10);
  const period = String(periodEl ? periodEl.value : '').trim();
  const note = String(noteEl ? noteEl.value : '').trim();
  const url = String(urlEl ? urlEl.value : '').trim();

  if (!brand) {
    if (typeof toastError === 'function') toastError('请填写品牌名称');
    if (nameEl) nameEl.focus();
    return;
  }
  if (!title) {
    if (typeof toastError === 'function') toastError('请填写合作头衔');
    if (titleEl) titleEl.focus();
    return;
  }
  if (!BRAND_CATEGORIES.includes(category)) {
    if (typeof toastError === 'function') toastError('请选择合作对象');
    return;
  }
  if (url && !/^https?:\/\//i.test(url)) {
    if (typeof toastError === 'function') toastError('官方链接需以 http:// 或 https:// 开头');
    return;
  }

  const isEdit = Boolean(brandState.editorId);
  const id = isEdit ? brandState.editorId : brandNewId();
  const payload = {
    brand,
    title,
    category,
    is_active: isActive,
    announce_date: announceDate || null,
    period: period || null,
    note: note || null,
    official_url: url || null
  };
  const record = normalizeBrandRecord({ id, ...payload });

  const remote = await brandAdminWrite(isEdit ? 'updateBrand' : 'createBrand', id, payload);
  const store = readBrandLocalStore();
  let finalId = id;
  if (remote.ok) {
    const rows = Array.isArray(remote.data) ? remote.data : (remote.data ? [remote.data] : []);
    const saved = rows.length ? normalizeBrandRecord(rows[0]) : record;
    if (saved.id) finalId = saved.id;
    const idx = brandRemoteRows.findIndex(x => String(x.id) === id);
    if (idx >= 0) brandRemoteRows[idx] = saved;
    else brandRemoteRows.push(saved);
    store.created = store.created.filter(r => String(r.id) !== id);
    delete store.overrides[id];
    store.deleted = store.deleted.filter(x => x !== id);
    writeBrandLocalStore(store);
    if (typeof showToast === 'function') showToast(isEdit ? '商务合作已更新' : '商务合作已新增');
  } else {
    const idx = store.created.findIndex(r => String(r.id) === id);
    if (idx >= 0) store.created[idx] = { ...record };
    else if (isEdit) store.overrides[id] = { ...record };
    else store.created.push({ ...record });
    writeBrandLocalStore(store);
    if (typeof showToast === 'function') showToast('已保存到本机（云端商务表未就绪时自动降级）');
  }
  brandState.editorId = null;
  renderBrandPage();
}

async function toggleBrandStatus(itemId) {
  const id = String(itemId || '');
  if (!id) return;
  if (!brandIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再修改商务状态');
    return;
  }
  const item = getBrand(id);
  if (!item) return;
  const next = !item.isActive;
  const payload = {
    brand: item.brand,
    title: item.title,
    category: item.category,
    is_active: next,
    announce_date: item.announceDate || null,
    period: item.period || null,
    note: item.note || null,
    official_url: item.officialUrl || null
  };
  const record = { ...item, isActive: next };
  const remote = await brandAdminWrite('updateBrand', id, payload);
  const store = readBrandLocalStore();
  if (remote.ok) {
    const rows = Array.isArray(remote.data) ? remote.data : (remote.data ? [remote.data] : []);
    const saved = rows.length ? normalizeBrandRecord(rows[0]) : normalizeBrandRecord(record);
    const idx = brandRemoteRows.findIndex(x => String(x.id) === id);
    if (idx >= 0) brandRemoteRows[idx] = saved;
    delete store.overrides[id];
    writeBrandLocalStore(store);
  } else {
    const idx = store.created.findIndex(r => String(r.id) === id);
    if (idx >= 0) store.created[idx] = { ...record };
    else store.overrides[id] = { ...record };
    writeBrandLocalStore(store);
  }
  renderBrandPage();
  if (typeof showToast === 'function') showToast(next ? `已切换为「🟢 正在合作中」：${item.brand}` : `已切换为「⚪ 合作已结束」：${item.brand}`);
}

async function deleteBrand(itemId) {
  const id = String(itemId || '');
  if (!id) return;
  if (!brandIsAdmin()) {
    if (typeof toastError === 'function') toastError('请先解锁管理员口令后再删除商务档案');
    return;
  }
  const item = getBrand(id);
  if (!confirm(`确认彻底删除「${item ? item.brand : '这条'}」的商务记录？删除后无法恢复。`)) return;
  const remote = await brandAdminWrite('deleteBrand', id, {});
  const store = readBrandLocalStore();
  store.created = store.created.filter(r => String(r.id) !== id);
  delete store.overrides[id];
  if (!store.deleted.includes(id)) store.deleted.push(id);
  writeBrandLocalStore(store);
  brandRemoteRows = brandRemoteRows.filter(x => String(x.id) !== id);
  renderBrandPage();
  if (remote.ok) {
    if (typeof showToast === 'function') showToast(`已彻底删除「${item ? item.brand : '商务记录'}」`);
  } else if (typeof showToast === 'function') {
    showToast('已从本机彻底删除（云端商务表未就绪时自动降级）');
  }
}

// ===== 居中毛玻璃浮窗 =====
function ensureBrandModal() {
  let modal = document.getElementById('brand-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'brand-modal';
  modal.className = 'travel-modal brand-modal hidden';
  modal.innerHTML = `
    <div class="travel-shell brand-shell" role="dialog" aria-modal="true" aria-label="商务档案">
      <div class="travel-head">
        <div class="travel-title-wrap">
          <div class="travel-title">💼 商务档案</div>
          <div class="travel-sub">代言 / 品牌合作 · 正在合作与历史回顾</div>
        </div>
        <button type="button" class="travel-close" data-brand-close aria-label="关闭">✕</button>
      </div>
      <div class="travel-body brand-modal-body" id="brand-modal-body"></div>
      <div class="travel-foot">商务信息以品牌官方公告为准；官方链接直达品牌 / 平台页面，本站不产生任何返佣。</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-brand-close]')) closeBrandModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    if (document.getElementById('chant-image-modal')) return;
    if (brandState.editorId !== null) {
      closeBrandEditor();
      return;
    }
    closeBrandModal();
  }, true);
  return modal;
}

function openBrandModal(status) {
  const modal = ensureBrandModal();
  const requested = String(status || '').trim();
  brandState.status = ['active', 'ended'].includes(requested) ? requested : 'all';
  brandState.category = 'all';
  brandState.editorId = null;
  modal.classList.remove('hidden');
  document.body.classList.add('travel-modal-open');
  renderBrandPage();
  if (!brandLoadPromise && !brandLoadedRemote && !readBrandLocalStore().created.length) loadBrands();
  const body = modal.querySelector('#brand-modal-body');
  if (body) body.scrollTop = 0;
}

function closeBrandModal() {
  const modal = document.getElementById('brand-modal');
  brandState.editorId = null;
  if (modal) modal.classList.add('hidden');
  if (!document.querySelector('.travel-modal:not(.hidden)')) {
    document.body.classList.remove('travel-modal-open');
  }
}

window.openBrandModal = openBrandModal;
window.closeBrandModal = closeBrandModal;
window.renderBrandPage = renderBrandPage;
window.setBrandStatusFilter = setBrandStatusFilter;
window.setBrandCategoryFilter = setBrandCategoryFilter;
window.openBrandEditor = openBrandEditor;
window.closeBrandEditor = closeBrandEditor;
window.submitBrandEditor = submitBrandEditor;
window.toggleBrandStatus = toggleBrandStatus;
window.deleteBrand = deleteBrand;
window.loadBrands = loadBrands;
window.getBrands = getBrands;
window.getBrand = getBrand;

loadBrands();
