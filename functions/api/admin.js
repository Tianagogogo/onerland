// Cloudflare Pages Function: /api/admin
// 统一处理所有写操作（增删改），用 service_role key 绕过 RLS，
// 但在服务端严格校验请求者是否为管理员。
//
// 编辑权限与邮箱登录态解耦：满足任意一种即可——
//   1. 已登录的授权邮箱（ADMIN_EMAIL）
//   2. 已通过 ADMIN_PASSWORD 验证、持有短期管理令牌（X-Admin-Token）
//
// 需要的环境变量（Cloudflare Pages → Settings → Environment variables）：
//   SUPABASE_URL                你的 Supabase 项目 URL
//   SUPABASE_SERVICE_ROLE_KEY   service_role key（绝不能出现在前端）
//   ADMIN_EMAIL                 管理员邮箱，多个用逗号分隔
//   ADMIN_PASSWORD              管理员密码（可选；与 ADMIN_EMAIL 任一即可编辑）
//   ADMIN_SESSION_SECRET        管理令牌签名密钥（可选，建议配置）
//
// 前端调用方式：
//   授权邮箱：Authorization: Bearer <用户 access_token>
//   密码解锁：X-Admin-Token: <verifyPassword 返回的短期令牌>

const ALLOWED_ACTIONS = new Set([
  'createTicket',
  'updateTicket',
  'deleteTicket',
  'reviewProof',
  'createChant',
  'updateChant',
  'deleteChant',
  'createBrand',
  'updateBrand',
  'deleteBrand',
]);

const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected']);
const ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function getTokenSecret(env) {
  return env.ADMIN_SESSION_SECRET ||
    `${env.ADMIN_PASSWORD || ''}:${env.SUPABASE_SERVICE_ROLE_KEY || ''}:onerland-admin`;
}

async function getHmacKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getTokenSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function issueAdminToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ADMIN_TOKEN_TTL_SECONDS;
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    v: 1,
    scope: 'admin',
    iat: now,
    exp: expiresAt,
  })));
  const key = await getHmacKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  return {
    token: `${payloadPart}.${base64UrlEncode(new Uint8Array(signature))}`,
    expiresAt,
  };
}

async function verifyAdminToken(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const [payloadPart, signaturePart] = parts;

  try {
    const key = await getHmacKey(env);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(payloadPart)
    );
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
    return Boolean(
      payload &&
      payload.v === 1 &&
      payload.scope === 'admin' &&
      Number(payload.exp) > Math.floor(Date.now() / 1000)
    );
  } catch (e) {
    return false;
  }
}

// 用用户 token 向 Supabase Auth 换取用户信息，确认身份
async function resolveUser(env, authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user : null;
}

function isAdminEmail(env, email) {
  const list = (env.ADMIN_EMAIL || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 && list.includes((email || '').trim().toLowerCase());
}

// 授权邮箱或管理员密码令牌，任意一种通过即可。
async function authorizeRequest(env, request) {
  const user = await resolveUser(env, request.headers.get('Authorization'));
  if (user && isAdminEmail(env, user.email)) {
    return { ok: true, via: 'email' };
  }

  const adminToken = request.headers.get('X-Admin-Token') || '';
  if (adminToken && await verifyAdminToken(env, adminToken)) {
    return { ok: true, via: 'password' };
  }

  return { ok: false, status: user ? 403 : 401 };
}

async function handleVerifyPassword(env, password) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'admin password not configured' }, 503);
  }
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ error: 'invalid admin password' }, 403);
  }
  const issued = await issueAdminToken(env);
  return json({ ok: true, token: issued.token, expires_at: issued.expiresAt });
}

const CHANT_CATEGORIES = new Set(['ONER团歌', '岳岳', '木子洋', '灵超']);

function sanitizeChantPayload(payload) {
  const p = payload || {};
  const title = String(p.title || '').trim().slice(0, 60);
  const category = String(p.category || '').trim();
  const content = String(p.content || '').trim().slice(0, 12000);
  if (!title || !content || !CHANT_CATEGORIES.has(category)) {
    return null;
  }
  return {
    title,
    category,
    album: String(p.album || '').trim().slice(0, 80) || null,
    video_url: String(p.video_url || '').trim().slice(0, 400) || null,
    content,
  };
}

const BRAND_CATEGORIES = new Set(['ONER全员', '岳岳', '木子洋', '灵超']);

