// ================= 🚄 出行比价：跨城交通 + 场馆同城 + 周边住宿（零爬虫，纯官方/合规直达） =================
// 设计原则：只做「参数拼装 + 站外直达跳转」，不抓取任何第三方页面内容；
// 机票底价仅在填入官方公开 API Token 后调用官方接口（默认关闭）。

const TRAVELPAYOUTS_TOKEN = ''; // 如已在 Travelpayouts 申请到公开数据 Token，可填入启用参考价

// 出发城市 → 机场三字码 / 主要车站（用于拼接跳转参数）
const TRAVEL_CITIES = [
  { city: '北京', iata: 'BJS', station: '北京南' },
  { city: '上海', iata: 'SHA', station: '上海虹桥' },
  { city: '广州', iata: 'CAN', station: '广州南' },
  { city: '深圳', iata: 'SZX', station: '深圳北' },
  { city: '成都', iata: 'CTU', station: '成都东' },
  { city: '杭州', iata: 'HGH', station: '杭州东' },
  { city: '重庆', iata: 'CKG', station: '重庆西' },
  { city: '武汉', iata: 'WUH', station: '武汉' },
  { city: '西安', iata: 'SIA', station: '西安北' },
  { city: '南京', iata: 'NKG', station: '南京南' },
  { city: '长沙', iata: 'CSX', station: '长沙南' },
  { city: '郑州', iata: 'CGO', station: '郑州东' },
  { city: '沈阳', iata: 'SHE', station: '沈阳北' },
  { city: '大连', iata: 'DLC', station: '大连北' },
  { city: '合肥', iata: 'HFE', station: '合肥南' },
  { city: '天津', iata: 'TSN', station: '天津' },
  { city: '青岛', iata: 'TAO', station: '青岛北' },
  { city: '佛山', iata: 'FUO', station: '佛山西' },
  { city: '济南', iata: 'TNA', station: '济南西' },
  { city: '福州', iata: 'FOC', station: '福州南' },
  { city: '厦门', iata: 'XMN', station: '厦门北' },
  { city: '昆明', iata: 'KMG', station: '昆明南' },
  { city: '贵阳', iata: 'KWE', station: '贵阳北' },
  { city: '南宁', iata: 'NNG', station: '南宁东' },
  { city: '南昌', iata: 'KHN', station: '南昌西' },
  { city: '石家庄', iata: 'SJW', station: '石家庄' },
  { city: '太原', iata: 'TYN', station: '太原南' },
  { city: '哈尔滨', iata: 'HRB', station: '哈尔滨西' },
  { city: '长春', iata: 'CGQ', station: '长春西' },
  { city: '兰州', iata: 'LHW', station: '兰州西' },
  { city: '乌鲁木齐', iata: 'URC', station: '乌鲁木齐' },
  { city: '呼和浩特', iata: 'HET', station: '呼和浩特东' },
  { city: '海口', iata: 'HAK', station: '海口东' },
  { city: '宁波', iata: 'NGB', station: '宁波' },
  { city: '苏州', iata: 'SZV', station: '苏州北' },
  { city: '无锡', iata: 'WUX', station: '无锡东' },
  { city: '温州', iata: 'WNZ', station: '温州南' },
  { city: '常州', iata: 'CZX', station: '常州北' },
  { city: '烟台', iata: 'YNT', station: '烟台' },
  { city: '桂林', iata: 'KWL', station: '桂林北' }
];

const TRAVEL_ORIGIN_KEY = 'onerland_travel_origin_v1';
// 热门出发城市快捷胶囊（点一下就切换出发地）
const TRAVEL_HOT_CITIES = ['北京', '上海', '广州', '深圳', '成都', '杭州', '重庆', '武汉', '西安', '南京', '长沙', '合肥'];
const travelHelperState = { show: null, origin: '北京', depart: '', ret: '', openGroup: '' };

function travelCityMeta(cityName) {
  const name = String(cityName || '').trim();
  const hit = TRAVEL_CITIES.find(c => name.includes(c.city) || c.city.includes(name));
  return hit || { city: name || '北京', iata: '', station: name || '' };
}

function travelPad(n) { return String(n).padStart(2, '0'); }

