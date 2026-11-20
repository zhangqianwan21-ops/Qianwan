// 离线缓存：首次打开后，没网也能练（录音、内容都在手机里）
const V = "fn-v3";
const CORE = ["./", "index.html", "data.json", "manifest.webmanifest", "icon-180.png", "icon-192.png",
  "audio/01.mp3", "audio/02.mp3", "audio/03.mp3", "audio/04.mp3", "audio/05.mp3"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== V + "-clips" && !k.endsWith("-clips")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 录音用 Range 请求播放，直接从缓存返回完整文件
  // 单词、例句的短录音：第一次播放时存进手机，以后没网也能听
  if (/\/c\/[0-9a-f]+\.mp3$/.test(url.pathname)) {
    e.respondWith((async () => {
      const key = url.origin + url.pathname;
      let hit = await caches.match(key);
      if (!hit) {
        const full = await fetch(key);
        if (!full.ok) return full;
        await (await caches.open(V + "-clips")).put(key, full.clone());
        hit = full;
      }
      return rangeOf(hit, req.headers.get("range"));
    })());
    return;
  }
  if (url.pathname.endsWith(".mp3")) {
    e.respondWith((async () => {
      // 有网时直接从网上播放，没网才用手机里存的录音
      try { return await fetch(req); } catch (err) {}
      const hit = await caches.match(url.pathname.replace(/^.*\/audio\//, "audio/"), { ignoreSearch: true })
        || await caches.match(req, { ignoreSearch: true });
      if (!hit) return fetch(req);
      return rangeOf(hit, req.headers.get("range"));
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

async function rangeOf(res, range) {
  if (!range) return res;
  // iPhone 的播放器按片段要录音，需要返回 206 片段
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : size - 1;
  if (!m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}
