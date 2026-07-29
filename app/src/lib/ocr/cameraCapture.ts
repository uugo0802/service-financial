// カメラ入力(<input type="file" capture="environment">)まわりの、DOM操作を伴わない
// 純粋なロジックだけを切り出したモジュール。実際のファイル選択・アップロードは
// components/ReceiptUpload.tsx 側で行い、ここでは「カメラボタンを目立たせてよい環境か」
// 「ボタンに表示するラベル」等の判定のみを提供する(ユニットテストしやすくするため)。
//
// capture属性自体はカメラの無い環境(PCブラウザ等)でも無害(通常のファイル選択にフォールバック)
// だが、カメラの無い環境で「カメラで撮影」ボタンを大きく出すとユーザーが混乱するため、
// モバイル端末らしさを簡易判定してボタンの出し分けに使う。

export interface CameraCaptureEnv {
  /** navigator.userAgent 相当の文字列 */
  userAgent: string;
  /** navigator.maxTouchPoints 相当。タッチ対応デバイスの判定に使う */
  maxTouchPoints: number;
}

const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod/i;

/**
 * 現在の環境で「カメラで撮影」ボタンを提示する意味があるかどうかを判定する。
 * env を省略した場合はグローバルの navigator から値を読む(SSR等 navigator が
 * 存在しない環境では false 相当の既定値を使う)。
 */
export function isCameraCaptureSupported(env?: Partial<CameraCaptureEnv>): boolean {
  const resolved = resolveEnv(env);
  if (MOBILE_USER_AGENT_PATTERN.test(resolved.userAgent)) return true;
  return resolved.maxTouchPoints > 0;
}

function resolveEnv(env?: Partial<CameraCaptureEnv>): CameraCaptureEnv {
  const globalNavigator = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    userAgent: env?.userAgent ?? globalNavigator?.userAgent ?? "",
    maxTouchPoints: env?.maxTouchPoints ?? globalNavigator?.maxTouchPoints ?? 0,
  };
}

/** 「カメラで撮影」ボタンに表示するラベルを、解析中かどうかに応じて返す */
export function getCameraCaptureLabel(loading: boolean): string {
  return loading ? "解析中…" : "カメラで撮影";
}

/** 既存の汎用ファイル選択ボタンに表示するラベルを、解析中かどうかに応じて返す */
export function getFilePickerLabel(loading: boolean): string {
  return loading ? "解析中…" : "ファイルを選択";
}
