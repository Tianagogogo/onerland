// ================= 💬 帮助与反馈 / 📬 管理员反馈收件箱 =================
// 普通访客：只能匿名提交（RLS 仅允许 INSERT），前端不具备任何读取他人留言的能力。
// 管理员：密码解锁后通过安全 RPC（SECURITY DEFINER + 口令校验）拉取 / 删除留言。

const FEEDBACK_CATEGORIES = [
  { id: 'bug', label: '🐞 问题报错' },
  { id: 'idea', label: '💡 功能建议' },
  { id: 'info', label: '🎤 场次/信息纠错' }
];
const FEEDBACK_NICK_KEY = 'onerland_feedback_nick_v1';
const FEEDBACK_LAST_AT_KEY = 'onerland_feedback_last_at_v1';
const FEEDBACK_UNREAD_KEY = 'onerland_feedback_unread_v1';
const FEEDBACK_THROTTLE_MS = 30 * 1000;
const FEEDBACK_MAX_LEN = 500;

let feedbackState = { category: 'bug', submitting: false, inboxLoading: false, items: [] };

// ❓ 使用帮助配置：按「首页 / 档案 / 足迹 / 身份与隐私」四大板块组织，日后增删改只改这里
// points 支持两种写法：字符串，或 { t: '加粗小标题', d: '详细说明' }
const HELP_GUIDE_ITEMS = [
  {
    id: 'home',
    icon: '🏠',
    title: '首页',
    subtitle: '时光提醒、纪念日与近期微时间轴',
    defaultOpen: true,
    points: [
      { t: '✨ 自定义时光提醒', d: '点击顶部「昵称 / 对象 / 动作词」可随时修改文案；切换主推对象（ONER / 岳岳 / 木子洋 / 灵超）后，会同步联动足迹页的默认粉籍与应援色主题。' },
      { t: '⏳ 见面与演出倒计时', d: '为未来演出点亮 `🎫 计划前往` 后，副标题自动切换为「距与 X 下次见面还有 X 天」；未点亮时客观显示「距 X 下一场演出还有 X 天」。' },
      { t: '🎂 关键纪念日管理', d: '底部可查看官方内置纪念日（支持单独删除或一键恢复全部），也可新增年度循环的自定义纪念日，统一显示「距 xxxxxx X 天」。' },
      { t: '🎫 纪念票根生成器', d: '一键生成带场次、座位与专属应援色的纪念票根图片，并支持同步写入纪念日列表。' },
      { t: '📅 近期演出微时间轴', d: '按距现实时间由近到远排列近期场次；直接点击卡片上的演出日期文字即可下载 `.ics` 导入手机 / 电脑日历，底部集成「交通、出行比价、地图、安检体验、找搭子」五个快捷入口。' }
    ]
  },
  {
    id: 'shows',
    icon: '🏛️',
    title: '档案',
    subtitle: '全量演出检索、专题聚合与参演指南',
    defaultOpen: false,
    points: [
      { t: '🔍 多维筛选与专题聚合', d: '支持按艺人 / 成员筛选，也可按巡演专题（「极尽声色」、ChillParty、无限未来、「燃点」）或「音乐节合集」一键聚合查看全部历史与待开演场次。' },
      { t: '🎫 计划前往与历史打卡', d: '未来场次可标记 `🎫 计划前往`（联动首页见面倒计时）；已落幕场次点击 `+ 足迹` 计入线下见面总场次。' },
      { t: '💺 座位图与视野参考', d: '场馆卡片提供「查看座位图」与「视野 live ↗」外链跳转，方便选座前查看不同区域看主舞台的真实视角。' },
      { t: '🚄 出行比价与同城导航', d: '点击 `🚄 出行比价` 可选出发城市（本地记忆）与往返日期，展开「机票 / 高铁 / 同城交通 / 酒店」四大分类直达正规平台（手机浏览器打开可唤醒对应 App），并支持一键复制行程关键词。' },
      { t: '🛡️ 安检体验与 🤝 找搭子', d: '免票根即可参与安检严格度与长焦 / 翻包标签投票（同设备限 1 票，再点可取消），并记录仅本机可见的私人安检笔记；找搭子须双方互相申请并确认同意后才会解锁展示联系方式。' }
    ]
  },
  {
    id: 'footprint',
    icon: '🎫',
    title: '足迹',
    subtitle: '个人观演统计、粉籍同步与搭子纪念日',
    defaultOpen: false,
    points: [
      { t: '📊 线下见面总览与时间轴', d: '自动汇总你点亮的所有历史观演场次，完整记录每一场线下奔赴的日期、城市与场馆。' },
      { t: '🎨 粉籍与应援色联动', d: '默认与首页「时光提醒」选择的人物及应援色保持一致，也支持在足迹页内独立切换粉籍；当两端设置不一致时，系统会弹出提醒供一键统一。' },
      { t: '🤝 同行搭子与 🎂 生成搭子纪念日', d: '添加或编辑足迹时可关联本机同场搭子昵称（仅存本机，不上传任何隐私联系方式）；已关联搭子的足迹支持一键 `🎂 生成搭子纪念日`，自动同步至首页时光提醒底部的倒计时。' }
    ]
  },
  {
    id: 'privacy',
    icon: '🔒',
    title: '身份与隐私',
    subtitle: '数据安全与留言反馈',
    defaultOpen: false,
    points: [
      { t: '👤 免注册本地存储', d: '全站无需注册账号，昵称、足迹、计划前往、私人安检笔记及搭子备注均保存在当前浏览器的本地存储（`localStorage`）中；清理浏览器缓存或更换设备前请留意保留数据。' },
      { t: '💬 隐私留言反馈', d: '任何使用问题、功能建议或演出场次纠错都可通过下方表单提交；所有反馈内容仅管理员解锁后可见，访客之间互不可见。' }
    ]
  }
];

