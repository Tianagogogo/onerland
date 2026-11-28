function renderHomeDashboard() {
  renderAnniversaryCard();
  renderUpcomingMiniTimeline();
}

// 时光提醒的内联编辑态：一次只编辑一项
const anniversaryEditState = { field: null, cancel: false };

function startAnniversaryEdit(field) {
  anniversaryEditState.field = field;
  anniversaryEditState.cancel = false;
  renderAnniversaryCard();
  const input = document.querySelector('[data-anniv-input="' + field + '"]');
  if (input) {
    input.focus();
    if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
  }
}

function commitAnniversaryEdit(field, value) {
  if (anniversaryEditState.cancel) {
    anniversaryEditState.cancel = false;
    anniversaryEditState.field = null;
    return;
  }
  if (anniversaryEditState.field !== field) return;
  anniversaryEditState.field = null;
  const clean = String(value || '').trim();
  if (!clean) {
    renderAnniversaryCard();
    return;
  }
  if (field === 'fanNickname') saveAnniversaryState({ fanNickname: clean });
  if (field === 'actionWord') saveAnniversaryState({ actionWord: clean });
  if (field === 'firstMeetDate') saveAnniversaryState({ firstMeetDate: clean });
  renderAnniversaryCard();
}

function cancelAnniversaryEdit() {
  anniversaryEditState.cancel = true;
  anniversaryEditState.field = null;
  renderAnniversaryCard();
}

// 关联对象：单选或多选（ONER / 岳岳 / 木子洋 / 灵超）
function toggleAnniversaryTarget(member) {
  const cur = Array.isArray(AppState.anniversary.targets) ? [...AppState.anniversary.targets] : [];
  const idx = cur.indexOf(member);
  let next;
  if (idx >= 0) {
    if (cur.length <= 1) return; // 至少保留一个对象
    next = cur.filter(m => m !== member);
  } else {
    next = ANNIVERSARY_TARGET_OPTIONS.filter(m => cur.includes(m) || m === member);
  }
  saveAnniversaryState({ targets: next });
}

// 与所选对象最近一次线下见面的倒计时
function getNextMeetCountdown(targets) {
  const list = (Array.isArray(AppState.cloudTickets) ? AppState.cloudTickets : [])
    .filter(item => {
      if (!item || !item.show_date) return false;
      const label = `${item.artist || ''} ${item.city || ''}`;
      return (targets || []).some(t => t === 'ONER'
        ? (item.artist === 'ONER' || label.includes('极尽声色'))
        : item.artist === t);
    })
    .map(item => ({
      item,
      ts: typeof parseLocalTime === 'function' ? parseLocalTime(item.show_date) : NaN
    }))
    .filter(x => !isNaN(x.ts) && x.ts + 3 * 3600 * 1000 > Date.now())
    .sort((a, b) => a.ts - b.ts);
  if (!list.length) return null;
  const first = list[0];
  const days = Math.max(0, Math.ceil((first.ts - Date.now()) / 86400000));
  return { days, city: first.item.city || '', date: String(first.item.show_date).slice(0, 10) };
}

