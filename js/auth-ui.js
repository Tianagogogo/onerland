// ================= 用户认证（Supabase 邮箱 + 密码，注册/登录二合一） =================
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

  // 顶部按钮：仅展示本机昵称与解锁态，不再暴露邮箱信息。
  const nickname = typeof getGuestNickname === 'function' ? getGuestNickname() : '';
  const topBtn = document.getElementById('user-auth-btn');
  if (topBtn) {
    topBtn.textContent = nickname
      ? `👤 ${nickname}`
      : (AppState.isAdminPasswordVerified ? '🔓 已解锁' : '👤 我的身份');
  }

  // 弹窗内状态文案
  const statusEl = document.getElementById('auth-current-status');
  if (statusEl) {
    statusEl.textContent = AppState.isAdminPasswordVerified
      ? '管理员密码已解锁：当前可编辑演出与档案。前台搭子等功能无需登录即可使用。'
      : '免注册即可浏览与发布搭子。这里的昵称只保存在本机，用于搭子卡片署名。';
  }

  // 管理员的批量瘦身工具：仅在管理弹窗内部、解锁后可见
  const compressBtn = document.getElementById('adm-compress-btn');
  if (compressBtn) {
    compressBtn.classList.toggle('hidden', !(AppState.isAdminPasswordVerified || AppState.isAdmin));
  }

  // 本机昵称与设备标识（不依赖邮箱，不阻塞任何前台功能）
  const nicknameInput = document.getElementById('guest-nickname-input');
  if (nicknameInput && document.activeElement !== nicknameInput) {
    nicknameInput.value = nickname || '';
  }
  const deviceHint = document.getElementById('guest-device-hint');
  if (deviceHint) {
    const deviceId = typeof getDeviceId === 'function' ? getDeviceId() : '';
    deviceHint.textContent = `本机设备标识：${deviceId.slice(0, 8)}…（仅用于允许你撤销自己发布的搭子，不会公开展示）`;
  }

  if (typeof renderTourCards === 'function') renderTourCards();
  if (typeof renderArchiveTimeline === 'function') renderArchiveTimeline();
  if (typeof updateAuthButtonUI === 'function') updateAuthButtonUI();
  // 💬 页脚「📬 查看反馈箱」入口只在管理员密码解锁后出现
  if (typeof refreshFeedbackEntryPoints === 'function') refreshFeedbackEntryPoints();

  // 🍜 同款打卡：解锁 / 锁定后立即刷新待审核队列（弹窗开着也能即时出现）
  try { if (typeof refreshCheckinAdminState === 'function') refreshCheckinAdminState(); } catch (e) { /* ignore */ }
  // 📣 应援词典：解锁 / 锁定后立即刷新管理按钮（浮窗开着也能即时出现或收起）
  try {
    const chantModal = document.getElementById('chant-dict-modal');
    if (chantModal && !chantModal.classList.contains('hidden') && typeof renderChantPage === 'function') renderChantPage();
  } catch (e) { /* ignore */ }
}

function saveGuestNicknameFromModal() {
  const input = document.getElementById('guest-nickname-input');
  const name = saveGuestNickname(input ? input.value : '');
  if (input) input.value = name;
  syncAuthState();
  // 保存成功 → 立即收起弹窗 + 轻量提示（不再用 alert 打断浏览）
  closeModalWithToast('user-auth-modal', name ? `昵称已保存：${name}` : '已清空昵称，将以匿名访客身份展示');
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
  if (!password) return toastError('请输入管理员密码');

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
    // 全站统一：解锁时把同一口令写入安全口令通道，供安检投票 / 反馈箱 / 同款打卡等 RPC 直接复用
    try { if (typeof setSecurityAdminKey === 'function') setSecurityAdminKey(password); } catch (e) { /* ignore */ }
    if (input) input.value = '';
    document.getElementById('admin-unlock-modal')?.classList.add('hidden');
    syncAuthState();
    showToast('管理员密码解锁成功');
    openHiddenAdminDrawer();
  } catch (e) {
    // 校验失败：弹窗保持打开，已输入的密码不丢失
    toastError(`管理员密码验证失败：${e.message}`);
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
  showToast('已锁定管理员密码解锁态');
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

// Supabase 认证错误 → 清晰中文提示
function translateAuthError(raw, status) {
  const msg = String(raw || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) return '邮箱或密码不正确，请检查后重试。';
  if (msg.includes('email not confirmed')) return '该邮箱还没完成验证，先去邮箱里点开验证链接，再回来登录即可。';
  if (msg.includes('user already registered') || msg.includes('already been registered')) return '该邮箱已注册，请直接点「登录」。';
  if (msg.includes('password should be at least')) return '密码太短，至少需要 6 位字符。';
  if (msg.includes('weak password') || msg.includes('weak_password')) return '密码强度过低，请换用更复杂的密码。';
  if (msg.includes('unable to validate email') || msg.includes('invalid email') || msg.includes('email address is invalid')) return '邮箱格式不正确，请重新输入。';
  if (msg.includes('rate limit') || msg.includes('too many requests') || status === 429) return '尝试过于频繁，请稍等 1 分钟再试。';
  if (msg.includes('signup') && msg.includes('disabled')) return '当前项目已关闭邮箱注册，请联系管理员。';
  if (status === 0 || msg.includes('failed to fetch') || msg.includes('networkerror')) return '网络连接失败，请检查网络后重试。';
  if (status >= 500) return '服务端暂时不可用，请稍后再试。';
  return `操作失败：${raw || `HTTP ${status}`}`;
}

function readAuthCredentials() {
  const emailInput = document.getElementById('auth-email-input');
  const passwordInput = document.getElementById('auth-password-input');
  const email = (emailInput ? emailInput.value : '').trim().toLowerCase();
  const password = passwordInput ? passwordInput.value : '';
  if (!email) { alert('请先输入邮箱地址'); return null; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('邮箱格式不正确，请重新输入'); return null; }
  if (!password) { alert('请输入密码'); return null; }
  if (password.length < 6) { alert('密码至少需要 6 位字符'); return null; }
  return { email, password, passwordInput };
}

function setAuthBusy(btn, busy, busyText, idleText) {
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? busyText : (idleText || btn.textContent);
}

function handleAuthSuccess(data, email, successText) {
  saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
    user: data.user || { email }
  });
  AppState.pendingAuthEmail = '';
  const passwordInput = document.getElementById('auth-password-input');
  if (passwordInput) passwordInput.value = '';
  syncAuthState();
  const modal = document.getElementById('user-auth-modal');
  if (modal) modal.classList.add('hidden');
  showToast(successText);
}

