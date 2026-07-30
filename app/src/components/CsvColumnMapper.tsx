"use client";

import { useMemo, useState } from "react";
import { Transaction } from "@/lib/categorize/engine";
import {
  applyCustomMapping,
  CustomColumnMapping,
  CustomMappingValidationError,
} from "@/lib/csv/customMapping";
import { decodeCsvBuffer } from "@/lib/csv/decode";
import { parseCsvText } from "@/lib/csv/parse";

// ------------------------------------------------------------------
// bankFormats.ts が対応する5つの銀行/カード会社に一致しない、または自動判定に
// 失敗したCSVを取り込むためのフォールバックUI。
//
// ユーザー自身に「どの列が日付/摘要/金額（または出金・入金）か」をドロップダウンで
// 指定してもらい、正規化ロジック（src/lib/csv/customMapping.ts）にそのまま渡す。
// 正規化・検証は customMapping.ts に委譲し、このコンポーネントはファイル読み込み・
// フォーム状態管理・プレビュー表示のみを担う。
//
// デフォルトでは折りたたまれた「自分の銀行が見つからない場合」の入口リンクとして表示し、
// 既存の銀行別アップロードフローの邪魔をしない（クリックすると本体のマッピングUIが開く）。
// ------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 他のCSV取込（app/page.tsx等）と上限を揃える
const PREVIEW_ROW_LIMIT = 5;

export type CustomMappingAmountMode = CustomColumnMapping["mode"];

export interface CsvColumnMapperProps {
  /** 正規化に成功したマッピングで「この内容で取り込む」が押された時に呼ばれる */
  onApply?: (transactions: Transaction[], mapping: CustomColumnMapping) => void;
  /** true の場合、折りたたみリンクを表示せず最初からマッピングUIを開いた状態にする */
  startExpanded?: boolean;
  className?: string;
}

const selectClass =
  "w-full border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-red-700 dark:focus:border-red-400";