function renderHelpGuide() {
  const box = document.getElementById('feedback-help-guide');
  if (!box) return;
  const fmt = (text) => escapeFeedbackText(text).replace(/`([^`]+)`/g, '<code class="help-guide-code">$1</code>');
  box.innerHTML = HELP_GUIDE_ITEMS.map((item, idx) => {
    const open = item.defaultOpen || idx === 0;
    const points = (item.points || []).map(pt => {
      if (pt && typeof pt === 'object') {
        return `<li><strong class="help-guide-pt-title">${fmt(pt.t || '')}</strong><span class="help-guide-pt-sep">：</span><span class="help-guide-pt-desc">${fmt(pt.d || '')}</span></li>`;
      }
      return `<li><span class="help-guide-pt-desc">${fmt(pt || '')}</span></li>`;
    }).join('');
    return `
      <details class="help-guide-item"${open ? ' open' : ''}>
        <summary class="help-guide-summary">
          <span class="help-guide-icon">${escapeFeedbackText(item.icon)}</span>
          <span class="help-guide-title">${escapeFeedbackText(item.title)}</span>
          ${item.subtitle ? `<span class="help-guide-sub">${escapeFeedbackText(item.subtitle)}</span>` : ''}
        </summary>
        <ul class="help-guide-points">${points}</ul>
      </details>
    `;
  }).join('');
}

function feedbackCategoryLabel(id) {
  const hit = FEEDBACK_CATEGORIES.find(c => c.id === id);
  return hit ? hit.label : '💬 留言';
}

function getSavedFeedbackNick() {
  try { return String(localStorage.getItem(FEEDBACK_NICK_KEY) || ''); } catch (e) { return ''; }
}

function saveFeedbackNick(nick) {
  try {
    const v = String(nick || '').trim().slice(0, 30);
    if (v) localStorage.setItem(FEEDBACK_NICK_KEY, v);
    else localStorage.removeItem(FEEDBACK_NICK_KEY);
  } catch (e) { /* ignore */ }
}

// 是否已解锁管理员密码（复用站内统一标识）
function isFeedbackAdminUnlocked() {
  return typeof isSecurityAdminUnlocked === 'function'
    ? isSecurityAdminUnlocked()
    : Boolean(typeof AppState !== 'undefined' && (AppState.isAdminPasswordVerified || AppState.isAdmin));
}

// 页脚入口：📬 按钮与未读数角标只在管理员解锁后出现
function refreshFeedbackEntryPoints() {
  const inboxBtn = document.getElementById('footer-feedback-inbox-btn');
  if (!inboxBtn) return;
  const unlocked = isFeedbackAdminUnlocked();
  inboxBtn.classList.toggle('hidden', !unlocked);
  const badge = document.getElementById('footer-feedback-badge');
  if (badge) {
    let unread = 0;
    try { unread = Number(localStorage.getItem(FEEDBACK_UNREAD_KEY) || 0) || 0; } catch (e) { unread = 0; }
    if (unlocked && unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

function setFeedbackUnreadCache(n) {
  try { localStorage.setItem(FEEDBACK_UNREAD_KEY, String(Math.max(0, Number(n) || 0))); } catch (e) { /* ignore */ }
  refreshFeedbackEntryPoints();
}

function setFeedbackCategory(id) {
  feedbackState.category = FEEDBACK_CATEGORIES.some(c => c.id === id) ? id : 'bug';
  document.querySelectorAll('[data-fb-cat]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.fbCat === feedbackState.category);
    btn.setAttribute('aria-pressed', btn.dataset.fbCat === feedbackState.category ? 'true' : 'false');
  });
}

function updateFeedbackCounter() {
  const ta = document.getElementById('feedback-content');
  const counter = document.getElementById('feedback-counter');
  if (!ta || !counter) return;
  const len = String(ta.value || '').length;
  counter.textContent = `${len}/${FEEDBACK_MAX_LEN}`;
  counter.classList.toggle('is-over', len > FEEDBACK_MAX_LEN);
}

function openFeedbackModal() {
  const modal = document.getElementById('feedback-modal');
  if (!modal) return;
  const ta = document.getElementById('feedback-content');
  if (ta) ta.value = '';
  const nick = document.getElementById('feedback-nick');
  if (nick) nick.value = getSavedFeedbackNick();
  renderHelpGuide();
  setFeedbackCategory(feedbackState.category);
  updateFeedbackCounter();
  modal.classList.remove('hidden');
  setTimeout(() => ta && ta.focus(), 40);
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal')?.classList.add('hidden');
}

// 提交匿名反馈：纯 INSERT，前端不会也不应拿到任何 SELECT 能力
async function submitSiteFeedback() {
  if (feedbackState.submitting) return;
  const ta = document.getElementById('feedback-content');
  const nickEl = document.getElementById('feedback-nick');
  const content = String(ta && ta.value || '').trim();
  const nickname = String(nickEl && nickEl.value || '').trim().slice(0, 30);

  if (!content) return toastError('请先写点留言内容');
  if (content.length > FEEDBACK_MAX_LEN) return toastError(`留言最多 ${FEEDBACK_MAX_LEN} 字，请精简后再提交`);

  let lastAt = 0;
  try { lastAt = Number(localStorage.getItem(FEEDBACK_LAST_AT_KEY) || 0) || 0; } catch (e) { lastAt = 0; }
  const waitMs = FEEDBACK_THROTTLE_MS - (Date.now() - lastAt);
  if (waitMs > 0) return toastError(`提交太频繁，请 ${Math.ceil(waitMs / 1000)} 秒后再试`);

  const btn = document.getElementById('feedback-submit-btn');
  const oldText = btn ? btn.textContent : '';
  feedbackState.submitting = true;
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

  try {
    if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) throw new Error('未配置 Supabase');
    const payload = {
      category: feedbackState.category,
      content,
      nickname: nickname || null,
      page_url: String(location.pathname + location.hash).slice(0, 200),
      status: 'new'
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_feedback`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let raw = '';
      try { raw = await res.text(); } catch (e) { raw = ''; }
      let msg = `HTTP ${res.status}`;
      try {
        const info = raw ? JSON.parse(raw) : null;
        if (info && (info.message || info.details || info.hint)) {
          msg = [info.message, info.details, info.hint].filter(Boolean).join(' | ');
        }
      } catch (e) { /* 非 JSON 错误体 */ }
      throw new Error(msg);
    }
    try { localStorage.setItem(FEEDBACK_LAST_AT_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    saveFeedbackNick(nickname);
    if (ta) ta.value = '';
    updateFeedbackCounter();
    closeFeedbackModal();
    showToast('感谢反馈，管理员已收到！');
    showFeedbackThanksModal(nickname);
    loadPublicThanksList();
  } catch (e) {
    toastError(`提交失败：${e && e.message ? e.message : '网络异常'}（若未建表，请先执行 site_feedback 建表 SQL）`);
  } finally {
    feedbackState.submitting = false;
    if (btn) { btn.disabled = false; btn.textContent = oldText || '提交反馈'; }
  }
}