// 登录：POST /auth/v1/token?grant_type=password（等价 signInWithPassword）
async function signInWithPassword() {
  const cred = readAuthCredentials();
  if (!cred) return;
  const btn = document.querySelector('#user-auth-modal button[onclick="signInWithPassword()"]');
  setAuthBusy(btn, true, '登录中…');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cred.email, password: cred.password })
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.msg || err.error_description || err.message || err.error || detail;
      } catch (e) { /* 忽略非 JSON 响应 */ }
      throw new Error(translateAuthError(detail, res.status));
    }
    const data = await res.json();
    handleAuthSuccess(data, cred.email, isAdminEmail(cred.email) ? '管理员登录成功' : '登录成功');
  } catch (e) {
    alert(`登录失败：${e.message}`);
  } finally {
    setAuthBusy(btn, false, '', '登录');
  }
}

// 注册：POST /auth/v1/signup（配合后台关闭 Confirm email 实现免验证直接登录）
// 已入库但前端未拿到 session 时，立刻用密码登录兜底，避免误报「该邮箱已注册」
async function postPasswordLogin(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.access_token) return { ok: true, data };
    const detail = (data && (data.msg || data.error_description || data.message || data.error)) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: e.message || '网络异常' };
  }
}

async function signUpThenAutoLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const detail = (data && (data.msg || data.error_description || data.message || data.error)) || `HTTP ${res.status}`;
    const alreadyRegistered = /already\s*(been\s*)?registered|user_already_exists|email\s*exists/i.test(String(detail));
    if (!alreadyRegistered) {
      return { ok: false, stage: 'signup', message: translateAuthError(detail, res.status) };
    }
    // 该邮箱已入库：不再误报，直接尝试密码登录
    const existingLogin = await postPasswordLogin(email, password);
    if (existingLogin.ok) return { ok: true, stage: 'login', data: existingLogin.data };
    return { ok: false, stage: 'login', existing: true, message: '该邮箱已注册且密码不匹配，请核对密码后点「登录」。' };
  }

  // 注册请求已成功（入库）：有 session 直接登录
  if (data && data.access_token) return { ok: true, stage: 'signup', data };

  // 无 session（或 identities 为空，说明该邮箱此前已存在）→ 立刻密码登录兜底
  const existing = Boolean(data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
  const loginResult = await postPasswordLogin(email, password);
  if (loginResult.ok) return { ok: true, stage: 'login', data: loginResult.data };
  return {
    ok: false,
    stage: 'login',
    existing,
    message: existing
      ? '该邮箱已注册且密码不匹配，请核对密码后点「登录」。'
      : translateAuthError(loginResult.detail, loginResult.status)
  };
}

async function signUpWithPassword() {
  const cred = readAuthCredentials();
  if (!cred) return;
  const btn = document.querySelector('#user-auth-modal button[onclick="signUpWithPassword()"]');
  setAuthBusy(btn, true, '注册中…');
  try {
    const result = await signUpThenAutoLogin(cred.email, cred.password);
    if (result.ok) {
      handleAuthSuccess(result.data, cred.email, isAdminEmail(cred.email) ? '注册成功，已自动登录（管理员）' : '注册成功，已自动登录');
      return;
    }
    if (result.stage === 'signup') {
      alert(`注册失败：${result.message}`);
      return;
    }
    alert(result.message);
  } catch (e) {
    alert(`注册失败：${e.message || '网络异常，请稍后重试'}`);
  } finally {
    setAuthBusy(btn, false, '', '注册并登录');
  }
}

// 兼容旧入口（避免历史按钮/脚本调用报错）
async function sendEmailOTP() {
  alert('登录方式已升级为「邮箱 + 密码」，请直接输入密码后点「登录」，首次使用请点「注册并登录」。');
}
async function verifyEmailOTP() {
  return signInWithPassword();
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
