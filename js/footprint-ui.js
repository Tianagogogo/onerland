function renderFootprintPage() {
  renderLocalFanPrefCard();
  renderFootprintMapAndList();
  renderTicketCanvasPreview();
}

// 1. 粉籍绝对本地化设置器（零上传、零统计、零公开）
function renderLocalFanPrefCard() {
  const box = document.getElementById('local-fan-pref-box');
  if (!box) return;
  const { biasType, biasMembers, autoFilterShows } = AppState.fanPref;
  const members = ['ONER', '岳岳', '木子洋', '灵超'];

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">🛡️ 个人粉籍偏好设置（100% 仅存本机浏览器）</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">服务器零存储、零统计、不对外展示，杜绝拉踩引战。</p>
        </div>
        <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
          <input type="checkbox" ${autoFilterShows ? 'checked' : ''} onchange="updateFanPref('autoFilterShows', this.checked)" />
          演出库仅看关注成员
        </label>
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs">
        <span class="text-slate-500">属性模式：</span>
        ${[['group', '团粉 / 家族粉'], ['solo', '唯粉模式'], ['cp', 'CP / 双人偏好']].map(([val, label]) => `
          <button type="button" onclick="updateFanPref('biasType', '${val}')"
            class="px-3 py-1 rounded-full border transition ${biasType === val ? 'obsidian-btn text-white border-transparent' : 'bg-white text-slate-600 border-slate-300'}">
            ${label}
          </button>
        `).join('')}
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs">
        <span class="text-slate-500">关注成员：</span>
        ${members.map(m => {
          const active = biasMembers.includes(m);
          return `
            <button type="button" onclick="toggleBiasMember('${m}')"
              class="px-3 py-1 rounded-full border transition ${active ? 'obsidian-btn text-white border-transparent' : 'bg-white text-slate-600 border-slate-300'}">
              ${active ? '✓ ' : ''}${m}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function updateFanPref(key, val) {
  AppState.fanPref[key] = val;
  saveLocalState(LOCAL_KEYS.FAN_PREF, AppState.fanPref);
  renderLocalFanPrefCard();
}

function toggleBiasMember(member) {
  const idx = AppState.fanPref.biasMembers.indexOf(member);
  if (idx >= 0) AppState.fanPref.biasMembers.splice(idx, 1);
  else AppState.fanPref.biasMembers.push(member);
  saveLocalState(LOCAL_KEYS.FAN_PREF, AppState.fanPref);
  renderLocalFanPrefCard();
}

// 2. 观演足迹记录与 SVG 连线轨迹图
function recordFootprintFromShow(title, date, venue, artist = 'ONER') {
  const cityMatch = `${title} ${venue}`.match(/(北京|上海|广州|深圳|杭州|南京|合肥|西安|成都|重庆|武汉|长沙|苏州|天津|郑州|青岛|厦门|沈阳)/);
  const city = cityMatch ? cityMatch[1] : '北京';
  AppState.footprints.unshift({
    id: Date.now(),
    title,
    date: (date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    venue,
    city,
    artist
  });
  saveLocalState(LOCAL_KEYS.FOOTPRINTS, AppState.footprints);
  alert(`已将「${title}」记入本机观演足迹（第 ${AppState.footprints.length} 面）！`);
  if (AppState.activeTab === 'footprint') renderFootprintPage();
  renderAnniversaryCard();
}

function removeFootprint(id) {
  AppState.footprints = AppState.footprints.filter(f => f.id !== id);
  saveLocalState(LOCAL_KEYS.FOOTPRINTS, AppState.footprints);
  renderFootprintPage();
  renderAnniversaryCard();
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

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl metal-card space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900">🗺️ 个人奔赴连线足迹（已点亮 ${list.length} 场）</h3>
        <span class="text-[11px] text-slate-400">仅保存在本机 · 不做他人排名对比</span>
      </div>

      <div class="w-full bg-slate-50 rounded-xl border border-slate-200 p-2 flex justify-center">
        <svg viewBox="0 0 400 220" class="w-full max-w-lg h-auto">
          <rect x="10" y="10" width="380" height="200" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="4 4"/>
          ${points.length >= 2 ? `<polyline fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="4 3" points="${polylinePts}"/>` : ''}
          ${points.map((p, i) => `
            <circle cx="${p.xy[0]}" cy="${p.xy[1]}" r="5" fill="#DD0514" stroke="#ffffff" stroke-width="1.5"/>
            <text x="${p.xy[0]}" y="${p.xy[1] - 8}" text-anchor="middle" fill="#0f172a" font-size="9" font-weight="bold">${p.city}(#${i + 1})</text>
          `).join('')}
          ${!points.length ? `<text x="200" y="114" text-anchor="middle" fill="#94a3b8" font-size="11">在「档案」点击演出卡片右上角「+ 记入足迹」即可点亮城市连线</text>` : ''}
        </svg>
      </div>

      <div class="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
        ${list.map((f, idx) => `
          <div class="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white border border-slate-200">
            <div class="truncate">
              <span class="font-bold text-slate-900">第 ${list.length - idx} 面 · ${f.title}</span>
              <span class="text-slate-400 ml-2">${f.date} · ${f.venue}</span>
            </div>
            <button type="button" onclick="removeFootprint(${f.id})" class="text-slate-400 hover:text-rose-600 shrink-0 ml-2">移除</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 3. 纯前端 Canvas 纪念票根生成器（非登机牌样式 + 免责水印底角烧录）
let ticketBgDataUrl = '';
function handleTicketBgUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    ticketBgDataUrl = e.target.result;
    renderTicketCanvasPreview();
  };
  reader.readAsDataURL(file);
}

function renderTicketCanvasPreview() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 720;
  const H = canvas.height = 340;

  const showName = document.getElementById('tk-show-name')?.value.trim() || 'ONER「极尽声色」巡回演唱会';
  const showDate = document.getElementById('tk-show-date')?.value || new Date().toISOString().slice(0, 10);
  const seatInfo = document.getElementById('tk-seat-info')?.value.trim() || '内场 · 黄金记忆区';
  const themeColor = document.getElementById('tk-color')?.value || '#DD0514';

  const start = new Date(AppState.anniversary.firstMeetDate.replace(/-/g, '/'));
  const meetDays = isNaN(start) ? 1 : Math.max(1, Math.floor((new Date(showDate.replace(/-/g, '/')).getTime() - start.getTime()) / 86400000));
  const faceCount = Math.max(1, AppState.footprints.length);

  // 背景底板（默认使用应援色质感渐变，绝不内置未授权官方海报）
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.55, '#1e293b');
  grad.addColorStop(1, themeColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(12, 12, W - 24, H - 24, 24);
  ctx.fill();

  // 左侧应援色光条
  ctx.fillStyle = themeColor;
  ctx.fillRect(36, 42, 6, 190);

  // 顶部标识
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('ONERLAND · 个人非商业观演纪念票根', 56, 60);

  // 演出主标题
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(showName.slice(0, 22), 56, 106);

  // 日期与区域
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '16px sans-serif';
  ctx.fillText(`观演日期：${showDate}   ｜   位置：${seatInfo}`, 56, 146);

  // 情感纪念数值（认识第 X 天 + 线下第 X 面）
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`✨ 相识第 ${meetDays} 天   ·   线下奔赴第 ${faceCount} 面`, 56, 196);

  // 虚线撕票分割线
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(520, 28);
  ctx.lineTo(520, H - 28);
  ctx.stroke();
  ctx.setLineDash([]);

  // 副券纪念印章
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('SOUVENIR', 555, 110);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`NO.${String(faceCount).padStart(4, '0')}`, 555, 142);
  ctx.fillText(showDate, 555, 172);

  // 底部合规免责声明与图源烧录
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px sans-serif';
  const sourceNote = ticketBgDataUrl ? '图源：用户自传现场实拍' : '底板：应援色纯色生成';
  ctx.fillText(`非商业粉丝个人纪念生成 · 仅供个人留念严禁售卖 · ${sourceNote}`, 56, H - 32);
}

function downloadSouvenirTicket() {
  const canvas = document.getElementById('souvenir-ticket-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `ONERLAND-纪念票根-${Date.now()}.png`;
  a.click();
}