function renderAnniversaryCard() {
  const box = document.getElementById('home-anniversary-box');
  if (!box) return;
  const ann = AppState.anniversary;
  const nickname = ann.fanNickname || '万能人';
  const actionWord = ann.actionWord || '相识';
  const targets = Array.isArray(ann.targets) && ann.targets.length ? ann.targets : ['ONER'];
  const targetLabel = getAnniversaryTargetsLabel(targets);

  const start = new Date(String(ann.firstMeetDate || '2018-08-30').replace(/-/g, '/'));
  const meetDays = isNaN(start) ? 0 : Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000));

  // 颜色实时跟随所选关联对象：单人=成员色，多选=所选成员顺滑渐变，含 ONER=全团红
  // 统一走站内粉籍配色：团粉=ONER 红，唯粉=成员应援色，双人=双色渐变
  const accent = typeof getFanIdentityAccent === 'function'
    ? getFanIdentityAccent(ann.fanIdentity, targets)
    : (typeof getAnniversaryTargetAccent === 'function'
      ? getAnniversaryTargetAccent(targets)
      : { bg: 'var(--fan-theme)', solid: 'var(--fan-theme-solid)' });

  const isGradientAccent = String(accent.bg || '').includes('gradient');
  const gradientTextStyle = isGradientAccent
    ? `background-image:${String(accent.bg).replace('135deg', '90deg')};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`
    : '';
  const targetStyle = gradientTextStyle
    ? `${gradientTextStyle}border-bottom:1px solid transparent;border-image:${accent.bg} 1;`
    : '';

  const nextMeet = getNextMeetCountdown(targets);
  const meetText = nextMeet
    ? `距与 ${targetLabel} 下次见面还有 <strong class="countdown-value" style="color:${accent.solid}">${nextMeet.days}</strong> 天（${nextMeet.city} ${nextMeet.date}）`
    : `与 ${targetLabel} 暂无待开演场次 · 期待下一次线下奔赴`;

  const microList = getMergedAnniversaryList().slice(0, 3);
  const microHtml = microList.length
    ? microList.map(ev => {
        const accent = getAnniversaryAccentColor(ev);
        return `<span class="anniv-day-item shrink-0">
          <strong>${escapeAnnivText(ev.title)}</strong>
          <span class="anniv-days" style="color:${accent}">${ev.diffDays === 0 ? '就是今天' : ev.diffDays + ' 天'}</span>
        </span>`;
      }).join('<span class="shrink-0 text-slate-300">·</span>')
    : '<span class="text-[11px] text-slate-400">暂无纪念日，点击右侧管理添加</span>';

  const editingField = anniversaryEditState.field;
  const nicknameHtml = editingField === 'fanNickname'
    ? `<input data-anniv-input="fanNickname" class="anniv-inline-input w-24" value="${escapeAnnivAttr(nickname)}"
         onkeydown="if(event.key==='Enter'){this.blur();} if(event.key==='Escape'){cancelAnniversaryEdit();}"
         onblur="commitAnniversaryEdit('fanNickname', this.value)" />`
    : `<button type="button" class="anniv-editable" title="点击修改昵称" onclick="startAnniversaryEdit('fanNickname')">${escapeAnnivText(nickname)}</button>`;

  const actionHtml = editingField === 'actionWord'
    ? `<input data-anniv-input="actionWord" class="anniv-inline-input w-24" value="${escapeAnnivAttr(actionWord)}"
         onkeydown="if(event.key==='Enter'){this.blur();} if(event.key==='Escape'){cancelAnniversaryEdit();}"
         onblur="commitAnniversaryEdit('actionWord', this.value)" />`
    : `<button type="button" class="anniv-editable" title="点击修改动作词（如 同行 / 初遇 / 双向奔赴）" onclick="startAnniversaryEdit('actionWord')">${escapeAnnivText(actionWord)}</button>`;

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl chronicle-card space-y-3" style="--anniv-accent:${accent.solid};--anniv-accent-bg:${accent.bg}">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="space-y-1.5 min-w-0">
          <div class="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span class="theme-pill" style="background:${accent.bg}">✨ 时光提醒</span>
            <span class="inline-flex items-center gap-1">你好，${nicknameHtml}</span>
            <span class="text-[10px] text-slate-400">（点击昵称 / 对象 / 动作词可改）</span>
          </div>
          <div class="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
            与 <button type="button" class="anniv-editable anniv-target-btn" title="点击切换关联对象"
              style="${targetStyle}"
              onclick="openAnniversaryTargetPicker(event)">${escapeAnnivText(targetLabel)}</button>
            ${actionHtml}
            的第 <button type="button" class="anniv-hot-number"
              style="${gradientTextStyle || `color:${accent.solid}`}"
              title="点击管理入坑 / 纪念日期 · 正数或倒计时 · 生日与自定义纪念日"
              aria-label="打开时光提醒与纪念日管理"
              onclick="openAnniversaryManager()">${meetDays}</button> 天
            <span class="text-slate-400">·</span>
            已点亮线下 <button type="button" class="anniv-hot-number"
              style="${gradientTextStyle || `color:${accent.solid}`}"
              title="点击查看我的线下足迹，快速点亮或补录观演记录"
              aria-label="打开我的线下足迹"
              onclick="switchMainTab('footprint')">${AppState.footprints.length}</button> 面
          </div>
          <p class="text-xs text-slate-600">${meetText}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button type="button" onclick="switchMainTab('footprint')" class="tour-action-btn tour-action-btn--mini">🎫 生成纪念票根</button>
        </div>
      </div>

      <button type="button" onclick="openAnniversaryManager()"
        class="anniv-bottom-bar w-full flex flex-wrap items-center gap-x-2 gap-y-1 pt-2.5 border-t border-slate-300/60 text-left hover:opacity-80 transition-opacity">
        <span class="anniv-day-strip flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 overflow-x-auto flex-1 min-w-0 basis-full sm:basis-auto">${microHtml}</span>
        <span class="anniv-manage-link shrink-0 text-[11px] text-slate-400 w-full text-right sm:w-auto">管理 ›</span>
      </button>
    </div>
  `;
}

// 主标题里的对象名：点击弹出简洁菜单，单选切换后实时持久化
function openAnniversaryTargetPicker(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  closeAnniversaryTargetPicker();
  const ann = AppState.anniversary;
  const options = (typeof getFanIdentityOptions === 'function' ? getFanIdentityOptions() : []);
  const targets = Array.isArray(ann.targets) && ann.targets.length ? ann.targets : ['ONER'];
  // 当前粉籍：优先存下来的 identity；老数据按对象名推断
  const current = ann.fanIdentity || (targets[0] === 'ONER' ? 'group' : `solo:${targets[0]}`);
  const btn = event && event.currentTarget;
  const rect = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: 20, bottom: 120, top: 100 };
  const menu = document.createElement('div');
  menu.id = 'anniv-target-picker';
  menu.className = 'fixed z-[9998] min-w-[190px] p-1.5 rounded-xl bg-white/95 border border-slate-200 shadow-xl backdrop-blur text-xs';
  menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 215))}px`;
  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 320)}px`;
  const optionHtml = options.map(opt => {
    const on = opt.id === current;
    const dot = opt.accent.includes('gradient')
      ? `background:${opt.accent}`
      : `background:${opt.accent}`;
    return `<button type="button" data-identity="${opt.id}" class="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 ${on ? 'font-bold text-slate-900' : 'text-slate-600'}">
      <span>${on ? '✓ ' : ''}${opt.target}</span><span class="w-2.5 h-2.5 rounded-full shrink-0" style="${dot}"></span>
    </button>`;
  }).join('');
  menu.innerHTML = `${optionHtml}
    <div class="my-1 h-px bg-slate-200"></div>
    <button type="button" data-identity-custom="1" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-600">✏️ 自定义对象名…</button>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', ev => {
    const pick = ev.target.closest('[data-identity]');
    if (pick) {
      const opt = options.find(o => o.id === pick.dataset.identity);
      if (opt) {
        // 只显示对象名（团粉→ONER，唯粉(灵超)→灵超，双人→岳岳 & 木子洋），不带括号
        saveAnniversaryState({ fanIdentity: opt.id, targets: [opt.target] });
      }
      closeAnniversaryTargetPicker();
      return;
    }
    if (ev.target.closest('[data-identity-custom]')) {
      const name = (prompt('输入要关联的对象名称', targets[0] || 'ONER') || '').trim().slice(0, 12);
      closeAnniversaryTargetPicker();
      if (name) saveAnniversaryState({ fanIdentity: 'custom', targets: [name] });
    }
  });
  setTimeout(() => document.addEventListener('click', closeAnniversaryTargetPicker, { once: true }), 0);
}

