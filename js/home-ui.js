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

// 与所选对象的下一场见面倒计时
// 优先级：① 已标记「计划前往」的未来场次 → ② 最近一场公开待开演场次 → ③ 无
function getNextMeetCountdown(targets) {
  const list = (Array.isArray(AppState.cloudTickets) ? AppState.cloudTickets : [])
    .filter(item => {
      if (!item || !item.show_date) return false;
      const label = `${item.artist || ''} ${item.city || ''}`;
      return (targets || []).some(t => t === 'ONER'
        ? (item.artist === 'ONER' || label.includes('极尽声色'))
        : item.artist === t);
    })
    .map(item => {
      const ts = typeof parseLocalTime === 'function' ? parseLocalTime(item.show_date) : NaN;
      const key = (typeof planShowKeyOf === 'function')
        ? planShowKeyOf(item.cloudId, item.venue || item.city, item.city, item.show_date)
        : String(item.cloudId);
      return {
        item,
        ts,
        key,
        planned: typeof isShowPlanned === 'function' ? isShowPlanned(key) : false
      };
    })
    .filter(x => !isNaN(x.ts) && x.ts + 3 * 3600 * 1000 > Date.now())
    .sort((a, b) => a.ts - b.ts);
  if (!list.length) return null;
  const plannedList = list.filter(x => x.planned);
  const first = plannedList.length ? plannedList[0] : list[0];
  const days = Math.max(0, Math.ceil((first.ts - Date.now()) / 86400000));
  return {
    days,
    planned: plannedList.length > 0,
    city: first.item.city || '',
    title: first.item.city || first.item.title || '演出',
    date: String(first.item.show_date).slice(0, 10)
  };
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
  // 统一走站内属性配色：团粉=ONER 红，唯粉=成员应援色，双人=双色渐变
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
  const nextMeetTitle = nextMeet ? String(nextMeet.title || nextMeet.city || '演出').replace(/[<>]/g, '') : '';
  const meetPrefix = nextMeet
    ? (nextMeet.planned ? `距与 ${targetLabel} 下次见面还有` : `距 ${targetLabel} 下一场演出还有`)
    : '';
  const meetSuffixShort = nextMeet
    ? `${String(nextMeet.city || nextMeetTitle).replace(/站$/, '')}站 ${String(nextMeet.date).slice(5)}`
    : '';
  const meetText = nextMeet
    ? `${meetPrefix} <strong class="countdown-value" style="color:${accent.solid}">${nextMeet.days}</strong> 天<span class="meet-place-full">（${nextMeetTitle} ${nextMeet.date}）</span><span class="meet-place-short">（${meetSuffixShort}）</span>`
    : `与 ${targetLabel} 暂无待开演场次 · 期待下一次线下奔赴`;

  const microList = getMergedAnniversaryList().slice(0, 3);
  const microHtml = microList.length
    ? microList.map(ev => {
        const accent = getAnniversaryAccentColor(ev);
        // 统一文案：距X N 天；标题若自带「距」字先剥离，避免出现两个「距」
        const rawTitle = String(ev.title || '').trim();
        const cleanTitle = rawTitle.replace(/^距\s*/, '');
        const dayText = Number(ev.diffDays) === 0 ? '0 天（就是今天）' : `${ev.diffDays} 天`;
        return `<span class="anniv-day-item shrink-0">
          <strong>距${escapeAnnivText(cleanTitle)}</strong>
          <span class="anniv-days" style="color:${accent}">${dayText}</span>
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
          <div class="anniv-main-line text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
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
          <p class="anniv-meet-line text-xs text-slate-600">${meetText}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button type="button" onclick="switchMainTab('footprint')" class="tour-action-btn tour-action-btn--mini">🎫 生成纪念票根</button>
          <button type="button" onclick="openChantDictModal()" class="tour-action-btn tour-action-btn--mini">📣 应援词典</button>
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
  // 当前属性：优先存下来的 identity；老数据按对象名推断
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
// 遮罩只做顶层 fixed 淡出：主页面与海报从第 0 秒就在后台并发加载，绝不被遮罩阻塞。
const SPLASH_START_TS = (window.performance && performance.timing && performance.timing.navigationStart) ? performance.timing.navigationStart : Date.now();
const SPLASH_MIN_MS = 1250;   // 品牌动效完整播放时长（自页面打开计约 1.25s）
const SPLASH_FADE_MS = 400;   // 淡出时长
const SPLASH_MAX_MS = 4000;   // 弱网兜底：最多 4s 必撤
let splashFinished = false;
let splashScheduled = false;

function finishSplashNow() {
  if (splashFinished === false) splashFinished = true;
  const el = document.getElementById('app-splash-screen');
  if (typeof ensurePosterImagesVisible === 'function') ensurePosterImagesVisible();
  if (!el) return;
  if (el.dataset.hiding === '1') return;
  el.dataset.hiding = '1';
  el.classList.add('is-hiding');
  // 淡出结束后再从 DOM 移除，期间底层页面已经完全可交互
  setTimeout(() => { if (el && el.parentNode) el.remove(); }, SPLASH_FADE_MS + 60);
  // 遮罩撤掉后再补两轮，覆盖 Safari 缓存命中漏 onload 的情况
  [SPLASH_FADE_MS, SPLASH_FADE_MS + 160, SPLASH_FADE_MS + 700].forEach(ms => setTimeout(() => {
    if (typeof ensurePosterImagesVisible === 'function') ensurePosterImagesVisible();
  }, ms));
}

// 点击 / 触摸 / Esc 立即跳过（提前淡出，不硬切）
function skipSplashScreen() {
  if (splashFinished) return;
  splashFinished = true;
  finishSplashNow();
}

function hideSplashScreen() {
  if (splashFinished || splashScheduled) return;
  splashScheduled = true;
  // 遮罩只负责品牌开场：固定播放 1.3s 后淡出，数据与海报在底层并行加载，绝不互相拖累
  const rest = Math.max(0, SPLASH_MIN_MS - (Date.now() - SPLASH_START_TS));
  setTimeout(() => { if (!splashFinished) finishSplashNow(); }, rest);
}

// 弱网/脚本异常兜底：最多 4s 必撤
setTimeout(() => { if (!splashFinished) finishSplashNow(); }, SPLASH_MIN_MS);
window.hideSplashScreen = hideSplashScreen;
window.skipSplashScreen = skipSplashScreen;
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app-splash-screen');
  if (!el) return;
  el.addEventListener('click', skipSplashScreen, { passive: true });
  el.addEventListener('touchstart', skipSplashScreen, { passive: true, once: true });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') skipSplashScreen(); });

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
            ? `<button type="button" onclick="managerRestoreAnniversary('${ev.builtinKey}')" class="tour-action-btn tour-action-btn--mini">恢复默认</button>
               <button type="button" onclick="managerDeleteBuiltinAnniversary('${ev.builtinKey}')" class="tour-action-btn tour-action-btn--mini anniv-del-btn">删除</button>`
            : `<button type="button" onclick="managerRemoveAnniversary('${ev.customKey}')" class="tour-action-btn tour-action-btn--mini anniv-del-btn">删除</button>`}
        </div>
      </div>
    `;
  }).join('');

  const deletedBuiltinCount = (typeof getDeletedBuiltinAnniversaryKeys === 'function')
    ? getDeletedBuiltinAnniversaryKeys().length
    : 0;
  const deletedTipHtml = deletedBuiltinCount ? `
    <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
      <span class="text-[11px] text-amber-800">已在本机隐藏 <strong>${deletedBuiltinCount}</strong> 条官方内置纪念日</span>
      <button type="button" onclick="restoreAllBuiltinAnniversariesUI()" class="tour-action-btn tour-action-btn--mini shrink-0">↺ 恢复全部内置纪念日</button>
    </div>
  ` : '';

  box.innerHTML = `
    ${deletedTipHtml}
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
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-[11px] font-semibold text-slate-700">➕ 新增纪念日（年度循环）</div>
        ${deletedBuiltinCount ? `<button type="button" onclick="restoreAllBuiltinAnniversariesUI()" class="text-[10.5px] text-slate-500 hover:text-slate-900 underline underline-offset-2">↺ 恢复全部内置纪念日</button>` : ''}
      </div>
      <div class="flex items-center gap-1.5 flex-wrap" data-enter-scope>
        <input id="anniv-new-title" type="text" placeholder="纪念日名称（如：初遇 / 双向奔赴）" class="flex-1 min-w-[8rem] px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" />
        <input id="anniv-new-date" type="date" class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs" />
        <button type="button" data-enter-submit onclick="managerAddAnniversary()" class="tour-action-btn tour-action-btn--mini">添加</button>
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

function managerDeleteBuiltinAnniversary(builtinKey) {
  const res = deleteBuiltinAnniversary(builtinKey);
  if (!res.ok) return toastError(res.message);
  showToast('已移除该内置纪念日');
}

function restoreAllBuiltinAnniversariesUI() {
  restoreAllBuiltinAnniversaries();
  showToast('已恢复全部官方内置纪念日');
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
  if (!result.ok) return toastError(result.message);
  const titleInput = document.getElementById('anniv-new-title');
  const dateInput = document.getElementById('anniv-new-date');
  if (titleInput) titleInput.value = '';
  if (dateInput) dateInput.value = '';
  renderAnniversaryCard();
  renderAnniversaryManager();
  showToast(`已添加纪念日：${title}`);
}

// 纪念票根 → 同步为纪念日（打通两个模块）
function syncTicketToAnniversary() {
  const showName = (document.getElementById('tk-show-name')?.value || '').trim();
  const showDate = (document.getElementById('tk-show-date')?.value || '').trim();
  if (!showName || !showDate) return toastError('请先填写演出名称与日期');
  const result = addCustomAnniversary(showName, showDate.slice(5));
  if (!result.ok) return toastError(result.message);
  showToast(`已将「${showName}」同步为 ${showDate.slice(5)} 年度纪念日`);
  renderAnniversaryCard();
  renderAnniversaryManager();
}

// ================= 近期演出微时间轴（合并云端 + 本地，去重后严格按日期降序） =================
function pickTransportTextOf(item) {
  const rec = item || {};
  if (typeof pickTransportText === 'function') {
    try {
      const t = pickTransportText(rec, rec);
      if (t) return t;
    } catch (e) { /* ignore */ }
  }
  return rec.transport || rec.traffic || rec.transit || '';
}

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
    scheduleImgs: Array.isArray(item.scheduleImgs) ? item.scheduleImgs
      : (Array.isArray(item.timetables) ? item.timetables
      : (Array.isArray(item.timetable_urls) ? item.timetable_urls
      : (Array.isArray(item.schedule_images) ? item.schedule_images : []))),
    transport: pickTransportTextOf(item),
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
    scheduleImgs: Array.isArray(item.scheduleImgs) ? item.scheduleImgs
      : (Array.isArray(item.timetables) ? item.timetables
      : (Array.isArray(item.timetable_urls) ? item.timetable_urls
      : (Array.isArray(item.schedule_images) ? item.schedule_images : []))),
    transport: pickTransportTextOf(item),
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
  // 排序规则：按「距今（今天）由近到远」——未开演/进行中按日期升序在前，已落幕历史场次按日期降序紧随其后
  const all = buildHomeTimelineList().slice();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const tsOf = item => {
    const raw = String(item.date || '').slice(0, 10);
    const t = new Date(raw + 'T00:00:00').getTime();
    return isNaN(t) ? NaN : t;
  };
  const valid = all.filter(item => !isNaN(tsOf(item)));
  const upcoming = valid
    .filter(item => tsOf(item) >= todayTs)
    .sort((a, b) => tsOf(a) - tsOf(b)); // 由近到远：越临近今天越靠前
  const past = valid
    .filter(item => tsOf(item) < todayTs)
    .sort((a, b) => tsOf(b) - tsOf(a)); // 同样由近到远：最近落幕的排更早历史场次之前
  const pinned = upcoming.length ? upcoming[0] : null;
  const list = [...upcoming, ...past].slice(0, 4);
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
    const isUpcomingShow = typeof isShowUpcomingOrToday === 'function' && isShowUpcomingOrToday(item.date);
    const planKey = (typeof planShowKeyOf === 'function')
      ? planShowKeyOf(item.cloudId, item.venue || item.city, item.city, item.date)
      : '';
    const plannedShow = isUpcomingShow && typeof isShowPlanned === 'function' && isShowPlanned(planKey);
    return `
      <div class="p-3.5 rounded-xl metal-card timeline-card flex flex-col gap-2.5 ${item === pinned ? 'timeline-card-next' : ''}">
        <div class="timeline-card-main flex items-start gap-3 min-w-0 w-full">
          <div class="w-12 poster-square-box shrink-0">
            ${(() => { const ps = (typeof posterSrcFor === 'function') ? posterSrcFor(item, item.posterUrl) : item.posterUrl; return ps ? `<img src="${ps}" alt="${safeTitle}" ${(typeof posterAttrsFor === 'function') ? posterAttrsFor(item, item.posterUrl, idx) : posterImgAttrs(ps, idx)} onload="this.classList.add(&#39;is-loaded&#39;)" onerror="handlePosterImageError(this)" onclick="event.stopPropagation(); openPosterLightbox(this.dataset.hdSrc || this.src, '${safeTitle}')" class="cursor-zoom-in" />` : ((typeof posterPlaceholderHtml === 'function') ? posterPlaceholderHtml(safeTitle) : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`); })()}
          </div>
          <div class="timeline-card-body min-w-0 flex-1">
            <div class="timeline-title-row flex items-center gap-2">
              <span class="text-[10px] px-1.5 py-0.5 rounded text-white font-semibold shrink-0" style="background:${badge}">${displayArtist}</span>
              <div class="timeline-card-actions flex items-center gap-1.5 justify-end">
                ${item === pinned
                  ? `<span class="timeline-next-badge tl-state-chip">⚡ 下一场</span>`
                  : `<span class="tl-state-chip ${isFuture ? 'bg-white border border-slate-300 text-slate-600' : 'bg-slate-100 text-slate-500'}">${isFuture ? '待开演' : '已落幕'}</span>`}
                ${isUpcomingShow
                  ? `<button type="button" class="plan-chip tl-plan-action ${plannedShow ? 'is-active' : ''}" aria-pressed="${plannedShow ? 'true' : 'false'}" title="标记计划前往（不计入已观演场次）" onclick="event.stopPropagation(); handleHomeTimelinePlan(${idx}, this)">${plannedShow ? '✓ 计划前往' : '🎫 计划前往'}</button>`
                  : ''}
                <button type="button" onclick="openHomeTimelineDetail(${idx})" class="tour-action-btn tl-detail-btn">📄 详情</button>
              </div>
            </div>
            <div class="timeline-card-title font-bold text-sm text-slate-900 leading-snug break-words">${safeTitle}</div>
            <div class="timeline-card-meta text-xs text-slate-500 mt-1">
              <button type="button" class="timeline-meta-line timeline-meta-date meta-date-ics" title="点击添加到日历提醒"
                onclick="event.stopPropagation(); handleHomeTimelineDateClick(${idx})">📅 ${item.date} ${weekday}</button>
              <div class="timeline-meta-line timeline-meta-venue" title="${String(item.venue || '场馆待定').replace(/["<>]/g, '')}">📍 ${item.venue || '场馆待定'}</div>
            </div>
            ${(item.slot || (item.scheduleImgs && item.scheduleImgs.length)) ? `<div class="timeline-slot-row">
              ${item.slot ? `<span class="timeline-slot-badge">⏰ ${String(item.slot).replace(/[<>"']/g, '')}</span>` : ''}
              ${(item.scheduleImgs && item.scheduleImgs.length) ? `<button type="button" data-sched="${idx}" class="timeline-table-btn" title="查看音乐节时间表大图">🗓️ 时间表${item.scheduleImgs.length > 1 ? ` ×${item.scheduleImgs.length}` : ''}</button>` : ''}
            </div>` : ''}
          </div>
        </div>
        <div class="tl-quick-bar" data-tl-bar="${idx}">
          <button type="button" class="tl-quick-btn" data-tl-action="traffic" data-tl-idx="${idx}" aria-expanded="false">🚇 交通</button>
          <button type="button" class="tl-quick-btn" data-tl-action="travel" data-tl-idx="${idx}">🚄 出行比价</button>
          <button type="button" class="tl-quick-btn" data-tl-action="checkin" data-tl-idx="${idx}">🍜 同款打卡</button>
          <button type="button" class="tl-quick-btn" data-tl-action="security" data-tl-idx="${idx}" aria-expanded="false">🛡️ 安检体验</button>
          <button type="button" class="tl-quick-btn" data-tl-action="buddy" data-tl-idx="${idx}">🤝 找搭子</button>
        </div>
      </div>
    `;
  }).join('');

  // 首页卡片直接开时间表大图：复用站内灯箱（支持多图上一张/下一张、缩放）
  const schedPool = list.map(item => ({
    imgs: Array.isArray(item.scheduleImgs) ? item.scheduleImgs : [],
    title: String(item.city || item.title || '音乐节').replace(/['"<>]/g, '')
  }));
  homeTimelineRecords = list;
  // 开屏期间就并发预加载首屏海报（前 6 张），撤遮罩即可见
  if (typeof preloadPosterImages === 'function') {
    preloadPosterImages(list.map(it => (typeof posterSrcFor === 'function' ? posterSrcFor(it, it.posterUrl) : it.posterUrl)), 6);
  }
  if (typeof ensurePosterImagesVisible === 'function') {
    ensurePosterImagesVisible(box);
    [0, 80, 300, 900].forEach(ms => setTimeout(() => ensurePosterImagesVisible(box), ms));
  }
  box.querySelectorAll('[data-tl-action]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      handleHomeTimelineAction(btn.dataset.tlAction, Number(btn.dataset.tlIdx), btn);
    });
  });

  box.querySelectorAll('[data-sched]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      const entry = schedPool[Number(btn.dataset.sched)];
      if (!entry || !entry.imgs.length) return;
      if (typeof openLightboxGallery === 'function') {
        openLightboxGallery(entry.imgs, 0, `${entry.title} · 音乐节时间表`);
      } else if (typeof openLightbox === 'function') {
        openLightbox(entry.imgs[0], `${entry.title} · 音乐节时间表`);
      }
    });
  });
}


