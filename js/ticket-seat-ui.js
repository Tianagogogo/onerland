/* 🎟️ 抢票与座位对照表（零自由输入 · 组合下拉 · 紧凑吸顶云表格 · 提交前二次核对） */
(function () {
  'use strict';

  window.SEAT_PLATFORMS = ['坤音商城', '大麦', '猫眼', '纷玩岛', '票星球', '秀动'];

  // 票档 / 区域：第 1 框大类 + 第 2 框区号（组合拼接）
  const ZONE_MAINS = ['内场', '一层看台', '二层看台', '三层看台', '包厢区', '音乐节站区'];
  // 二级联动：每个大类对应的专属区号白名单
  const ZONE_SUB_MAP = (function () {
    const floor = ['无细分区', 'VIP区', 'A区', 'B区', 'C区', 'D区', 'E区', 'F区',
      'A1区', 'A2区', 'A3区', 'A4区', 'B1区', 'B2区', 'B3区', 'B4区',
      'C1区', 'C2区', 'C3区', 'C4区', 'D1区', 'D2区', 'D3区', 'D4区'];
    const makeNum = (base, to) => {
      const list = ['无细分区'];
      for (let i = 1; i <= to; i++) list.push(`${base + i}区`);
      return list;
    };
    const boxes = ['无细分区', 'VIP包厢'];
    for (let i = 1; i <= 20; i++) boxes.push(`${i}号包厢`);
    return {
      '内场': floor,
      '一层看台': makeNum(100, 30).concat(['A区', 'B区', 'C区', 'D区']),
      '二层看台': makeNum(200, 30),
      '三层看台': makeNum(300, 30),
      '包厢区': boxes,
      '音乐节站区': ['通用站区', 'VIP前排区', 'A区', 'B区', '普通区']
    };
  })();

  function zoneSubsOf(main) {
    return ZONE_SUB_MAP[main] || ['无细分区'];
  }

  // 排数 / 座号：两个数字组合下拉
  const ROW_NOS = (function () {
    const list = ['站区/无排号'];
    for (let i = 1; i <= 35; i++) list.push(`${i}排`);
    return list;
  })();
  const SEAT_NOS = (function () {
    const list = ['不填具体座号'];
    for (let i = 1; i <= 50; i++) list.push(`${i}号`);
    return list;
  })();

  const ZONE_FILTERS = [
    { key: 'all', label: '全部区域', match: null },
    { key: 'infield', label: '内场', match: z => /^内场|音乐节站区/.test(z) },
    { key: 'l1', label: '一层看台', match: z => /^一层/.test(z) },
    { key: 'l23', label: '二/三层看台', match: z => /^二层|^三层|^包厢/.test(z) }
  ];

  const LOCAL_KEY = 'onerland_ticket_seats_local_v1';
  window.seatTableState = window.seatTableState || {};
  window.ticketSeatFormOpen = window.ticketSeatFormOpen || {};

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function readLocal() {
    try {
      const obj = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }
  function writeLocal(obj) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(obj)); } catch (e) {} }
  function getLocalOwn(showId) {
    const row = readLocal()[String(showId)];
    return row && typeof row === 'object' ? row : null;
  }
  function saveLocalOwn(showId, row) {
    const all = readLocal();
    all[String(showId)] = row;
    writeLocal(all);
  }
  function removeLocalOwn(showId) {
    const all = readLocal();
    delete all[String(showId)];
    writeLocal(all);
  }

  function deviceId() {
    try { return typeof getDeviceId === 'function' ? String(getDeviceId()) : 'local-device'; } catch (e) { return 'local-device'; }
  }
  function adminKey() {
    try { return typeof getSecurityAdminKey === 'function' ? String(getSecurityAdminKey() || '') : ''; } catch (e) { return ''; }
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

  function composeZone(main, sub) {
    if (!main) return '';
    if (!sub || sub === '无细分区') return main;
    return `${main} · ${sub}`;
  }
  function splitZone(zone) {
    const s = String(zone || '').trim();
    const idx = s.indexOf(' · ');
    if (idx > 0) {
      const main = s.slice(0, idx);
      const sub = s.slice(idx + 3);
      const safeMain = ZONE_MAINS.includes(main) ? main : ZONE_MAINS[0];
      return { main: safeMain, sub: zoneSubsOf(safeMain).includes(sub) ? sub : '无细分区' };
    }
    if (ZONE_MAINS.includes(s)) return { main: s, sub: '无细分区' };
    const hit = ZONE_MAINS.find(m => s.indexOf(m) === 0);
    return { main: hit || ZONE_MAINS[0], sub: '无细分区' };
  }
  function composeSeat(row, num) {
    const parts = [];
    if (row && row !== '站区/无排号') parts.push(row);
    if (num && num !== '不填具体座号') parts.push(num);
    return parts.length ? parts.join(' ') : '站区/无排号';
  }
  function splitSeat(detail) {
    const s = String(detail || '');
    const rm = s.match(/(\d{1,2})排/);
    const nm = s.match(/(\d{1,2})号/);
    const row = rm ? `${rm[1]}排` : '站区/无排号';
    const num = nm ? `${nm[1]}号` : '不填具体座号';
    return {
      row: ROW_NOS.includes(row) ? row : '站区/无排号',
      num: SEAT_NOS.includes(num) ? num : '不填具体座号'
    };
  }

  function normalizeRow(r, i) {
    if (!r) return null;
    return {
      id: String(r.id == null ? `row-${i}` : r.id),
      platform: String(r.platform || '坤音商城'),
      seconds: Number(r.pay_seconds == null ? r.seconds : r.pay_seconds) || 0,
      zone: String(r.zone || r.area || r.ticket_area || ''),
      seatDetail: String(r.seat_detail || r.seatDetail || r.seat || ''),
      deviceId: String(r.device_id || r.deviceId || ''),
      createdAt: String(r.created_at || r.createdAt || '')
    };
  }

  function stateFor(showId) {
    const key = String(showId);
    if (!window.seatTableState[key]) {
      window.seatTableState[key] = { rows: [], loading: false, degraded: false, filter: 'all', zoneFilter: 'all', sort: 'seconds', loaded: false };
    }
    return window.seatTableState[key];
  }

  async function loadSeatRows(showId, force) {
    const st = stateFor(showId);
    if (st.loading) return;
    if (st.loaded && !force) return;
    st.loading = true;
    renderSeatPanel(showId);
    let rows = [];
    let degraded = false;
    try {
      const data = await seatRpc('get_show_ticket_seats', { p_show_id: String(showId) });
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.rows) ? data.rows : []);
      rows = list.map(normalizeRow).filter(Boolean);
    } catch (e) {
      degraded = true;
    }
    const own = getLocalOwn(showId);
    if (own) {
      const hasOwn = rows.some(r => r.deviceId && r.deviceId === deviceId());
      if (!hasOwn) rows.push(normalizeRow({ ...own, id: own.id || 'local-own', device_id: deviceId() }, 999));
    }
    st.rows = rows;
    st.degraded = degraded;
    st.loading = false;
    st.loaded = true;
    renderSeatPanel(showId);
  }

  function visibleRows(showId) {
    const st = stateFor(showId);
    let rows = st.rows.slice();
    if (st.filter !== 'all') rows = rows.filter(r => r.platform === st.filter);
    const zf = ZONE_FILTERS.find(z => z.key === st.zoneFilter);
    if (zf && zf.match) rows = rows.filter(r => zf.match(String(r.zone || '')));
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

  function platformChips(st) {
    const extra = [];
    st.rows.forEach(r => { if (r.platform && !window.SEAT_PLATFORMS.includes(r.platform) && !extra.includes(r.platform)) extra.push(r.platform); });
    return ['all'].concat(window.SEAT_PLATFORMS, extra);
  }

  function seatOptionsHTML(list, selected) {
    return list.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }

  function renderSeatPanel(showId) {
    const key = String(showId);
    const host = document.querySelector(`[data-seat-table-host="${key}"]`);
    if (!host) return;
    const st = stateFor(key);
    const rows = visibleRows(key);
    const rank = fastRankMap(st.rows);
    const own = getLocalOwn(key);
    const formOpen = Boolean(window.ticketSeatFormOpen[key]);
    const ownZone = splitZone(own && own.zone);
    const ownSeat = splitSeat(own && (own.seatDetail || own.seat));

    const toolbar = `
      <div class="seat-toolbar">
        <span class="text-[10px] font-semibold text-slate-500 shrink-0">平台</span>
        ${platformChips(st).map(p => `<button type="button" class="seat-chip ${st.filter === p ? 'is-active' : ''}" onclick="setSeatPlatformFilter('${key}', '${esc(p)}', event)">${p === 'all' ? '全部' : esc(p)}</button>`).join('')}
      </div>
      <div class="seat-toolbar seat-zone-toolbar">
        ${ZONE_FILTERS.map(z => `<button type="button" class="seat-chip ${st.zoneFilter === z.key ? 'is-active' : ''}" onclick="setSeatZoneFilter('${key}', '${z.key}', event)">${z.label}</button>`).join('')}
        <span class="w-px h-4 bg-slate-300 mx-0.5 shrink-0"></span>
        <button type="button" class="seat-chip ${st.sort === 'seconds' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'seconds', event)">⏱️ 按付款秒数升序</button>
        <button type="button" class="seat-chip ${st.sort === 'created' ? 'is-active' : ''}" onclick="setSeatSort('${key}', 'created', event)">🕒 按提交时间最新</button>
      </div>`;

    const body = st.loading
      ? `<div class="p-4 text-center text-[11px] text-slate-400">正在加载抢票记录…</div>`
      : rows.length
        ? `<div class="seat-table-scroll">
            <table class="seat-table">
              <thead><tr><th>购票平台</th><th>付款秒数</th><th>票档 / 区域</th><th>具体排座位置</th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const mine = (r.deviceId && r.deviceId === deviceId()) || String(r.id) === 'local-own';
                  const rankNo = rank.get(r.id) || 0;
                  const isAdmin = typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified;
                  return `<tr>
                    <td>${esc(r.platform)}${mine ? ' <span class="text-[9px] text-slate-400">（我的）</span>' : ''}</td>
                    <td><strong>${r.seconds}秒</strong>${rankNo && st.sort === 'seconds' ? '<span class="seat-fast-badge">⚡ 手速参考</span>' : ''}</td>
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
          ✍️ 登记 / 修改我的出票座位 <span class="seat-form-chev">${formOpen ? '▴' : '▾'}</span>
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
            value="${own ? esc(own.seconds) : ''}" placeholder="如 8" class="seat-select seat-intensity" />
        </label>
        <div class="seat-field">
          <span>票档 / 区域（大类 + 区号）</span>
          <div class="seat-combo">
            <select id="seat-zone-main-${key}" class="seat-select" onchange="onSeatZoneMainChange('${key}', event)">${seatOptionsHTML(ZONE_MAINS, ownZone.main)}</select>
            <select id="seat-zone-sub-${key}" class="seat-select">${seatOptionsHTML(zoneSubsOf(ownZone.main), ownZone.sub)}</select>
          </div>
        </div>
        <div class="seat-field">
          <span>排数 / 座号</span>
          <div class="seat-combo">
            <select id="seat-row-${key}" class="seat-select">${seatOptionsHTML(ROW_NOS, ownSeat.row)}</select>
            <select id="seat-number-${key}" class="seat-select">${seatOptionsHTML(SEAT_NOS, ownSeat.num)}</select>
          </div>
        </div>
        <div class="seat-form-actions">
          <span class="text-[10px] text-slate-400">同一设备每场限 1 条，可随时修改或撤回</span>
          <button type="button" onclick="submitSeatRow('${key}', event)" class="seat-chip is-active seat-submit-btn">${own ? '💾 保存修改' : '💾 提交登记'}</button>
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

  function readForm(showId) {
    const key = String(showId);
    const platform = document.getElementById(`seat-platform-${key}`)?.value || '';
    const secondsRaw = document.getElementById(`seat-seconds-${key}`)?.value || '';
    const zoneMain = document.getElementById(`seat-zone-main-${key}`)?.value || '';
    const zoneSub = document.getElementById(`seat-zone-sub-${key}`)?.value || '';
    const rowNo = document.getElementById(`seat-row-${key}`)?.value || '';
    const seatNo = document.getElementById(`seat-number-${key}`)?.value || '';
    return {
      platform,
      secondsRaw: String(secondsRaw).trim(),
      seconds: Number(String(secondsRaw).trim()),
      zoneMain,
      zoneSub,
      rowNo,
      seatNo,
      zone: composeZone(zoneMain, zoneSub),
      seatDetail: composeSeat(rowNo, seatNo)
    };
  }

  // 大类切换时，第二个下拉即时重建为对应区号，重置为「无细分区」
  function onSeatZoneMainChange(showId) {
    const key = String(showId);
    const mainEl = document.getElementById(`seat-zone-main-${key}`);
    const subEl = document.getElementById(`seat-zone-sub-${key}`);
    if (!mainEl || !subEl) return;
    const subs = zoneSubsOf(mainEl.value);
    subEl.innerHTML = seatOptionsHTML(subs, '无细分区');
    if (!subs.includes(subEl.value)) subEl.value = subs[0];
  }

  function validateForm(f) {
    if (!Number.isInteger(f.seconds) || f.seconds < 0 || f.seconds > 600) return '请填写 0–600 之间的整数秒数';
    if (!window.SEAT_PLATFORMS.includes(f.platform)) return '请选择列表中的购票平台';
    if (!ZONE_MAINS.includes(f.zoneMain)) return '请选择票档区域大类';
    if (!zoneSubsOf(f.zoneMain).includes(f.zoneSub)) return '请选择该区域对应的大类区号';
    if (!ROW_NOS.includes(f.rowNo)) return '请选择排数';
    if (!SEAT_NOS.includes(f.seatNo)) return '请选择座号';
    return '';
  }

  // 提交前二次核对弹窗
  function closeSeatConfirm() {
    document.getElementById('seat-confirm-modal')?.remove();
    window.__seatPending = null;
  }

  function openSeatConfirm(showId) {
    const key = String(showId);
    const f = readForm(key);
    const err = validateForm(f);
    if (err) return toastError(err);
    window.__seatPending = { showId: key, data: f };
    document.getElementById('seat-confirm-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'seat-confirm-modal';
    modal.className = 'seat-confirm-overlay';
    modal.innerHTML = `
      <div class="seat-confirm-card" role="dialog" aria-modal="true" aria-label="核对抢票信息">
        <div class="seat-confirm-title">🔍 提交前请核对</div>
        <div class="seat-confirm-list">
          <div class="seat-confirm-row"><span>购票平台</span><strong>${esc(f.platform)}</strong></div>
          <div class="seat-confirm-row"><span>付款秒数</span><strong>${f.seconds}秒</strong></div>
          <div class="seat-confirm-row"><span>票档 / 区域</span><strong>${esc(f.zone)}</strong></div>
          <div class="seat-confirm-row"><span>具体排座</span><strong>${esc(f.seatDetail)}</strong></div>
        </div>
        <p class="seat-confirm-warn">⚠️ 每台设备每场演出仅可登记 1 条出票数据，为保证全场抢票数据真实准确，请核对以上信息与实际票面一致后再提交。</p>
        <div class="seat-confirm-actions">
          <button type="button" class="seat-confirm-cancel" onclick="closeSeatConfirm()">↩️ 返回修改</button>
          <button type="button" class="seat-confirm-ok" onclick="confirmSeatSubmit()">✅ 确认无误并提交</button>
        </div>
      </div>`;
    modal.addEventListener('click', ev => { if (ev.target === modal) closeSeatConfirm(); });
    document.body.appendChild(modal);
  }

  async function saveSeatRow(showId, f) {
    const key = String(showId);
    const localRow = { platform: f.platform, seconds: f.seconds, zone: f.zone, seat: f.seatDetail, seatDetail: f.seatDetail, updatedAt: new Date().toISOString(), id: (getLocalOwn(key) || {}).id || '' };
    saveLocalOwn(key, localRow);
    let synced = false;
    try {
      const res = await seatRpc('upsert_show_ticket_seat', {
        p_show_id: key,
        p_device_id: deviceId(),
        p_platform: f.platform,
        p_pay_seconds: f.seconds,
        p_zone: f.zone,
        p_seat_detail: f.seatDetail
      });
      const saved = normalizeRow(Array.isArray(res) ? res[0] : res, 0);
      if (saved && saved.id) saveLocalOwn(key, { ...localRow, id: saved.id });
      synced = true;
    } catch (e) { synced = false; }
    if (typeof showToast === 'function') showToast(synced ? '✅ 抢票记录已保存并同步' : '✅ 已保存到本机（云端暂时未同步）');
    window.ticketSeatFormOpen[key] = false;
    const st = stateFor(key);
    st.loaded = false;
    st.loading = false;
    renderSeatPanel(key);
    await loadSeatRows(key, true);
  }

  async function confirmSeatSubmit() {
    const pending = window.__seatPending;
    closeSeatConfirm();
    if (!pending) return;
    await saveSeatRow(pending.showId, pending.data);
  }

  function openTicketSeatPanel(showId) {
    const key = String(showId);
    renderSeatPanel(key);
    loadSeatRows(key, false);
  }

  function toggleSeatForm(showId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(showId);
    window.ticketSeatFormOpen[key] = !window.ticketSeatFormOpen[key];
    renderSeatPanel(key);
  }

  function setSeatPlatformFilter(showId, platform, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(showId).filter = platform || 'all';
    renderSeatPanel(showId);
  }

  function setSeatZoneFilter(showId, zoneKey, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(showId).zoneFilter = zoneKey || 'all';
    renderSeatPanel(showId);
  }

  function setSeatSort(showId, sort, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    stateFor(showId).sort = sort === 'created' ? 'created' : 'seconds';
    renderSeatPanel(showId);
  }

  async function withdrawSeatRow(showId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const key = String(showId);
    if (!getLocalOwn(key)) return;
    if (!confirm('确定撤回本机登记的这条抢票记录吗？')) return;
    removeLocalOwn(key);
    try { await seatRpc('delete_own_ticket_seat', { p_show_id: key, p_device_id: deviceId() }); } catch (e) {}
    const st = stateFor(key);
    st.rows = st.rows.filter(r => !(r.deviceId && r.deviceId === deviceId()) && r.id !== 'local-own');
    st.loaded = false;
    await loadSeatRows(key, true);
    if (typeof showToast === 'function') showToast('已撤回本机记录');
  }

  async function adminDeleteSeatRow(showId, rowId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!(typeof AppState !== 'undefined' && AppState.isAdminPasswordVerified)) return;
    if (!confirm('确认删除这条抢票记录？')) return;
    const key = String(showId);
    try {
      await seatRpc('admin_delete_ticket_seat', { p_id: rowId, p_admin_key: adminKey() });
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
  window.onSeatZoneMainChange = onSeatZoneMainChange;
  window.submitSeatRow = openSeatConfirm;
  window.openSeatConfirm = openSeatConfirm;
  window.confirmSeatSubmit = confirmSeatSubmit;
  window.closeSeatConfirm = closeSeatConfirm;
  window.withdrawSeatRow = withdrawSeatRow;
  window.adminDeleteSeatRow = adminDeleteSeatRow;
})();
