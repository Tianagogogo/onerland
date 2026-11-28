/* 🎟️ 抢票与座位对照表（结构化选择 · 零自由文本 · 紧凑云表格） */
(function () {
  'use strict';

  window.SEAT_PLATFORMS = ['大麦', '猫眼', '纷玩岛', '票星球', '秀动', '其他官方平台'];

  // 通用标准场馆分区（白名单）
  window.SEAT_ZONES_GENERIC = [
    '内场VIP / 前区', '内场A区', '内场B区', '内场C区', '内场站区',
    '一层看台（前区/正对）', '一层看台（两侧）', '二层看台', '三层看台', '包厢区'
  ];

  // 场馆专属分区（按场馆关键词匹配，未命中时用通用分区）
  const VENUE_ZONE_MAP = [
    { match: ['凯迪拉克', '五棵松'], zones: ['内场VIP / 前区', '内场A区', '内场B区', '一层看台（前区/正对）', '一层看台（两侧）', '二层看台', '包厢区'] },
    { match: ['北京展览馆', '北展'], zones: ['内场A区', '内场B区', '一层看台（正对）', '一层看台（两侧）', '二层看台'] },
    { match: ['梅赛德斯', '世博'], zones: ['内场VIP / 前区', '内场A区', '内场B区', '内场C区', '一层看台（前区/正对）', '一层看台（两侧）', '二层看台', '包厢区'] },
    { match: ['奥体中心', '西安奥体', '杭州奥体', '南京奥体'], zones: ['内场VIP / 前区', '内场A区', '内场B区', '内场C区', '一层看台（前区/正对）', '一层看台（两侧）', '二层看台', '三层看台', '包厢区'] },
    { match: ['凤凰山', '深圳湾体育', '春茧'], zones: ['内场站区', '内场A区', '内场B区', '一层看台（前区/正对）', '一层看台（两侧）', '二层看台'] },
    { match: ['livehouse', 'Livehouse', 'LIVEHOUSE', 'MAO', '疆进酒'], zones: ['内场站区', '前区近距离', '后区自由站'] }
  ];

  const ROW_RANGES = ['1-3排（前排）', '4-8排（中前排）', '9-15排（中区）', '16-25排（后排）', '26排及以后', '随机号段 / 音乐节站区'];
  const SEAT_DETAILS = ['不限号段', '中间号段', '靠过道号段'];
  const ZONE_FILTERS = [
    { key: 'all', label: '全部区域' },
    { key: 'infield', label: '内场', match: z => z.indexOf('内场') === 0 },
    { key: 'l1', label: '一层看台', match: z => z.indexOf('一层') === 0 },
    { key: 'l23', label: '二/三层看台', match: z => /^二|^三|包厢/.test(z) }
  ];

  const LOCAL_KEY = 'onerland_ticket_seats_local_v1';
  window.seatTableState = window.seatTableState || {};
  window.seatVenueMap = window.seatVenueMap || {};
  window.ticketSeatFormOpen = window.ticketSeatFormOpen || {};

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
    const row = readLocal()[String(eventId)];
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

  function zonesForVenue(venue) {
    const text = String(venue || '');
    const hit = VENUE_ZONE_MAP.find(x => x.match.some(k => text.includes(k)));
    return hit ? hit.zones.slice() : window.SEAT_ZONES_GENERIC.slice();
  }

  function normalizeRow(r, i) {
    if (!r) return null;
    return {
      id: String(r.id == null ? `row-${i}` : r.id),
      platform: String(r.platform || '其他官方平台'),
      seconds: Number(r.seconds == null ? r.pay_seconds : r.seconds) || 0,
      zone: String(r.zone || r.area || r.ticket_area || ''),
      seatDetail: String(r.seat_detail || r.seatDetail || r.seat || ''),
      deviceId: String(r.device_id || r.deviceId || ''),
      createdAt: String(r.created_at || r.createdAt || '')
    };
  }

  function stateFor(eventId) {
    const key = String(eventId);
    if (!window.seatTableState[key]) {
      window.seatTableState[key] = { rows: [], loading: false, degraded: false, filter: 'all', zoneFilter: 'all', sort: 'seconds', loaded: false };
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
    const zf = ZONE_FILTERS.find(z => z.key === st.zoneFilter);
    if (zf && zf.match) rows = rows.filter(r => zf.match(r.zone || ''));
    if (st.sort === 'created') {
      rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else {
      rows.sort((a, b) => (a.seconds - b.seconds) || String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    return rows;
  }

  function fastRankMap(rows) {
    const map = new Map();
    const byPlatform = {};
    rows.forEach(r => { (byPlatform[r.platform] = byPlatform[r.platform] || []).push(r); });
    Object.values(byPlatform).forEach(list => {
      list.slice().sort((a, b) => a.seconds - b.seconds).slice(0, 3).forEach((r, i) => map.set(r.id, i + 1));
    });
    return map;
  }

  function seatOptionsHTML(list, selected) {
    return list.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }

  function renderSeatPanel(eventId, venue) {
    const key = String(eventId);
    const host = document.querySelector(`[data-seat-table-host="${key}"]`);
    if (!host) return;
    if (venue) window.seatVenueMap[key] = String(venue);
    const st = stateFor(key);
    const rows = visibleRows(key);
    const rank = fastRankMap(st.rows);
    const own = getLocalOwn(key);
    const venues = zonesForVenue(window.seatVenueMap[key] || venue || '');
    const formOpen = Boolean(window.ticketSeatFormOpen[key]);

    const toolbar = `
      <div class="seat-toolbar">
        <span class="text-[10px] font-semibold text-slate-500 shrink-0">平台</span>
        ${['all'].concat(window.SEAT_PLATFORMS).map(p => {
          const label = p === 'all' ? '全部' : p;
          return `<button type="button" class="seat-chip ${st.filter === p ? 'is-active' : ''}" onclick="setSeatPlatformFilter('${key}', '${p}', event)">${label}</button>`;
        }).join('')}
      </div>
      <div class="seat-toolbar seat-zone-toolbar">
        ${ZONE_FILTERS.map(z => `<button type="button" class="seat-chip ${st.zoneFilter === z.key ? 'is-active' : ''}" onclick="setSeatZoneFilter('${key}', '${z.key}', event)">${z.label}</button>`).join('')}
        <span class="w-px h-4 bg-slate-300 mx-0.5 shrink-0"></span>
        <button type="button" class="seat-chip ${st.sort === 'seconds' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'seconds', event)">⏱️ 按秒数升序</button>
        <button type="button" class="seat-chip ${st.sort === 'created' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'created', event)">🕒 最新提交</button>
      </div>`;

    const body = st.loading
      ? `<div class="p-4 text-center text-[11px] text-slate-400">正在加载抢票记录…</div>`
      : rows.length
        ? `<div class="seat-table-scroll">
            <table class="seat-table">
              <thead><tr><th>购票平台</th><th>付款秒数</th><th>票档 / 区域</th><th>排数 / 号段</th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const mine = (r.deviceId && r.deviceId === deviceId()) || String(r.id) === 'local-own';
                  const rankNo = rank.get(r.id) || 0;
                  const isAdmin = typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified;
                  return `<tr>
                    <td>${esc(r.platform)}${mine ? ' <span class="text-[9px] text-slate-400">（我的）</span>' : ''}</td>
                    <td><strong>${r.seconds}秒</strong>${rankNo ? `<span class="seat-fast-badge">⚡ 手速参考</span>` : ''}</td>
                    <td>${esc(r.zone || '—')}</td>
                    <td>
                      <span>${esc(r.seatDetail || '—')}</span>
                      ${mine ? `<button type="button" class="block mt-0.5 text-[10px] text-slate-500 underline" onclick="withdrawSeatRow('${key}', event)">撤回</button>` : ''}
                      ${isAdmin ? `<button type="button" class="block mt-0.5 text-[10px] text-rose-600 underline" onclick="adminDeleteSeatRow('${key}', '${esc(r.id)}', event)">🗑️ 删除</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
        : `<div class="p-4 text-center text-[11px] text-slate-400">${st.rows.length ? '这个筛选下还没有记录，换个区域看看～' : '还没有抢票记录，来做第一个登记手速的人吧～'}</div>`;

    const form = `
      <div class="seat-form-toggle">
        <button type="button" class="seat-form-btn" onclick="toggleSeatForm('${key}', event)" aria-expanded="${formOpen ? 'true' : 'false'}">
          ✍️ ${own ? '登记 / 修改我的出票座位' : '登记我的出票座位'} <span class="seat-form-chev">${formOpen ? '▴' : '▾'}</span>
        </button>
      </div>
      <div class="seat-form ${formOpen ? '' : 'hidden'}" data-seat-form="${key}">
        <label class="seat-field">
          <span>购票平台</span>
          <select id="seat-platform-${key}" class="seat-select">${seatOptionsHTML(window.SEAT_PLATFORMS, own && own.platform)}</select>
        </label>
        <label class="seat-field">
          <span>付款秒数（0–600）</span>
          <input id="seat-seconds-${key}" type="number" min="0" max="600" step="1" inputmode="numeric"
            value="${own ? esc(own.seconds) : ''}" placeholder="如 8" class="seat-select" />
        </label>
        <label class="seat-field">
          <span>票档 / 区域</span>
          <select id="seat-zone-${key}" class="seat-select">${seatOptionsHTML(venues, own && own.zone)}</select>
        </label>
        <label class="seat-field">
          <span>排数分段</span>
          <select id="seat-rowrange-${key}" class="seat-select">${seatOptionsHTML(ROW_RANGES, own && own.seatDetail && own.seatDetail.split(' · ')[0])}</select>
        </label>
        <label class="seat-field">
          <span>号段（可选）</span>
          <select id="seat-detail-${key}" class="seat-select">${seatOptionsHTML(SEAT_DETAILS, own && own.seatDetail && own.seatDetail.split(' · ')[1] ? own.seatDetail.split(' · ')[1] : '不限号段')}</select>
        </label>
        <div class="seat-form-actions">
          <span class="text-[10px] text-slate-400">同一设备每场限 1 条，可随时修改或撤回</span>
          <button type="button" onclick="submitSeatRow('${key}', event)" class="seat-chip is-active">${own ? '💾 保存修改' : '➕ 提交登记'}</button>
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

  function openTicketSeatPanel(eventId, title, venue) {
    const key = String(eventId);
    renderSeatPanel(key, venue);
    loadSeatRows(key, false);
  }

  function toggleSeatForm(eventId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(eventId);
    window.ticketSeatFormOpen[key] = !window.ticketSeatFormOpen[key];
    renderSeatPanel(key);
  }

  function setSeatPlatformFilter(eventId, platform, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(eventId).filter = platform || 'all';
    renderSeatPanel(eventId);
  }

  function setSeatZoneFilter(eventId, zoneKey, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(eventId).zoneFilter = zoneKey || 'all';
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
    const platform = document.getElementById(`seat-platform-${key}`)?.value || '';
    const secondsRaw = document.getElementById(`seat-seconds-${key}`)?.value || '';
    const zone = document.getElementById(`seat-zone-${key}`)?.value || '';
    const rowRange = document.getElementById(`seat-rowrange-${key}`)?.value || '';
    const detail = document.getElementById(`seat-detail-${key}`)?.value || '不限号段';

    const seconds = Number(String(secondsRaw).trim());
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600) return toastError('请填写 0–600 之间的整数秒数');
    if (!window.SEAT_PLATFORMS.includes(platform)) return toastError('请选择列表中的购票平台');
    if (!zonesForVenue(window.seatVenueMap[key] || '').includes(zone)) {
      return toastError('请选择列表中的票档 / 区域');
    }
    if (!ROW_RANGES.includes(rowRange)) return toastError('请选择列表中的排数分段');
    if (!SEAT_DETAILS.includes(detail)) return toastError('请选择列表中的号段');

    const seatDetail = `${rowRange} · ${detail}`;
    const localRow = { platform, seconds, zone, seat: seatDetail, seatDetail, updatedAt: new Date().toISOString(), id: getLocalOwn(key)?.id || '' };
    saveLocalOwn(key, localRow);
    try {
      const res = await seatRpc('upsert_show_ticket_seat', {
        p_event_id: key,
        p_device_id: deviceId(),
        p_platform: platform,
        p_seconds: seconds,
        p_area: zone,
        p_seat: seatDetail
      });
      const saved = normalizeRow(Array.isArray(res) ? res[0] : res, 0);
      if (saved && saved.id) saveLocalOwn(key, { ...localRow, id: saved.id });
      if (typeof showToast === 'function') showToast('✅ 抢票记录已保存并同步');
    } catch (e) {
      if (typeof showToast === 'function') showToast('✅ 已保存到本机（云端暂时未同步）');
    }
    window.ticketSeatFormOpen[key] = false;
    renderSeatPanel(key);
    const st = stateFor(key);
    st.loaded = false;
    st.loading = false;
    await loadSeatRows(key, true);
  }

  async function withdrawSeatRow(eventId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(eventId);
    if (!getLocalOwn(key)) return;
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
  window.renderSeatPanel = renderSeatPanel;
  window.toggleSeatForm = toggleSeatForm;
  window.setSeatPlatformFilter = setSeatPlatformFilter;
  window.setSeatZoneFilter = setSeatZoneFilter;
  window.setSeatSort = setSeatSort;
  window.submitSeatRow = submitSeatRow;
  window.withdrawSeatRow = withdrawSeatRow;
  window.adminDeleteSeatRow = adminDeleteSeatRow;
})();