// ================= 首页微时间轴：底部 5 项实用功能（交通 / 安检 / 搭子 / 日历 / 地图） =================
let homeTimelineRecords = [];

function closeHomeTimelinePanels(exceptCard) {
  document.querySelectorAll('#home-upcoming-timeline .tl-quick-panel').forEach(panel => {
    if (exceptCard && panel.closest('.timeline-card') === exceptCard) return;
    panel.remove();
  });
  document.querySelectorAll('#home-upcoming-timeline [data-tl-action]').forEach(btn => {
    if (exceptCard && btn.closest('.timeline-card') === exceptCard) return;
    btn.classList.remove('is-active');
    btn.setAttribute('aria-expanded', 'false');
  });
}

function toggleHomeTimelinePanel(card, action, html) {
  const existing = card.querySelector('.tl-quick-panel');
  const sameAction = existing && existing.dataset.tlPanel === action;
  closeHomeTimelinePanels(card);
  const btn = card.querySelector(`[data-tl-action="${action}"]`);
  if (existing) existing.remove();
  if (sameAction) {
    if (btn) { btn.classList.remove('is-active'); btn.setAttribute('aria-expanded', 'false'); }
    return;
  }
  const holder = document.createElement('div');
  holder.className = 'tl-quick-panel';
  holder.dataset.tlPanel = action;
  holder.innerHTML = html;
  card.appendChild(holder);
  if (btn) { btn.classList.add('is-active'); btn.setAttribute('aria-expanded', 'true'); }
  if (action === 'security' && typeof hydrateSecurityVoteBlocks === 'function') {
    try { hydrateSecurityVoteBlocks(); } catch (e) { /* ignore */ }
  }
  if (action === 'map' && typeof bindShowMapMenuDismiss === 'function') bindShowMapMenuDismiss();
}