function travelShiftDate(iso, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T12:00:00`) : new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return `${base.getFullYear()}-${travelPad(base.getMonth() + 1)}-${travelPad(base.getDate())}`;
}

function travelEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTravelOrigin() {
  try {
    const saved = localStorage.getItem(TRAVEL_ORIGIN_KEY);
    if (saved && TRAVEL_CITIES.some(c => c.city === saved)) return saved;
  } catch (e) { /* ignore */ }
  return '北京';
}

function setTravelOrigin(city) {
  try { localStorage.setItem(TRAVEL_ORIGIN_KEY, String(city || '')); } catch (e) { /* ignore */ }
}

// ---------- 四大类一级入口 + 二级平台链接（只保留经验证的官方稳定入口） ----------
// 原则：不拼接易失效的深层参数路径，优先官方首页/移动端首页，让用户在 App 内自行检索；
// 行程关键词用「📋 一键复制」提供，粘贴即用。
function buildTravelGroups() {
  const show = travelHelperState.show || {};
  const dest = travelCityMeta(show.city);
  const origin = travelCityMeta(travelHelperState.origin);
  const venue = String(show.venue || dest.city || '').trim() || dest.city;
  const depart = travelHelperState.depart;
  const back = travelHelperState.ret;
  const enc = encodeURIComponent;
  const keyword = `${origin.city} → ${dest.city}${depart || back ? ` ${depart || ''}${back ? `至${back}` : ''}` : ''}${venue ? ` ${venue}` : ''}`.trim();

  return {
    origin,
    dest,
    venue,
    keyword: keyword.replace(/\s+/g, ' '),
    groups: [
      {
        id: 'flights',
        icon: '✈️',
        title: '机票',
        hint: `${origin.city} → ${dest.city}${depart ? ` · ${depart}` : ''}`,
        links: [
          { label: '携程机票', desc: '移动端 H5 机票首页', url: 'https://m.ctrip.com/html5/flight/swift/index' },
          { label: '去哪儿机票', desc: '多航司比价 / 中转', url: 'https://flight.qunar.com/' },
          { label: '飞猪机票', desc: '阿里系运价与优惠', url: 'https://h5.m.taobao.com/trip/flight/search/index.html' }
        ]
      },
      {
        id: 'trains',
        icon: '🚄',
        title: '高铁',
        hint: `${origin.station || origin.city} → ${dest.station || dest.city}${depart ? ` · ${depart}` : ''}`,
        links: [
          { label: '铁路 12306 官方', desc: '官方余票与正晚点（移动端自适应）', url: 'https://www.12306.cn/index/' },
          { label: '携程火车票', desc: '余票 / 票价对比', url: 'https://m.ctrip.com/webapp/train/' },
          { label: '去哪儿火车票', desc: '车次耗时 / 中转组合', url: 'https://train.qunar.com/' }
        ]
      },
      {
        id: 'local',
        icon: '🚇',
        title: '同城交通',
        hint: `${venue} · 地铁 / 打车`,
        links: [
          {
            label: '高德地图 · 路线 / 打车',
            desc: `${venue} · 公交地铁优先（可唤醒 App）`,
            url: `https://uri.amap.com/navigation?to=,,${enc(venue)}&mode=bus&src=onerland&callnative=1`
          },
          {
            label: '百度地图 · 地铁换乘',
            desc: `${venue} · 公交/地铁耗时（可唤醒 App）`,
            url: `https://api.map.baidu.com/direction?destination=${enc(venue)}&mode=transit&output=html&src=webapp.onerland.onerland`
          }
        ]
      },
      {
        id: 'hotels',
        icon: '🏨',
        title: '酒店',
        hint: `${venue} 周边${show.date ? ` · ${String(show.date).slice(0, 10)} 入住` : ''}`,
        links: [
          { label: '携程酒店', desc: '移动端酒店首页', url: 'https://m.ctrip.com/webapp/hotel/' },
          { label: '去哪儿酒店', desc: '酒店比价', url: 'https://hotel.qunar.com/' }
        ]
      }
    ]
  };
}

function travelLinkButtons(list) {
  return list.map(item => `
    <a class="travel-link" href="${travelEsc(item.url)}" target="_blank" rel="noopener noreferrer">
      <span class="travel-link-label">${travelEsc(item.label)} <span class="travel-link-arrow">↗</span></span>
      <span class="travel-link-desc">${travelEsc(item.desc)}</span>
    </a>
  `).join('');
}

