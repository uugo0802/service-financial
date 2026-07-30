import { CategorizedTransaction, Transaction } from "./engine";
import { TaxCategory } from "./dictionary";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const MAX_AI_ROWS_PER_REQUEST = 50; // 1回のアップロードでAIに投げる件数の上限（コスト・速度の暴走防止）

const TAX_CATEGORIES: TaxCategory[] = [
  "課税売上10%",
  "課税仕入10%",
  "課税仕入8%(軽減)",
  "非課税",
  "不課税",
  "対象外",
  "要確認",
];

interface AiResult {
  account: string;
  taxCategory: TaxCategory;
  confidence: number;
  reasoning: string;
}

async function classifyOne(tx: Transaction): Promise<AiResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const isIncome = tx.amount > 0;

  const body = {
    model: MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text:
              `あなたは日本の個人事業主・フリーランスの記帳を支援する会計アシスタントです。\n` +
              `以下の取引明細1件について、青色申告決算書の勘定科目と消費税の税区分を判定してください。\n` +
              `断定できない場合は confidence を低くし、account に「要確認」を含めてください。\n\n` +
              `日付: ${tx.date}\n摘要: ${tx.description}\n金額: ${tx.amount}円（${isIncome ? "収入" : "支出"}）\n`,
          },
        ],
      },
    ],
    tools: [
      {
        name: "categorize_transaction",
        description: "取引明細に勘定科目と消費税区分を割り当てる",
        input_schema: {
          type: "object",
          properties: {
            account: { type: "string", description: "勘定科目名（例: 通信費、旅費交通費、売上高 など）" },
            taxCategory: { type: "string", enum: TAX_CATEGORIES },
            confidence: { type: "number", description: "0〜1の確信度" },
            reasoning: { type: "string", description: "判定根拠の一文" },
          },
          required: ["account", "taxCategory", "confidence", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "categorize_transaction" },
  };

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
    console.error("Anthropic API error", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const toolUse = data.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) return null;

  const input = toolUse.input as Partial<AiResult>;
  if (!input.account || !input.taxCategory) return null;

  // cto-tech-architecture.md 3.3: 税区分判定はルール優先。LLMの構造化出力は json_schema の
  // enum指定はあくまでモデルへのヒントであり、実行時に値が保証されるわけではない。ここで
  // 既知の税区分（TAX_CATEGORIES）に含まれるかを検証せずに受け入れると、幻覚・表記ゆれの
  // 値がそのまま台帳に書き込まれ、他の計算箇所の taxCategory 文字列完全一致判定（例:
  // "課税仕入10%"）に一致しないまま静かに仕入税額控除等の対象から漏れてしまう。
  if (!TAX_CATEGORIES.includes(input.taxCategory)) return null;

  const rawConfidence = typeof input.confidence === "number" && Number.isFinite(input.confidence) ? input.confidence : 0.5;
  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return {
    account: input.account,
    taxCategory: input.taxCategory,
    confidence,
    reasoning: input.reasoning ?? "",
  };
}

/**
 * ルールベースで信頼度が低かった取引をAIで再分類する。
 * ANTHROPIC_API_KEY が未設定の場合は何もせず、元の分類を「要確認」のまま返す。
 */
export async function escalateWithAi(
  rows: CategorizedTransaction[]
): Promise<{ results: CategorizedTransaction[]; aiConfigured: boolean; escalatedCount: number; cappedAt: number | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { results: rows, aiConfigured: false, escalatedCount: 0, cappedAt: null };
  }

  const toEscalate = rows.filter((r) => r.source === "uncategorized");
  const capped = toEscalate.length > MAX_AI_ROWS_PER_REQUEST;
  const targets = capped ? toEscalate.slice(0, MAX_AI_ROWS_PER_REQUEST) : toEscalate;
  const targetIds = new Set(targets.map((t) => t.id));

  const settled = await Promise.allSettled(targets.map((tx) => classifyOne(tx)));

  const byId = new Map<string, AiResult | null>();
  targets.forEach((tx, i) => {
    const r = settled[i];
    byId.set(tx.id, r.status === "fulfilled" ? r.value : null);
  });

  const results = rows.map((row) => {
    if (!targetIds.has(row.id)) return row;
    const ai = byId.get(row.id);
    if (!ai) return row;
    return {
      ...row,
      account: ai.account,
      taxCategory: ai.taxCategory,
      confidence: ai.confidence,
      source: "ai" as const,
      note: ai.reasoning,
    };
  });

  return {
    results,
    aiConfigured: true,
    escalatedCount: targets.length,
    cappedAt: capped ? MAX_AI_ROWS_PER_REQUEST : null,
  };
}