function closeAnniversaryTargetPicker() {
  document.getElementById('anniv-target-picker')?.remove();
}

// ================= 开屏过渡收尾 =================
const SPLASH_START_TS = Date.now();
const SPLASH_MIN_MS = 350;
const SPLASH_FADE_MS = 450;
const SPLASH_MAX_MS = 3500;
let splashFinished = false;

function finishSplashNow() {
  const el = document.getElementById('app-splash-screen');
  if (!el) return;
  el.classList.add('is-hiding');
  setTimeout(() => el.remove(), SPLASH_FADE_MS + 50);
}

function hideSplashScreen() {
  if (splashFinished) return;
  splashFinished = true;
  const el = document.getElementById('app-splash-screen');
  if (!el) return;
  // 首屏可见区域内的海报：等 onload / onerror，避免遮罩撤掉时露出空框
  const imgs = Array.from(document.querySelectorAll('#home-upcoming-timeline img, #home-anniversary-box img'))
    .filter(img => {
      const r = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
      return !r || (r.top < (window.innerHeight || 800) && r.bottom > 0);
    });
  const waitImg = img => new Promise(resolve => {
    if (img.complete) return resolve();
    const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve(); };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
    // 单张图最多再等 1.2s，防弱网拖死
    setTimeout(done, 1200);
  });
  const elapsed = Date.now() - SPLASH_START_TS;
  const minWait = Math.max(0, SPLASH_MIN_MS - elapsed);
  Promise.race([
    Promise.all([Promise.all(imgs.map(waitImg)), new Promise(r => setTimeout(r, minWait))]),
    new Promise(r => setTimeout(r, SPLASH_MAX_MS))
  ]).finally(finishSplashNow);
}

