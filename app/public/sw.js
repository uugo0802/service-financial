// PWAオフラインキャッシュの最小構成雛形。
// トップページ等の静的シェルのみをキャッシュし、/api/配下（会計データを扱うエンドポイント）や
// GET以外のリクエストはキャッシュ対象外とし、常にネットワークへそのまま流す。
// 将来のオフライン対応拡張（プッシュ通知・バックグラウンド同期等）はここに追加していく想定。

const CACHE_NAME = "jarvis-shell-v1";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // オフライン初回インストール等でシェルの取得に失敗しても致命的にしない
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 会計データを扱うAPIリクエスト・GET以外は常にネットワーク優先（キャッシュしない）
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  );
});
