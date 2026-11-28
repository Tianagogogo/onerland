function renderFootprintPage() {
  renderLocalFanPrefBox();
  renderFootprintMapAndList();
  refreshTicketShowOptions();
  renderTicketCanvasPreview();
  syncFootprintVisualTheme();
}

// 同步足迹模块的视觉主题（与全局应援色共用同一套 CSS 变量）
function syncFootprintVisualTheme() {
  syncGlobalFanTheme();
}

// 1. 属性绝对本地化设置器（零上传、零统计、零公开）
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
          <h3 class="text-sm font-bold text-slate-900">🛡️ 个人属性偏好设置（100% 仅存本机浏览器）</h3>
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


// 🗺️ 中国省级行政区点亮地图（矢量轮廓 · 主推应援色高亮）
function getFootprintProvinceStats(list) {
  const stats = {};
  (list || []).forEach(f => {
    const province = typeof getProvinceOfCity === 'function' ? getProvinceOfCity(f.city) : '';
    if (!province) return;
    if (!stats[province]) stats[province] = { province, cities: new Set(), shows: [] };
    if (f.city) stats[province].cities.add(String(f.city));
    stats[province].shows.push(f);
  });
  return stats;
}

// 🗺️ 城市 → 中国省级 SVG 地图坐标（viewBox 1000×979，以省质心为锚点推算）
const CITY_SVG_COORDS = {
  '北京': [696, 320], '天津': [714, 337], '上海': [781, 499], '重庆': [557, 526],
  '石家庄': [665, 345], '唐山': [700, 335], '保定': [676, 335], '秦皇岛': [715, 320],
  '太原': [640, 360], '大同': [630, 320], '呼和浩特': [645, 295], '包头': [615, 285],
  '沈阳': [800, 285], '大连': [790, 330], '长春': [845, 230], '哈尔滨': [865, 175],
  '南京': [740, 470], '苏州': [763, 481], '无锡': [759, 477], '常州': [755, 469],
  '徐州': [715, 430], '南通': [762, 455], '扬州': [748, 458],
  '杭州': [785, 525], '宁波': [800, 535], '温州': [775, 570], '嘉兴': [790, 510],
  '合肥': [710, 485], '芜湖': [729, 497], '蚌埠': [712, 455],
  '福州': [736, 598], '厦门': [716, 636], '泉州': [720, 615],
  '南昌': [684, 569], '赣州': [660, 615], '九江': [683, 545],
  '济南': [720, 390], '青岛': [795, 405], '烟台': [812, 370], '聊城': [700, 395],
  '潍坊': [770, 385], '临沂': [730, 420],
  '郑州': [660, 430], '洛阳': [630, 425], '开封': [670, 435],
  '武汉': [655, 505], '宜昌': [600, 505], '襄阳': [615, 460],
  '长沙': [630, 565], '株洲': [635, 580], '衡阳': [620, 600],
  '广州': [646, 659], '深圳': [659, 673], '佛山': [640, 660], '东莞': [654, 661],
  '珠海': [648, 678], '中山': [645, 668], '惠州': [672, 665], '汕头': [690, 680],
  '南宁': [565, 675], '桂林': [590, 640], '柳州': [575, 650],
  '海口': [653, 845], '三亚': [640, 880],
  '成都': [482, 507], '绵阳': [475, 470], '德阳': [478, 486],
  '贵阳': [548, 575], '遵义': [555, 545],
  '昆明': [470, 620], '大理': [445, 620], '丽江': [440, 595],
  '拉萨': [256, 505],
  '西安': [573, 420], '咸阳': [569, 420], '宝鸡': [545, 415],
  '兰州': [480, 395], '天水': [510, 410], '嘉峪关': [390, 340],
  '西宁': [450, 400], '银川': [535, 375],
  '乌鲁木齐': [280, 255], '喀什': [150, 320],
  '香港': [661, 662], '澳门': [651, 665], '台北': [790, 625], '高雄': [780, 655]
};

// 兜底：未收录城市按所属省份质心定位；再兜底到全国中心点，绝不让坐标变成 NaN
function citySvgPoint(city) {
  const name = String(city || '').trim();
  const hit = CITY_SVG_COORDS[name];
  if (hit && Number.isFinite(hit[0]) && Number.isFinite(hit[1])) return [hit[0], hit[1]];
  const province = typeof getProvinceOfCity === 'function' ? getProvinceOfCity(name) : '';
  const geoName = province && typeof PROVINCE_GEO_KEY !== 'undefined' ? PROVINCE_GEO_KEY[province] : '';
  const geo = geoName && window.CHINA_PROVINCE_MAP && window.CHINA_PROVINCE_MAP.provinces
    ? window.CHINA_PROVINCE_MAP.provinces[geoName] : null;
  if (geo && Number.isFinite(geo.cx) && Number.isFinite(geo.cy)) return [geo.cx, geo.cy];
  return [500, 490];
}