function sanitizeBrandPayload(payload) {
  const p = payload || {};
  const brandName = String(p.brand_name || p.brand || '').trim().slice(0, 60);
  const title = String(p.title || '').trim().slice(0, 40);
  const artist = String(p.artist || p.category || '').trim();
  const activeRaw = p.is_active;
  const isActive = !(activeRaw === false || activeRaw === 0 || activeRaw === 'false' || activeRaw === '0');
  const announceDate = String(p.announce_date || '').trim().slice(0, 10);
  const periodText = String(p.period_text || p.period || '').trim().slice(0, 60);
  const note = String(p.note || '').trim().slice(0, 300);
  const officialUrl = String(p.official_url || '').trim().slice(0, 400);
  if (!brandName || !title || !BRAND_CATEGORIES.has(artist)) return null;
  if (announceDate && !/^\d{4}-\d{2}-\d{2}$/.test(announceDate)) return null;
  if (officialUrl && !/^https?:\/\//i.test(officialUrl)) return null;
  return {
    brand_name: brandName,
    title,
    artist,
    is_active: isActive,
    announce_date: announceDate || null,
    period_text: periodText || null,
    note: note || null,
    official_url: officialUrl || null,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server not configured' }, 500);
  }

  let body = null;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid json' }, 400);
    }
    // 密码验证本身不需要任何既有登录态。
    if (body && body.action === 'verifyPassword') {
      return handleVerifyPassword(env, String(body.password || ''));
    }
  }

  const auth = await authorizeRequest(env, request);
  if (!auth.ok) {
    return json(
      { error: auth.status === 401 ? 'unauthorized' : 'forbidden: not an admin' },
      auth.status
    );
  }

  // GET：管理员列出待复核票根（RLS 对 anon 隐藏 pending，必须走 service_role）
  if (request.method === 'GET') {
    const url0 = new URL(request.url);
    const status = url0.searchParams.get('status') || 'pending';
    const limit = Math.min(Number(url0.searchParams.get('limit')) || 30, 100);
    const wantStatus = status === 'all' ? null : status;
    if (wantStatus && !REVIEW_STATUSES.has(wantStatus)) {
      return json({ error: 'invalid status' }, 400);
    }

    const qs = new URLSearchParams();
    qs.set('select', 'id,show_key,artist,city,show_date,seat_area,image_url,review_status,reviewer_note,created_at,reviewed_at');
    if (wantStatus) qs.set('review_status', `eq.${wantStatus}`);
    qs.set('order', 'created_at.desc');
    qs.set('limit', String(limit));

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/ticket_proofs?${qs.toString()}`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) {
      return json({ error: `supabase ${res.status}`, detail: (await res.text()).slice(0, 500) }, res.status);
    }
    const rows = await res.json();

    // 桶是私有的，给每条记录签一个短期可读 URL，避免管理员看不到图
    const signed = await Promise.all(
      (Array.isArray(rows) ? rows : []).map(async (row) => {
        if (!row.image_url) return { ...row, signed_url: null };
        try {
          const sres = await fetch(
            `${env.SUPABASE_URL}/storage/v1/object/sign/ticket-proofs/${row.image_url}`,
            {
              method: 'POST',
              headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ expiresIn: 600 }),
            }
          );
          if (!sres.ok) return { ...row, signed_url: null };
          const sdata = await sres.json();
          const rel = sdata.signedURL || sdata.signedUrl || '';
          return {
            ...row,
            signed_url: rel ? `${env.SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}` : null,
          };
        } catch (e) {
          return { ...row, signed_url: null };
        }
      })
    );

    return json({ ok: true, data: signed });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const { action, payload = {}, id } = body || {};
  if (!ALLOWED_ACTIONS.has(action)) {
    return json({ error: `unknown action: ${action}` }, 400);
  }

  const svcHeaders = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  let url;
  let method;
  let data;

  switch (action) {
    case 'createTicket':
      url = `${env.SUPABASE_URL}/rest/v1/tickets`;
      method = 'POST';
      data = payload;
      break;

    case 'updateTicket':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/tickets?id=eq.${encodeURIComponent(id)}`;
      method = 'PATCH';
      data = payload;
      break;

    case 'deleteTicket':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/tickets?id=eq.${encodeURIComponent(id)}`;
      method = 'DELETE';
      data = undefined;
      break;

    // 📣 应援词典：云端应援词库（匿名只读，写操作仅管理员）
    case 'createChant':
      url = `${env.SUPABASE_URL}/rest/v1/fan_chants`;
      method = 'POST';
      data = sanitizeChantPayload(payload);
      if (!data) return json({ error: 'invalid chant payload' }, 400);
      break;

    case 'updateChant':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/fan_chants?id=eq.${encodeURIComponent(id)}`;
      method = 'PATCH';
      data = sanitizeChantPayload(payload);
      if (!data) return json({ error: 'invalid chant payload' }, 400);
      break;

    case 'deleteChant':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/fan_chants?id=eq.${encodeURIComponent(id)}`;
      method = 'DELETE';
      data = undefined;
      break;

    // 💼 商务档案：品牌代言 / 合作（匿名只读，写操作仅管理员）
    case 'createBrand':
      url = `${env.SUPABASE_URL}/rest/v1/brand_endorsements`;
      method = 'POST';
      data = sanitizeBrandPayload(payload);
      if (!data) return json({ error: 'invalid brand payload' }, 400);
      break;

    case 'updateBrand':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/brand_endorsements?id=eq.${encodeURIComponent(id)}`;
      method = 'PATCH';
      data = sanitizeBrandPayload(payload);
      if (!data) return json({ error: 'invalid brand payload' }, 400);
      break;

    case 'deleteBrand':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${env.SUPABASE_URL}/rest/v1/brand_endorsements?id=eq.${encodeURIComponent(id)}`;
      method = 'DELETE';
      data = undefined;
      break;

    // 票根复核：把 review_status 改成 approved / rejected / pending
    case 'reviewProof': {
      if (!id) return json({ error: 'missing id' }, 400);
      const status = String(payload.review_status || '').trim();
      if (!REVIEW_STATUSES.has(status)) {
        return json({ error: 'invalid review_status' }, 400);
      }
      url = `${env.SUPABASE_URL}/rest/v1/ticket_proofs?id=eq.${encodeURIComponent(id)}`;
      method = 'PATCH';
      data = {
        review_status: status,
        reviewer_note: payload.reviewer_note ? String(payload.reviewer_note).slice(0, 500) : null,
        reviewed_at: new Date().toISOString(),
      };
      break;
    }
  }

  const init = { method, headers: svcHeaders };
  if (data !== undefined) init.body = JSON.stringify(data);

  const res = await fetch(url, init);
  const text = await res.text();

  if (!res.ok) {
    return json({ error: `supabase ${res.status}`, detail: text.slice(0, 500) }, res.status);
  }

  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
  return json({ ok: true, data: parsed });
}
