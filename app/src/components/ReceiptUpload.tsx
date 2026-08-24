"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getCameraCaptureLabel, getFilePickerLabel, isCameraCaptureSupported } from "@/lib/ocr/cameraCapture";
import { hasRecommendedMinimumResolution, parseImageDimensions } from "@/lib/ocr/imageMeta";
import { ReceiptJournalCandidate, recordCorrection } from "@/lib/ocr/receiptCandidate";
import { findReceiptDuplicate } from "@/lib/ocr/receiptDuplicateDetection";
import { isSupportedPdfMediaType, TAX_CATEGORIES } from "@/lib/ocr/receiptOcr";
import { evaluateScannerStorageCompliance } from "@/lib/ocr/scannerStorageCompliance";

// ファイル選択(カメラ以外)の入力は画像に加え、スキャンデータ読み込み（docs/business-plan.md 12章）
// としてPDFも受け付ける。カメラ撮影(capture="environment")は端末カメラでの直接撮影用のため画像のみ。
const FILE_PICKER_ACCEPT = "image/*,application/pdf";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // サーバー側(app/api/ocr/route.ts)の上限と揃える

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

// isCameraCaptureSupported()の判定結果はマウント後に変化しないため、購読は何もしない
function subscribeNoop() {
  return () => {};
}