// 🎫 计划前往：首页微时间轴卡片右上角，与档案页共用同一份本机标记
function handleHomeTimelinePlan(idx, btn) {
  const rec = homeTimelineRecords[idx];
  if (!rec) return;
  const key = (typeof planShowKeyOf === 'function')
    ? planShowKeyOf(rec.cloudId, rec.venue || rec.city, rec.city, rec.date)
    : String(rec.cloudId);
  if (!key) {
    toastError('该场次暂无可用的场次标识');
    return;
  }
  if (typeof togglePlannedShowFromCard === 'function') {
    togglePlannedShowFromCard(btn, key);
  } else {
    const on = togglePlannedShow(key);
    if (btn) {
      btn.classList.toggle('is-active', on);
      btn.textContent = on ? '✓ 计划前往' : '🎫 计划前往';
    }
    showToast(on ? '已加入「计划前往」，不计入已观演' : '已取消「计划前往」');
  }
}

// 卡片正文的日期文本 = 日历提醒入口（与「档案」页完全一致，走同一个 exportShowICS）
function handleHomeTimelineDateClick(idx) {
  const rec = homeTimelineRecords[idx];
  if (!rec) return;
  if (rec.cloudId == null || rec.cloudId === '') {
    return toastError('该场次暂无可用的精确时间，无法生成日历');
  }
  try {
    exportShowICS(rec.cloudId);
  } catch (e) {
    toastError(`日历生成失败：${e.message}`);
  }
}

