import { NextRequest, NextResponse } from "next/server";
import { normalizeCsv } from "@/lib/csv/parse";
import { decodeCsvBuffer } from "@/lib/csv/decode";
import { ruleBasedCategorize } from "@/lib/categorize/engine";
import { escalateWithAi } from "@/lib/categorize/aiEscalate";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "CSVファイルが見つかりません" }, { status: 400 });
  }

  const { text, encoding } = decodeCsvBuffer(await file.arrayBuffer());
  const { transactions, skippedRows, detectedColumns } = normalizeCsv(text);

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: "取引データを読み取れませんでした。ヘッダー行に「日付」「摘要」「金額」（または出金/入金）の列があるか確認してください。" },
      { status: 422 }
    );
  }

  const ruleCategorized = transactions.map(ruleBasedCategorize);
  const { results, aiConfigured, escalatedCount, cappedAt } = await escalateWithAi(ruleCategorized);

  return NextResponse.json({
    transactions: results,
    meta: {
      total: results.length,
      skippedRows,
      detectedColumns,
      encoding,
      aiConfigured,
      escalatedCount,
      cappedAt,
      autoConfirmedCount: results.filter((r) => r.source === "rule").length,
      needsReviewCount: results.filter((r) => r.source === "uncategorized" || r.confidence < 0.75).length,
    },
  });
}