export function ReceiptUpload({
  onConfirm,
}: {
  /** 利用者が内容を確認・確定したレシート仕訳候補を親コンポーネントへ渡すコールバック */
  onConfirm?: (candidate: ReceiptJournalCandidate) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [candidate, setCandidate] = useState<ReceiptJournalCandidate | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [resolutionHint, setResolutionHint] = useState<string | null>(null);
  const [scannerComplianceReasons, setScannerComplianceReasons] = useState<string[]>([]);
  // このセッション内で既に「確定する」ボタンを押したレシート候補（重複検出用）。
  // CSV側(duplicateDetection.ts)と同様、DB非永続化のプロトタイプのためセッション内限定の検出。
  const [confirmedReceipts, setConfirmedReceipts] = useState<ReceiptJournalCandidate[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<{ matchedExistingId: string } | null>(null);
  // navigatorはサーバー側で参照できないため、SSR時は「未対応」扱いの既定値を返し、
  // クライアントでの実際の値とはuseSyncExternalStoreがハイドレーション不一致なく同期する。
  const cameraSupported = useSyncExternalStore(
    subscribeNoop,
    () => isCameraCaptureSupported(),
    () => false
  );

  useEffect(() => {
    // 選択中のファイルのオブジェクトURLは差し替え・アンマウント時に必ず解放する
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // アップロード前にクライアント側だけで分かる「明らかに解像度が低い」ケースを、
  // サーバーの解析結果を待たずに即座にお知らせするための非ブロッキングな事前チェック。
  // カメラ撮影直後にその場で撮り直せるようにするのが狙い（電子帳簿保存法 スキャナ保存要件の目安）。
  // 失敗しても本来のアップロード・解析フロー（handleFile）には一切影響させない。
  async function updateResolutionHint(file: File) {
    setResolutionHint(null);
    try {
      const buffer = await file.arrayBuffer();
      const dims = parseImageDimensions(buffer, file.type);
      if (dims && !hasRecommendedMinimumResolution(dims)) {
        setResolutionHint(
          "画像の解像度が低い可能性があります。電子帳簿保存法のスキャナ保存要件の目安（200dpi相当）に近づけるため、明るい場所でレシート全体が大きく写るように撮影し直すことをおすすめします。"
        );
      }
    } catch {
      // 事前チェックはあくまで補助的な注意喚起のため、失敗しても無視する
    }
  }

  // 紙のレシート原本を破棄する予定がある場合に関係する、電子帳簿保存法スキャナ保存要件
  // （解像度200dpi相当以上・カラー画像）についてのベストエフォートな事前チェック。
  // src/lib/ocr/scannerStorageCompliance.ts のヒューリスティックに基づく「参考情報」であり、
  // 法的な充足保証ではない（詳細は同モジュールの免責コメントを参照）。あくまでアドバイザリー
  // 表示のため、判定結果によってアップロード自体をブロックすることはしない（本人の判断で続行可能）。
  async function updateScannerComplianceWarning(file: File) {
    setScannerComplianceReasons([]);
    try {
      const buffer = await file.arrayBuffer();
      const dims = parseImageDimensions(buffer, file.type);
      const result = evaluateScannerStorageCompliance(dims);
      if (!result.passed) {
        setScannerComplianceReasons(result.reasons);
      }
    } catch {
      // 事前チェックはあくまで補助的な注意喚起のため、失敗しても無視する
    }
  }

  async function handleFile(file: File) {
    if (loading) return; // 解析中の二重送信を防止

    setError(null);
    setCandidate(null);
    setDuplicateWarning(null);
    void updateResolutionHint(file);
    void updateScannerComplianceWarning(file);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewFileName(file.name);
    setPreviewIsPdf(isSupportedPdfMediaType(file.type));

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析に失敗しました");
        return;
      }
      setCandidate(data.candidate);
      setAiConfigured(data.aiConfigured);
      setDuplicateWarning(findReceiptDuplicate(confirmedReceipts, data.candidate));
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof ReceiptJournalCandidate>(field: K, value: ReceiptJournalCandidate[K]) {
    setCandidate((prev) => {
      if (!prev) return prev;
      if (prev[field] === value) return prev;
      return recordCorrection(prev, field, prev[field], value) as ReceiptJournalCandidate;
    });
  }

  function handleConfirm() {
    if (!candidate) return;
    onConfirm?.(candidate);
    setConfirmedReceipts((prev) => [...prev, candidate]);
    setConfirmedCount((n) => n + 1);
    setCandidate(null);
    setDuplicateWarning(null);
    setResolutionHint(null);
    setScannerComplianceReasons([]);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewFileName(null);
    setPreviewIsPdf(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
        レシート・請求書をカメラで撮影、または画像ファイル・PDF（スキャンデータ、単一ページのみ対応）を選択してアップロードすると、
        Claudeが読み取り内容から日付・金額・取引先を抽出し、勘定科目・消費税区分を自動判定します。
        <b>読み取り結果は必ずご自身で確認・修正してから確定してください。</b>
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        {/* カメラでの撮影に特化した入り口。既存のファイル選択（下記）を置き換えるものではなく、
            モバイル端末でその場で撮影したいユーザー向けに並べて用意する追加の導線。 */}
        {cameraSupported && (
          <label
            className={`inline-flex min-w-[11rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
              loading
                ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
                : "border-stone-400 bg-white cursor-pointer hover:border-red-700"
            }`}
          >
            <span>{getCameraCaptureLabel(loading)}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={loading}
              aria-busy={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = ""; // 同じファイルを選び直しても再度onChangeが発火するようにする
              }}
            />
          </label>
        )}

        <label
          className={`inline-flex min-w-[11rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
            loading
              ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
              : "border-stone-400 bg-white cursor-pointer hover:border-red-700"
          }`}
        >
          <span>{getFilePickerLabel(loading)}</span>
          <input
            type="file"
            accept={FILE_PICKER_ACCEPT}
            className="hidden"
            disabled={loading}
            aria-busy={loading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = ""; // 同じファイルを選び直しても再度onChangeが発火するようにする
            }}
          />
        </label>
        {confirmedCount > 0 && <span className="text-xs text-stone-500">確定済み: {confirmedCount}件</span>}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && resolutionHint && <p className="text-xs text-amber-700">{resolutionHint}</p>}
      {!error && scannerComplianceReasons.length > 0 && (
        <div
          role="status"
          className="max-w-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1"
        >
          <p className="font-semibold">
            紙原本を破棄する場合の電子帳簿保存法スキャナ保存要件を満たさない可能性があります（参考情報・アップロードは継続できます）
          </p>
          {scannerComplianceReasons.map((reason, i) => (
            <p key={i}>{reason}</p>
          ))}
          <p>最終的な要件充足の判断はご自身（必要に応じて税理士等の専門家）でご確認ください。紙原本を破棄しない場合はこの警告は無視して構いません。</p>
        </div>
      )}
      {!aiConfigured && (
        <p className="text-xs text-amber-700">
          ANTHROPIC_API_KEYが未設定のため、画像からの自動読み取りは行われていません（「要確認」のまま表示されています）。
        </p>
      )}

      {previewUrl && (
        <div className="flex flex-col sm:flex-row gap-6">
          {previewIsPdf ? (
            // PDFは<img>で描画できないため、ファイル名とブラウザの標準ビューアで開けるリンクのみを示す簡易プレビュー
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-xs flex-col items-center justify-center gap-2 border border-stone-300 bg-stone-50 p-6 text-center text-xs text-stone-600 hover:border-red-700"
            >
              <span aria-hidden className="text-3xl">📄</span>
              <span className="break-all">{previewFileName}</span>
              <span className="text-stone-400">クリックしてPDFを開く</span>
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- ユーザーが選択したローカル画像のプレビューのため next/image の最適化対象外
            <img src={previewUrl} alt="アップロードしたレシートのプレビュー" className="max-w-xs border border-stone-300 object-contain" />
          )}

          {candidate && (
            <div className="flex-1 flex flex-col gap-3 border border-stone-300 bg-white p-4">
              {duplicateWarning && (
                <div role="status" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-semibold">同じ日付・金額・取引先のレシートを既にこのセッションで確定済みです（重複の可能性）</p>
                  <p className="mt-1">二重に経費計上していないか、内容をご確認のうえ確定してください。</p>
                </div>
              )}
              <div className="text-sm font-semibold">
                読み取り結果{" "}
                {candidate.source === "ai" ? (
                  <span className="text-xs text-sky-700">（AI判定 {Math.round(candidate.confidence * 100)}%）</span>
                ) : (
                  <span className="text-xs text-red-700">（要確認・未読み取り）</span>
                )}
              </div>

              <Field label="日付">
                <input
                  type="date"
                  className="w-full border border-stone-300 rounded px-2 py-1.5 text-sm"
                  value={candidate.date ?? ""}
                  onChange={(e) => updateField("date", e.target.value || null)}
                />
              </Field>
              <Field label="取引先">
                <input
                  type="text"
                  className="w-full border border-stone-300 rounded px-2 py-1.5 text-sm"
                  value={candidate.counterparty ?? ""}
                  onChange={(e) => updateField("counterparty", e.target.value || null)}
                  placeholder="例: 株式会社〇〇"
                />
              </Field>
              <Field label="金額（円）">
                <input
                  type="number"
                  className="w-full border border-stone-300 rounded px-2 py-1.5 text-sm"
                  value={candidate.amount ?? ""}
                  onChange={(e) => updateField("amount", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="勘定科目">
                <input
                  type="text"
                  className="w-full border border-stone-300 rounded px-2 py-1.5 text-sm"
                  value={candidate.account}
                  onChange={(e) => updateField("account", e.target.value)}
                />
              </Field>
              <Field label="消費税区分">
                <select
                  className="w-full border border-stone-300 rounded px-2 py-1.5 text-sm bg-white"
                  value={candidate.taxCategory}
                  onChange={(e) => updateField("taxCategory", e.target.value as ReceiptJournalCandidate["taxCategory"])}
                >
                  {TAX_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              {candidate.reasoning && <p className="text-xs text-stone-500">判定根拠: {candidate.reasoning}</p>}

              <ScanMetadataPanel candidate={candidate} />

              <button
                type="button"
                onClick={handleConfirm}
                className="mt-2 text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors self-start"
              >
                この内容で確定する
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500">
      {label}
      {children}
    </label>
  );
}

function ScanMetadataPanel({ candidate }: { candidate: ReceiptJournalCandidate }) {
  const m = candidate.scanMetadata;
  return (
    <div className="mt-2 border-t border-stone-200 pt-3 text-xs text-stone-500 space-y-1">
      <div className="font-semibold text-stone-600">保存メタデータ（電子帳簿保存法 スキャナ保存要件の確認用）</div>
      <div>取込日時: {new Date(m.uploadedAt).toLocaleString("ja-JP")}</div>
      <div>
        解像度: {m.width && m.height ? `${m.width}×${m.height}px（概算 ${m.estimatedDpi}dpi）` : "判定不能"} ／ カラー:{" "}
        {m.isColor === null ? "判定不能" : m.isColor ? "はい" : "いいえ（グレースケール）"}
      </div>
      <div>ファイルサイズ: {yen.format(Math.round(m.sizeBytes / 1024))}KB</div>
      <div className={m.meetsScannerStorageRequirement ? "text-emerald-700" : "text-amber-700"}>
        {m.meetsScannerStorageRequirement
          ? "スキャナ保存要件（200dpi相当以上・カラー画像）を満たす見込みです"
          : "スキャナ保存要件を満たさない可能性があります"}
      </div>
      {m.scannerStorageWarnings.map((w, i) => (
        <div key={i} className="text-amber-700">
          {w}
        </div>
      ))}
    </div>
  );
}
