import { NextRequest, NextResponse } from "next/server";
import { getPdfPageCount } from "@/lib/ocr/imageMeta";
import { buildReceiptCandidate, buildScanMetadata } from "@/lib/ocr/receiptCandidate";
import { classifyReceiptImage, isSupportedPdfMediaType, isSupportedReceiptMediaType } from "@/lib/ocr/receiptOcr";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB。スマホカメラで撮影した高解像度レシート画像を許容する上限

// スキャンデータ読み込み（docs/business-plan.md 12章）はv1では単一ページのPDFのみ対応する。
// 複数ページPDFは「どのページを仕訳対象とするか」が曖昧になるため、ページを分割して
// 個別にアップロードし直してもらう（imageMeta.ts の getPdfPageCount 参照。ベストエフォートの
// ページ数検出のため、判定不能(null)の場合は単一ページ扱いとして先に進める）。
const MAX_PDF_PAGES = 1;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "リクエストの読み取りに失敗しました。画像を選び直して再度お試しください。" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "画像ファイルが見つかりません" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "空のファイルです" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。` },
      { status: 413 }
    );
  }
  if (!isSupportedReceiptMediaType(file.type)) {
    return NextResponse.json(
      { error: "対応していない形式です。JPEG・PNG・GIF・WebP画像、またはPDF（スキャンデータ）でアップロードしてください。" },
      { status: 415 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();

    if (isSupportedPdfMediaType(file.type)) {
      const pageCount = getPdfPageCount(buffer);
      if (pageCount !== null && pageCount > MAX_PDF_PAGES) {
        return NextResponse.json(
          {
            error: `複数ページのPDFには対応していません（${pageCount}ページ検出）。1ページ目のみを抽出するか、レシート/請求書ごとに1ページのPDFに分けて再度アップロードしてください。`,
          },
          { status: 415 }
        );
      }
    }

    const scanMetadata = buildScanMetadata({
      originalFileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      imageBuffer: buffer,
    });

    const base64 = Buffer.from(buffer).toString("base64");
    const classification = await classifyReceiptImage({ base64, mimeType: file.type });
    const candidate = buildReceiptCandidate({
      id: crypto.randomUUID(),
      classification,
      scanMetadata,
    });

    return NextResponse.json({
      candidate,
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  } catch (err) {
    console.error("ocr route failed", err);
    return NextResponse.json(
      { error: "処理中にエラーが発生しました。画像形式をご確認のうえ、再度お試しください。" },
      { status: 500 }
    );
  }
}
