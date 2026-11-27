// ================= 用户认证（Supabase 邮箱 OTP 无密码登录） =================
// 依赖 config.js 提供的 SUPABASE_URL / SUPABASE_ANON_KEY / ADMIN_EMAIL

const AUTH_STORAGE_KEY = 'onerland_auth_session_v1';
const ADMIN_TOKEN_STORAGE_KEY = 'onerland_admin_token_v1';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.access_token) return null;
    // 提前 60 秒视为过期，避免边界失败
    if (s.expires_at && Date.now() > (s.expires_at - 60) * 1000) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function isAdminEmail(email) {
  const list = String(typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 && list.includes((email || '').trim().toLowerCase());
}

// 管理员密码解锁态独立于邮箱会话：只保存服务端签发的短期令牌，不保存明文密码。
function getStoredAdminToken() {
  try {
    const raw = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (!raw) return '';
    const token = JSON.parse(raw);
    if (!token || !token.value) return '';
    if (!token.expires_at || token.expires_at * 1000 <= Date.now()) {
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      return '';
    }
    return token.value;
  } catch (e) {
    return '';
  }
}

function saveAdminToken(value, expiresAt) {
  const token = {
    value,
    expires_at: Number(expiresAt) || (Math.floor(Date.now() / 1000) + 12 * 3600)
  };
  localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, JSON.stringify(token));
  AppState.adminToken = token.value;
  AppState.adminTokenExpiresAt = token.expires_at;
  AppState.isAdminPasswordVerified = true;
}

function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  AppState.adminToken = '';
  AppState.adminTokenExpiresAt = 0;
  AppState.isAdminPasswordVerified = false;
}

function syncAdminUnlockState() {
  const token = getStoredAdminToken();
  AppState.adminToken = token;
  AppState.isAdminPasswordVerified = Boolean(token);
}

// 根据当前会话同步邮箱授权态、密码解锁态与界面
function syncAuthState() {
  const session = getStoredSession();
  const email = session && session.user ? session.user.email : '';
  AppState.authEmail = email || '';
  AppState.isAdmin = Boolean(email) && isAdminEmail(email);
  AppState.accessToken = session ? session.access_token : '';
  syncAdminUnlockState();

  // 顶部按钮：邮箱登录态优先展示，密码解锁态在没有邮箱时单独显示。
  const topBtn = document.getElementById('user-auth-btn');
  if (topBtn) {
    topBtn.textContent = email
      ? (AppState.isAdmin ? '👤 管理员' : `👤 ${email.split('@')[0]}`)
      : (AppState.isAdminPasswordVerified ? '🔓 已解锁' : '👤 登录');
  }

  // 弹窗内状态文案
  const statusEl = document.getElementById('auth-current-status');
  if (statusEl) {
    if (!email) {
      statusEl.textContent = AppState.isAdminPasswordVerified
        ? '管理员密码已解锁：当前可编辑内容（与邮箱登录态互不影响）。'
        : '未登录。输入邮箱获取 6 位验证码即可登录，无需密码；也可使用管理员密码独立解锁编辑权限。';
    } else if (AppState.isAdmin) {
      statusEl.textContent = `已登录：${email}（授权邮箱，可编辑演出与档案）`;
    } else if (AppState.isAdminPasswordVerified) {
      statusEl.textContent = `已登录：${email}（普通用户）；管理员密码已解锁，可编辑演出与档案。`;
    } else {
      statusEl.textContent = `已登录：${email}（普通用户，仅可浏览；也可用管理员密码解锁编辑权限）。`;
    }
  }

  // 登录态下隐藏邮箱输入，避免误操作
  const emailInput = document.getElementById('auth-email-input');
  if (emailInput) emailInput.disabled = Boolean(email);

  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof renderArchiveTimeline === 'function') renderArchiveTimeline();
  if (typeof updateAuthButtonUI === 'function') updateAuthButtonUI();
}

function openUserAuthModal() {
  const modal = document.getElementById('user-auth-modal');
  if (!modal) return;
  syncAuthState();
  document.getElementById('admin-unlock-modal')?.classList.add('hidden');
  modal.classList.remove('hidden');
}

function openAdminUnlockModal() {
  syncAuthState();
  document.getElementById('user-auth-modal')?.classList.add('hidden');
  const modal = document.getElementById('admin-unlock-modal');
  if (!modal) return;
  const input = document.getElementById('admin-password-input');
  if (input) input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input?.focus(), 50);
}

