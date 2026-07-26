"use client";

import { useEffect, useState } from "react";
import { ReceiptJournalCandidate, recordCorrection } from "@/lib/ocr/receiptCandidate";
import { TAX_CATEGORIES } from "@/lib/ocr/receiptOcr";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // サーバー側(app/api/ocr/route.ts)の上限と揃える

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

export function ReceiptUpload({
  onConfirm,
}: {
  /** 利用者が内容を確認・確定したレシート仕訳候補を親コンポーネントへ渡すコールバック */
  onConfirm?: (candidate: ReceiptJournalCandidate) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [candidate, setCandidate] = useState<ReceiptJournalCandidate | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  useEffect(() => {
    // 選択中のファイルのオブジェクトURLは差し替え・アンマウント時に必ず解放する
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFile(file: File) {
    if (loading) return; // 解析中の二重送信を防止

    setError(null);
    setCandidate(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

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
    setConfirmedCount((n) => n + 1);
    setCandidate(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
        レシート・請求書をカメラで撮影またはファイルから選択してアップロードすると、
        Claudeが画像から日付・金額・取引先を読み取り、勘定科目・消費税区分を自動判定します。
        <b>読み取り結果は必ずご自身で確認・修正してから確定してください。</b>
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <label
          className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
            loading
              ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
              : "border-stone-400 bg-white cursor-pointer hover:border-red-700"
          }`}
        >
          <span>{loading ? "解析中…" : "レシート画像を撮影・選択"}</span>
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
        {confirmedCount > 0 && <span className="text-xs text-stone-500">確定済み: {confirmedCount}件</span>}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!aiConfigured && (
        <p className="text-xs text-amber-700">
          ANTHROPIC_API_KEYが未設定のため、画像からの自動読み取りは行われていません（「要確認」のまま表示されています）。
        </p>
      )}

      {previewUrl && (
        <div className="flex flex-col sm:flex-row gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- ユーザーが選択したローカル画像のプレビューのため next/image の最適化対象外 */}
          <img src={previewUrl} alt="アップロードしたレシートのプレビュー" className="max-w-xs border border-stone-300 object-contain" />

          {candidate && (
            <div className="flex-1 flex flex-col gap-3 border border-stone-300 bg-white p-4">
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
