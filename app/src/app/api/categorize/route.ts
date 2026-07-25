import { NextRequest, NextResponse } from "next/server";
import { normalizeCsv } from "@/lib/csv/parse";
import { decodeCsvBuffer } from "@/lib/csv/decode";
import { ruleBasedCategorize } from "@/lib/categorize/engine";
import { escalateWithAi } from "@/lib/categorize/aiEscalate";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB。個人事業主・マイクロ法人の年間明細CSVとしては十分な余裕を見た上限

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "リクエストの読み取りに失敗しました。ファイルを選び直して再度お試しください。" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "CSVファイルが見つかりません" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "空のファイルです" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。期間を分けてアップロードしてください。` },
      { status: 413 }
    );
  }

  try {
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
  } catch (err) {
    console.error("categorize route failed", err);
    return NextResponse.json(
      { error: "処理中にエラーが発生しました。ファイル形式をご確認のうえ、再度お試しください。" },
      { status: 500 }
    );
  }
}
