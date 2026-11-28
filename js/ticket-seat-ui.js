/* 🎟️ 抢票与座位对照表（共享云表格视图 + 本机登记） */
(function () {
  'use strict';

  window.SEAT_PLATFORMS = ['大麦', '猫眼', '纷玩岛', '其他'];
  const LOCAL_KEY = 'onerland_ticket_seats_local_v1';
  window.seatTableState = window.seatTableState || {};

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function writeLocal(obj) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function getLocalOwn(eventId) {
    const all = readLocal();
    const row = all[String(eventId)];
    return row && typeof row === 'object' ? row : null;
  }

  function saveLocalOwn(eventId, row) {
    const all = readLocal();
    all[String(eventId)] = row;
    writeLocal(all);
  }

  function removeLocalOwn(eventId) {
    const all = readLocal();
    delete all[String(eventId)];
    writeLocal(all);
  }

  function deviceId() {
    try { return typeof getDeviceId === 'function' ? String(getDeviceId()) : 'local-device'; } catch (e) { return 'local-device'; }
  }

  async function seatRpc(fnName, params) {
    if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) throw new Error('offline');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {})
    });
    if (!res.ok) throw new Error('rpc-failed-' + res.status);
    return res.json().catch(() => null);
  }

  function normalizeRow(r, i) {
    if (!r) return null;
    const platform = String(r.platform || '其他');
    return {
      id: String(r.id == null ? `row-${i}` : r.id),
      platform,
      seconds: Number(r.seconds == null ? r.pay_seconds : r.seconds) || 0,
      area: String(r.area || r.ticket_area || ''),
      seat: String(r.seat || r.seat_no || r.seat_position || ''),
      deviceId: String(r.device_id || r.deviceId || ''),
      createdAt: String(r.created_at || r.createdAt || '')
    };
  }

  function stateFor(eventId) {
    const key = String(eventId);
    if (!window.seatTableState[key]) {
      window.seatTableState[key] = { rows: [], loading: false, degraded: false, filter: 'all', sort: 'seconds', loaded: false };
    }
    return window.seatTableState[key];
  }

  async function loadSeatRows(eventId, force) {
    const st = stateFor(eventId);
    if (st.loading) return;
    if (st.loaded && !force) return;
    st.loading = true;
    renderSeatPanel(eventId);
    let rows = [];
    let degraded = false;
    try {
      const data = await seatRpc('get_show_ticket_seats', { p_event_id: String(eventId) });
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.rows) ? data.rows : []);
      rows = list.map(normalizeRow).filter(Boolean);
    } catch (e) {
      degraded = true;
    }
    const own = getLocalOwn(eventId);
    if (own) {
      const hasOwn = rows.some(r => r.deviceId && r.deviceId === deviceId());
      if (!hasOwn) rows.push(normalizeRow({ ...own, id: own.id || 'local-own', device_id: deviceId() }, 999));
    }
    st.rows = rows;
    st.degraded = degraded;
    st.loading = false;
    st.loaded = true;
    renderSeatPanel(eventId);
  }

  function visibleRows(eventId) {
    const st = stateFor(eventId);
    let rows = st.rows.slice();
    if (st.filter !== 'all') rows = rows.filter(r => r.platform === st.filter);
    if (st.sort === 'created') {
      rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else {
      rows.sort((a, b) => (a.seconds - b.seconds) || String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    return rows;
  }

  // 同平台付款秒数前 3 名
  function fastRankMap(rows) {
    const map = new Map();
    const byPlatform = {};
    rows.forEach(r => { (byPlatform[r.platform] = byPlatform[r.platform] || []).push(r); });
    Object.values(byPlatform).forEach(list => {
      list.slice().sort((a, b) => a.seconds - b.seconds).slice(0, 3).forEach((r, i) => map.set(r.id, i + 1));
    });
    return map;
  }

  function renderSeatPanel(eventId) {
    const key = String(eventId);
    const host = document.querySelector(`[data-seat-table-host="${key}"]`);
    if (!host) return;
    const st = stateFor(key);
    const rows = visibleRows(key);
    const rank = fastRankMap(st.rows);
    const own = getLocalOwn(key);

    const toolbar = `
      <div class="seat-toolbar">
        <span class="text-[10px] font-semibold text-slate-500 shrink-0">平台</span>
        ${['all'].concat(window.SEAT_PLATFORMS).map(p => {
          const label = p === 'all' ? '全部' : p;
          return `<button type="button" class="seat-chip ${st.filter === p ? 'is-active' : ''}" onclick="setSeatPlatformFilter('${key}', '${p}', event)">${label}</button>`;
        }).join('')}
        <span class="w-px h-4 bg-slate-300 mx-0.5 shrink-0"></span>
        <button type="button" class="seat-chip ${st.sort === 'seconds' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'seconds', event)">⏱️ 按付款秒数从快到慢升序</button>
        <button type="button" class="seat-chip ${st.sort === 'created' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'created', event)">🕒 按提交时间最新</button>
      </div>`;

    const body = st.loading
      ? `<div class="p-4 text-center text-[11px] text-slate-400">正在加载抢票记录…</div>`
      : rows.length
        ? `<table class="seat-table">
            <thead><tr><th>购票平台</th><th>付款秒数</th><th>票档 / 区域</th><th>具体排座位置</th></tr></thead>
            <tbody>
              ${rows.map(r => {
                const mine = (r.deviceId && r.deviceId === deviceId()) || String(r.id) === 'local-own';
                const rankNo = rank.get(r.id) || 0;
                const isAdmin = typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified;
                return `<tr>
                  <td>${esc(r.platform)}${mine ? ' <span class="text-[9px] text-slate-400">（我的）</span>' : ''}</td>
                  <td><strong>${r.seconds}秒</strong>${rankNo ? `<span class="seat-fast-badge">⚡ 手速参考</span>` : ''}</td>
                  <td>${esc(r.area || '—')}</td>
                  <td>
                    <span>${esc(r.seat || '—')}</span>
                    ${mine ? `<button type="button" class="block mt-0.5 text-[10px] text-slate-500 underline" onclick="withdrawSeatRow('${key}', event)">撤回</button>` : ''}
                    ${isAdmin ? `<button type="button" class="block mt-0.5 text-[10px] text-rose-600 underline" onclick="adminDeleteSeatRow('${key}', '${esc(r.id)}', event)">🗑️ 删除</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`
        : `<div class="p-4 text-center text-[11px] text-slate-400">还没有抢票记录，来做第一个登记手速的人吧～</div>`;

    const form = `
      <div class="seat-form">
        <select id="seat-platform-${key}" class="buddy-platform-select" style="width:100%;height:30px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;padding:0 6px;background:#fff;color:#1e293b;">
          ${window.SEAT_PLATFORMS.map(p => `<option value="${p}" ${own && own.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input id="seat-seconds-${key}" type="text" inputmode="numeric" maxlength="4"
          value="${own ? esc(own.seconds) : ''}" placeholder="付款秒数，如 6" />
        <input id="seat-area-${key}" type="text" maxlength="16"
          value="${own ? esc(own.area) : ''}" placeholder="票档 / 区域，如 内场A2区" />
        <input id="seat-seat-${key}" type="text" maxlength="16"
          value="${own ? esc(own.seat) : ''}" placeholder="具体排座位置，如 4排11座" />
        <div class="col-span-2 flex items-center justify-between gap-2">
          <span class="text-[10px] text-slate-400">同一设备每场限 1 条，可随时修改或撤回</span>
          <button type="button" onclick="submitSeatRow('${key}', event)" class="seat-chip is-active">${own ? '💾 保存修改' : '➕ 登记我的抢票记录'}</button>
        </div>
      </div>`;

    host.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="font-bold text-slate-900 text-[12px]">🎟️ 抢票与座位对照表</div>
          <div class="text-[10px] text-slate-500">按平台对照付款手速与最终排座${st.degraded ? ' · 暂时只显示本机记录' : ''}</div>
        </div>
        <div class="seat-table-wrap">${toolbar}${body}${form}</div>
      </div>`;
  }

  function openTicketSeatPanel(eventId, title) {
    const key = String(eventId);
    renderSeatPanel(key);
    loadSeatRows(key, false);
  }

  function setSeatPlatformFilter(eventId, platform, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(eventId).filter = platform || 'all';
    renderSeatPanel(eventId);
  }

  function setSeatSort(eventId, sort, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(eventId).sort = sort === 'created' ? 'created' : 'seconds';
    renderSeatPanel(eventId);
  }

  async function submitSeatRow(eventId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(eventId);
    const platformEl = document.getElementById(`seat-platform-${key}`);
    const secondsEl = document.getElementById(`seat-seconds-${key}`);
    const areaEl = document.getElementById(`seat-area-${key}`);
    const seatEl = document.getElementById(`seat-seat-${key}`);
    const platform = platformEl ? platformEl.value : '其他';
    const seconds = parseInt(String(secondsEl ? secondsEl.value : '').replace(/[^0-9]/g, ''), 10);
    const area = (areaEl ? areaEl.value : '').trim().slice(0, 16);
    const seat = (seatEl ? seatEl.value : '').trim().slice(0, 16);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) return toastError('请填写 0–3600 之间的付款秒数');
    if (!area) return toastError('请填写票档 / 区域');
    if (!seat) return toastError('请填写具体排座位置');

    const localRow = { platform, seconds, area, seat, updatedAt: new Date().toISOString(), id: getLocalOwn(key)?.id || '' };
    saveLocalOwn(key, localRow);
    try {
      const res = await seatRpc('upsert_show_ticket_seat', {
        p_event_id: key,
        p_device_id: deviceId(),
        p_platform: platform,
        p_seconds: seconds,
        p_area: area,
        p_seat: seat
      });
      const saved = normalizeRow(Array.isArray(res) ? res[0] : res, 0);
      if (saved && saved.id) saveLocalOwn(key, { ...localRow, id: saved.id });
      if (typeof showToast === 'function') showToast('✅ 抢票记录已保存并同步');
    } catch (e) {
      if (typeof showToast === 'function') showToast('✅ 已保存到本机（云端暂时未同步）');
    }
    const st = stateFor(key);
    st.loaded = false;
    await loadSeatRows(key, true);
  }

  async function withdrawSeatRow(eventId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(eventId);
    const own = getLocalOwn(key);
    if (!own) return;
    if (!confirm('确定撤回本机登记的这条抢票记录吗？')) return;
    removeLocalOwn(key);
    try {
      await seatRpc('withdraw_show_ticket_seat', { p_event_id: key, p_device_id: deviceId() });
    } catch (e) {}
    const st = stateFor(key);
    st.rows = st.rows.filter(r => !(r.deviceId && r.deviceId === deviceId()) && r.id !== 'local-own');
    st.loaded = false;
    await loadSeatRows(key, true);
    if (typeof showToast === 'function') showToast('已撤回本机记录');
  }

  async function adminDeleteSeatRow(eventId, rowId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!(typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified)) return;
    if (!confirm('确认删除这条抢票记录？')) return;
    const key = String(eventId);
    try {
      await seatRpc('admin_delete_show_ticket_seat', { p_id: rowId });
    } catch (e) {
      if (typeof toastError === 'function') toastError('删除失败，请稍后重试');
      return;
    }
    const st = stateFor(key);
    st.rows = st.rows.filter(r => String(r.id) !== String(rowId));
    st.loaded = false;
    await loadSeatRows(key, true);
    if (typeof showToast === 'function') showToast('已删除该条记录');
  }

  window.openTicketSeatPanel = openTicketSeatPanel;
  window.setSeatPlatformFilter = setSeatPlatformFilter;
  window.setSeatSort = setSeatSort;
  window.submitSeatRow = submitSeatRow;
  window.withdrawSeatRow = withdrawSeatRow;
  window.adminDeleteSeatRow = adminDeleteSeatRow;
})();
