/* 🎟️ 抢票与座位对照表（零自由输入 · 组合下拉 · 紧凑吸顶云表格 · 提交前二次核对） */
(function () {
  'use strict';

  window.SEAT_PLATFORMS = ['坤音商城', '大麦', '猫眼', '纷玩岛', '票星球', '秀动'];

  // 票档 / 区域：三级短选项（大类 → 字母/十位段 → 个位尾号），每框不超过 10 项
  const ZONE_MAINS = ['内场', '一层看台', '二层看台', '三层看台', '包厢区', '音乐节站区'];
  const TAIL_NONE = '无数字';
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function standBase(main) {
    return main === '一层看台' ? 1 : main === '二层看台' ? 2 : main === '三层看台' ? 3 : 0;
  }
  function zonePrefixesOf(main) {
    if (main === '内场') return ['无细分区', 'VIP', 'A', 'B', 'C', 'D', 'E', 'F'];
    if (main === '包厢区') return ['无细分区', 'VIP', '0x号', '1x号', '2x号'];
    if (main === '音乐节站区') return ['通用站区', 'VIP前排', 'A区', 'B区', '普通区'];
    const n = standBase(main);
    if (!n) return ['无细分区'];
    return ['无细分区', `${n}0x段`, `${n}1x段`, `${n}2x段`, `${n}3x段`, '字母看台'];
  }
  function zoneTailsOf(main, prefix) {
    if (main === '内场') return [TAIL_NONE, '1', '2', '3', '4', '5', '6'];
    if (!prefix || prefix === '无细分区') return [];
    if (main === '包厢区') return prefix === 'VIP' ? [] : DIGITS.slice();
    if (main === '音乐节站区') return [];
    if (prefix === '字母看台') return ['A', 'B', 'C', 'D', 'E', 'F'];
    return DIGITS.slice();
  }
  function composeZoneSub(main, prefix, tail) {
    if (!prefix || prefix === '无细分区') return '无细分区';
    if (main === '内场') return prefix + (tail && tail !== TAIL_NONE ? tail : '') + '区';
    if (main === '包厢区') {
      if (prefix === 'VIP') return 'VIP包厢';
      const d = tail == null || tail === '' ? '0' : String(tail);
      return `${prefix === '0x号' ? d : prefix.charAt(0) + d}号包厢`;
    }
    if (main === '音乐节站区') return prefix === 'VIP前排' ? 'VIP前排区' : prefix;
    if (prefix === '字母看台') return `${tail || 'A'}区`;
    const n = standBase(main);
    return `${n}${prefix.charAt(1)}${tail == null || tail === '' ? '0' : tail}区`;
  }
  function composeZone(main, prefix, tail) {
    if (!main) return '';
    const sub = composeZoneSub(main, prefix, tail);
    if (!sub || sub === '无细分区') return main;
    return `${main} · ${sub}`;
  }
  // 反向拆解：区域字符串 → { 大类, 第2框, 第3框 }
  function parseZoneSub(main, sub) {
    const s = String(sub || '').trim();
    if (!s || s === '无细分区') return { prefix: '无细分区', tail: main === '内场' ? TAIL_NONE : '' };
    if (main === '内场') {
      const m = /^(VIP|[A-F])(\d*)(区)$/.exec(s);
      if (m) return { prefix: m[1], tail: m[2] || TAIL_NONE };
      return { prefix: '无细分区', tail: TAIL_NONE };
    }
    if (main === '包厢区') {
      if (s === 'VIP包厢') return { prefix: 'VIP', tail: '' };
      const m = /^(\d{1,2})号包厢$/.exec(s);
      if (m) {
        const n = Number(m[1]);
        const prefix = n < 10 ? '0x号' : n < 20 ? '1x号' : '2x号';
        return { prefix, tail: String(n % 10) };
      }
      return { prefix: '无细分区', tail: '' };
    }
    if (main === '音乐节站区') {
      if (/^[A-F]区$/.test(s)) return { prefix: s, tail: '' };
      if (s === 'VIP前排区') return { prefix: 'VIP前排', tail: '' };
      if (['通用站区', '普通区'].includes(s)) return { prefix: s, tail: '' };
      return { prefix: '通用站区', tail: '' };
    }
    if (/^[A-F]区$/.test(s)) return { prefix: '字母看台', tail: s.charAt(0) };
    const n = standBase(main);
    if (n && new RegExp('^' + n + '[0-3]\\d区$').test(s)) {
      return { prefix: `${n}${s.charAt(1)}x段`, tail: s.charAt(2) };
    }
    return { prefix: '无细分区', tail: '' };
  }
  function splitZone(zone) {
    const raw = String(zone || '').trim();
    let main = ZONE_MAINS[0];
    let sub = '无细分区';
    const idx = raw.indexOf(' · ');
    if (idx > 0) {
      const candidate = raw.slice(0, idx);
      if (ZONE_MAINS.includes(candidate)) { main = candidate; sub = raw.slice(idx + 3); }
    } else if (ZONE_MAINS.includes(raw)) {
      main = raw;
    } else if (raw) {
      const hit = ZONE_MAINS.find(m => raw.indexOf(m) === 0);
      main = hit || ZONE_MAINS[0];
      if (hit) {
        const rest = raw.slice(hit.length).replace(/^[\s·]+/, '').trim();
        if (rest) sub = rest;
      }
    }
    const parts = parseZoneSub(main, sub);
    return { main, prefix: parts.prefix, tail: parts.tail, sub: composeZoneSub(main, parts.prefix, parts.tail) };
  }

  // 排数：号段 + 个位尾号
  const ROW_SEGS = ['站区/无排号', '1-9排', '10-19排', '20-29排', '30-39排'];
  function rowTailsOf(seg) {
    if (!seg || seg === '站区/无排号') return [];
    if (seg === '1-9排') return ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return DIGITS.slice();
  }
  function composeRow(seg, tail) {
    if (!seg || seg === '站区/无排号') return '站区/无排号';
    if (seg === '1-9排') return `${tail || '1'}排`;
    return `${parseInt(seg, 10) + Number(tail || '0')}排`;
  }
  // 座号：号段 + 个位尾号
  const SEAT_SEGS = ['不填座号', '1-9号', '10-19号', '20-29号', '30-39号', '40-50号'];
  function seatTailsOf(seg) {
    if (!seg || seg === '不填座号') return [];
    if (seg === '1-9号') return ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return DIGITS.slice();
  }
  function composeSeatNo(seg, tail) {
    if (!seg || seg === '不填座号') return '不填具体座号';
    if (seg === '1-9号') return `${tail || '1'}号`;
    return `${parseInt(seg, 10) + Number(tail || '0')}号`;
  }
  function splitSeat(detail) {
    const s = String(detail || '');
    let rowSeg = '站区/无排号';
    let rowTail = '';
    let seatSeg = '不填座号';
    let seatTail = '';
    const rm = /(\d{1,2})排/.exec(s);
    if (rm) {
      const n = Number(rm[1]);
      if (n < 10) { rowSeg = '1-9排'; rowTail = String(n); }
      else if (n < 20) { rowSeg = '10-19排'; rowTail = String(n % 10); }
      else if (n < 30) { rowSeg = '20-29排'; rowTail = String(n % 10); }
      else if (n < 40) { rowSeg = '30-39排'; rowTail = String(n % 10); }
      else { rowSeg = '10-19排'; rowTail = String(n % 10); }
    }
    const nm = /(\d{1,2})号/.exec(s);
    if (nm) {
      const n = Number(nm[1]);
      if (n < 10) { seatSeg = '1-9号'; seatTail = String(n); }
      else if (n < 20) { seatSeg = '10-19号'; seatTail = String(n % 10); }
      else if (n < 30) { seatSeg = '20-29号'; seatTail = String(n % 10); }
      else if (n < 40) { seatSeg = '30-39号'; seatTail = String(n % 10); }
      else { seatSeg = '40-50号'; seatTail = String(n % 10); }
    }
    return {
      rowSeg, rowTail, seatSeg, seatTail,
      row: composeRow(rowSeg, rowTail),
      num: composeSeatNo(seatSeg, seatTail)
    };
  }
  function composeSeat(row, num) {
    const parts = [];
    if (row && row !== '站区/无排号') parts.push(row);
    if (num && num !== '不填具体座号') parts.push(num);
    return parts.length ? parts.join(' ') : '站区/无排号';
  }

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
    const ownSeat = splitSeat(own && (own.seatDetail || own.seat_detail || own.seat));

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
          <span>票档 / 区域（大类 · 号段 · 尾号）</span>
          <div class="seat-combo seat-combo--triple">
            <select id="seat-zone-main-${key}" class="seat-select" onchange="onSeatZoneMainChange('${key}')">${seatOptionsHTML(ZONE_MAINS, ownZone.main)}</select>
            <select id="seat-zone-prefix-${key}" class="seat-select" onchange="onSeatZonePrefixChange('${key}')">${seatOptionsHTML(zonePrefixesOf(ownZone.main), ownZone.prefix)}</select>
            <select id="seat-zone-tail-${key}" class="seat-select" ${zoneTailsOf(ownZone.main, ownZone.prefix).length ? '' : 'disabled'}>${seatOptionsHTML(zoneTailsOf(ownZone.main, ownZone.prefix).length ? zoneTailsOf(ownZone.main, ownZone.prefix) : ['—'], ownZone.tail)}</select>
          </div>
        </div>
        <div class="seat-field">
          <span>排数 / 座号（号段 + 尾号）</span>
          <div class="seat-combo">
            <select id="seat-row-seg-${key}" class="seat-select" onchange="onSeatRowSegChange('${key}')">${seatOptionsHTML(ROW_SEGS, ownSeat.rowSeg)}</select>
            <select id="seat-row-tail-${key}" class="seat-select" ${rowTailsOf(ownSeat.rowSeg).length ? '' : 'disabled'}>${seatOptionsHTML(rowTailsOf(ownSeat.rowSeg).length ? rowTailsOf(ownSeat.rowSeg) : ['—'], ownSeat.rowTail)}</select>
          </div>
          <div class="seat-combo">
            <select id="seat-number-seg-${key}" class="seat-select" onchange="onSeatNumberSegChange('${key}')">${seatOptionsHTML(SEAT_SEGS, ownSeat.seatSeg)}</select>
            <select id="seat-number-tail-${key}" class="seat-select" ${seatTailsOf(ownSeat.seatSeg).length ? '' : 'disabled'}>${seatOptionsHTML(seatTailsOf(ownSeat.seatSeg).length ? seatTailsOf(ownSeat.seatSeg) : ['—'], ownSeat.seatTail)}</select>
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
    const zonePrefix = document.getElementById(`seat-zone-prefix-${key}`)?.value || '';
    const zoneTailEl = document.getElementById(`seat-zone-tail-${key}`);
    const zoneTail = zoneTailEl && !zoneTailEl.disabled ? zoneTailEl.value : '';
    const rowSeg = document.getElementById(`seat-row-seg-${key}`)?.value || '';
    const rowTailEl = document.getElementById(`seat-row-tail-${key}`);
    const rowTail = rowTailEl && !rowTailEl.disabled ? rowTailEl.value : '';
    const seatSeg = document.getElementById(`seat-number-seg-${key}`)?.value || '';
    const seatTailEl = document.getElementById(`seat-number-tail-${key}`);
    const seatTail = seatTailEl && !seatTailEl.disabled ? seatTailEl.value : '';
    const rowNo = composeRow(rowSeg, rowTail);
    const seatNo = composeSeatNo(seatSeg, seatTail);
    return {
      platform,
      secondsRaw: String(secondsRaw).trim(),
      seconds: Number(String(secondsRaw).trim()),
      zoneMain,
      zonePrefix,
      zoneTail,
      rowSeg,
      rowTail,
      seatSeg,
      seatTail,
      rowNo,
      seatNo,
      zone: composeZone(zoneMain, zonePrefix, zoneTail),
      seatDetail: composeSeat(rowNo, seatNo)
    };
  }

  // 三级联动：大类 → 字母/十位段 → 个位尾号
  function fillSelect(el, list, preferred) {
    if (!el) return;
    if (!list.length) {
      el.innerHTML = seatOptionsHTML(['—'], '—');
      el.disabled = true;
      return;
    }
    el.disabled = false;
    const pick = list.includes(preferred) ? preferred : list[0];
    el.innerHTML = seatOptionsHTML(list, pick);
    el.value = pick;
  }

  function onSeatZoneMainChange(showId) {
    const key = String(showId);
    const mainEl = document.getElementById(`seat-zone-main-${key}`);
    if (!mainEl) return;
    const prefixes = zonePrefixesOf(mainEl.value);
    fillSelect(document.getElementById(`seat-zone-prefix-${key}`), prefixes, prefixes[0]);
    onSeatZonePrefixChange(key);
  }

  function onSeatZonePrefixChange(showId) {
    const key = String(showId);
    const main = document.getElementById(`seat-zone-main-${key}`)?.value || ZONE_MAINS[0];
    const prefix = document.getElementById(`seat-zone-prefix-${key}`)?.value || '';
    const tails = zoneTailsOf(main, prefix);
    fillSelect(document.getElementById(`seat-zone-tail-${key}`), tails, tails[0]);
  }

  function onSeatRowSegChange(showId) {
    const key = String(showId);
    const seg = document.getElementById(`seat-row-seg-${key}`)?.value || '站区/无排号';
    const tails = rowTailsOf(seg);
    fillSelect(document.getElementById(`seat-row-tail-${key}`), tails, tails[0]);
  }

  function onSeatNumberSegChange(showId) {
    const key = String(showId);
    const seg = document.getElementById(`seat-number-seg-${key}`)?.value || '不填座号';
    const tails = seatTailsOf(seg);
    fillSelect(document.getElementById(`seat-number-tail-${key}`), tails, tails[0]);
  }

  function validateForm(f) {
    if (!Number.isInteger(f.seconds) || f.seconds < 0 || f.seconds > 600) return '请填写 0–600 之间的整数秒数';
    if (!window.SEAT_PLATFORMS.includes(f.platform)) return '请选择列表中的购票平台';
    if (!ZONE_MAINS.includes(f.zoneMain)) return '请选择票档区域大类';
    if (!zonePrefixesOf(f.zoneMain).includes(f.zonePrefix)) return '请选择区域号段';
    const tails = zoneTailsOf(f.zoneMain, f.zonePrefix);
    if (tails.length && !tails.includes(f.zoneTail)) return '请选择区域尾号';
    if (!ROW_SEGS.includes(f.rowSeg)) return '请选择排数段';
    const rowTails = rowTailsOf(f.rowSeg);
    if (rowTails.length && !rowTails.includes(f.rowTail)) return '请选择具体排数';
    if (!SEAT_SEGS.includes(f.seatSeg)) return '请选择座号段';
    const seatTails = seatTailsOf(f.seatSeg);
    if (seatTails.length && !seatTails.includes(f.seatTail)) return '请选择具体座号';
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
  window.onSeatZonePrefixChange = onSeatZonePrefixChange;
  window.onSeatRowSegChange = onSeatRowSegChange;
  window.onSeatNumberSegChange = onSeatNumberSegChange;
  window.submitSeatRow = openSeatConfirm;
  window.openSeatConfirm = openSeatConfirm;
  window.confirmSeatSubmit = confirmSeatSubmit;
  window.closeSeatConfirm = closeSeatConfirm;
  window.withdrawSeatRow = withdrawSeatRow;
  window.adminDeleteSeatRow = adminDeleteSeatRow;
})();