// ---------- 管理员：反馈收件箱 ----------
function getFeedbackAdminKeyFromMemory() {
  return typeof getSecurityAdminKey === 'function' ? String(getSecurityAdminKey() || '').trim() : '';
}

function askFeedbackAdminKey() {
  const cached = getFeedbackAdminKeyFromMemory();
  if (cached) return cached;
  let typed = '';
  try { typed = window.prompt('请输入管理员密码以查看反馈箱：') || ''; } catch (e) { typed = ''; }
  return String(typed).trim();
}

async function feedbackAdminRpc(fnName, params) {
  if (typeof securityRpc === 'function') return securityRpc(fnName, params);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  if (!res.ok) {
    let raw = '';
    try { raw = await res.text(); } catch (e) { raw = ''; }
    let info = null;
    try { info = raw ? JSON.parse(raw) : null; } catch (e) { info = null; }
    const detail = info && (info.message || info.details || info.hint);
    throw new Error(`RPC ${fnName} HTTP ${res.status}${detail ? `：${detail}` : ''}`);
  }
  return res.json().catch(() => null);
}

function escapeFeedbackText(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatFeedbackTime(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v || '');
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openAdminFeedbackInbox() {
  if (!isFeedbackAdminUnlocked()) return toastError('请先用管理员密码解锁');
  const modal = document.getElementById('feedback-inbox-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await loadAdminFeedbacks();
}

async function loadAdminFeedbacks() {
  const box = document.getElementById('feedback-inbox-list');
  if (!box) return;
  if (feedbackState.inboxLoading) return;

  const adminKey = askFeedbackAdminKey();
  if (!adminKey) {
    box.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">未输入管理员密码，已取消读取。</div>`;
    return;
  }

  feedbackState.inboxLoading = true;
  box.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">正在读取…</div>`;
  try {
    const data = await feedbackAdminRpc('admin_get_feedbacks', { p_admin_key: adminKey });
    const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    feedbackState.items = items;
    if (typeof setSecurityAdminKey === 'function') setSecurityAdminKey(adminKey);
    setFeedbackUnreadCache(items.filter(it => String(it.status || 'new') !== 'read').length);
    renderAdminFeedbackList(items);
  } catch (e) {
    box.innerHTML = `<div class="text-xs text-rose-500 py-4 text-center leading-relaxed">${escapeFeedbackText(e && e.message ? e.message : '读取失败')}</div>`;
  } finally {
    feedbackState.inboxLoading = false;
  }
}

function renderAdminFeedbackList(items) {
  const box = document.getElementById('feedback-inbox-list');
  if (!box) return;
  if (!items || !items.length) {
    box.innerHTML = `<div class="text-xs text-slate-400 py-6 text-center">暂时没有新留言，辛苦啦 ✨</div>`;
    return;
  }
  box.innerHTML = items.map(item => {
    const id = String(item.id || '');
    const isRead = String(item.status || 'new') === 'read';
    const isPublic = item.is_public !== false;
    return `
      <div class="feedback-inbox-item ${isRead ? 'is-read' : ''}">
        <div class="feedback-inbox-head">
          <span class="feedback-inbox-cat">${escapeFeedbackText(feedbackCategoryLabel(item.category))}</span>
          <span class="feedback-inbox-time">${escapeFeedbackText(formatFeedbackTime(item.created_at))}</span>
        </div>
        <div class="feedback-inbox-body">${escapeFeedbackText(item.content)}</div>
        <div class="feedback-inbox-meta">
          <span>🙋 ${escapeFeedbackText(item.nickname || '匿名访客')}</span>
          ${item.page_url ? `<span>🔗 ${escapeFeedbackText(item.page_url)}</span>` : ''}
          <span>${isRead ? '✓ 已读' : '🆕 待处理'}</span>
        </div>
        <div class="feedback-inbox-actions">
          ${isRead ? '' : `<button type="button" class="tour-action-btn tour-action-btn--mini" onclick="markFeedbackRead('${id}')">✓ 已读/处理</button>`}
          <button type="button" class="fb-public-toggle ${isPublic ? '' : 'is-off'}" title="仅在公开鸣谢名单里隐藏该昵称，不删除留言" onclick="toggleFeedbackPublic('${id}', ${isPublic ? 'false' : 'true'})">🙈 ${isPublic ? '移出公开鸣谢' : '恢复公开鸣谢'}</button>
          <button type="button" class="feedback-del-btn" onclick="deleteFeedbackAsAdmin('${id}')">🗑️ 删除</button>
        </div>
      </div>
    `;
  }).join('');
}

async function markFeedbackRead(id) {
  const adminKey = getFeedbackAdminKeyFromMemory();
  if (!adminKey) return toastError('管理员口令已过期，请重新打开反馈箱');
  try {
    await feedbackAdminRpc('admin_mark_feedback_read', { p_id: String(id), p_admin_key: adminKey });
    showToast('已标记为处理完成');
    await loadAdminFeedbacks();
  } catch (e) {
    toastError(`操作失败：${e && e.message ? e.message : '网络异常'}`);
  }
}

async function deleteFeedbackAsAdmin(id) {
  if (!window.confirm('确定要删除这条反馈吗？此操作不可恢复。')) return;
  const adminKey = getFeedbackAdminKeyFromMemory();
  if (!adminKey) return toastError('管理员口令已过期，请重新打开反馈箱');
  try {
    await feedbackAdminRpc('admin_delete_feedback', { p_id: String(id), p_admin_key: adminKey });
    showToast('已删除该条反馈');
    await loadAdminFeedbacks();
  } catch (e) {
    toastError(`删除失败：${e && e.message ? e.message : '网络异常'}`);
  }
}

// ---------- 💌 提交成功专属致谢弹窗（冷银白液态金属，3.5 秒后自动淡出） ----------
let __feedbackThanksTimer = null;
function closeFeedbackThanksModal() {
  const el = document.getElementById('feedback-thanks-modal');
  if (!el) return;
  el.classList.add('is-hiding');
  clearTimeout(__feedbackThanksTimer);
  setTimeout(() => el.remove(), 260);
}

function showFeedbackThanksModal(nickname) {
  document.getElementById('feedback-thanks-modal')?.remove();
  clearTimeout(__feedbackThanksTimer);
  const name = String(nickname || '').trim().slice(0, 30);
  const text = name
    ? `感谢「${escapeFeedbackText(name)}」的反馈与陪伴！你的留言已安全送达管理员，名字已加入共建感谢名单 ✨`
    : '感谢你的反馈与陪伴！你的留言已安全送达管理员 ✨';
  const modal = document.createElement('div');
  modal.id = 'feedback-thanks-modal';
  modal.className = 'fb-thanks-overlay';
  modal.innerHTML = `
    <div class="fb-thanks-card" role="dialog" aria-modal="true" aria-label="感谢支持">
      <button type="button" class="fb-thanks-close" aria-label="关闭" data-thanks-close>✕</button>
      <div class="fb-thanks-icon">💌</div>
      <div class="fb-thanks-title">感谢支持</div>
      <p class="fb-thanks-text">${text}</p>
      <div class="fb-thanks-foot">反馈正文仅管理员可见 · 访客之间互不可见</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', ev => {
    if (ev.target === modal || ev.target.closest('[data-thanks-close]')) closeFeedbackThanksModal();
  });
  __feedbackThanksTimer = setTimeout(closeFeedbackThanksModal, 3500);
}

// ---------- ✨ 共建感谢名单（公开只读 RPC，仅昵称/分类/时间，绝无正文） ----------
function thanksCategoryLabel(cat) {
  return feedbackCategoryLabel(cat);
}

function renderPublicThanksWall(items, anonCount) {
  const box = document.getElementById('feedback-thanks-wall');
  if (!box) return;
  const list = Array.isArray(items) ? items : [];
  const anon = Math.max(0, Number(anonCount) || 0);
  if (!list.length && !anon) {
    box.innerHTML = `<div class="fb-thanks-empty">还没有公开鸣谢记录，欢迎成为第一位共建伙伴 ✨</div>`;
    return;
  }
  const chips = list.slice(0, 30).map(it => `
    <span class="fb-thanks-chip" title="${escapeFeedbackText(it.created_at || '')}">
      @${escapeFeedbackText(it.nickname || '')}<span class="fb-thanks-chip-sep">·</span>${escapeFeedbackText(thanksCategoryLabel(it.category))}
    </span>
  `).join('');
  box.innerHTML = `
    <div class="fb-thanks-chips">${chips || '<span class="fb-thanks-empty">暂无可展示的公开昵称</span>'}</div>
    ${anon > 0 ? `<div class="fb-thanks-anon">以及 ${anon} 位匿名伙伴的暖心建议</div>` : ''}
  `;
}

// RPC 返回结构兼容解析：后端可能返回 直接数组 / {items} / {contributors} / {data}
function pickThanksPayload(data) {
  if (Array.isArray(data)) return { items: data, anonCount: 0 };
  if (!data || typeof data !== 'object') return { items: [], anonCount: 0 };
  const candidates = [data.items, data.contributors, data.data, data.list, data.thanks, data.rows];
  const items = candidates.find(v => Array.isArray(v)) || [];
  const anonRaw = data.anon_count != null ? data.anon_count
    : data.anonCount != null ? data.anonCount
    : data.anonymous_count != null ? data.anonymous_count : 0;
  return { items, anonCount: Number(anonRaw) || 0 };
}

// 依次尝试：直连 Supabase → 同源 /sb 反代（国内网络兜底）
function thanksRpcUrls() {
  const urls = [];
  if (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) {
    urls.push(`${SUPABASE_URL}/rest/v1/rpc/get_public_thanks_list`);
  }
  urls.push('/sb/rest/v1/rpc/get_public_thanks_list');
  return urls.filter((u, i) => urls.indexOf(u) === i);
}

async function fetchThanksRpc(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let detail = '';
    try { const j = JSON.parse(raw); detail = j.message || j.hint || j.error || ''; } catch (e) { detail = String(raw || '').slice(0, 120); }
    throw new Error(`HTTP ${res.status}${detail ? ' · ' + detail : ''}`);
  }
  return res.json();
}

async function loadPublicThanksList() {
  const box = document.getElementById('feedback-thanks-wall');
  if (!box) return;
  if (!box.dataset.loaded) box.innerHTML = '<div class="fb-thanks-empty">正在加载鸣谢名单…</div>';
  const errors = [];
  for (const url of thanksRpcUrls()) {
    try {
      const data = await fetchThanksRpc(url);
      const payload = pickThanksPayload(data);
      // 昵称去重（保留最新一条的分类），按时间倒序，最多 30 位
      const seen = new Map();
      payload.items.forEach(it => {
        const name = String((it && it.nickname) || '').trim();
        if (!name) return;
        const ts = Date.parse((it && it.created_at) || '') || 0;
        const prev = seen.get(name);
        if (!prev || ts >= prev.ts) seen.set(name, { nickname: name, category: it.category, created_at: it.created_at, ts });
      });
      const list = [...seen.values()].sort((a, b) => b.ts - a.ts);
      renderPublicThanksWall(list, payload.anonCount);
      box.dataset.loaded = '1';
      return;
    } catch (e) {
      errors.push(`${new URL(url, location.href).host}：${(e && e.message) || '网络异常'}`);
    }
  }
  box.innerHTML = `<div class="fb-thanks-empty">鸣谢名单暂不可用（${escapeFeedbackText(errors.join('；') || '未知错误')}）</div>`;
  box.dataset.loaded = '';
}

// 管理员：把某条反馈的昵称移出 / 恢复公开鸣谢
async function toggleFeedbackPublic(id, isPublic) {
  const adminKey = getFeedbackAdminKeyFromMemory();
  if (!adminKey) return toastError('管理员口令已过期，请重新打开反馈箱');
  try {
    await feedbackAdminRpc('admin_toggle_feedback_public', {
      p_id: String(id),
      p_admin_key: adminKey,
      p_is_public: Boolean(isPublic)
    });
    showToast(isPublic ? '已恢复公开鸣谢' : '已移出公开鸣谢名单');
    await loadAdminFeedbacks();
    loadPublicThanksList();
  } catch (e) {
    toastError(`操作失败：${e && e.message ? e.message : '网络异常'}`);
  }
}


window.openFeedbackModal = openFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.submitSiteFeedback = submitSiteFeedback;
window.setFeedbackCategory = setFeedbackCategory;
window.updateFeedbackCounter = updateFeedbackCounter;
window.openAdminFeedbackInbox = openAdminFeedbackInbox;
window.loadAdminFeedbacks = loadAdminFeedbacks;
window.markFeedbackRead = markFeedbackRead;
window.deleteFeedbackAsAdmin = deleteFeedbackAsAdmin;
window.refreshFeedbackEntryPoints = refreshFeedbackEntryPoints;
window.renderHelpGuide = renderHelpGuide;
window.showFeedbackThanksModal = showFeedbackThanksModal;
window.closeFeedbackThanksModal = closeFeedbackThanksModal;
window.loadPublicThanksList = loadPublicThanksList;
window.toggleFeedbackPublic = toggleFeedbackPublic;

document.addEventListener('DOMContentLoaded', () => {
  renderHelpGuide();
  loadPublicThanksList();
  refreshFeedbackEntryPoints();
  updateFeedbackCounter();
});
