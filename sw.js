const CACHE_NAME = 'onerland-pwa-v102';
const IMAGE_CACHE_NAME = 'onerland-images-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './tour_data.json',
  './css/theme.css',
  './js/config.js',
  './js/store.js',
  './js/home-ui.js',
  './js/shows-ui.js',
  './js/parser.js',
  './js/footprint-ui.js',
  './js/admin-ui.js',
  './js/auth-ui.js',
  './js/travel-helper.js',
  './js/fandom-sync.js',
  './js/feedback-ui.js',
  './js/ticket-seat-ui.js',
  './js/china-map-data.js',
  './js/install-hint.js',
  './js/onboarding-ui.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 允许页面主动触发新 SW 接管
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // 自毁旧版本静态缓存，图片缓存保留（CacheFirst 策略）
        keys.filter(k => k !== CACHE_NAME && k !== IMAGE_CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', cache: CACHE_NAME })))
  );
});

const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i;
// Supabase Storage 图片链接（含签名参数）也走图片缓存
const SUPABASE_IMAGE_PATTERN = /\/storage\/v1\/object\//i;

function isImageRequest(request) {
  if (request.destination === 'image') return true;
  try {
    const url = new URL(request.url);
    if (SUPABASE_IMAGE_PATTERN.test(url.pathname)) return true;
    return IMAGE_PATTERN.test(url.pathname);
  } catch (e) {
    return false;
  }
}

// 图片：CacheFirst，首次入缓存后毫秒级直出，不再重复走网络
function handleImageRequest(request) {
  return caches.open(IMAGE_CACHE_NAME).then(cache =>
    cache.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          cache.put(request, resp.clone()).catch(() => {});
        }
        return resp;
      }).catch(() => Response.error());
    })
  );
}

// 代码资源（HTML/JS/CSS/JSON）：Network-First，优先拿最新版本，断网时才回退缓存
const CODE_PATTERN = /\.(html?|js|css|json|webmanifest)(\?.*)?$/i;

function isCodeAssetRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    if (request.mode === 'navigate') return true;
    return CODE_PATTERN.test(url.pathname);
  } catch (e) {
    return false;
  }
}

function handleCodeRequest(request) {
  return fetch(request, { cache: 'no-store' })
    .then(resp => {
      if (resp && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
      }
      return resp;
    })
    .catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      // 页面导航离线兜底：回到首页缓存
      if (request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (isImageRequest(event.request)) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }
  if (isCodeAssetRequest(event.request)) {
    event.respondWith(handleCodeRequest(event.request));
    return;
  }
  // 其它同源静态资源（字体等）：Network-First，失败回退缓存
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
