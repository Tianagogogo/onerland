function renderFootprintPage() {
  renderLocalFanPrefBox();
  renderFootprintMapAndList();
  refreshTicketShowOptions();
  renderTicketCanvasPreview();
  syncFootprintVisualTheme();
}

// 同步足迹模块的视觉主题（与全局粉籍应援色共用同一套 CSS 变量）
function syncFootprintVisualTheme() {
  syncGlobalFanTheme();
}

// 1. 粉籍绝对本地化设置器（零上传、零统计、零公开）
function renderLocalFanPrefBox() {
  const box = document.getElementById('local-fan-pref-box');
  if (!box) return;
  const { biasType, biasMembers, autoFilterShows } = AppState.fanPref;

  // 唯粉模式仅显示三人，其他模式显示全员
  const allMembers = ['ONER', '岳岳', '木子洋', '灵超'];
  const displayMembers = biasType === 'solo'
    ? ['岳岳', '木子洋', '灵超']
    : allMembers;

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-4 relative z-10">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">🛡️ 个人粉籍偏好设置（100% 仅存本机浏览器）</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">服务器零存储、零统计、不对外展示，杜绝拉踩引战。CP 模式仅使用所选两位成员的官方应援色。</p>
        </div>
        <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
          <input type="checkbox" ${autoFilterShows ? 'checked' : ''} onchange="updateFanPref('autoFilterShows', this.checked)" />
          演出库仅看关注成员
        </label>
      </div>

      <div class="space-y-3.5">
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="text-slate-500 w-16 shrink-0">属性模式：</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${[['group', '团粉 / 家族粉'], ['solo', '唯粉模式'], ['cp', 'CP / 双人偏好']].map(([val, label]) => {
              const active = biasType === val;
              return `
                <button type="button" onclick="updateFanPref('biasType', '${val}')"
                  class="tour-action-btn tour-action-btn--mini ${active ? 'footprint-active-btn' : ''}">
                  ${label}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="text-slate-500 w-16 shrink-0">关注成员：</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${displayMembers.map(m => {
              const active = biasMembers.includes(m);
              const colorInfo = ARTIST_COLORS[m] || ARTIST_COLORS['ONER'];
              const style = active ? `background: ${colorInfo.bg || colorInfo.hex};` : '';
              return `
                <button type="button" onclick="toggleBiasMember('${m}')"
                  style="${style}"
                  class="tour-action-btn tour-action-btn--mini font-medium ${active ? 'colored-pill' : ''}">
                  ${active ? '✓ ' : ''}${m}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateFanPref(key, val) {
  const patch = { [key]: val };
  if (key === 'biasType') {
    // 逻辑联动：切换模式时修正成员选择
    if (val === 'solo') {
      if (AppState.fanPref.biasMembers.includes('ONER') || AppState.fanPref.biasMembers.length === 0) {
        patch.biasMembers = ['岳岳'];
      } else if (AppState.fanPref.biasMembers.length > 1) {
        patch.biasMembers = [AppState.fanPref.biasMembers[0]];
      }
    } else if (val === 'cp') {
      // CP 模式：最多 2 位，且排除 ONER（只用成员官方双色）
      let next = AppState.fanPref.biasMembers.filter(m => m !== 'ONER');
      if (next.length === 0) next = ['岳岳', '木子洋'];
      patch.biasMembers = next.slice(0, 2);
    } else if (val === 'group') {
      if (AppState.fanPref.biasMembers.length === 0) patch.biasMembers = ['ONER'];
    }
  }
  saveFanPrefState(patch);
  renderFootprintPage();
}

function toggleBiasMember(member) {
  let nextMembers = [...AppState.fanPref.biasMembers];
  const idx = nextMembers.indexOf(member);

  if (idx >= 0) {
    if (AppState.fanPref.biasType !== 'group' && nextMembers.length <= 1) return;
    nextMembers.splice(idx, 1);
  } else {
    if (AppState.fanPref.biasType === 'solo') {
      nextMembers = [member];
    } else if (AppState.fanPref.biasType === 'cp') {
      if (member === 'ONER') return; // CP 只使用两位成员的官方应援色
      nextMembers = nextMembers.filter(m => m !== 'ONER');
      if (nextMembers.length >= 2) nextMembers.shift();
      nextMembers.push(member);
    } else {
      nextMembers.push(member);
    }
  }

  saveFanPrefState({ biasMembers: nextMembers });
  renderFootprintPage();
}

// 暴露函数到全局，确保 HTML onclick 能触发
window.updateFanPref = updateFanPref;
window.toggleBiasMember = toggleBiasMember;
window.renderFootprintPage = renderFootprintPage;

// 2. 观演足迹记录与 SVG 连线轨迹图
function recordFootprintFromShow(title, date, venue, artist = 'ONER') {
  // 新增足迹前先做一次首页对象 ⇄ 足迹粉籍的一致性检测（本会话已选「保持各自独立」则跳过）
  if (typeof checkFandomConflict === 'function') {
    try { checkFandomConflict(); } catch (e) { /* ignore */ }
  }
  const showKey = buildShowKey(venue, title);
  const existed = findFootprintIndex({ showKey, title, date, venue }) >= 0;
  upsertFootprintEntry({ showKey, title, date, venue, artist });
  showToast(existed
    ? `「${title}」的足迹已更新（共 ${AppState.footprints.length} 面）`
    : `已将「${title}」记入本机观演足迹（第 ${AppState.footprints.length} 面）`);
  // 预填「添加足迹 / 票根」表单，方便补录座位并可直接打卡
  try { prefillFootprintComposer(title, date, venue); } catch (e) { /* ignore */ }
  renderAnniversaryCard();
  renderUpcomingMiniTimeline();
  if (!document.getElementById('view-footprint-page')?.classList.contains('hidden')) renderFootprintPage();
  if (typeof renderTourCards === 'function' && !document.getElementById('view-shows-page')?.classList.contains('hidden')) {
    renderTourCards();
  }
}

// 本机搭子列表里可以一键点选的昵称（只读昵称，不涉及任何联系方式）
function getBuddyNicknameSuggestions() {
  const names = [];
  const push = v => {
    const n = String(v || '').trim();
    if (n && !names.includes(n)) names.push(n);
  };
  try {
    Object.values(window.buddyCloudCache || {}).forEach(list => {
      (Array.isArray(list) ? list : []).forEach(entry => {
        if (!entry || typeof isBuddyOwner !== 'function' || isBuddyOwner(entry)) return;
        push(entry.nickname);
      });
    });
  } catch (e) { /* ignore */ }
  return names;
}

// 打开并预填「添加足迹」表单（演出名称 / 日期 / 场馆），手机端也直接可用
function prefillFootprintComposer(title, date, venue) {
  const page = document.getElementById('view-footprint-page');
  const onFootprintPage = page && !page.classList.contains('hidden');
  if (!onFootprintPage && typeof switchMainTab === 'function') switchMainTab('footprint');
  const d = String(date || '').slice(0, 10);
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('tk-show-name', String(title || ''));
  setVal('tk-show-date', d);
  setVal('tk-venue-info', String(venue || ''));
  setVal('tk-seat-info', '');
  if (typeof refreshTicketShowOptions === 'function') refreshTicketShowOptions();
  const sel = document.getElementById('tk-show-pick');
  if (sel && Array.isArray(ticketShowRecords)) {
    const i = ticketShowRecords.findIndex(r => r.name === String(title || '') && (!d || r.date === d));
    if (i >= 0) sel.value = String(i);
  }
  if (typeof renderTicketCanvasPreview === 'function') renderTicketCanvasPreview();
  const target = document.getElementById('tk-show-name');
  if (target && target.scrollIntoView) {
    setTimeout(() => { try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ } }, 140);
  }
}

function saveFootprintBuddy(id, name) {
  const res = typeof updateFootprintBuddy === 'function' ? updateFootprintBuddy(id, name) : { ok: false };
  if (!res.ok) return toastError('保存同行搭子失败');
  showToast(name ? '已记录同行搭子（仅本机）' : '已清空同行搭子');
  renderFootprintMapAndList();
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
}

// 🎂 一键把「与XX线下同行纪念」写入自定义纪念日（同日期同名自动覆盖）
function createBuddyAnniversary(id) {
  const entry = (AppState.footprints || []).find(f => String(f.id) === String(id));
  const buddy = String(entry && entry.buddyName || '').trim();
  if (!buddy) return toastError('请先填写同行搭子昵称');
  const showDate = String(entry.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return toastError('该足迹缺少有效演出日期');
  const title = `与${buddy}线下同行纪念`;
  const res = addCustomAnniversary(title, showDate.slice(5));
  if (!res || res.ok === false) return toastError((res && res.message) || '生成失败');
  showToast(`已生成「${title}」纪念日`);
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderAnniversaryManager === 'function' &&
      !document.getElementById('anniversary-manager-modal')?.classList.contains('hidden')) {
    renderAnniversaryManager();
  }
}

function removeFootprint(id) {
  AppState.footprints = AppState.footprints.filter(f => f.id !== id);
  localStorage.setItem(LOCAL_KEYS.FOOTPRINTS, JSON.stringify(AppState.footprints));
  renderFootprintPage();
  renderAnniversaryCard();
  renderUpcomingMiniTimeline();
}

function renderFootprintMapAndList() {
  const box = document.getElementById('footprint-map-box');
  if (!box) return;
  const list = AppState.footprints;

  // 将经纬度映射为轻量 SVG 坐标（中国区域框：经度 75~135，纬度 18~54）
  const toXY = ([lon, lat]) => [
    Math.round(((lon - 75) / 60) * 340 + 30),
    Math.round(((54 - lat) / 36) * 180 + 20)
  ];

  const points = list
    .slice().reverse()
    .map(f => ({ ...f, xy: CITY_COORDS[f.city] ? toXY(CITY_COORDS[f.city]) : null }))
    .filter(p => p.xy);

  const polylinePts = points.map(p => p.xy.join(',')).join(' ');
  const themeSolid = getComputedStyle(document.documentElement).getPropertyValue('--footprint-theme-solid').trim() || '#C8102E';
  const [themeC1, themeC2] = getFanThemeHexes();
  const isGradient = themeC1 !== themeC2;

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900">🗺️ 个人奔赴连线足迹（已点亮 ${list.length} 场）</h3>
        <span class="text-[11px] text-slate-400">仅保存在本机 · 不做他人排名对比</span>
      </div>

      <div class="w-full bg-slate-50 rounded-xl border border-slate-200 p-2 flex justify-center">
        <svg viewBox="0 0 400 220" class="w-full max-w-lg h-auto">
          <defs>
            <linearGradient id="footprint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="38%" stop-color="${themeC1}" />
              <stop offset="62%" stop-color="${isGradient ? themeC2 : themeC1}" />
            </linearGradient>
          </defs>
          <rect x="10" y="10" width="380" height="200" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="4 4"/>
          ${points.length >= 2 ? `<polyline fill="none" stroke="url(#footprint-grad)" stroke-width="2.5" stroke-dasharray="4 3" points="${polylinePts}"/>` : ''}
          ${points.map((p, i) => `
            <circle cx="${p.xy[0]}" cy="${p.xy[1]}" r="5.5" fill="url(#footprint-grad)" stroke="#ffffff" stroke-width="1.5"/>
            <text x="${p.xy[0]}" y="${p.xy[1] - 10}" text-anchor="middle" fill="#0f172a" font-size="9" font-weight="bold">${p.city}(#${i + 1})</text>
          `).join('')}
          ${!points.length ? `<text x="200" y="114" text-anchor="middle" fill="#94a3b8" font-size="11">在「档案」点击演出卡片右上角「+ 足迹」即可点亮城市连线</text>` : ''}
        </svg>
      </div>

      <div class="space-y-1.5 max-h-72 overflow-y-auto no-scrollbar">
        ${list.map((f, idx) => {
          const mColor = ARTIST_COLORS[f.artist]?.hex || themeSolid;
          const scoreEntries = Object.entries(f.venueScores || {});
          const secRec = getSecurityExperience(f.showKey) || (f.securityLevel || f.securityDetail ? {
            level: f.securityLevel || '',
            detail: f.securityDetail || '',
            updatedAt: f.securityUpdatedAt || ''
          } : null);
          return `
            <div class="px-3 py-2 rounded-lg bg-white border border-slate-200 hover:footprint-active-border transition-colors space-y-1.5">
              <div class="flex items-center justify-between gap-2 text-xs">
                <div class="truncate flex items-center gap-2 min-w-0">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background:${mColor}"></span>
                  <span class="font-bold text-slate-900 truncate">第 ${list.length - idx} 面 · ${f.title}</span>
                  <span class="text-slate-400 shrink-0">${f.date} · ${f.venue}</span>
                </div>
                <button type="button" onclick="removeFootprint(${f.id})" class="tour-action-btn tour-action-btn--mini shrink-0">移除</button>
              </div>
              <div class="fp-buddy-row">
                <span class="shrink-0">🤝 同行搭子</span>
                ${f.buddyName ? `<span class="fp-buddy-tag">${escapeTicketHtml(f.buddyName)}</span>` : ''}
                <input type="text" maxlength="20" value="${escapeTicketHtml(f.buddyName || '')}"
                  placeholder="选填，仅存本机" onchange="saveFootprintBuddy(${f.id}, this.value)" />
                ${getBuddyNicknameSuggestions().filter(n => n !== f.buddyName).slice(0, 3).map(n =>
                  `<button type="button" class="fp-buddy-chip" onclick="saveFootprintBuddy(${f.id}, '${escapeTicketHtml(n).replace(/'/g, "&#39;")}')">${escapeTicketHtml(n)}</button>`
                ).join('')}
                ${f.buddyName ? `<button type="button" class="tour-action-btn tour-action-btn--mini shrink-0" title="写入自定义纪念日（同名同日自动覆盖）" onclick="createBuddyAnniversary(${f.id})">🎂 生成搭子纪念日</button>` : ''}
              </div>
              ${(f.seatArea || scoreEntries.length || f.experienceNote) ? `
                <details class="text-[11px] text-slate-600">
                  <summary class="cursor-pointer text-slate-500 select-none">🏟️ 场馆体验归档（${f.seatArea ? f.seatArea + ' · ' : ''}${scoreEntries.length} 项维度${f.experienceNote ? ' · 含体验记录' : ''}）</summary>
                  <div class="mt-1.5 space-y-1.5">
                    ${f.seatArea ? `<div>💺 座位大区：<strong class="text-slate-800">${f.seatArea}</strong></div>` : ''}
                    ${scoreEntries.length ? `<div class="flex flex-wrap gap-1">
                        ${scoreEntries.map(([k, v]) => `<span class="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">${k}：${v}</span>`).join('')}
                      </div>` : ''}
                    ${f.experienceNote ? `<p class="whitespace-pre-line text-slate-700">📝 ${f.experienceNote}</p>` : ''}
                    ${f.ratedAt ? `<div class="text-[10px] text-slate-400">归档时间：${f.ratedAt}</div>` : ''}
                    ${f.noteUpdatedAt ? `<div class="text-[10px] text-slate-400">评语更新：${f.noteUpdatedAt}</div>` : ''}
                  </div>
                </details>
              ` : ''}
              ${secRec ? `
                <details class="text-[11px] text-slate-600">
                  <summary class="cursor-pointer text-slate-500 select-none">🛡️ 演出期间安检体验归档（${secRec.level || '已记录细节'}）</summary>
                  <div class="mt-1.5 space-y-1">
                    <div>🔍 严格程度：<strong class="text-slate-800">${secRec.level || '未选择'}</strong></div>
                    ${secRec.detail ? `<p class="whitespace-pre-line text-slate-700">📝 ${secRec.detail}</p>` : ''}
                    ${secRec.updatedAt ? `<div class="text-[10px] text-slate-400">记录时间：${secRec.updatedAt}</div>` : ''}
                  </div>
                </details>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// 3. 纯前端 Canvas 纪念票根生成器（统一复古液态银白灰拟物质感，不取海报/粉籍色）
let ticketShowRecords = [];

function escapeTicketHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function refreshTicketShowOptions() {
  const sel = document.getElementById('tk-show-pick');
  if (!sel) return;
  const records = [];
  const seen = new Set();
  const add = rec => {
    const name = String(rec.name || '').trim();
    if (!name) return;
    const key = `${name}|${String(rec.date || '').slice(0, 10)}`;
    if (seen.has(key)) return;
    seen.add(key);
    records.push({ ...rec, name, date: String(rec.date || '').slice(0, 10) });
  };

  (AppState.cloudTickets || []).forEach(t => add({ name: t.city, date: t.show_date, venue: t.venue || '' }));
  (AppState.cloudArchives || []).forEach(a => add({ name: a.title, date: a.showDate, venue: a.venue || '' }));
  (AppState.footprints || []).forEach(f => add({ name: f.title, date: f.date, venue: f.venue || '' }));

  const current = sel.value;
  ticketShowRecords = records;
  sel.innerHTML = `<option value="">选择场次自动带入</option>` +
    records.map((rec, i) => `<option value="${i}">${escapeTicketHtml(rec.name)}${rec.date ? ` · ${rec.date}` : ''}</option>`).join('');
  sel.value = current && records[Number(current)] ? current : '';
}

function applyTicketShowPick(value) {
  const rec = ticketShowRecords[Number(value)];
  if (!rec) return;
  const nameInput = document.getElementById('tk-show-name');
  const dateInput = document.getElementById('tk-show-date');
  const venueInput = document.getElementById('tk-venue-info');
  if (nameInput) nameInput.value = rec.name;
  if (dateInput && rec.date) dateInput.value = rec.date;
  if (venueInput && rec.venue) venueInput.value = rec.venue;
  renderTicketCanvasPreview();
}

function handleTicketFieldInput() {
  renderTicketCanvasPreview();
}

// ---- 复古液态银白灰拟物质感（固定配色，不随海报 / 粉籍变化） ----
const TICKET_SILVER = {
  top: '#F8FAFC',
  mid: '#E2E8F0',
  bottom: '#CBD5E1',
  ink: '#0F172A',
  subInk: 'rgba(15, 23, 42, 0.66)',
  faintInk: 'rgba(15, 23, 42, 0.42)',
  hairline: 'rgba(148, 163, 184, 0.55)',
  perforation: 'rgba(100, 116, 139, 0.45)'
};

function drawRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function renderTicketCanvasPreview() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // 逻辑坐标 760×384，实际按 2 倍像素绘制，保证导出 PNG 高清
  const W = 760;
  const H = 384;
  const DPR = 2;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  if (ctx.setTransform) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  else if (ctx.scale) ctx.scale(DPR, DPR);

  const showName = document.getElementById('tk-show-name')?.value.trim() || 'ONER「极尽声色」巡回演唱会';
  const showDate = document.getElementById('tk-show-date')?.value || new Date().toISOString().slice(0, 10);
  const seatInfo = document.getElementById('tk-seat-info')?.value.trim() || '内场 · 黄金记忆区';
  const venueText = document.getElementById('tk-venue-info')?.value.trim() || '';

  const start = new Date(String(AppState.anniversary.firstMeetDate || '2018-08-30').replace(/-/g, '/'));
  const showTs = new Date(showDate.replace(/-/g, '/')).getTime();
  const meetDays = isNaN(start) || isNaN(showTs) ? 1 : Math.max(1, Math.floor((showTs - start.getTime()) / 86400000));
  const faceCount = Math.max(1, AppState.footprints.length);
  const dateCode = showDate.replace(/-/g, '');
  const serial = `NO. ${dateCode}-ONER`;

  const P = TICKET_SILVER;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'left';

  // ---------- 票体几何：主券 72% + 副券 28% ----------
  const bodyX = 12, bodyY = 12, bodyW = W - 24, bodyH = H - 24;
  const cutX = bodyX + Math.round(bodyW * 0.72);
  const radius = 22;
  const padX = 24;

  // 底板：145deg 冷银白灰渐变
  const grad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW * 0.86, bodyY + bodyH);
  grad.addColorStop(0, P.top);
  grad.addColorStop(0.52, P.mid);
  grad.addColorStop(1, P.bottom);
  drawRoundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  drawRoundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
  ctx.clip();

  // 液态金属高光
  const sheen = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH * 0.52);
  sheen.addColorStop(0, 'rgba(255,255,255,0.95)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.52);

  // 拉丝金属细纹
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = bodyY + 10 + i * (bodyH / 26);
    ctx.beginPath();
    ctx.moveTo(bodyX + 8, y);
    ctx.lineTo(bodyX + bodyW - 8, y + 1.5);
    ctx.stroke();
  }

  // 底部内侧压暗，做出纸张厚度
  const shade = ctx.createLinearGradient(0, bodyY + bodyH - 46, 0, bodyY + bodyH);
  shade.addColorStop(0, 'rgba(148,163,184,0)');
  shade.addColorStop(1, 'rgba(100,116,139,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(bodyX, bodyY + bodyH - 46, bodyW, 46);

  // 防伪细密点阵（保持低对比）
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#64748B';
  for (let x = bodyX + 16; x < bodyX + bodyW - 16; x += 9) {
    for (let y = bodyY + 12; y < bodyY + bodyH - 12; y += 9) {
      if ((x + y) % 27 === 0) ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
  ctx.restore();

  // 主券右下角极淡水印（不穿过正文）
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 58px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ONERLAND', cutX - 32, bodyY + bodyH - 68);
  ctx.restore();

  ctx.restore();

  // 外圈描边：内白边 + 冷灰发丝线
  drawRoundRectPath(ctx, bodyX + 1, bodyY + 1, bodyW - 2, bodyH - 2, radius - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawRoundRectPath(ctx, bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1, radius);
  ctx.strokeStyle = P.hairline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ---------- 主副券交界的半圆物理缺口（单一干净缺口，无多余描边） ----------
  const notchR = 11;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  [bodyY, bodyY + bodyH].forEach(cy => {
    ctx.beginPath();
    ctx.arc(cutX, cy, notchR, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // 打孔虚线撕裂线（1.5px）
  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.55)';
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cutX, bodyY + notchR + 6);
  ctx.lineTo(cutX, bodyY + bodyH - notchR - 6);
  ctx.stroke();
  ctx.restore();

  // ---------- 主券：三段式（顶部眉题 / 中部主视觉居中 / 底部页脚） ----------
  const padMainX = 32, padMainY = 28;
  const mainX = bodyX + padMainX;
  const mainRight = cutX - padMainX;

  // ① 顶部眉题区
  const headerY = bodyY + padMainY + 12;
  ctx.textAlign = 'left';
  ctx.fillStyle = P.faintInk;
  ctx.font = '12.5px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('ONERLAND · 个人非商业观演纪念票根', mainX, headerY);
  ctx.textAlign = 'right';
  ctx.font = '11.5px "SFMono-Regular",Menlo,Consolas,monospace';
  ctx.fillText(serial, mainRight, headerY);
  ctx.textAlign = 'left';

  // ② 中部核心视觉区：在眉题与页脚之间垂直居中
  const footerY = bodyY + bodyH - padMainY;
  const regionTop = headerY + 22;
  const regionBottom = footerY - 30;
  // 段落间距：标题下 14px；日期行下 24px + 20px 内边距后接虚线分隔；高光下 12px
  const titleLH = 30 * 1.3;
  const sessionLH = 16 * 1.3;
  const highlightLH = 16 * 1.3;
  const noteLH = 14 * 1.6;
  const blockH = titleLH + 14 + sessionLH + 24 + 20 + highlightLH + 12 + noteLH;
  const blockTop = regionTop + Math.max(0, (regionBottom - regionTop - blockH) / 2);

  const titleBase = blockTop + 30 * 0.82;
  const sessionBase = blockTop + titleLH + 14 + 16 * 0.82;
  const dividerY = blockTop + titleLH + 14 + sessionLH + 24;
  const highlightBase = dividerY + 20 + 16 * 0.82;
  const noteBase = dividerY + 20 + highlightLH + 12 + 14 * 0.9;

  // 演出主标题：30px / 800 / 字距 0.5px
  ctx.fillStyle = P.ink;
  ctx.font = '800 30px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  const titleGap = 0.5;
  const titleText = showName.length > 15 ? `${showName.slice(0, 14)}…` : showName;
  let titleCursor = mainX;
  Array.from(titleText).forEach(ch => {
    ctx.fillText(ch, titleCursor, titleBase);
    titleCursor += ctx.measureText(ch).width + titleGap;
  });

  // 观演日期与位置：16px / 500 / #334155
  ctx.fillStyle = '#334155';
  ctx.font = '500 16px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText(`观演日期：${showDate}  |  位置：${seatInfo}`, mainX, sessionBase);

  // 极浅虚线分隔（核心信息块 ↔ 纪念寄语块）
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(mainX, dividerY);
  ctx.lineTo(mainRight, dividerY);
  ctx.stroke();
  ctx.restore();

  // 纪念高光：16px 加粗
  ctx.fillStyle = P.ink;
  ctx.font = '800 16px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText(`✨ 相识第 ${meetDays} 天 · 线下奔赴第 ${faceCount} 面`, mainX, highlightBase);

  // 观演寄语：14px / 行高 1.6
  ctx.fillStyle = 'rgba(15,23,42,0.5)';
  ctx.font = '14px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('观演寄语：愿每一次奔赴，都被认真记住。', mainX, noteBase);

  // ③ 底部页脚区
  ctx.fillStyle = P.faintInk;
  ctx.font = '11px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('非商业粉丝个人纪念生成 · 仅供个人留念严禁售卖', mainX, footerY);

  if (venueText) {
    ctx.textAlign = 'right';
    ctx.font = '11px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
    ctx.fillText(`场馆：${venueText.slice(0, 18)}`, mainRight, footerY);
    ctx.textAlign = 'left';
  }

  // ---------- 副券存根：垂直居中三段式，零重叠 ----------
  const stubCenter = cutX + (bodyX + bodyW - cutX) / 2;
  ctx.textAlign = 'center';

  // ① 副券存根
  ctx.fillStyle = P.subInk;
  ctx.font = 'bold 13.5px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('副券存根', stubCenter, bodyY + 48);

  // ② 日期简码
  ctx.fillStyle = P.ink;
  ctx.font = 'bold 22px "SFMono-Regular",Menlo,Consolas,monospace';
  ctx.fillText(dateCode.slice(2), stubCenter, bodyY + 128);

  // ③ 留念印章
  const stampY = bodyY + 210;
  ctx.save();
  ctx.strokeStyle = 'rgba(15,23,42,0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(stubCenter, stampY, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(stubCenter, stampY, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.font = 'bold 14px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('留念', stubCenter, stampY + 1);
  ctx.font = '8.5px "PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  ctx.fillText('MEMORY', stubCenter, stampY + 15);
  ctx.restore();

  // ④ 底部条形码
  const barTop = bodyY + bodyH - 70;
  const barW = 120;
  const barX = stubCenter - barW / 2;
  ctx.fillStyle = P.ink;
  let seed = dateCode.split('').reduce((a, c) => a + Number(c), 0) || 7;
  let cursor = barX;
  while (cursor < barX + barW) {
    seed = (seed * 9301 + 49297) % 233280;
    const w = 1 + (seed % 3);
    ctx.fillRect(cursor, barTop, w, 26);
    cursor += w + 1 + (seed % 2);
  }
  ctx.font = '9px "SFMono-Regular",Menlo,Consolas,monospace';
  ctx.fillStyle = P.faintInk;
  ctx.fillText(dateCode, stubCenter, barTop + 38);
  ctx.textAlign = 'left';
}

function downloadSouvenirTicket() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `ONERLAND-纪念票根-${Date.now()}.png`;
  a.click();
}

window.renderTicketCanvasPreview = renderTicketCanvasPreview;
window.downloadSouvenirTicket = downloadSouvenirTicket;
