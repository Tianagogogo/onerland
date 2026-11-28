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
const travelHelperState = { show: null, origin: '北京', depart: '', ret: '' };

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

// ---------- 各分区跳转链接 ----------
function buildTravelLinks() {
  const show = travelHelperState.show || {};
  const dest = travelCityMeta(show.city);
  const origin = travelCityMeta(travelHelperState.origin);
  const venue = String(show.venue || dest.city || '').trim();
  const depart = travelHelperState.depart;
  const back = travelHelperState.ret;
  const showDate = String(show.date || depart || '').slice(0, 10);
  const enc = encodeURIComponent;

  return {
    dest,
    origin,
    flights: [
      {
        label: '携程 · 特价机票日历',
        desc: '低价日历 + 含税总价',
        url: `https://flights.ctrip.com/itinerary/oneway/${origin.iata || origin.city}-${dest.iata || dest.city}?date=${enc(depart)}`
      },
      {
        label: '去哪儿 · 特价机票',
        desc: '多航司比价 / 中转方案',
        url: `https://flight.qunar.com/site/oneway_list.htm?searchDepartureAirport=${enc(origin.city)}&searchArrivalAirport=${enc(dest.city)}&searchDepartureTime=${enc(depart)}`
      },
      {
        label: '飞猪 · 机票比价',
        desc: '阿里系运价 + 优惠券',
        url: `https://sjipiao.fliggy.com/flight_search_result.htm?tripType=0&depCity=${enc(origin.city)}&arrCity=${enc(dest.city)}&goDate=${enc(depart)}`
      }
    ],
    trains: [
      {
        label: '携程 · 火车票余票/票价',
        desc: '二等座 / 一等座对比',
        url: `https://trains.ctrip.com/TrainBooking/Search.aspx?from=${enc(origin.station || origin.city)}&to=${enc(dest.station || dest.city)}&day=${enc(depart)}`
      },
      {
        label: '去哪儿 · 火车票查询',
        desc: '车次耗时 / 中转组合',
        url: `https://train.qunar.com/stationToStation.htm?fromStation=${enc(origin.city)}&toStation=${enc(dest.city)}&date=${enc(depart)}`
      },
      {
        label: '铁路 12306 · 官方查询',
        desc: '官方余票与正晚点',
        url: 'https://www.12306.cn/index/'
      }
    ],
    local: [
      {
        label: '高德地图 · 场馆路线 / 打车估价',
        desc: `${venue || dest.city} · 车站机场 → 场馆`,
        url: `https://uri.amap.com/search?keyword=${enc(venue || dest.city)}&city=${enc(dest.city)}&callnative=1`
      },
      {
        label: '百度地图 · 地铁换乘方案',
        desc: '地铁耗时 / 步行距离',
        url: `https://map.baidu.com/?newmap=1&qt=s&wd=${enc(venue || dest.city)}&c=${enc(dest.city)}`
      }
    ],
    hotels: [
      {
        label: '携程 · 场馆周边酒店',
        desc: `${venue || dest.city} 附近 · ${showDate} 入住`,
        url: `https://hotels.ctrip.com/hotels/list?city=${enc(dest.city)}&keyword=${enc(venue || dest.city)}&checkin=${enc(showDate)}&checkout=${enc(travelShiftDate(showDate, 1))}`
      },
      {
        label: '去哪儿 · 场馆周边酒店',
        desc: '步行 / 地铁直达筛选',
        url: `https://hotel.qunar.com/city/${enc(dest.city)}/?q=${enc(venue || dest.city)}&fromDate=${enc(showDate)}&toDate=${enc(travelShiftDate(showDate, 1))}`
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
          <input id="travel-origin" list="travel-origin-list" autocomplete="off" placeholder="输入或选择出发城市" />
          <datalist id="travel-origin-list"></datalist>
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
      <div class="travel-body" id="travel-body"></div>
      <div class="travel-foot">全部为官方/正规平台直达链接，新标签页打开；本站不抓取任何第三方页面数据，也不参与任何交易。</div>
    </div>
  `;
  document.body.appendChild(modal);

  const listBox = modal.querySelector('#travel-origin-list');
  TRAVEL_CITIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.city;
    opt.label = `${c.iata || '—'} · ${c.station || c.city}`;
    listBox.appendChild(opt);
  });

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-travel-close]')) {
      closeTravelHelper();
    }
  });

  modal.querySelector('#travel-origin').addEventListener('change', event => {
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
  const links = buildTravelLinks();
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
  body.innerHTML = `
    <section class="travel-section">
      <div class="travel-section-head">✈️ 特价机票直达 <span class="travel-hint">${travelEsc(links.origin.city)} → ${travelEsc(links.dest.city)}</span></div>
      <div class="travel-link-grid">${travelLinkButtons(links.flights)}</div>
      <div id="travel-price-slot" class="travel-price-slot"></div>
    </section>
    <section class="travel-section">
      <div class="travel-section-head">🚄 高铁 / 动车车次与票价 <span class="travel-hint">${travelEsc(links.origin.station || links.origin.city)} → ${travelEsc(links.dest.station || links.dest.city)}</span></div>
      <div class="travel-link-grid">${travelLinkButtons(links.trains)}</div>
    </section>
    <section class="travel-section">
      <div class="travel-section-head">🚇 场馆同城交通（地铁 / 打车估价）</div>
      <div class="travel-link-grid">${travelLinkButtons(links.local)}</div>
    </section>
    <section class="travel-section">
      <div class="travel-section-head">🏨 场馆周边酒店房价对比 <span class="travel-hint">${travelEsc(String(show.date || '').slice(0, 10))} 入住</span></div>
      <div class="travel-link-grid">${travelLinkButtons(links.hotels)}</div>
    </section>
  `;
  modal.querySelector('#travel-origin').value = travelHelperState.origin;
  modal.querySelector('#travel-depart').value = travelHelperState.depart;
  modal.querySelector('#travel-return').value = travelHelperState.ret;
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