// 按演出日期升序排列、去掉相邻同城，得到奔赴顺序
function buildFootprintRoutePoints(list) {
  const sorted = (list || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const points = [];
  sorted.forEach(f => {
    const xy = citySvgPoint(f.city);
    if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return;
    const city = String(f.city || '').trim();
    const prev = points[points.length - 1];
    if (prev && prev.city === city) return;
    if (prev && Math.abs(prev.x - xy[0]) < 0.5 && Math.abs(prev.y - xy[1]) < 0.5) return;
    points.push({ city, x: xy[0], y: xy[1] });
  });
  return points;
}

// 二次贝塞尔曲线航线：每段坐标都做有限值校验，避免 3+ 城市时整条线消失
function buildRoutePathD(points) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const cmds = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const x1 = Number(a.x), y1 = Number(a.y), x2 = Number(b.x), y2 = Number(b.y);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 0.5) continue;
    const off = Math.min(34, len * 0.18);
    const cx = ((x1 + x2) / 2) - (dy / len) * off;
    const cy = ((y1 + y2) / 2) + (dx / len) * off;
    cmds.push(`M ${x1.toFixed(1)},${y1.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  return cmds.join(' ');
}

function toggleFootprintCityLabels() {
  window.__fpShowCityLabels = window.__fpShowCityLabels === false;
  renderFootprintMapAndList();
}

window.toggleFootprintCityLabels = toggleFootprintCityLabels;

function renderChinaProvinceMap(list) {
  const map = window.CHINA_PROVINCE_MAP;
  if (!map || !map.provinces) return '';
  const stats = getFootprintProvinceStats(list);
  const litProvinces = Object.keys(stats);
  const citySet = new Set();
  (list || []).forEach(f => { if (f.city) citySet.add(String(f.city)); });
  const themeC1 = (getComputedStyle(document.documentElement).getPropertyValue('--footprint-theme-solid').trim()) || '#C8102E';
  const rcPair = typeof getFanThemeHexes === 'function' ? getFanThemeHexes() : [themeC1, themeC1];
  const routeGradientEnd = rcPair[1] || themeC1;
  const routePoints = buildFootprintRoutePoints(list);
  const routeD = buildRoutePathD(routePoints);
  const showCityLabels = window.__fpShowCityLabels !== false;
  const routeLayer = routePoints.length ? `
    <g class="footprint-route-layer" style="pointer-events:none">
      ${routeD ? `<path d="${routeD}" fill="none" stroke="url(#fp-route-grad)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="7 5" opacity="0.95">
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.6s" repeatCount="indefinite" />
      </path>` : ''}
      ${routePoints.map((p, i) => `
        <g>
          <circle cx="${p.x}" cy="${p.y}" r="8" fill="${themeC1}" opacity="0.16" />
          <circle cx="${p.x}" cy="${p.y}" r="5.6" fill="#ffffff" opacity="0.95" />
          <circle cx="${p.x}" cy="${p.y}" r="3.6" fill="url(#fp-route-grad)" />
          ${showCityLabels ? `<text x="${p.x}" y="${p.y - 11}" text-anchor="middle" font-size="11" font-weight="700"
            fill="#0f172a" stroke="#ffffff" stroke-width="2.6" style="paint-order:stroke">${escapeTicketHtml(p.city)}</text>` : ''}
          <title>${escapeTicketHtml(p.city)} · 第 ${i + 1} 站</title>
        </g>
      `).join('')}
    </g>` : '';

  const paths = Object.entries(map.provinces).map(([geoName, geo]) => {
    const short = Object.keys(PROVINCE_GEO_KEY).find(k => PROVINCE_GEO_KEY[k] === geoName) || geoName;
    const st = stats[short];
    const lit = Boolean(st);
    return `<path d="${geo.d}" data-province="${short}"
      fill="${lit ? 'url(#fp-province-lit)' : '#eef2f7'}"
      stroke="${lit ? themeC1 : '#cfd8e3'}" stroke-width="${lit ? 1.1 : 0.6}"
      style="cursor:${lit ? 'pointer' : 'default'};transition:fill .2s ease"
      ${lit ? `onclick="showProvinceFootprints('${short}')"` : ''}><title>${short}${lit ? ` · 已点亮 ${st.cities.size} 座城市 / ${st.shows.length} 场` : ''}</title></path>`;
  }).join('');

  const active = window.__fpActiveProvince || '';
  const activeShows = active && stats[active] ? stats[active].shows : [];

  return `
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-3" id="footprint-china-map-card">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="text-sm font-bold text-slate-900">🗺️ 中国足迹点亮地图</h3>
        <span class="text-[11px] font-semibold" style="color:${themeC1}">已点亮全国 ${litProvinces.length} 个省份 · ${citySet.size} 座城市（仅保存在本机）</span>
      </div>
      <div class="w-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-2 flex justify-center">
        <svg viewBox="0 0 ${map.width} ${map.height}" class="w-full max-w-xl h-auto" role="img" aria-label="中国省份足迹点亮地图与个人奔赴航线">
          <defs>
            <linearGradient id="fp-province-lit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${themeC1}" stop-opacity="0.92" />
              <stop offset="100%" stop-color="${themeC1}" stop-opacity="0.55" />
            </linearGradient>
            <linearGradient id="fp-route-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${themeC1}" />
              <stop offset="100%" stop-color="${routeGradientEnd}" />
            </linearGradient>
          </defs>
          ${paths}
          ${routeLayer}
        </svg>
      </div>
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span class="text-[10px] text-slate-400">✈️ 航线按演出日期先后连接，共 ${routePoints.length} 个城市节点</span>
        <button type="button" class="text-[10px] text-slate-500 underline" onclick="toggleFootprintCityLabels()">${showCityLabels ? '🙈 隐藏城市名' : '👁️ 显示城市名'}</button>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap">
        ${litProvinces.length
          ? litProvinces.map(p => `<button type="button" class="fp-province-chip ${active === p ? 'is-active' : ''}" onclick="showProvinceFootprints('${p}')">${p} · ${stats[p].shows.length} 场</button>`).join('')
          : `<span class="text-[11px] text-slate-400">还没有点亮任何省份，去「档案」点卡片上的「+ 足迹」记录第一场吧～</span>`}
      </div>
      ${active && activeShows.length ? `
        <div class="space-y-1.5 pt-1 border-t border-slate-200/70">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-slate-700">📍 ${active} · 去过的演出（${activeShows.length}）</span>
            <button type="button" class="text-[10px] text-slate-400 underline" onclick="showProvinceFootprints('')">收起</button>
          </div>
          ${activeShows.map(f => `
            <div class="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center justify-between gap-2">
              <span class="truncate font-semibold text-slate-800">${escapeTicketHtml(f.title || '未命名场次')}</span>
              <span class="text-slate-400 shrink-0">${escapeTicketHtml(String(f.date || '').slice(0, 10))} · ${escapeTicketHtml(f.city || '')}</span>
            </div>
          `).join('')}
        </div>` : ''}
    </div>
  `;
}

function showProvinceFootprints(province) {
  window.__fpActiveProvince = String(province || '');
  renderFootprintMapAndList();
}

// 2. 观演足迹记录与 SVG 连线轨迹图
function recordFootprintFromShow(title, date, venue, artist = 'ONER') {
  // 新增足迹前先做一次首页对象 ⇄ 足迹属性的一致性检测（本会话已选「保持各自独立」则跳过）
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

  const themeSolid = getComputedStyle(document.documentElement).getPropertyValue('--footprint-theme-solid').trim() || '#C8102E';

  box.innerHTML = `
    ${renderChinaProvinceMap(list)}
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-3">
      <div class="footprint-archive-head">
        <h3 class="footprint-archive-title">🎫 我的观演足迹档案（已点亮 ${list.length} 场）</h3>
        <span class="footprint-archive-note">仅保存在本机 · 不做他人排名对比</span>
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

// 3. 纯前端 Canvas 纪念票根生成器（统一复古液态银白灰拟物质感，不取海报/属性色）
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

// ---- 复古液态银白灰拟物质感（固定配色，不随海报 / 属性变化） ----
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
  if (!ctx) return;
  try {
    paintSouvenirTicket(canvas, ctx);
  } catch (e) {
    console.warn('票根绘制失败：', e);
  }
  // Safari：容器不可见时绘制的画布可能为空白，等布局完成后再补一次
  if (!canvas.offsetWidth && !canvas.__ticketRetryScheduled) {
    canvas.__ticketRetryScheduled = true;
    requestAnimationFrame(() => {
      canvas.__ticketRetryScheduled = false;
      if (canvas.offsetWidth) { try { paintSouvenirTicket(canvas, ctx); } catch (e) { /* ignore */ } }
    });
  }
}