// 弱网/脚本异常兜底：最多 3.5s 必撤
setTimeout(() => { if (!splashFinished) { splashFinished = true; finishSplashNow(); } }, SPLASH_MAX_MS);
window.hideSplashScreen = hideSplashScreen;

function escapeAnnivText(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAnnivAttr(text) {
  return escapeAnnivText(text).replace(/"/g, '&quot;');
}

// ================= 纪念日管理弹窗 =================
function openAnniversaryManager() {
  const modal = document.getElementById('anniversary-manager-modal');
  if (!modal) return;
  renderAnniversaryManager();
  modal.classList.remove('hidden');
}

function closeAnniversaryManager() {
  document.getElementById('anniversary-manager-modal')?.classList.add('hidden');
}

function renderAnniversaryManager() {
  const box = document.getElementById('anniversary-manager-body');
  if (!box) return;
  const ann = AppState.anniversary;
  const merged = getMergedAnniversaryList();
  const overrideMap = ann.builtinOverrides || {};

  const rows = merged.map(ev => {
    const isBuiltin = ev.official;
    const changed = isBuiltin && overrideMap[ev.builtinKey];
    const rowKey = isBuiltin ? `builtin:${ev.builtinKey}` : `custom:${ev.customKey}`;
    return `
      <div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] px-1.5 py-0.5 rounded ${isBuiltin ? 'bg-slate-100 text-slate-600' : 'bg-white border border-slate-300 text-slate-600'}">${isBuiltin ? '官方内置' : '我的自定义'}</span>
          <span class="text-[11px] text-slate-500">倒计时</span>
          <span class="countdown-value font-bold text-xs">${ev.diffDays === 0 ? '就是今天' : ev.diffDays + ' 天'}</span>
          ${changed ? '<span class="text-[10px] text-slate-400">（已修改）</span>' : ''}
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <input type="text" value="${escapeAnnivAttr(ev.title)}" class="flex-1 min-w-[7rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
            onchange="managerRenameAnniversary('${rowKey}', this.value)" />
          <input type="date" value="2000-${ev.date}" class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
            onchange="managerRetypeAnniversary('${rowKey}', this.value)" />
          ${isBuiltin
            ? `<button type="button" onclick="managerRestoreAnniversary('${ev.builtinKey}')" class="tour-action-btn tour-action-btn--mini">恢复默认</button>`
            : `<button type="button" onclick="managerRemoveAnniversary('${ev.customKey}')" class="tour-action-btn tour-action-btn--mini">删除</button>`}
        </div>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
      <div class="text-[11px] font-semibold text-slate-700">相识起点（用于计算「第 X 天」）</div>
      <div class="flex items-center gap-1.5 flex-wrap">
        <input type="date" value="${escapeAnnivAttr(ann.firstMeetDate || '2018-08-30')}"
          class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
          onchange="saveAnniversaryState({firstMeetDate:this.value})" />
        <span class="text-[11px] text-slate-500">当前昵称：${escapeAnnivText(ann.fanNickname || '万能人')} · 动作词：${escapeAnnivText(ann.actionWord || '相识')}</span>
      </div>
    </div>

    <div class="space-y-1.5">
      <div class="text-[11px] font-semibold text-slate-700">🎂 内置官方纪念日（8/30 出道日、万能人生日、7/11、4/21、1/9）与自定义纪念日</div>
      <div class="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar pr-0.5">${rows || '<div class="text-[11px] text-slate-400">暂无纪念日</div>'}</div>
    </div>

    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="text-[11px] font-semibold text-slate-700">➕ 新增纪念日（年度循环）</div>
      <div class="flex items-center gap-1.5 flex-wrap">
        <input id="anniv-new-title" type="text" placeholder="纪念日名称（如：初遇 / 双向奔赴）" class="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" />
        <input id="anniv-new-date" type="date" class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" />
        <button type="button" onclick="managerAddAnniversary()" class="tour-action-btn tour-action-btn--mini">添加</button>
      </div>
      <p class="text-[10px] text-slate-400 leading-relaxed">纪念票根生成器里的「同步记录为纪念日」也会写入这里，同日期同名自动覆盖，不会重复。</p>
    </div>
  `;
}

function managerRenameAnniversary(key, value) {
  const clean = String(value || '').trim();
  if (!clean) return renderAnniversaryManager();
  if (key.startsWith('builtin:')) {
    updateBuiltinAnniversary(key.slice(8), { title: clean });
  } else {
    const target = key.slice(7);
    const events = (AppState.anniversary.customEvents || []).map(ev =>
      String(ev.key) === String(target) ? { ...ev, title: clean } : ev);
    saveAnniversaryState({ customEvents: events });
  }
  renderAnniversaryManager();
}

function managerRetypeAnniversary(key, value) {
  const mmdd = String(value || '').slice(5);
  if (!/^\d{2}-\d{2}$/.test(mmdd)) return;
  if (key.startsWith('builtin:')) {
    updateBuiltinAnniversary(key.slice(8), { date: mmdd });
  } else {
    const target = key.slice(7);
    const events = (AppState.anniversary.customEvents || []).map(ev =>
      String(ev.key) === String(target) ? { ...ev, date: mmdd } : ev);
    saveAnniversaryState({ customEvents: events });
  }
  renderAnniversaryManager();
}

function managerRestoreAnniversary(builtinKey) {
  restoreBuiltinAnniversary(builtinKey);
  renderAnniversaryManager();
}

function managerRemoveAnniversary(customKey) {
  removeCustomAnniversary(customKey);
  renderAnniversaryManager();
}

function managerAddAnniversary() {
  const title = document.getElementById('anniv-new-title')?.value || '';
  const dateRaw = document.getElementById('anniv-new-date')?.value || '';
  const date = dateRaw ? dateRaw.slice(5) : '';
  const result = addCustomAnniversary(title, date);
  if (!result.ok) return alert(result.message);
  const titleInput = document.getElementById('anniv-new-title');
  if (titleInput) titleInput.value = '';
  renderAnniversaryManager();
}

// 纪念票根 → 同步为纪念日（打通两个模块）
function syncTicketToAnniversary() {
  const showName = (document.getElementById('tk-show-name')?.value || '').trim();
  const showDate = (document.getElementById('tk-show-date')?.value || '').trim();
  if (!showName || !showDate) return alert('请先填写演出名称与日期');
  const result = addCustomAnniversary(showName, showDate.slice(5));
  if (!result.ok) return alert(result.message);
  alert(`✅ 已将「${showName}」同步到时光提醒纪念日（${showDate.slice(5)} 年度循环倒数）。`);
  renderAnniversaryCard();
  renderAnniversaryManager();
}

// ================= 近期演出微时间轴（合并云端 + 本地，去重后严格按日期降序） =================
function buildHomeTimelineList() {
  const map = new Map();
  const push = rec => {
    const date = String(rec.date || '').slice(0, 10);
    if (!date) return;
    const key = `${rec.artist || ''}|${rec.city || ''}|${date}`;
    const exist = map.get(key);
    if (!exist) {
      map.set(key, { ...rec, date });
      return;
    }
    // 同一条记录去重合并，优先保留内容更完整的一份
    map.set(key, {
      ...rec,
      ...Object.fromEntries(Object.entries(exist).filter(([, v]) => v !== '' && v != null)),
      date
    });
  };

  const visibleTickets = typeof filterVisibleShowRecords === 'function'
    ? filterVisibleShowRecords(AppState.cloudTickets)
    : (Array.isArray(AppState.cloudTickets) ? AppState.cloudTickets : []).filter(item => String(item && item.artist || '').toUpperCase() !== 'HIDDEN');
  visibleTickets.forEach(item => push({
    artist: item.artist || 'ONER',
    city: item.city || item.title || '待定场次',
    venue: item.venue || '',
    date: String(item.show_date || '').slice(0, 10),
    posterUrl: item.posterUrl || item.poster_url || item.poster || item.cover || item.cover_url || item.image || '',
    slot: item.slot || item.timeSlot || item.time_slot || item.schedule_time || item.stage_time || item.performance_time || '',
    cloudId: item.cloudId
  }));

  // 往日档案（Supabase tickets 中的 ARCHIVE 记录）同样参与时间轴排序，
  // 否则 2022 年的足迹会顶到最前，而 2023–2025 的已落幕巡演完全不出现。
  const visibleArchives = typeof filterVisibleShowRecords === 'function'
    ? filterVisibleShowRecords(AppState.cloudArchives)
    : (Array.isArray(AppState.cloudArchives) ? AppState.cloudArchives : []);
  visibleArchives.forEach(item => push({
    artist: item.artist || 'ONER',
    city: item.title || item.city || '往日场次',
    venue: item.venue || '',
    date: String(item.showDate || '').slice(0, 10),
    posterUrl: item.posterUrl || item.poster_url || item.poster || item.cover || item.cover_url || item.image || '',
    slot: item.slot || item.timeSlot || item.time_slot || item.schedule_time || item.stage_time || item.performance_time || '',
    cloudId: item.cloudId,
    isArchive: true
  }));

  (Array.isArray(AppState.footprints) ? AppState.footprints : []).forEach(f => push({
    artist: f.artist || 'ONER',
    city: f.title || f.city || '我的场次',
    venue: f.venue || '',
    date: String(f.date || '').slice(0, 10),
    posterUrl: '',
    cloudId: `fp-${f.id}`
  }));

  return [...map.values()]
    .map(rec => ({
      ...rec,
      ts: typeof parseLocalTime === 'function' ? parseLocalTime(rec.date) : new Date(rec.date).getTime()
    }))
    .filter(rec => !isNaN(rec.ts))
    .filter(rec => String(rec.artist || '').toUpperCase() !== 'HIDDEN' && !String(rec.city || '').includes('HIDDEN|'))
    .sort((a, b) => b.ts - a.ts);
}

function renderUpcomingMiniTimeline() {
  const box = document.getElementById('home-upcoming-timeline');
  if (!box) return;
  // 排序规则：最近一场未开演演出置顶，其余按演出日期倒序（从新到旧）
  const all = buildHomeTimelineList().slice();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const tsOf = item => new Date(String(item.date || '').slice(0, 10) + 'T00:00:00').getTime();
  const upcoming = all
    .filter(item => {
      const t = tsOf(item);
      return !isNaN(t) && t >= todayTs;
    })
    .sort((a, b) => tsOf(a) - tsOf(b));
  const pinned = upcoming.length ? upcoming[0] : null;
  const rest = all
    .filter(item => item !== pinned)
    .sort((a, b) => {
      const ta = tsOf(a);
      const tb = tsOf(b);
      return (isNaN(tb) ? -Infinity : tb) - (isNaN(ta) ? -Infinity : ta);
    });
  const list = (pinned ? [pinned, ...rest] : rest).slice(0, 4);
  if (!list.length) {
    box.innerHTML = `<div class="p-4 rounded-xl metal-card text-xs text-slate-400">近期暂无演出数据，去「档案」看看往期巡演回顾吧。</div>`;
    return;
  }

  box.innerHTML = list.map((item, idx) => {
    const displayArtist = item.artist === 'ONER' || String(item.city).includes('极尽声色') ? 'ONER' : item.artist;
    const badge = (ARTIST_COLORS[displayArtist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.city || '').replace(/['"<>]/g, '');
    const weekday = isNaN(item.ts) ? '' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(item.ts).getDay()];
    const isFuture = item.ts + 3 * 3600 * 1000 > Date.now();
    return `
      <div class="p-3.5 rounded-xl metal-card timeline-card flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${item === pinned ? 'timeline-card-next' : ''}">
        <div class="timeline-card-main flex items-start sm:items-center gap-3 min-w-0 w-full">
          <div class="w-12 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" ${posterImgAttrs(item.posterUrl, idx)} onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)" />` : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`}
          </div>
          <div class="timeline-card-body min-w-0 flex-1">
            <div class="timeline-title-row flex items-center gap-1.5">
              <span class="text-[10px] px-1.5 py-0.5 rounded text-white font-semibold shrink-0" style="background:${badge}">${displayArtist}</span>
              <span class="timeline-card-title font-bold text-sm text-slate-900 leading-snug break-words">${safeTitle}</span>
            </div>
            <div class="timeline-card-meta text-xs text-slate-500 mt-1 leading-relaxed">
              <span class="timeline-meta-date">🗓️ ${item.date} ${weekday}</span>
              <span class="timeline-meta-venue" title="${String(item.venue || '场馆待定').replace(/["<>]/g, '')}">📍 ${item.venue || '场馆待定'}</span>
            </div>
            ${item.slot ? `<div class="timeline-slot-row"><span class="timeline-slot-badge">⏰ ${String(item.slot).replace(/[<>"']/g, '')}</span></div>` : ''}
          </div>
        </div>
        <div class="timeline-card-actions flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end flex-wrap pt-1.5 sm:pt-0 border-t border-slate-200/70 sm:border-0">
          ${item === pinned
            ? `<span class="timeline-next-badge text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">⚡ 下一场 · 距开演 ${Math.max(0, Math.ceil((item.ts - todayTs) / 86400000))} 天</span>`
            : `<span class="text-[10px] px-1.5 py-0.5 rounded ${isFuture ? 'bg-white border border-slate-300 text-slate-600' : 'bg-slate-100 text-slate-500'}">${isFuture ? '待开演' : '已落幕'}</span>`}
          ${(typeof item.cloudId === 'number' && !item.isArchive) ? `<button type="button" onclick="exportShowICS(${item.cloudId})" class="tour-action-btn tour-action-btn--mini" title="导出日历提醒">📅 日历</button>` : ''}
          <button type="button" onclick="switchMainTab('shows')" class="tour-action-btn tour-action-btn--mini">详情</button>
        </div>
      </div>
    `;
  }).join('');
}
