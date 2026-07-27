import { TaxCategory } from "../categorize/dictionary";
import { ImageDimensions, parseImageDimensions } from "./imageMeta";
import { OcrClassificationResult } from "./receiptOcr";

// 電子帳簿保存法 スキャナ保存要件（docs/cto-tech-architecture.md 4.1章）に対応するためのメタデータ設計。
// 要件: 解像度200dpi相当以上、カラー画像(RGB各256階調以上)、タイムスタンプ付与または訂正削除履歴が
// 残るシステムでの保存、入力者等の情報記録。
// このモジュールはデータモデルとインターフェースのみを提供し、実ファイルストレージ配線は行わない。

/** レシートの一般的な長辺を想定した概算値(cm)。物理サイズはメタデータから取得できないため近似値として使用する */
export const RECEIPT_LONG_EDGE_REFERENCE_CM = 15;
export const SCANNER_STORAGE_MIN_DPI = 200;

export interface ReceiptScanMetadata {
  /** システムに取り込まれた日時(ISO8601)。真実性確保のためサーバー側で記録した値のみを信頼する */
  uploadedAt: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** true=カラー画像、false=グレースケール、null=形式上判定不能 */
  isColor: boolean | null;
  /** レシート長辺を{@link RECEIPT_LONG_EDGE_REFERENCE_CM}cmと仮定した概算DPI。正式なDPIはスキャナ側のメタデータが無いと算出できないため参考値 */
  estimatedDpi: number | null;
  /** 「200dpi相当以上」かつ「カラー画像」の2条件を上記の概算値で簡易判定した結果 */
  meetsScannerStorageRequirement: boolean;
  /** 満たさない場合の理由（UIでの警告表示用） */
  scannerStorageWarnings: string[];
}

export function buildScanMetadata(params: {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  imageBuffer: ArrayBuffer;
  uploadedAt?: string;
}): ReceiptScanMetadata {
  const dims = parseImageDimensions(params.imageBuffer, params.mimeType);
  const estimatedDpi = dims ? estimateDpi(dims) : null;
  const warnings: string[] = [];

  if (!dims) {
    warnings.push(
      "この画像形式は解像度・カラー情報を自動判定できませんでした。200dpi相当以上・カラー画像であることをご自身でご確認ください。"
    );
  } else {
    if (estimatedDpi !== null && estimatedDpi < SCANNER_STORAGE_MIN_DPI) {
      warnings.push(`解像度が低い可能性があります（概算 ${estimatedDpi}dpi。電子帳簿保存法の目安は200dpi相当以上）。`);
    }
    if (dims.isColor === false) {
      warnings.push("グレースケール画像として検出されました。電子帳簿保存法のスキャナ保存要件はカラー画像を求めています。");
    }
  }

  return {
    uploadedAt: params.uploadedAt ?? new Date().toISOString(),
    originalFileName: params.originalFileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    isColor: dims?.isColor ?? null,
    estimatedDpi,
    meetsScannerStorageRequirement: warnings.length === 0,
    scannerStorageWarnings: warnings,
  };
}

function estimateDpi(dims: ImageDimensions): number {
  const longEdgePx = Math.max(dims.width, dims.height);
  const longEdgeInches = RECEIPT_LONG_EDGE_REFERENCE_CM / 2.54;
  return Math.round(longEdgePx / longEdgeInches);
}

export type ReceiptCandidateSource = "ai" | "unrecognized";

/** 訂正・削除の履歴を残すための追記専用ログ（電子帳簿保存法 真実性確保の要件(b)に対応） */
export interface ReceiptCandidateCorrection {
  correctedAt: string;
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface ReceiptJournalCandidate {
  id: string;
  date: string | null;
  counterparty: string | null;
  amount: number | null;
  account: string;
  taxCategory: TaxCategory;
  confidence: number;
  source: ReceiptCandidateSource;
  reasoning?: string;
  /** OCRで読み取れた文字列の要約。可視性確保（取引年月日・金額・取引先での検索）の補助情報として保持する */
  rawOcrText?: string;
  scanMetadata: ReceiptScanMetadata;
  correctionHistory: ReceiptCandidateCorrection[];
}

/** AI分類結果（またはAI未実行）から仕訳候補を組み立てる */
export function buildReceiptCandidate(params: {
  id: string;
  classification: OcrClassificationResult | null;
  scanMetadata: ReceiptScanMetadata;
}): ReceiptJournalCandidate {
  const { id, classification, scanMetadata } = params;

  if (!classification) {
    return {
      id,
      date: null,
      counterparty: null,
      amount: null,
      account: "要確認(OCR未実行)",
      taxCategory: "要確認",
      confidence: 0,
      source: "unrecognized",
      scanMetadata,
      correctionHistory: [],
    };
  }

  return {
    id,
    date: classification.date,
    counterparty: classification.counterparty,
    amount: classification.amount,
    account: classification.account,
    taxCategory: classification.taxCategory,
    confidence: classification.confidence,
    source: "ai",
    reasoning: classification.reasoning,
    rawOcrText: classification.rawOcrText,
    scanMetadata,
    correctionHistory: [],
  };
}

/** 利用者による修正を訂正履歴に追記した新しい候補を返す（既存オブジェクトは変更しない） */
export function recordCorrection(
  candidate: ReceiptJournalCandidate,
  field: string,
  previousValue: unknown,
  newValue: unknown
): ReceiptJournalCandidate {
  return {
    ...candidate,
    correctionHistory: [
      ...candidate.correctionHistory,
      { correctedAt: new Date().toISOString(), field, previousValue, newValue },
    ],
  };
}
