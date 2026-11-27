// Cloudflare Pages Function: /api/admin
// 统一处理所有写操作（增删改），用 service_role key 绕过 RLS，
// 但在服务端严格校验请求者是否为管理员。
//
// 需要的环境变量（Cloudflare Pages → Settings → Environment variables）：
//   SUPABASE_URL                你的 Supabase 项目 URL
//   SUPABASE_SERVICE_ROLE_KEY   service_role key（绝不能出现在前端）
//   ADMIN_EMAIL                 管理员邮箱，多个用逗号分隔
//
// 前端调用方式：
//   fetch('/api/admin', {
//     method: 'POST',
//     headers: { Authorization: 'Bearer <用户 access_token>' },
//     body: JSON.stringify({ action: 'upsertTicket', payload: {...} })
//   })

const ALLOWED_ACTIONS = new Set([
  'createTicket',
  'updateTicket',
  'deleteTicket',
  'createFeed',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server not configured' }, 500);
  }

  const user = await resolveUser(env, request.headers.get('Authorization'));
  if (!user) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!isAdminEmail(env, user.email)) {
    return json({ error: 'forbidden: not an admin' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid json' }, 400);
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

    case 'createFeed':
      url = `${env.SUPABASE_URL}/rest/v1/feeds`;
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