function paintSouvenirTicket(canvas, ctx) {
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

function ticketCanvasDataUrl() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return '';
  if (!canvas.width || !canvas.height) {
    try { renderTicketCanvasPreview(); } catch (e) { /* ignore */ }
  }
  try {
    return canvas.toDataURL('image/png');
  } catch (e) {
    // Safari：画布偶发被判定为不安全时，重绘一次再导出
    try {
      paintSouvenirTicket(canvas, canvas.getContext('2d'));
      return canvas.toDataURL('image/png');
    } catch (e2) {
      return '';
    }
  }
}

function dataUrlToFile(dataUrl, fileName) {
  try {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(parts[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  } catch (e) { return null; }
}

function closeTicketSaveModal() {
  const el = document.getElementById('ticket-save-modal');
  if (!el) return;
  el.classList.add('is-hiding');
  setTimeout(() => el.remove(), 200);
}

function openTicketSaveModal(dataUrl) {
  document.getElementById('ticket-save-modal')?.remove();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canShareFiles = typeof navigator.canShare === 'function' && typeof File === 'function';
  const modal = document.createElement('div');
  modal.id = 'ticket-save-modal';
  modal.className = 'ticket-save-overlay';
  modal.innerHTML = `
    <div class="ticket-save-card" role="dialog" aria-modal="true" aria-label="纪念票根已生成">
      <button type="button" class="ticket-save-close" aria-label="关闭" onclick="closeTicketSaveModal()">✕</button>
      <div class="ticket-save-title">🎟️ 专属纪念票根已生成</div>
      <div class="ticket-save-imgbox">
        <img src="${dataUrl}" alt="ONERLAND 纪念票根" style="width:100%;border-radius:14px;-webkit-touch-callout:default;display:block" />
      </div>
      ${isIOS
        ? `<p class="ticket-save-hint">📱 Safari 存图提示：长按上方票根图片，点击「存储到“照片”」即可高清保存至手机相册</p>`
        : `<p class="ticket-save-hint">💻 若未自动下载，可在图片上右键「将图像存储为…」，或直接拖拽到桌面保存</p>`}
      <div class="ticket-save-actions">
        ${canShareFiles ? `<button type="button" class="ticket-save-share" onclick="shareTicketImage()">📤 唤起系统分享 / 存相册</button>` : ''}
        <button type="button" class="ticket-save-done" onclick="closeTicketSaveModal()">完成</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', ev => { if (ev.target === modal) closeTicketSaveModal(); });
  document.body.appendChild(modal);
  window.__ticketSaveDataUrl = dataUrl;
}

async function shareTicketImage() {
  const dataUrl = window.__ticketSaveDataUrl;
  if (!dataUrl) return;
  const fileName = `ONERLAND-纪念票根-${Date.now()}.png`;
  const file = dataUrlToFile(dataUrl, fileName);
  if (!file || typeof navigator.share !== 'function') {
    return toastError('当前浏览器不支持直接分享，请长按图片保存');
  }
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return toastError('当前浏览器不支持分享图片，请长按图片保存');
    }
    await navigator.share({ files: [file], title: 'ONERLAND 纪念票根' });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toastError('分享未完成，可长按图片保存');
  }
}

function downloadSouvenirTicket() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return;
  const dataUrl = ticketCanvasDataUrl();
  if (!dataUrl) {
    toastError('票根生成失败，请刷新页面后重试');
    return;
  }
  // 1) 常规浏览器：尝试 <a download>（Safari 可能忽略 download 属性，故必须保留弹窗兜底）
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ONERLAND-纪念票根-${Date.now()}.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) { /* Safari 不支持时静默失败 */ }
  // 2) 所有环境都弹出存图弹窗（长按存图 / 右键存储 / 系统分享）
  openTicketSaveModal(dataUrl);
}

window.renderTicketCanvasPreview = renderTicketCanvasPreview;
window.downloadSouvenirTicket = downloadSouvenirTicket;
window.openTicketSaveModal = openTicketSaveModal;
window.closeTicketSaveModal = closeTicketSaveModal;
window.shareTicketImage = shareTicketImage;
