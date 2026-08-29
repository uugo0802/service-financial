"use client";

import { useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import {
  MIGRATION_FORMATS,
  MigrationDetectedColumns,
  MigrationFormatId,
  parseMigrationCsvBuffer,
} from "@/lib/csv/migrationImport";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // このアプリの他のCSV取込（app/page.tsx）と上限を揃える

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

interface ImportedState {
  fileName: string;
  /** parseMigrationCsvBuffer が formatId: null を返した場合はエラー表示に回すため、この state には保持しない */
  formatId: MigrationFormatId;
  encoding: "utf-8" | "shift_jis";
  transactions: CategorizedTransaction[];
  skippedRows: number;
  detectedColumns: MigrationDetectedColumns;
}

/**
 * freee会計 / マネーフォワード クラウド会計・確定申告からエクスポートした仕訳帳CSVを読み込み、
 * このアプリの取引形式（CategorizedTransaction）に正規化してプレビューするフォーム。
 *
 * このコンポーネントは lib/csv/migrationImport.ts の純粋関数（ファイル読み込み・文字コード判定・
 * 借方/貸方の圧縮ロジック）をブラウザ上でそのまま呼び出すだけで、サーバーへのアップロードは行わない
 * （AIによる再判定を必要としないため、他のCSV取込・レシートOCRとは異なりAPIルートを経由しない）。
 */
export function MigrationImportForm() {
  const [formatOverride, setFormatOverride] = useState<MigrationFormatId | "auto">("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedState | null>(null);

  async function handleFile(file: File) {
    if (loading) return; // 解析中の二重送信を防止
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。年度を分けてエクスポートし直してください。`);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMigrationCsvBuffer(buffer, formatOverride === "auto" ? undefined : formatOverride);

      if (!parsed.formatId) {
        setError(
          "freee / マネーフォワードの仕訳帳エクスポートとして認識できませんでした。列名が「日付(または取引日)・借方勘定科目・貸方勘定科目(または貸方科目)・金額・摘要」を含む仕訳帳（journal）形式のCSVかご確認ください。"
        );
        return;
      }

      setResult({
        fileName: file.name,
        formatId: parsed.formatId,
        encoding: parsed.encoding,
        transactions: parsed.transactions,
        skippedRows: parsed.skippedRows,
        detectedColumns: parsed.detectedColumns,
      });
    } catch {
      setError("ファイルの読み込みに失敗しました。文字化けやフォーマット崩れがないかご確認ください。");
    } finally {
      setLoading(false);
    }
  }

  const needsReviewCount = result ? result.transactions.filter((t) => t.source === "uncategorized" || t.confidence < 0.75).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
        freee会計・マネーフォワード クラウド会計/確定申告からエクスポートした<b>仕訳帳（journal）のCSV</b>
        をアップロードすると、このアプリの取引形式に変換してプレビューします。
        複式簿記の借方・貸方は自動的に1件の符号付き金額に集約されるため、
        <b>勘定科目・金額の符号・消費税区分は必ずご自身で確認・修正してから記帳データとして取り込んでください。</b>
        個別具体的な税務相談は行っておらず、あくまで移行作業を補助する下書き変換です。
      </p>

      <div>
        <div className="text-xs text-muted-foreground mb-2" id="format-override-label">
          移行元ソフト
        </div>
        <div className="flex items-center gap-3 flex-wrap" role="group" aria-labelledby="format-override-label">
          <FormatButton current={formatOverride} value="auto" label="自動判定" onSelect={setFormatOverride} />
          {(Object.values(MIGRATION_FORMATS)).map((def) => (
            <FormatButton key={def.id} current={formatOverride} value={def.id} label={def.label} onSelect={setFormatOverride} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">仕訳帳CSV</div>
        <label
          className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
            loading
              ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
              : "border-border bg-surface cursor-pointer hover:border-red-700"
          }`}
        >
          <span>{loading ? "解析中…" : "CSVファイルを選択"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
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
        {result && <span className="ml-3 text-xs text-muted-foreground">{result.fileName}</span>}
        <p className="mt-2 text-xs text-muted-foreground max-w-md leading-relaxed">
          対応列名: 日付/取引日、借方勘定科目、貸方勘定科目/貸方科目、金額、摘要。
          文字コードはUTF-8・Shift-JISを自動判定します。
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {result && (
        <>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
            <span>判定フォーマット: {MIGRATION_FORMATS[result.formatId].label}</span>
            <span>文字コード: {result.encoding === "shift_jis" ? "Shift-JIS(自動検出)" : "UTF-8"}</span>
            <span>取込件数: {result.transactions.length}件（スキップ {result.skippedRows}件）</span>
            <span>要確認: {needsReviewCount}件</span>
          </div>

          {result.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              フォーマットは認識できましたが、データ行が見つかりませんでした。ヘッダーのみのファイルでないかご確認ください。
            </p>
          ) : (
            <div className="overflow-x-auto border border-border bg-surface">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">日付</th>
                    <th className="px-3 py-2 font-normal">摘要</th>
                    <th className="px-3 py-2 font-normal text-right">金額</th>
                    <th className="px-3 py-2 font-normal">勘定科目（移行元のまま）</th>
                    <th className="px-3 py-2 font-normal">消費税区分</th>
                    <th className="px-3 py-2 font-normal">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {result.transactions.map((t) => {
                    const needsReview = t.source === "uncategorized" || t.confidence < 0.75;
                    return (
                      <tr key={t.id} className={`border-b border-border/60 last:border-0 ${needsReview ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{t.date}</td>
                        <td className="px-3 py-2 max-w-[10rem] sm:max-w-xs truncate" title={t.description}>
                          {t.description}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${t.amount < 0 ? "text-foreground" : "text-emerald-700"}`}>
                          {yen.format(t.amount)}
                        </td>
                        <td className="px-3 py-2">{t.account}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{t.taxCategory}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {t.source === "rule" && <span className="text-emerald-700">自動確定</span>}
                          {t.source === "uncategorized" && <span className="text-red-700">要確認</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FormatButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: MigrationFormatId | "auto";
  value: MigrationFormatId | "auto";
  label: string;
  onSelect: (v: MigrationFormatId | "auto") => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
      className={`text-sm px-4 py-2 border transition-colors ${
        current === value
          ? "bg-accent border-accent text-white"
          : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}
