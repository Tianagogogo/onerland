// ================= 用户认证（Supabase 邮箱 OTP 无密码登录） =================
// 依赖 config.js 提供的 SUPABASE_URL / SUPABASE_ANON_KEY / ADMIN_EMAIL

const AUTH_STORAGE_KEY = 'onerland_auth_session_v1';

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
  const adminEmail = (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '').trim().toLowerCase();
  if (!adminEmail) return false;
  return (email || '').trim().toLowerCase() === adminEmail;
}

// 根据当前会话同步 isAdmin 与界面
function syncAuthState() {
  const session = getStoredSession();
  const email = session && session.user ? session.user.email : '';
  AppState.authEmail = email || '';
  AppState.isAdmin = Boolean(email) && isAdminEmail(email);
  AppState.accessToken = session ? session.access_token : '';

  // 顶部按钮
  const topBtn = document.getElementById('user-auth-btn');
  if (topBtn) {
    topBtn.textContent = email
      ? (AppState.isAdmin ? '👤 管理员' : `👤 ${email.split('@')[0]}`)
      : '👤 登录';
  }

  // 弹窗内状态文案
  const statusEl = document.getElementById('auth-current-status');
  if (statusEl) {
    if (!email) {
      statusEl.textContent = '未登录。输入邮箱获取 6 位验证码即可登录，无需密码。';
    } else if (AppState.isAdmin) {
      statusEl.textContent = `已登录：${email}（管理员，可编辑演出与档案）`;
    } else {
      statusEl.textContent = `已登录：${email}（普通用户，仅可浏览）`;
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
  modal.classList.remove('hidden');
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
  const emailInput = document.getElementById('auth-email-input');
  if (emailInput) { emailInput.disabled = false; emailInput.value = ''; }
  const otpInput = document.getElementById('auth-otp-input');
  if (otpInput) otpInput.value = '';
  syncAuthState();
  alert('已退出登录');
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
  if (!AppState.isAdmin) {
    syncAuthState();
  }
  if (!AppState.isAdmin) {
    alert('管理台需要管理员账号登录后访问。');
    openUserAuthModal();
    return;
  }
  modal.classList.remove('hidden');
  if (typeof renderAdminTodoQueue === 'function') renderAdminTodoQueue();
  if (typeof renderAdminScheduleThumbs === 'function') renderAdminScheduleThumbs();
  if (typeof updateAiKeyStatusUI === 'function') updateAiKeyStatusUI();
}

// 启动时恢复登录态
document.addEventListener('DOMContentLoaded', () => {
  syncAuthState();
});
