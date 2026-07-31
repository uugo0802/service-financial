import { TaxCategory } from "../categorize/dictionary";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// レシートOCR＋仕訳分類は一次分類より難度が高い(手書き・かすれ・複数税率混在等)ため、
// Haikuではなく最初からSonnetを使う(docs/cto-tech-architecture.md 3.2章の按分方針に準拠)。
const MODEL = "claude-sonnet-5";

export const TAX_CATEGORIES: TaxCategory[] = [
  "課税売上10%",
  "課税仕入10%",
  "課税仕入8%(軽減)",
  "非課税",
  "不課税",
  "対象外",
  "要確認",
];

const SUPPORTED_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

// スキャンデータ読み込み対応（docs/business-plan.md 12章「csvファイル、手入力、カメラ入力からの画像認識、
// スキャンデータ読み込み」）。PDFはClaude APIの document コンテンツブロックとして画像と同様に
// vision処理へ渡せるため、別建てのPDF→画像変換は行わない（下記 classifyReceiptImage 参照）。
const SUPPORTED_PDF_MEDIA_TYPES = ["application/pdf"];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface OcrClassificationResult {
  date: string | null;
  counterparty: string | null;
  amount: number | null;
  account: string;
  taxCategory: TaxCategory;
  confidence: number;
  reasoning: string;
  rawOcrText: string;
}

interface RawToolInput {
  date?: unknown;
  counterparty?: unknown;
  amount?: unknown;
  account?: unknown;
  taxCategory?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
  rawOcrText?: unknown;
}

export function isSupportedImageMediaType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MEDIA_TYPES.includes(mimeType);
}

export function isSupportedPdfMediaType(mimeType: string): boolean {
  return SUPPORTED_PDF_MEDIA_TYPES.includes(mimeType);
}

/** 画像・PDF（スキャンデータ）のどちらかとしてレシートOCRアップロードに対応しているメディアタイプかどうか */
export function isSupportedReceiptMediaType(mimeType: string): boolean {
  return isSupportedImageMediaType(mimeType) || isSupportedPdfMediaType(mimeType);
}

/**
 * Claude Vision APIのtool_use出力を検証し、型安全な OcrClassificationResult に変換する。
 * 表記ゆれ・型不一致・スキーマ外の値は弾き、安全側（null または「要確認」）にフォールバックする。
 * account が欠落している場合のみ結果全体を無効として null を返す。
 */
export function validateOcrToolInput(input: unknown): OcrClassificationResult | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as RawToolInput;

  if (typeof raw.account !== "string" || raw.account.trim() === "") return null;

  const taxCategory: TaxCategory = TAX_CATEGORIES.includes(raw.taxCategory as TaxCategory)
    ? (raw.taxCategory as TaxCategory)
    : "要確認";

  const date = typeof raw.date === "string" && DATE_PATTERN.test(raw.date) ? raw.date : null;
  const counterparty = typeof raw.counterparty === "string" && raw.counterparty.trim() !== "" ? raw.counterparty : null;
  const amount = typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null;
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0.5;
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  const rawOcrText = typeof raw.rawOcrText === "string" ? raw.rawOcrText : "";

  return { date, counterparty, amount, account: raw.account, taxCategory, confidence, reasoning, rawOcrText };
}

/**
 * レシート/請求書画像またはPDF（スキャンデータ、docs/business-plan.md 12章）を Claude の vision 機能に
 * 直接渡し、OCR＋仕訳分類を1回のAPI呼び出しで完結させる
 * (docs/cto-tech-architecture.md 3.2章「レシート/請求書OCR」: 別建てのOCRサービスを挟まない方針)。
 * PDFは事前にラスタ画像へ変換せず、Anthropic API の document コンテンツブロックとしてそのまま渡す
 * （複数ページPDFの1ページ目のみを渡す想定。ページ数の事前検証は呼び出し側 (app/api/ocr/route.ts) が
 * `imageMeta.ts` の `getPdfPageCount` を使って行う）。
 * ANTHROPIC_API_KEY が未設定、またはAPI呼び出しが失敗した場合は null を返す。
 */
export async function classifyReceiptImage(image: { base64: string; mimeType: string }): Promise<OcrClassificationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const isPdf = isSupportedPdfMediaType(image.mimeType);
  const documentContentBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: image.mimeType, data: image.base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: image.mimeType, data: image.base64 } };

  const body = {
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user" as const,
        content: [
          documentContentBlock,
          {
            type: "text" as const,
            text:
              `あなたは日本の個人事業主・フリーランス・マイクロ法人の記帳を支援する会計アシスタントです。\n` +
              `このレシート/請求書の${isPdf ? "PDF（スキャンデータ）" : "画像"}をOCRで読み取り、日付・取引先・金額を抽出したうえで、` +
              `青色申告決算書の勘定科目と消費税の税区分を判定してください。\n` +
              `日付は西暦のYYYY-MM-DD形式にしてください。読み取れない項目はnullとし、断定できない場合はconfidenceを低くしてください。\n`,
          },
        ],
      },
    ],
    tools: [
      {
        name: "extract_receipt",
        description: "レシート/請求書画像から取引情報を抽出し、勘定科目と消費税区分を割り当てる",
        input_schema: {
          type: "object",
          properties: {
            date: { type: ["string", "null"], description: "取引日（YYYY-MM-DD形式）。読み取れない場合はnull" },
            counterparty: { type: ["string", "null"], description: "取引先名（店名・発行元）。読み取れない場合はnull" },
            amount: { type: ["number", "null"], description: "合計金額（円）。読み取れない場合はnull" },
            account: { type: "string", description: "勘定科目名（例: 旅費交通費、消耗品費 など）" },
            taxCategory: { type: "string", enum: TAX_CATEGORIES },
            confidence: { type: "number", description: "0〜1の確信度" },
            reasoning: { type: "string", description: "判定根拠の一文" },
            rawOcrText: { type: "string", description: "画像から読み取れた文字列の要約（検索性確保用の参考テキスト）" },
          },
          required: ["account", "taxCategory", "confidence", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_receipt" },
  };

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Anthropic API error (ocr)", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const toolUse = data.content?.find((c: { type: string }) => c.type === "tool_use");
    if (!toolUse) return null;

    return validateOcrToolInput(toolUse.input);
  } catch (err) {
    // ネットワークエラーやレスポンスのパース失敗を含め、API呼び出しが失敗した場合は
    // (このモジュールのドキュメントコメントの契約どおり) 例外を投げずに null を返す。
    console.error("Anthropic API call failed (ocr)", err);
    return null;
  }
}