async function verifyAdminPassword() {
  const input = document.getElementById('admin-password-input');
  const password = input ? input.value : '';
  if (!password) return alert('请输入管理员密码');

  const btn = document.querySelector('#admin-unlock-modal button[onclick="verifyAdminPassword()"]');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }

  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verifyPassword', password })
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || !data.ok || !data.token) {
      throw new Error((data && (data.error || data.detail)) || `HTTP ${res.status}`);
    }
    saveAdminToken(data.token, data.expires_at);
    if (input) input.value = '';
    document.getElementById('admin-unlock-modal')?.classList.add('hidden');
    syncAuthState();
    openHiddenAdminDrawer();
  } catch (e) {
    alert(`管理员密码验证失败：${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || '验证解锁'; }
  }
}

function lockAdminPassword() {
  if (!getStoredAdminToken()) {
    alert('当前没有已解锁的管理员密码状态。');
    return;
  }
  if (!confirm('确认锁定管理员密码解锁态？授权邮箱登录态不会受影响。')) return;
  clearAdminToken();
  document.getElementById('hidden-admin-modal')?.classList.add('hidden');
  document.getElementById('admin-unlock-modal')?.classList.add('hidden');
  syncAuthState();
  alert('已锁定管理员密码解锁态');
}

// 管理接口统一请求头：邮箱会话与管理员密码令牌互相独立，可同时携带。
function getAdminRequestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const session = getStoredSession();
  if (session && session.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const adminToken = getStoredAdminToken();
  if (adminToken) {
    headers['X-Admin-Token'] = adminToken;
  }
  return headers;
}

async function sendEmailOTP() {
  const input = document.getElementById('auth-email-input');
  const email = (input ? input.value : '').trim().toLowerCase();
  if (!email) return alert('请先输入邮箱地址');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert('邮箱格式不正确');

  const btn = document.querySelector('#user-auth-modal button[onclick="sendEmailOTP()"]');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, create_user: true })
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.msg || err.error_description || err.message || detail;
      } catch (e) { /* 忽略非 JSON 响应 */ }
      throw new Error(detail);
    }
    AppState.pendingAuthEmail = email;
    alert(`验证码已发送至 ${email}，请查收邮箱（注意垃圾箱）。`);
  } catch (e) {
    alert(`发送失败：${e.message}\n\n若持续失败，请确认 Supabase 已开启 Email OTP 并配置了发信服务。`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || '发验证码'; }
  }
}

async function verifyEmailOTP() {
  const emailInput = document.getElementById('auth-email-input');
  const otpInput = document.getElementById('auth-otp-input');
  const email = (AppState.pendingAuthEmail || (emailInput ? emailInput.value : '')).trim().toLowerCase();
  const token = (otpInput ? otpInput.value : '').trim();

  if (!email) return alert('请先输入邮箱并获取验证码');
  if (!token) return alert('请输入收到的验证码');

  const btn = document.querySelector('#user-auth-modal button[onclick="verifyEmailOTP()"]');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, token, type: 'email' })
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.msg || err.error_description || err.message || detail;
      } catch (e) { /* 忽略 */ }
      throw new Error(detail);
    }
    const data = await res.json();
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
      user: data.user || { email }
    });
    AppState.pendingAuthEmail = '';
    if (otpInput) otpInput.value = '';
    syncAuthState();
    const modal = document.getElementById('user-auth-modal');
    if (modal) modal.classList.add('hidden');
    alert(isAdminEmail(email) ? '管理员登录成功' : '登录成功');
  } catch (e) {
    alert(`验证失败：${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || '验证登录'; }
  }
}

function logoutEmailUser() {
  if (!confirm('确认退出当前邮箱？')) return;
  saveSession(null);
  AppState.pendingAuthEmail = '';
  AppState.authEmail = '';
  AppState.accessToken = '';
  AppState.isAdmin = false;
  // 退出邮箱不影响已独立验证的管理员密码解锁态。
  const emailInput = document.getElementById('auth-email-input');
  if (emailInput) { emailInput.disabled = false; emailInput.value = ''; }
  const otpInput = document.getElementById('auth-otp-input');
  if (otpInput) otpInput.value = '';
  syncAuthState();
  alert(AppState.isAdminPasswordVerified
    ? '已退出邮箱登录；管理员密码解锁态仍然有效'
    : '已退出登录');
}

// 读取登录态用的请求头（写操作请走服务端校验，见 functions/rpc）
function getAuthHeaders() {
  const session = getStoredSession();
  if (!session) return SB_HEADERS;
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// 隐藏管理员入口：连点页面标题 7 次
let secretTapCount = 0;
let secretTapTimer = null;

function handleSecretTitleTap() {
  secretTapCount += 1;
  if (secretTapTimer) clearTimeout(secretTapTimer);
  secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 1500);

  if (secretTapCount >= 7) {
    secretTapCount = 0;
    clearTimeout(secretTapTimer);
    openHiddenAdminDrawer();
  }
}

function openHiddenAdminDrawer() {
  const modal = document.getElementById('hidden-admin-modal');
  if (!modal) return;
  syncAuthState();
  if (!canEditContent()) {
    openAdminUnlockModal();
    return;
  }
  modal.classList.remove('hidden');
  if (typeof renderAdminTodoQueue === 'function') renderAdminTodoQueue();
  if (typeof renderAdminScheduleThumbs === 'function') renderAdminScheduleThumbs();
  if (typeof updateAiKeyStatusUI === 'function') updateAiKeyStatusUI();
  // 打开管理台时自动拉一次待复核票根
  if (typeof loadProofReviewQueue === 'function') loadProofReviewQueue('pending');
}

// 启动时恢复登录态
document.addEventListener('DOMContentLoaded', () => {
  syncAuthState();
});