function ensureTravelModal() {
  let modal = document.getElementById('travel-helper-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'travel-helper-modal';
  modal.className = 'travel-modal hidden';
  modal.innerHTML = `
    <div class="travel-shell" role="dialog" aria-modal="true" aria-label="出行比价">
      <div class="travel-head">
        <div class="travel-title-wrap">
          <div class="travel-title">🚄 出行比价</div>
          <div class="travel-sub" id="travel-sub"></div>
        </div>
        <button type="button" class="travel-close" data-travel-close aria-label="关闭">✕</button>
      </div>
      <div class="travel-controls">
        <label class="travel-field">
          <span>出发城市</span>
          <select id="travel-origin" class="travel-select"></select>
        </label>
        <label class="travel-field">
          <span>去程日期</span>
          <input id="travel-depart" type="date" />
        </label>
        <label class="travel-field">
          <span>返程日期</span>
          <input id="travel-return" type="date" />
        </label>
      </div>
      <div class="travel-hot-cities" id="travel-hot-cities"></div>
      <div class="travel-body" id="travel-body"></div>
      <div class="travel-foot">
        全部为官方/正规平台直达链接，新标签页打开；本站不抓取任何第三方页面数据，也不参与任何交易。<br />
        📱 手机浏览器打开可自动拉起对应 App；若在微信内打开，点右上角「在默认浏览器打开」即可一键唤醒 App。
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const originSelect = modal.querySelector('#travel-origin');
  TRAVEL_CITIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.city;
    opt.textContent = `${c.city}（${c.iata || '—'} · ${c.station || c.city}）`;
    originSelect.appendChild(opt);
  });

  const hotBox = modal.querySelector('#travel-hot-cities');
  hotBox.innerHTML = TRAVEL_HOT_CITIES.map(city =>
    `<button type="button" class="travel-hot-chip" data-hot-city="${travelEsc(city)}">${travelEsc(city)}</button>`
  ).join('');
  hotBox.addEventListener('click', event => {
    const chip = event.target.closest('[data-hot-city]');
    if (!chip) return;
    event.preventDefault();
    travelHelperState.origin = travelCityMeta(chip.dataset.hotCity).city;
    setTravelOrigin(travelHelperState.origin);
    renderTravelHelper();
    loadTravelFlightPrices();
  });

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-travel-close]')) {
      closeTravelHelper();
    }
  });

  originSelect.addEventListener('change', event => {
    const val = String(event.target.value || '').trim();
    const meta = travelCityMeta(val);
    travelHelperState.origin = meta.city;
    setTravelOrigin(meta.city);
    renderTravelHelper();
  });
  modal.querySelector('#travel-depart').addEventListener('change', event => {
    travelHelperState.depart = event.target.value || travelHelperState.depart;
    renderTravelHelper();
    loadTravelFlightPrices();
  });
  modal.querySelector('#travel-return').addEventListener('change', event => {
    travelHelperState.ret = event.target.value || travelHelperState.ret;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeTravelHelper();
  });
  return modal;
}

function renderTravelHelper() {
  const modal = ensureTravelModal();
  const show = travelHelperState.show || {};
  const data = buildTravelGroups();
  const sub = modal.querySelector('#travel-sub');
  const titleParts = [];
  const title = String(show.title || '').trim();
  const city = String(show.city || '').trim();
  if (title && title !== city) titleParts.push(title);
  if (city) titleParts.push(city);
  if (show.venue && show.venue !== city) titleParts.push(show.venue);
  const dateText = String(show.date || '').slice(0, 10);
  if (dateText) titleParts.push(dateText);
  sub.textContent = titleParts.join(' · ');

  const body = modal.querySelector('#travel-body');
  body.innerHTML = data.groups.map(group => {
    const open = travelHelperState.openGroup === group.id;
    return `
      <section class="travel-group ${open ? 'is-open' : ''}" data-group="${group.id}">
        <button type="button" class="travel-group-head" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleTravelGroup('${group.id}')">
          <span class="travel-group-icon">${travelEsc(group.icon)}</span>
          <span class="travel-group-title">${travelEsc(group.title)}</span>
          <span class="travel-group-hint">${travelEsc(group.hint)}</span>
          <span class="travel-group-count">${group.links.length}</span>
          <span class="travel-group-chev">▾</span>
        </button>
        <div class="travel-group-panel ${open ? '' : 'hidden'}">
          <button type="button" class="travel-copy-btn" data-copy-key="${travelEsc(group.id)}">📋 一键复制行程关键词</button>
          <div class="travel-link-grid">${travelLinkButtons(group.links)}</div>
        </div>
      </section>
    `;
  }).join('');
  body.querySelectorAll('[data-copy-key]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      copyTravelKeywords(btn.dataset.copyKey);
    });
  });

  const originSelectEl = modal.querySelector('#travel-origin');
  if (originSelectEl) originSelectEl.value = travelHelperState.origin;
  modal.querySelectorAll('[data-hot-city]').forEach(chip => {
    chip.classList.toggle('is-active', chip.dataset.hotCity === travelHelperState.origin);
  });
  modal.querySelector('#travel-depart').value = travelHelperState.depart;
  modal.querySelector('#travel-return').value = travelHelperState.ret;
}

// 手风琴：点开一个大类会收起其它大类（保持弹窗紧凑）
function toggleTravelGroup(id) {
  const next = travelHelperState.openGroup === id ? '' : id;
  travelHelperState.openGroup = next;
  const modal = document.getElementById('travel-helper-modal');
  if (!modal) return;
  modal.querySelectorAll('.travel-group').forEach(sec => {
    const on = sec.dataset.group === next;
    sec.classList.toggle('is-open', on);
    const head = sec.querySelector('.travel-group-head');
    if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
    sec.querySelector('.travel-group-panel')?.classList.toggle('hidden', !on);
  });
}

// 复制行程关键词：优先 Clipboard API，失败退回 textarea 方案
function copyTravelKeywords(groupId) {
  const data = buildTravelGroups();
  const group = data.groups.find(g => g.id === groupId);
  let text = data.keyword;
  if (group) text = `${group.icon} ${group.title}：${data.keyword}`;
  const done = () => showToast(`已复制：${text}`);
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done(); else toastError('复制失败，请手动选择文字复制');
    } catch (e) {
      toastError('复制失败，请手动选择文字复制');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

// 可选的官方公开数据参考价（未配置 Token 时完全跳过，不发任何请求）
async function loadTravelFlightPrices() {
  const slot = document.getElementById('travel-price-slot');
  if (!slot) return;
  if (!TRAVELPAYOUTS_TOKEN) { slot.innerHTML = ''; return; }
  const origin = travelCityMeta(travelHelperState.origin);
  const dest = travelCityMeta((travelHelperState.show || {}).city);
  if (!origin.iata || !dest.iata) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="travel-price-loading">⏳ 正在获取官方公开参考底价…</div>`;
  try {
    const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin.iata}&destination=${dest.iata}&departure_at=${travelHelperState.depart}&currency=cny&token=${encodeURIComponent(TRAVELPAYOUTS_TOKEN)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data && data.data) ? data.data.slice(0, 3) : [];
    if (!rows.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="travel-price-list">
        ${rows.map(r => `
          <div class="travel-price-item">
            <span>${travelEsc(String(r.departure_at || '').slice(0, 10))}</span>
            <strong>¥${travelEsc(r.price || '—')}</strong>
            <span>${travelEsc(r.airline || '')}${r.flight_number ? ` ${travelEsc(r.flight_number)}` : ''}</span>
          </div>
        `).join('')}
      </div>
      <div class="travel-price-note">参考价来自 Travelpayouts 官方公开数据，最终以出票平台为准。</div>
    `;
  } catch (e) {
    slot.innerHTML = '';
  }
}

function openTravelHelper(show) {
  const src = show || {};
  const rawDate = String(src.date || src.show_date || '').slice(0, 10);
  // 只接受规范日期，避免脏数据把跳转参数带偏
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  travelHelperState.show = {
    city: src.city || '',
    venue: src.venue || '',
    date,
    title: src.title || src.city || ''
  };
  travelHelperState.origin = getTravelOrigin();
  travelHelperState.depart = date ? travelShiftDate(date, -1) : travelShiftDate('', 1);
  travelHelperState.ret = date ? travelShiftDate(date, 1) : travelShiftDate('', 2);

  travelHelperState.openGroup = '';
  ensureTravelModal().classList.remove('hidden');
  document.body.classList.add('travel-modal-open');
  renderTravelHelper();
  loadTravelFlightPrices();
}

function openTravelHelperFromButton(btn) {
  if (!btn) return;
  openTravelHelper({
    city: btn.dataset.city || '',
    venue: btn.dataset.venue || '',
    date: btn.dataset.date || '',
    title: btn.dataset.title || ''
  });
}

function closeTravelHelper() {
  const modal = document.getElementById('travel-helper-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('travel-modal-open');
}

window.openTravelHelper = openTravelHelper;
window.openTravelHelperFromButton = openTravelHelperFromButton;
window.closeTravelHelper = closeTravelHelper;
window.toggleTravelGroup = toggleTravelGroup;
window.copyTravelKeywords = copyTravelKeywords;
