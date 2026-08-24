// PWAオフラインキャッシュ戦略。
// 「インストール可能」「オフラインでも真っ白なネットワークエラーにならない」を最低限満たすための構成。
//
// 方針:
//   - 会計データを扱う /api/ 配下、および GET以外のリクエストは絶対にキャッシュしない・常にネットワークへ流す。
//   - トップページ("/")とオフライン案内ページ("/offline")のみをinstall時に事前キャッシュし、アプリシェルとする。
//   - Next.jsのビルド成果物(/_next/static/配下)はファイル名にコンテンツハッシュを含み不変なので cache-first。
//   - それ以外の同一オリジンGETは「まずネットワーク、失敗したらキャッシュ、キャッシュも無ければオフラインシェル」。
//   - クロスオリジンのリクエストには一切関与しない（サードパーティAPI等をキャッシュ/代替しない）。
//
// このファイルはNext.jsのビルドを通らない素の静的ファイルとして配信されるため、
// 定数・分岐ロジックを直接importすることはできない。
// 同じ判定ロジックは src/lib/pwa/offlineCache.ts にユニットテスト付きで存在するので、
// この2ファイルの定数・分岐は必ず同期させること（値を変えたら両方直す）。

const CACHE_NAME = "jarvis-shell-v2";
const OFFLINE_FALLBACK_URL = "/offline";
const APP_SHELL = ["/", OFFLINE_FALLBACK_URL];

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

function isNetworkOnlyRequest(method, pathname) {
  if (method.toUpperCase() !== "GET") return true;
  return pathname.startsWith("/api/");
}

function isImmutableStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

// Next.jsビルド資産用: cache-first。無ければ取得してキャッシュに保存する。
function handleImmutableStaticAsset(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
      return response;
    });
  });
}

// それ以外の同一オリジンGET用: network-first。失敗時はキャッシュ、それも無ければ
// ナビゲーションリクエストに限りオフライン案内ページにフォールバックする。
function handleNetworkFirst(request, isNavigation) {
  return fetch(request)
    .then((response) => {
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached;
        if (isNavigation) {
          return caches.match(OFFLINE_FALLBACK_URL).then((offline) => offline ?? Response.error());
        }
        return Response.error();
      })
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // クロスオリジン・GET以外・/api/配下（会計データ）は素通しし、SWは一切関与しない
  if (url.origin !== self.location.origin || isNetworkOnlyRequest(request.method, url.pathname)) {
    return;
  }

  if (isImmutableStaticAsset(url.pathname)) {
    event.respondWith(handleImmutableStaticAsset(request));
    return;
  }

  event.respondWith(handleNetworkFirst(request, request.mode === "navigate"));
});
