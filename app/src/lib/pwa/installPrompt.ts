// 「ホーム画面に追加」インストールバナーの表示可否を判定する純粋ロジック。
// beforeinstallprompt イベント自体のハンドリングはコンポーネント側(InstallPromptBanner)が担当し、
// ここでは「一度見せたら二度と出さない」の判定・記録のみを扱う（ユニットテスト容易性のため分離）。

/** localStorageに保存するキー。値の中身は使わず、キーの有無だけを見る。 */
export const INSTALL_PROMPT_STORAGE_KEY = "jarvis:pwa-install-prompt-seen";

/**
 * localStorageの get/set だけに依存する最小限のインターフェース。
 * 本物の window.localStorage はもちろん、テストでは単純なオブジェクトのモックを渡せる。
 */
export interface InstallPromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * すでにインストールバナーを見せた（＝表示 or 却下 or インストール完了のいずれか）ユーザーかどうかを判定する。
 * storageへのアクセスが失敗する環境（プライベートブラウジング等）では、
 * 「安全側に倒して二度と表示しない」を選び true を返す。
 */
export function hasSeenInstallPrompt(storage: InstallPromptStorage | null | undefined): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(INSTALL_PROMPT_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * インストールバナーを見せた（今後は出さない）ことを記録する。
 * storageへの書き込みが失敗しても例外は投げない（表示自体は妨げない）。
 */
export function markInstallPromptSeen(storage: InstallPromptStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(INSTALL_PROMPT_STORAGE_KEY, "1");
  } catch {
    // プライベートブラウジング等でstorageが使えない場合は無視する
  }
}
