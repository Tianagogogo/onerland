export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetPath = url.pathname.replace(/^\/sb/, '');
  const targetUrl = `https://xtgkepaqikpzvnmpkoxsa.supabase.co${targetPath}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set('Host', 'xtgkepaqikpzvnmpkoxsa.supabase.co');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');

  const init = {
    method: context.request.method,
    headers,
  };
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  const resp = await fetch(targetUrl, init);
  const newHeaders = new Headers(resp.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  });
}
