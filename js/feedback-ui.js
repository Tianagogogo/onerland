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

// ❓ 使用帮助配置：日后增删改功能说明只改这里即可
const HELP_GUIDE_ITEMS = [
  {
    id: 'anniversary',
    icon: '✨',
    title: '时光提醒与纪念日',
    defaultOpen: true,
    points: [
      '点击顶部「昵称 / 对象 / 动作词」即可自定义显示文案与关联对象。',
      '为未来场次点亮 `🎫 计划前往` 后，顶部倒计时自动改为「距下次见面还有 X 天」（不计入已观演场次）。',
      '支持管理内置官方纪念日、新增自定义纪念日，并生成纪念票根留作收藏。'
    ]
  },
  {
    id: 'calendar-travel',
    icon: '📅',
    title: '演出日历与出行比价',
    defaultOpen: true,
    points: [
      '点击卡片上的演出日期，可一键把该场演出导入手机 / 电脑日历并设提醒。',
      '点击 `🚄 出行比价`：先选出发城市与往返日期，再直达机票、高铁、场馆路线与周边酒店查询。',
      '手机自带浏览器打开可自动拉起对应 App；微信内请点右上角「在默认浏览器打开」。'
    ]
  },
  {
    id: 'security',
    icon: '🛡️',
    title: '演出安检体验与私人笔记',
    defaultOpen: false,
    points: [
      '无需上传票根即可参与安检标签投票（安检严格 / 安检宽松 / 查相机长焦 / 翻包细致 / 过检很快）。',
      '同一设备始终只算 1 票，再点一次可取消；换浏览器或设备会自动合并去重。',
      '下方「我的私人安检笔记」仅存本机、不公开，散场次日起自动归档到「场馆体验」与「我的足迹」。'
    ]
  },
  {
    id: 'buddy',
    icon: '🤝',
    title: '找搭子与双向同意解锁',
    defaultOpen: false,
    points: [
      '在任意场次发布「找搭子」意向（昵称 + 简短备注，联系方式可填但不公开）。',
      '双方互相点击申请并确认同意后，才会展示彼此联系方式，避免被陌生人直接查看。',
      '严禁填写手机号、身份证号或转账链接；线下见面请核对票根并注意安全。'
    ]
  },
  {
    id: 'footprint',
    icon: '🎫',
    title: '我的足迹与搭子纪念日',
    defaultOpen: false,
    points: [
      '历史场次点击 `+ 足迹` 即可点亮并累计「已点亮线下 X 面」见面次数。',
      '足迹里可记录本机「🤝 同行搭子昵称」，并支持从已互换联系方式的搭子中一键点选填入。',
      '填写搭子后可点 `🎂 生成搭子纪念日`，自动同步到首页「✨ 时光提醒」的倒计时栏。'
    ]
  },
  {
    id: 'local-data',
    icon: '🔒',
    title: '免注册与本机数据存储',
    defaultOpen: false,
    points: [
      '全站免注册即可浏览与使用；个人足迹、计划前往、私人笔记、搭子备注、纪念日设置都只存在当前浏览器。',
      '清理浏览器缓存 / 数据、换浏览器或换设备后，这些记录不会自动带过去，请提前备份（导出备份）。',
      '安检投票、找搭子等公共数据会匿名上云；私人笔记与搭子备注绝不上传。'
    ]
  }
];

function renderHelpGuide() {
  const box = document.getElementById('feedback-help-guide');
  if (!box) return;
  box.innerHTML = HELP_GUIDE_ITEMS.map((item, idx) => {
    const open = item.defaultOpen || idx < 2;
    const pts = (item.points || []).map(t => `<li>${escapeFeedbackText(t).replace(/`([^`]+)`/g, '<code class="help-guide-code">$1</code>')}</li>`).join('');
    return `
      <details class="help-guide-item"${open ? ' open' : ''}>
        <summary class="help-guide-summary"><span class="help-guide-icon">${escapeFeedbackText(item.icon)}</span><span class="help-guide-title">${escapeFeedbackText(item.title)}</span></summary>
        <ul class="help-guide-points">${pts}</ul>
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

document.addEventListener('DOMContentLoaded', () => {
  renderHelpGuide();
  refreshFeedbackEntryPoints();
  updateFeedbackCounter();
});