// 📄 详情浮窗：集中展示场次信息，并保留「📣 查看应援词」双入口
function openHomeTimelineDetail(idx) {
  const rec = homeTimelineRecords[idx];
  if (!rec) return;
  const esc = v => String(v == null ? '' : v).replace(/[<>]/g, '');
  const title = esc(rec.city || rec.title || '');
  const venue = esc(rec.venue || '');
  const date = esc(rec.date || '');
  if (typeof openShowFeatureModal !== 'function') return;
  closeHomeTimelinePanels();
  openShowFeatureModal({
    title: `📄 演出详情${title ? ` · ${title}` : ''}`,
    sub: [date, venue].filter(Boolean).join(' · '),
    html: `
      <div class="feature-text tl-detail-body">
        <p><strong>🗓️ 演出时间：</strong>${date || '待公布'}${rec.slot ? ` ${esc(rec.slot)}` : ''}</p>
        <p><strong>📍 演出场馆：</strong>${venue || '待公布'}</p>
        ${title ? `<p><strong>🎤 演出名称：</strong>${title}</p>` : ''}
      </div>
      <div class="tl-detail-actions">
        <button type="button" class="tour-action-btn tour-action-btn--mini" onclick="closeShowFeatureModal(); openChantDictModal()">📣 查看应援词</button>
        <button type="button" class="tour-action-btn tour-action-btn--mini" onclick="closeShowFeatureModal(); switchMainTab('shows')">🏛️ 在档案查看完整场次 ↗</button>
      </div>
    `
  });
}