const labelClass = "block text-xs text-stone-500 dark:text-stone-400 mb-1";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function fieldSelect(
  header: string[],
  value: string,
  onChange: (v: string) => void,
  placeholder: string,
  idPrefix: string
) {
  return (
    <select id={idPrefix} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">{placeholder}</option>
      {header.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );
}

export function CsvColumnMapper({ onApply, startExpanded = false, className }: CsvColumnMapperProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [fileName, setFileName] = useState<string | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [csvText, setCsvText] = useState<string>("");
  const [readError, setReadError] = useState<string | null>(null);
  const [amountMode, setAmountMode] = useState<CustomMappingAmountMode>("signed");
  const [dateField, setDateField] = useState("");
  const [descField, setDescField] = useState("");
  const [amountField, setAmountField] = useState("");
  const [withdrawField, setWithdrawField] = useState("");
  const [depositField, setDepositField] = useState("");
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  async function handleFile(file: File) {
    setReadError(null);
    setAppliedCount(null);
    setDateField("");
    setDescField("");
    setAmountField("");
    setWithdrawField("");
    setDepositField("");

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setReadError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。期間を分けてアップロードしてください。`);
      setFileName(null);
      setHeader([]);
      setCsvText("");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const { text } = decodeCsvBuffer(buffer);
      const rows = parseCsvText(text);
      setFileName(file.name);
      if (rows.length === 0) {
        setReadError("CSVからヘッダー行を読み取れませんでした。ファイルの内容をご確認ください。");
        setHeader([]);
        setCsvText("");
        return;
      }
      setHeader(rows[0]);
      setCsvText(text);
    } catch {
      setReadError("ファイルの読み込みに失敗しました。文字化けやフォーマット崩れがないかご確認ください。");
      setHeader([]);
      setCsvText("");
    }
  }

  const mapping: CustomColumnMapping = useMemo(() => {
    if (amountMode === "signed") {
      return { mode: "signed", date: dateField, description: descField, amount: amountField };
    }
    return { mode: "split", date: dateField, description: descField, withdraw: withdrawField, deposit: depositField };
  }, [amountMode, dateField, descField, amountField, withdrawField, depositField]);

  const result = useMemo(() => {
    if (!csvText) return null;
    return applyCustomMapping(csvText, mapping);
  }, [csvText, mapping]);

  const errorsByField = useMemo(() => {
    if (!result || result.ok) return new Map<string, CustomMappingValidationError>();
    return new Map(result.errors.map((e) => [e.field, e]));
  }, [result]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`text-sm text-red-700 dark:text-red-400 underline hover:no-underline ${className ?? ""}`}
      >
        自分の銀行が見つからない場合はこちら（CSVの列を自分で指定して取り込む）
      </button>
    );
  }

  return (
    <div className={`border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 flex flex-col gap-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">CSVの列を自分で指定して取り込む</h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-xl">
            対応銀行の一覧に無い銀行・カード会社のCSVでも、どの列が「日付」「摘要」「金額」（または「出金」「入金」）に
            対応するかをご自身で指定すれば取り込めます。ファイルはサーバーに送信されず、お使いのブラウザ内だけで処理します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-stone-500 dark:text-stone-400 underline hover:no-underline whitespace-nowrap"
        >
          閉じる
        </button>
      </div>

      <div>
        <label
          className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm cursor-pointer transition-colors border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 hover:border-red-700 dark:hover:border-red-400`}
        >
          <span>CSVファイルを選択</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <span className="ml-3 text-xs text-stone-500 dark:text-stone-400">{fileName}</span>}
      </div>

      {readError && <p className="text-sm text-red-700 dark:text-red-400">{readError}</p>}

      {header.length > 0 && (
        <>
          <div className="text-xs text-stone-500 dark:text-stone-400">
            検出したヘッダー列: {header.map((h) => `「${h}」`).join(" ")}
          </div>

          <div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-2" id="amount-mode-label">
              金額の列の形式
            </div>
            <div className="flex items-center gap-3 flex-wrap" role="group" aria-labelledby="amount-mode-label">
              <button
                type="button"
                aria-pressed={amountMode === "signed"}
                onClick={() => setAmountMode("signed")}
                className={`text-sm px-4 py-2 border transition-colors ${
                  amountMode === "signed"
                    ? "bg-stone-900 border-stone-900 text-white dark:bg-stone-100 dark:border-stone-100 dark:text-stone-900"
                    : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
                }`}
              >
                金額は1列（符号あり）
              </button>
              <button
                type="button"
                aria-pressed={amountMode === "split"}
                onClick={() => setAmountMode("split")}
                className={`text-sm px-4 py-2 border transition-colors ${
                  amountMode === "split"
                    ? "bg-stone-900 border-stone-900 text-white dark:bg-stone-100 dark:border-stone-100 dark:text-stone-900"
                    : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
                }`}
              >
                出金・入金が別の列
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="mapper-date">
                日付の列
              </label>
              {fieldSelect(header, dateField, setDateField, "選択してください", "mapper-date")}
              {errorsByField.get("date") && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-400">{errorsByField.get("date")?.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="mapper-description">
                摘要（取引内容）の列
              </label>
              {fieldSelect(header, descField, setDescField, "選択してください", "mapper-description")}
              {errorsByField.get("description") && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-400">{errorsByField.get("description")?.message}</p>
              )}
            </div>

            {amountMode === "signed" ? (
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="mapper-amount">
                  金額の列（支出は負の値、収入は正の値になっている想定）
                </label>
                {fieldSelect(header, amountField, setAmountField, "選択してください", "mapper-amount")}
                {errorsByField.get("amount") && (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-400">{errorsByField.get("amount")?.message}</p>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass} htmlFor="mapper-withdraw">
                    出金の列（任意。入金列と合わせてどちらか一方は必須）
                  </label>
                  {fieldSelect(header, withdrawField, setWithdrawField, "（未選択）", "mapper-withdraw")}
                  {errorsByField.get("withdraw") && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{errorsByField.get("withdraw")?.message}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="mapper-deposit">
                    入金の列（任意。出金列と合わせてどちらか一方は必須）
                  </label>
                  {fieldSelect(header, depositField, setDepositField, "（未選択）", "mapper-deposit")}
                  {errorsByField.get("deposit") && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{errorsByField.get("deposit")?.message}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {result && result.ok && (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-stone-500 dark:text-stone-400 flex flex-wrap gap-x-6 gap-y-1">
                <span>取込件数: {result.transactions.length}件（スキップ {result.skippedRows}件）</span>
              </div>

              {result.transactions.length === 0 ? (
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  列の指定は正しく認識されましたが、データ行が見つかりませんでした。
                </p>
              ) : (
                <div className="overflow-x-auto border border-stone-300 dark:border-stone-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                        <th className="px-3 py-2 font-normal">日付</th>
                        <th className="px-3 py-2 font-normal">摘要</th>
                        <th className="px-3 py-2 font-normal text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.transactions.slice(0, PREVIEW_ROW_LIMIT).map((t) => (
                        <tr key={t.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">{t.date}</td>
                          <td className="px-3 py-2 max-w-xs truncate" title={t.description}>
                            {t.description}
                          </td>
                          <td
                            className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${
                              t.amount < 0 ? "text-stone-700 dark:text-stone-300" : "text-emerald-700 dark:text-emerald-400"
                            }`}
                          >
                            {yen.format(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.transactions.length > PREVIEW_ROW_LIMIT && (
                    <p className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">
                      …ほか{result.transactions.length - PREVIEW_ROW_LIMIT}件（プレビューは先頭{PREVIEW_ROW_LIMIT}件のみ表示）
                    </p>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  disabled={result.transactions.length === 0}
                  onClick={() => {
                    onApply?.(result.transactions, mapping);
                    setAppliedCount(result.transactions.length);
                  }}
                  className={`text-sm px-5 py-2.5 border transition-colors ${
                    result.transactions.length === 0
                      ? "border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed"
                      : "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300"
                  }`}
                >
                  この内容で取り込む
                </button>
                {appliedCount != null && (
                  <span className="ml-3 text-xs text-emerald-700 dark:text-emerald-400">{appliedCount}件を取り込みました</span>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed max-w-xl">
            この機能で読み取った内容も、他のCSV取込と同様にAIによる仕訳判定を通していません（または簡易な下書きです）。
            列の対応関係・金額の符号（支出=負、収入=正）が正しいか、必ずご自身でプレビューをご確認のうえ取り込んでください。
          </p>
        </>
      )}
    </div>
  );
}
