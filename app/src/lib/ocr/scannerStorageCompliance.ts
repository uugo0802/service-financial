import type { ImageDimensions } from "./imageMeta";

// ------------------------------------------------------------------
// 電子帳簿保存法 スキャナ保存要件（docs/cto-tech-architecture.md 4.1章）のうち、
// 紙のレシート原本を破棄する際に必須となる下記2条件を、アップロード画像の
// ピクセル寸法とカラー種別のみから推定する「参考程度」の簡易チェックです。
//   - 解像度: 200dpi相当以上
//   - カラー画像: 赤色・緑色・青色それぞれ256階調以上
//
// ⚠️ 免責事項（src/lib/payroll/withholding.ts, src/lib/tax/depreciation.ts と同様の位置付け）:
// 画像ファイルには通常、撮影時の物理的なDPIやレシートの実サイズが記録されていません。
// このモジュールは「レシートの短辺は概ね{@link ASSUMED_RECEIPT_SHORT_EDGE_MM}mm程度
// （国内のレジ用感熱紙ロールで広く使われる幅）」という仮定を置き、画像の短辺ピクセル数から
// 逆算した概算dpiで判定する、あくまでベストエフォートのヒューリスティックです。
// - 実際のレシート・請求書がこの仮定より大きい（例: A4サイズの請求書）場合、判定は保守的
//   （厳しめ）になります。仮定より小さい場合は逆に緩くなります。
// - 画像のカラー種別（グレースケールかどうか）は判定できますが、実際のビット深度
//   （RGB各256階調=8bit相当かどうか）まではヘッダー情報から確実には判定できないため、
//   「グレースケールでない=カラー画像」を256階調カラーの代わりの近似指標として使っています。
// - このチェックが「合格」と判定しても、電子帳簿保存法上の要件を満たすことの法的な保証には
//   一切なりません。紙原本を破棄する前の最終的な充足判断は、必ず利用者本人が画像を目視確認し、
//   必要に応じて税理士等の専門家のレビューを受けたうえで行ってください（「本人の判断」原則）。
// ------------------------------------------------------------------

/** レシートの短辺（幅）の想定物理サイズ(mm)。国内のレジ用感熱紙ロールの代表的な幅を仮定として採用 */
export const ASSUMED_RECEIPT_SHORT_EDGE_MM = 80;

/** 電子帳簿保存法 スキャナ保存要件の解像度の目安（dpi相当） */
export const SCANNER_STORAGE_MIN_DPI = 200;

const MM_PER_INCH = 25.4;

/**
 * {@link ASSUMED_RECEIPT_SHORT_EDGE_MM}mmの短辺が{@link SCANNER_STORAGE_MIN_DPI}dpi相当を
 * 満たすために必要な最低限の短辺ピクセル数（200dpi × 80mm ÷ 25.4mm/inch を切り上げ）。
 */
export const RECOMMENDED_MIN_SHORT_EDGE_PX = Math.ceil((SCANNER_STORAGE_MIN_DPI * ASSUMED_RECEIPT_SHORT_EDGE_MM) / MM_PER_INCH);

export interface ScannerStorageComplianceResult {
  /** 解像度・カラーの両条件について、失敗している/判定不能な理由が一つも無ければtrue */
  passed: boolean;
  /** 満たさない可能性がある、または判定不能な項目についての日本語の説明文（UIでの警告表示用） */
  reasons: string[];
  /** {@link ASSUMED_RECEIPT_SHORT_EDGE_MM}mmの仮定に基づく概算dpi。判定不能な場合はnull */
  estimatedDpi: number | null;
}

/**
 * 画像の寸法・カラー情報から、電子帳簿保存法のスキャナ保存要件（解像度200dpi相当以上・
 * カラー画像）を「満たしていそうか」をベストエフォートで判定する。
 *
 * この関数が返す結果はあくまでアドバイザリー（お勧め）情報であり、アップロード自体を
 * ブロックする用途には使わない想定（本人の判断で続行できることを前提としたUI設計）。
 */
export function evaluateScannerStorageCompliance(
  dims: Pick<ImageDimensions, "width" | "height" | "isColor"> | null
): ScannerStorageComplianceResult {
  if (!dims) {
    return {
      passed: false,
      reasons: [
        "この画像形式からは解像度・カラー情報を自動判定できませんでした。電子帳簿保存法のスキャナ保存要件（200dpi相当以上・カラー画像）を満たしているか、ご自身でご確認ください。",
      ],
      estimatedDpi: null,
    };
  }

  const reasons: string[] = [];
  const shortEdgePx = Math.min(dims.width, dims.height);
  const estimatedDpi = Math.round((shortEdgePx * MM_PER_INCH) / ASSUMED_RECEIPT_SHORT_EDGE_MM);

  if (shortEdgePx < RECOMMENDED_MIN_SHORT_EDGE_PX) {
    reasons.push(
      `解像度が不足している可能性があります（レシート幅${ASSUMED_RECEIPT_SHORT_EDGE_MM}mmを想定した概算 ${estimatedDpi}dpi。電子帳簿保存法の目安は200dpi相当以上です）。`
    );
  }

  if (dims.isColor === false) {
    reasons.push(
      "グレースケール（モノクロ）画像として検出されました。電子帳簿保存法のスキャナ保存要件はカラー画像（赤色・緑色・青色それぞれ256階調以上）を求めています。"
    );
  } else if (dims.isColor === null) {
    reasons.push(
      "この画像形式ではカラー画像かどうかを自動判定できませんでした。カラー画像（赤色・緑色・青色それぞれ256階調以上）であることをご自身でご確認ください。"
    );
  }

  return { passed: reasons.length === 0, reasons, estimatedDpi };
}