function handleHomeTimelineAction(action, idx, btn) {
  const rec = homeTimelineRecords[idx];
  const card = btn.closest('.timeline-card');
  if (!rec || !card) return;
  const safeTitle = String(rec.city || rec.title || '').replace(/['"<>]/g, '');
  const safeVenue = String(rec.venue || rec.city || '').replace(/['"<>]/g, '');
  const esc = v => String(v == null ? '' : v).replace(/['"<>]/g, '');

  if (action === 'traffic') {
    const text = String(rec.transport || '暂无该场次的交通指南，可在「档案」中补充。').replace(/[<>]/g, '');
    closeHomeTimelinePanels();
    if (typeof openShowFeatureModal === 'function') {
      openShowFeatureModal({
        title: `🚇 场馆交通指南${safeVenue ? ` · ${safeVenue}` : ''}`,
        sub: [safeTitle, String(rec.date || '')].filter(Boolean).join(' · '),
        html: `<div class="feature-text">${text.replace(/\n/g, '<br />')}</div>`
      });
    }
    return;
  }

  if (action === 'travel') {
    if (typeof openTravelHelper === 'function') {
      openTravelHelper({ city: rec.city, venue: rec.venue, date: rec.date, title: rec.city });
    }
    return;
  }

  if (action === 'checkin') {
    if (typeof openCheckinHelper === 'function') {
      openCheckinHelper({ city: rec.city, venue: rec.venue, date: rec.date, title: rec.city });
    }
    return;
  }

  if (action === 'security') {
    // 直接复用档案页同款安检标签投票渲染：这里只放渲染宿主，
    // buildVenueExperienceDrawerHTML 返回的外层是 hidden 抽屉，塞进来会变空白框
    const showKey = (typeof buildShowKey === 'function')
      ? buildShowKey(rec.venue || rec.city, safeTitle)
      : `${rec.venue || rec.city}::${safeTitle}`;
    const safeKey = showKey.replace(/['"<>]/g, '');
    closeHomeTimelinePanels();
    if (typeof openShowFeatureModal === 'function') {
      openShowFeatureModal({
        title: `🛡️ 场馆安检体验${safeVenue ? ` · ${safeVenue}` : ''}`,
        sub: [safeTitle, String(rec.date || '')].filter(Boolean).join(' · '),
        html: `
          <div class="tl-quick-panel-inner tl-sec-panel">
            <div data-security-vote data-show-key="${safeKey}" data-venue="${safeVenue}">
              <div class="tl-sec-loading">⏳ 正在同步全场安检投票…</div>
            </div>
            <button type="button" class="tl-sec-more" onclick="switchMainTab('shows')">在「档案」查看完整安检记录 ↗</button>
          </div>`,
        onOpen: () => {
          if (typeof hydrateSecurityVoteBlocks === 'function') hydrateSecurityVoteBlocks();
        }
      });
    }
    return;
  }

  if (action === 'buddy') {
    closeHomeTimelinePanels();
    if (typeof switchMainTab === 'function') switchMainTab('shows');
    const cid = rec.cloudId;
    window.setTimeout(() => {
      const cardEl = cid != null ? document.querySelector(`[data-show-card="${String(cid)}"]`) : null;
      const trigger = cardEl ? cardEl.querySelector('[data-footer-tab="buddy"]') : null;
      if (trigger && typeof openCardFeatureModal === 'function') {
        const panel = document.querySelector(`[data-buddy-card="${String(cid)}"]`);
        if (panel) panel.dataset.ready = '0';
        openCardFeatureModal(trigger, 'buddy');
        return;
      }
      const panel = document.querySelector(`[data-buddy-card="${String(cid)}"]`);
      // 该场次不在当前档案列表里时，退化成提示浮窗，绝不再往卡片内部塞面板
      if (!panel) {
        if (typeof openShowFeatureModal === 'function') {
          openShowFeatureModal({
            title: `🤝 同场观演找搭子${safeVenue ? ` · ${safeVenue}` : ''}`,
            sub: [safeTitle, String(rec.date || '')].filter(Boolean).join(' · '),
            html: `<div class="feature-text">这场演出的档案还在同步，稍后可在「档案」页对应卡片里发布或查看搭子信息。</div>`
          });
        }
        return;
      }
      if (typeof openShowFeatureModal === 'function') {
        openShowFeatureModal({
          title: `🤝 同场观演找搭子 · ${safeTitle || safeVenue}`,
          sub: [safeVenue, String(rec.date || '')].filter(Boolean).join(' · '),
          panel: panel,
          onOpen: () => {
            window.__buddyActiveEventId = cid;
            if (typeof refreshBuddyPanel === 'function' && cid != null) {
              try { refreshBuddyPanel(String(cid)); } catch (e) { /* ignore */ }
            }
          }
        });
        return;
      }
      panel.classList.remove('hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof refreshBuddyPanel === 'function' && cid != null) {
        try { refreshBuddyPanel(String(cid)); } catch (e) { /* ignore */ }
      }
    }, 120);
    return;
  }

  if (action === 'calendar') {
    if (rec.cloudId != null && typeof exportShowICS === 'function') {
      try { exportShowICS(rec.cloudId); } catch (e) { console.warn('日历生成失败', e); }
    }
    return;
  }

  // 地图导航已收拢进「🚄 出行比价 → 🚇 同城交通」，不再单独出按钮
}
