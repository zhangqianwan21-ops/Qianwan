// 离线缓存：首次打开后，没网也能练（录音、内容都在手机里）
const V = "fn-v1";
const CORE = ["./", "index.html", "data.json", "manifest.webmanifest", "icon-180.png", "icon-192.png",
  "audio/01.mp3", "audio/02.mp3", "audio/03.mp3", "audio/04.mp3", "audio/05.mp3"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 录音用 Range 请求播放，直接从缓存返回完整文件
  if (url.pathname.endsWith(".mp3")) {
    e.respondWith((async () => {
      const hit = await caches.match(url.pathname.replace(/^.*\/audio\//, "audio/"), { ignoreSearch: true })
        || await caches.match(req, { ignoreSearch: true });
      if (!hit) return fetch(req);
      const range = req.headers.get("range");
      if (!range) return hit;
      // iPhone 的播放器按片段要录音，需要返回 206 片段
      const buf = await hit.arrayBuffer(), size = buf.byteLength;
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : size - 1;
      if (!m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
      end = Math.min(end, size - 1);
      return new Response(buf.slice(start, end + 1), { status: 206, headers: {
        "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
    })());
    return;
  }
  // 页面和内容：先用网络拿最新的，没网时用缓存
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
    return;
  }
  // 字体：缓存优先
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); return res; })));
  }
});
