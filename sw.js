const CACHE_NAME = 'onerland-pwa-v28';
const IMAGE_CACHE_NAME = 'onerland-images-v2';
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
  './js/auth-ui.js'
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

function isImageRequest(request) {
  if (request.destination === 'image') return true;
  try {
    const url = new URL(request.url);
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

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (isImageRequest(event.request)) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
