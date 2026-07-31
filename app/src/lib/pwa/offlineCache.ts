// Service Worker (public/sw.js) のキャッシュ戦略のうち、
// 「何をキャッシュ対象にするか」を決める純粋ロジックだけを切り出したもの。
//
// public/sw.js は素のスクリプトとしてブラウザに配信されるため（バンドラを通さないため）
// このファイルを直接importすることはできないが、sw.js内の同名の定数・分岐は
// このファイルの実装と同期させること（sw.js冒頭のコメントにもその旨を明記している）。
// ここでロジックをテスト可能な形にしておくことで、キャッシュ対象の判定ミス
// （例: 会計データを扱う/api/配下を誤ってキャッシュしてしまう）を単体テストで防ぐ。

/** Service Workerのキャッシュストレージ名。バージョンを上げると古いキャッシュはactivate時に破棄される。 */
export const CACHE_VERSION = "v2";
export const CACHE_NAME = `jarvis-shell-${CACHE_VERSION}`;

/** オフライン時にナビゲーションのフォールバック先として使う、キャッシュ済みの案内ページ */
export const OFFLINE_FALLBACK_URL = "/offline";

/**
 * install時に事前キャッシュする「アプリシェル」。
 * 会計データを含まない、静的なトップページとオフライン案内ページのみを対象とする。
 */
export const APP_SHELL_URLS: readonly string[] = ["/", OFFLINE_FALLBACK_URL];

/**
 * このリクエストをService Workerのキャッシュ対象から常に除外すべきか判定する。
 * - GET以外（POST等の更新系）はキャッシュしない
 * - /api/ 配下（会計・税務データを扱うエンドポイント）は常にネットワークへ素通しする
 */
export function isNetworkOnlyRequest(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== "GET") return true;
  return pathname.startsWith("/api/");
}

/**
 * Next.jsのビルド成果物（/_next/static/配下）はファイル名にコンテンツハッシュを含み不変なので、
 * cache-first（一度取得したら再検証なしで使い回す）が安全かつオフライン耐性が高い。
 */
export function isImmutableStaticAsset(pathname: string): boolean {
  return pathname.startsWith("/_next/static/");
}
