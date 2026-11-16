/* CV Studio Pro service worker.
   Goal: let the site be installed and let the builder open again without internet.
   Safety rules:
   - Only same-origin GET requests are handled. Google Apps Script, Analytics and every other site go straight to the network.
   - admin.html is never cached.
   - Network first: when online you always get the newest files after a deploy. The cache is only the fallback.
   Change VERSION to force every phone to drop the old cache. */
const VERSION = 'v1';
const CACHE = 'cvsp-' + VERSION;
const CORE = ['./', 'index.html', 'builder.html', 'templates.html', 'css/style.css', 'css/home.css', 'css/home-3d.css', 'css/builder-skin.css',
  'js/app.js', 'js/resume-import.js', 'js/site-config.js', 'js/consent.js', 'js/html2canvas.min.js', 'js/pwa.js',
  'fonts/fraunces-latin-wght-normal.woff2', 'fonts/inter-latin-wght-normal.woff2', 'favicon.svg', 'manifest.webmanifest', 'img/icon-192.png'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* one missing file must not break the install */
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('cvsp-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function skip(req, url) {
  if (req.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (/(^|\/)admin(\.html)?$/.test(url.pathname)) return true;
  return false;
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (skip(req, url)) return;
  e.respondWith(networkFirst(req));
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('builder.html').then(function (b) { return b || Response.error(); });
        return Response.error();
      });
    }
    var timer = setTimeout(function () { if (!done) fromCache().then(function (r) { if (!done && r && r.type !== 'error') { done = true; resolve(r); } }); }, NETWORK_TIMEOUT_MS);
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      if (!done) fromCache().then(function (r) { done = true; resolve(r); });
    });
  });
}
