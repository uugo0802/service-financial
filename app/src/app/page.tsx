"use client";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { estimateForIndividual, ItemizedDeductionInput } from "@/lib/tax/estimate";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildIndividualTaxSavingChecklist, buildCorporateTaxSavingChecklist } from "@/lib/tax/taxSavingChecklist";
import { DocumentPreview } from "@/components/DocumentPreview";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { ReceiptJournalCandidate } from "@/lib/ocr/receiptCandidate";
import { TaxSavingChecklistSection } from "@/components/TaxSavingChecklistSection";
import { SubmissionGuide } from "@/components/SubmissionGuide";
import { AdvisorReferralBanner } from "@/components/AdvisorReferralBanner";
import { detectDuplicates, DuplicateMatch } from "@/lib/csv/duplicateDetection";

type EntityMode = "individual" | "corp";

interface ApiMeta {
  total: number;
  skippedRows: number;
  detectedColumns: { date: string; description: string; amount: string };
  encoding: "utf-8" | "shift_jis";
  aiConfigured: boolean;
  escalatedCount: number;
  cappedAt: number | null;
  autoConfirmedCount: number;
  needsReviewCount: number;
}

/** 2回目以降のアップロードで、直前までの取込結果と重複している疑いがある行が見つかった場合に保持する内容 */
interface PendingDuplicateUpload {
  matches: DuplicateMatch[];
  pendingRows: CategorizedTransaction[];
  pendingMeta: ApiMeta;
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export default function Home() {
  const [rows, setRows] = useState<CategorizedTransaction[] | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<EntityMode>("individual");
  const [entityName, setEntityName] = useState("");
  const [showDocuments, setShowDocuments] = useState(false);
  const [capitalStock, setCapitalStock] = useState("1000000");
  const [openingCash, setOpeningCash] = useState("1000000");
  const [shareCount, setShareCount] = useState("");
  const [receiptCandidates, setReceiptCandidates] = useState<ReceiptJournalCandidate[]>([]);
  const [pendingDuplicateUpload, setPendingDuplicateUpload] = useState<PendingDuplicateUpload | null>(null);
  const [flaggedDuplicateIds, setFlaggedDuplicateIds] = useState<Set<string>>(new Set());

  // 生命保険料控除・地震保険料控除・寄附金控除（ふるさと納税を含む）・医療費控除・
  // 小規模企業共済等掛金控除（iDeCoを含む）の任意入力。すべて空欄のままなら
  // itemizedDeductionOptionsはundefinedのままとなり、estimateForIndividualの挙動は
  // これらの項目を追加する前と完全に同一になる（lib/tax/estimate.tsのitemizedDeductionOptions
  // と同じ「未指定なら考慮しない」後方互換パターン）。
  const [showItemizedDeductions, setShowItemizedDeductions] = useState(false);
  const [lifeInsGeneral, setLifeInsGeneral] = useState("");
  const [lifeInsNursingMedical, setLifeInsNursingMedical] = useState("");
  const [lifeInsPersonalPension, setLifeInsPersonalPension] = useState("");
  const [earthquakeInsurancePremium, setEarthquakeInsurancePremium] = useState("");
  const [donations, setDonations] = useState("");
  const [medicalExpenses, setMedicalExpenses] = useState("");
  const [medicalExpenseReimbursements, setMedicalExpenseReimbursements] = useState("");
  const [mutualAidContributions, setMutualAidContributions] = useState("");

  const itemizedDeductionOptions = useMemo<ItemizedDeductionInput | undefined>(() => {
    const toNumberOrUndefined = (v: string) => (v.trim() === "" ? undefined : Number(v) || 0);
    const general = toNumberOrUndefined(lifeInsGeneral);
    const nursingMedical = toNumberOrUndefined(lifeInsNursingMedical);
    const personalPension = toNumberOrUndefined(lifeInsPersonalPension);
    const earthquake = toNumberOrUndefined(earthquakeInsurancePremium);
    const donationsAmount = toNumberOrUndefined(donations);
    const medicalExpensesAmount = toNumberOrUndefined(medicalExpenses);
    const medicalExpenseReimbursementsAmount = toNumberOrUndefined(medicalExpenseReimbursements);
    const mutualAidAmount = toNumberOrUndefined(mutualAidContributions);

    const hasAnyInput =
      [general, nursingMedical, personalPension, earthquake, donationsAmount, medicalExpensesAmount, medicalExpenseReimbursementsAmount, mutualAidAmount].some(
        (v) => v !== undefined
      );
    if (!hasAnyInput) return undefined; // 何も入力されていなければオプション自体を渡さず、従来どおりの挙動にする

    return {
      lifeInsurancePremiums: { general, nursingMedical, personalPension },
      earthquakeInsurancePremium: earthquake,
      donations: donationsAmount,
      medicalExpenses: medicalExpensesAmount,
      medicalExpenseReimbursements: medicalExpenseReimbursementsAmount,
      smallBusinessMutualAidContributions: mutualAidAmount,
    };
  }, [
    lifeInsGeneral,
    lifeInsNursingMedical,
    lifeInsPersonalPension,
    earthquakeInsurancePremium,
    donations,
    medicalExpenses,
    medicalExpenseReimbursements,
    mutualAidContributions,
  ]);

  const individualEstimate = useMemo(
    () => (rows ? estimateForIndividual(rows, undefined, undefined, itemizedDeductionOptions) : null),
    [rows, itemizedDeductionOptions]
  );
  const corpEstimate = useMemo(() => (rows ? estimateForMicroCorp(rows) : null), [rows]);
  const individualChecklist = useMemo(
    () => (rows && individualEstimate ? buildIndividualTaxSavingChecklist(individualEstimate, rows) : null),
    [rows, individualEstimate]
  );
  const corpChecklist = useMemo(
    () => (rows && corpEstimate ? buildCorporateTaxSavingChecklist(corpEstimate, rows) : null),
    [rows, corpEstimate]
  );

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // サーバー側(app/api/categorize/route.ts)の上限と揃える

  async function handleFile(file: File) {
    if (loading) return; // 解析中は二重送信を防ぐ（ファイル入力は無効化しているが念のため）
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。期間を分けてアップロードしてください。`);
      return;
    }
    setLoading(true);
    setError(null);
    setFileName(file.name);
    setPendingDuplicateUpload(null); // 前回の警告が残っていれば、新しいアップロードの結果でクリアする
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/categorize", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析に失敗しました");
        setRows(null);
        setMeta(null);
        setFlaggedDuplicateIds(new Set());
        return;
      }

      const newRows: CategorizedTransaction[] = data.transactions;
      // このプロトタイプはアップロード内容をDBに永続化していないため、重複検出は「今セッションで
      // 直前まで画面に表示していた rows」との突き合わせに限定される（詳細は duplicateDetection.ts）。
      const matches = rows && rows.length > 0 ? detectDuplicates(rows, newRows) : [];
      if (matches.length > 0) {
        // 重複の疑いがある行が見つかった場合は即座に反映せず、ユーザーが除外するかどうかを
        // 選べるように一旦保留する。
        setPendingDuplicateUpload({ matches, pendingRows: newRows, pendingMeta: data.meta });
        return;
      }

      setRows(newRows);
      setMeta(data.meta);
      setFlaggedDuplicateIds(new Set());
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  /** 重複警告バナーでのユーザーの選択を確定し、保留中のアップロード内容を反映する */
  function resolvePendingDuplicateUpload(excludeDuplicates: boolean) {
    if (!pendingDuplicateUpload) return;
    const duplicateIds = new Set(pendingDuplicateUpload.matches.map((m) => m.newRowId));
    if (excludeDuplicates) {
      setRows(pendingDuplicateUpload.pendingRows.filter((r) => !duplicateIds.has(r.id)));
      setFlaggedDuplicateIds(new Set());
    } else {
      setRows(pendingDuplicateUpload.pendingRows);
      setFlaggedDuplicateIds(duplicateIds);
    }
    setMeta(pendingDuplicateUpload.pendingMeta);
    setPendingDuplicateUpload(null);
  }

  function updateRow(id: string, patch: Partial<CategorizedTransaction>) {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch, source: "rule", confidence: 1 } : r)) ?? null);
  }

  return (
    <div className="bg-stone-50 text-stone-900">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 個人事業主・フリーランス向け 記帳/申告下書き試作</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10 flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-semibold mb-2">明細CSVを読み込む</h1>
          <p className="text-sm text-stone-600 mb-4 max-w-2xl leading-relaxed">
            銀行・カード会社からダウンロードした取引明細CSVをアップロードすると、AIが勘定科目・消費税区分を自動判定し、
            確定申告の概算下書きを作成します。<b>これは概算シミュレーションであり、正式な申告書ではありません。</b>
            最終的な内容は必ずご自身でご確認ください。
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs text-stone-500 mb-2" id="entity-mode-label">事業形態</div>
              <div className="flex items-center gap-3 flex-wrap" role="group" aria-labelledby="entity-mode-label">
                <button
                  type="button"
                  aria-pressed={mode === "individual"}
                  onClick={() => setMode("individual")}
                  className={`min-w-[13rem] text-sm px-5 py-3 border transition-colors ${
                    mode === "individual"
                      ? "bg-stone-900 border-stone-900 text-white"
                      : "bg-white border-stone-400 text-stone-600 hover:border-stone-600"
                  }`}
                >
                  フリーランス・個人事業主
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "corp"}
                  onClick={() => setMode("corp")}
                  className={`min-w-[13rem] text-sm px-5 py-3 border transition-colors ${
                    mode === "corp"
                      ? "bg-stone-900 border-stone-900 text-white"
                      : "bg-white border-stone-400 text-stone-600 hover:border-stone-600"
                  }`}
                >
                  マイクロ法人
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="entityName" className="block text-xs text-stone-500 mb-2">
                {mode === "corp" ? "法人名（書類プレビュー用）" : "氏名・屋号（書類プレビュー用）"}
              </label>
              <input
                id="entityName"
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder={mode === "corp" ? "例: 株式会社サンプル" : "例: 山田 太郎（サンプル屋号）"}
                className="w-full max-w-md border border-stone-400 bg-white px-4 py-3 text-sm outline-none focus:border-stone-600"
              />
            </div>

            {mode === "corp" && (
              <div>
                <div className="text-xs text-stone-500 mb-2">貸借対照表用の入力（期首時点の想定値）</div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex flex-col gap-1 text-xs text-stone-500">
                    資本金
                    <input
                      type="number"
                      value={capitalStock}
                      onChange={(e) => setCapitalStock(e.target.value)}
                      className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-stone-500">
                    期首現金残高
                    <input
                      type="number"
                      value={openingCash}
                      onChange={(e) => setOpeningCash(e.target.value)}
                      className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-stone-500">
                    発行済株式数（任意）
                    <input
                      type="number"
                      value={shareCount}
                      onChange={(e) => setShareCount(e.target.value)}
                      className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-stone-400 max-w-md leading-relaxed">
                  期首の資産は現金のみ・負債ゼロと仮定し、期首繰越利益剰余金＝期首現金－資本金として貸借対照表を作成します（固定資産・売掛金・借入金等は反映されません）。
                </p>
              </div>
            )}

            <div>
              <div className="text-xs text-stone-500 mb-2">明細データ</div>
              <label
                className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
                  loading
                    ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
                    : "border-stone-400 bg-white cursor-pointer hover:border-red-700"
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
              {fileName && <span className="ml-3 text-xs text-stone-500">{fileName}</span>}
              <p className="mt-2 text-xs text-stone-400 max-w-md leading-relaxed">
                対応列名: 日付/取引日/利用日、摘要/内容/ご利用店名、金額（または出金/入金の2列）。
                文字コードはUTF-8・Shift-JISを自動判定します。
              </p>
            </div>
          </div>

          {loading && <p className="mt-3 text-sm text-stone-500">解析中…</p>}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

          {meta && (
            <div className="mt-4 text-xs text-stone-500 flex flex-wrap gap-x-6 gap-y-1">
              <span>文字コード: {meta.encoding === "shift_jis" ? "Shift-JIS(自動検出)" : "UTF-8"}</span>
              <span>取込件数: {meta.total}件（スキップ {meta.skippedRows}件）</span>
              <span>自動確定: {meta.autoConfirmedCount}件</span>
              <span>要確認: {meta.needsReviewCount}件</span>
              <span>
                AI補完: {meta.aiConfigured ? `${meta.escalatedCount}件実行${meta.cappedAt ? `（上限${meta.cappedAt}件で打ち切り）` : ""}` : "未設定（ANTHROPIC_API_KEY未設定のためルールベースのみ）"}
              </span>
            </div>
          )}

          {pendingDuplicateUpload && (
            <div className="mt-4 border border-red-300 bg-red-50 p-4 text-sm">
              <p className="font-semibold text-red-700">
                重複の可能性がある取引が{pendingDuplicateUpload.matches.length}件見つかりました
              </p>
              <p className="mt-1 text-xs text-stone-600 leading-relaxed max-w-2xl">
                今回アップロードした明細の一部が、直前まで取り込んでいた明細と「同じ日付・同じ金額・よく似た摘要」でした。
                銀行・カードの明細エクスポートの対象期間が前回と重なっている可能性があります。重複を含めたまま反映すると
                収入・経費が二重に計上され、税額の概算がずれるおそれがあります。内容をご確認のうえ、反映方法をお選びください。
              </p>
              <ul className="mt-3 max-h-40 overflow-y-auto text-xs text-stone-600 space-y-1 border-t border-red-200 pt-2">
                {pendingDuplicateUpload.matches.slice(0, 20).map((m) => {
                  const row = pendingDuplicateUpload.pendingRows.find((r) => r.id === m.newRowId);
                  if (!row) return null;
                  return (
                    <li key={m.newRowId} className="tabular-nums">
                      {row.date} ／ {row.description} ／ {yen.format(row.amount)}
                    </li>
                  );
                })}
                {pendingDuplicateUpload.matches.length > 20 && (
                  <li>…ほか{pendingDuplicateUpload.matches.length - 20}件</li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => resolvePendingDuplicateUpload(true)}
                  className="text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
                >
                  重複を除外して反映する（推奨）
                </button>
                <button
                  type="button"
                  onClick={() => resolvePendingDuplicateUpload(false)}
                  className="text-sm px-4 py-2 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
                >
                  そのまま全件反映する
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">レシート・請求書画像から仕訳を作成</h2>
          <ReceiptUpload onConfirm={(c) => setReceiptCandidates((prev) => [...prev, c])} />

          {receiptCandidates.length > 0 && (
            <div className="mt-6 overflow-x-auto border border-stone-300 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">日付</th>
                    <th className="px-3 py-2 font-normal">取引先</th>
                    <th className="px-3 py-2 font-normal text-right">金額</th>
                    <th className="px-3 py-2 font-normal">勘定科目</th>
                    <th className="px-3 py-2 font-normal">消費税区分</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptCandidates.map((c) => (
                    <tr key={c.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{c.date ?? "（未入力）"}</td>
                      <td className="px-3 py-2">{c.counterparty ?? "（未入力）"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.amount != null ? yen.format(c.amount) : "（未入力）"}</td>
                      <td className="px-3 py-2">{c.account}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{c.taxCategory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {rows && rows.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">仕訳結果（要確認の行は必ず見直してください）</h2>
            <div className="overflow-x-auto border border-stone-300 bg-white">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">日付</th>
                    <th className="px-3 py-2 font-normal">摘要</th>
                    <th className="px-3 py-2 font-normal text-right">金額</th>
                    <th className="px-3 py-2 font-normal">勘定科目</th>
                    <th className="px-3 py-2 font-normal">消費税区分</th>
                    <th className="px-3 py-2 font-normal">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const needsReview = r.source === "uncategorized" || r.confidence < 0.75;
                    return (
                      <tr key={r.id} className={`border-b border-stone-100 last:border-0 ${needsReview ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.date}</td>
                        <td className="px-3 py-2 max-w-[10rem] sm:max-w-xs truncate" title={r.description}>
                          {r.description}
                          {flaggedDuplicateIds.has(r.id) && (
                            <span className="ml-2 inline-block whitespace-nowrap rounded-sm bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] text-amber-800">
                              重複の可能性
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${r.amount < 0 ? "text-stone-700" : "text-emerald-700"}`}>
                          {yen.format(r.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full min-w-[7rem] bg-transparent border-b border-transparent focus:border-stone-400 outline-none"
                            value={r.account}
                            onChange={(e) => updateRow(r.id, { account: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{r.taxCategory}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {r.source === "rule" && <span className="text-emerald-700">自動確定</span>}
                          {r.source === "ai" && <span className="text-sky-700">AI判定 ({Math.round(r.confidence * 100)}%)</span>}
                          {r.source === "uncategorized" && <span className="text-red-700">要確認</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {mode === "individual" && individualEstimate && (
          <section>
            <h2 className="text-lg font-semibold mb-3">確定申告 概算サマリー（フリーランス・個人事業主向け）</h2>

            <div className="mb-4 print:hidden">
              <button
                type="button"
                aria-expanded={showItemizedDeductions}
                onClick={() => setShowItemizedDeductions((v) => !v)}
                className="text-sm px-4 py-2 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
              >
                {showItemizedDeductions
                  ? "所得控除の追加入力を閉じる"
                  : "生命保険料控除・寄附金控除など所得控除を追加入力する（任意）"}
              </button>
              {showItemizedDeductions && (
                <div className="mt-3 border border-stone-300 bg-white p-4 sm:p-5">
                  <p className="text-xs text-stone-500 mb-4 leading-relaxed max-w-2xl">
                    社会保険料控除・基礎控除に加え、該当する所得控除があれば入力してください。未入力の項目は0円として扱われ、
                    概算に反映されません。ここでの計算もあくまで概算シミュレーションであり、正式な控除額は必ずご自身（または税理士）でご確認ください。
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-xs font-semibold text-stone-600 mb-1">
                        生命保険料控除（新制度＝2012年1月1日以後契約のみ対応）
                      </legend>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        一般生命保険料（年間払込額）
                        <input
                          type="number"
                          min="0"
                          value={lifeInsGeneral}
                          onChange={(e) => setLifeInsGeneral(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        介護医療保険料（年間払込額）
                        <input
                          type="number"
                          min="0"
                          value={lifeInsNursingMedical}
                          onChange={(e) => setLifeInsNursingMedical(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        個人年金保険料（年間払込額）
                        <input
                          type="number"
                          min="0"
                          value={lifeInsPersonalPension}
                          onChange={(e) => setLifeInsPersonalPension(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        2011年12月31日以前に契約した保険（旧制度、区分・上限額が異なる）は対応していません。
                      </p>
                    </fieldset>

                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-xs font-semibold text-stone-600 mb-1">地震保険料控除</legend>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        年間支払保険料
                        <input
                          type="number"
                          min="0"
                          value={earthquakeInsurancePremium}
                          onChange={(e) => setEarthquakeInsurancePremium(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                    </fieldset>

                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-xs font-semibold text-stone-600 mb-1">寄附金控除（ふるさと納税を含む）</legend>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        年間寄附金合計額
                        <input
                          type="number"
                          min="0"
                          value={donations}
                          onChange={(e) => setDonations(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        ふるさと納税のワンストップ特例・住民税側の控除額は住民税に影響するものであり、この所得税概算には含まれません。
                      </p>
                    </fieldset>

                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-xs font-semibold text-stone-600 mb-1">医療費控除</legend>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        年間医療費合計額（保険金等による補填前）
                        <input
                          type="number"
                          min="0"
                          value={medicalExpenses}
                          onChange={(e) => setMedicalExpenses(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        保険金等による補填額
                        <input
                          type="number"
                          min="0"
                          value={medicalExpenseReimbursements}
                          onChange={(e) => setMedicalExpenseReimbursements(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        通常の医療費控除の計算のみ対応しています（セルフメディケーション税制は対応していません）。
                      </p>
                    </fieldset>

                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-xs font-semibold text-stone-600 mb-1">
                        小規模企業共済等掛金控除（iDeCoを含む）
                      </legend>
                      <label className="flex flex-col gap-1 text-xs text-stone-500">
                        年間掛金合計額
                        <input
                          type="number"
                          min="0"
                          value={mutualAidContributions}
                          onChange={(e) => setMutualAidContributions(e.target.value)}
                          className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                        />
                      </label>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-stone-300 bg-white p-5">
                <div className="text-xs text-stone-500 mb-3">所得税（概算）</div>
                <dl className="text-sm space-y-2">
                  <Row label="収入合計" value={yen.format(individualEstimate.totalIncome)} />
                  <Row label="経費合計" value={yen.format(individualEstimate.totalExpense)} />
                  <Row label="事業所得" value={yen.format(individualEstimate.businessProfit)} />
                  <Row label="課税所得（概算）" value={yen.format(individualEstimate.taxableIncome)} />
                  <Row
                    label={`所得税額（限界税率 ${individualEstimate.incomeTax.marginalRate}%）`}
                    value={yen.format(individualEstimate.incomeTax.tax)}
                    strong
                  />
                </dl>
              </div>
              <div className="border border-stone-300 bg-white p-5">
                <div className="text-xs text-stone-500 mb-3">消費税（概算）</div>
                <dl className="text-sm space-y-2">
                  <Row label="売上に係る税額" value={yen.format(individualEstimate.consumptionTax.salesTax)} />
                  <Row label="仕入に係る税額" value={yen.format(individualEstimate.consumptionTax.purchaseTax)} />
                  <Row label="納税額（概算）" value={yen.format(individualEstimate.consumptionTax.payable)} strong />
                  {individualEstimate.consumptionTax.isLikelyExempt && (
                    <p className="text-xs text-amber-700 pt-1">
                      課税売上高が1,000万円以下です。基準期間の実績次第で免税事業者の可能性があります（要確認）。
                    </p>
                  )}
                </dl>
              </div>
            </div>
            <ul className="mt-4 text-xs text-stone-500 list-disc list-inside space-y-1">
              {individualEstimate.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {mode === "individual" && individualChecklist && (
          <TaxSavingChecklistSection title="一般的な節税制度セルフチェック（フリーランス・個人事業主向け）" checklist={individualChecklist} />
        )}

        {mode === "corp" && corpEstimate && (
          <section>
            <h2 className="text-lg font-semibold mb-3">申告 概算サマリー（マイクロ法人向け）</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-stone-300 bg-white p-5">
                <div className="text-xs text-stone-500 mb-3">法人税・地方法人税（概算）</div>
                <dl className="text-sm space-y-2">
                  <Row label="収入合計" value={yen.format(corpEstimate.revenue)} />
                  <Row label="経費合計" value={yen.format(corpEstimate.expenses)} />
                  <Row label="所得金額（概算）" value={yen.format(corpEstimate.taxableIncome)} />
                  <Row label="法人税額" value={yen.format(corpEstimate.corporateTax)} />
                  <Row label="地方法人税額" value={yen.format(corpEstimate.localCorporateTax)} />
                  <Row label="国税合計（概算）" value={yen.format(corpEstimate.totalNationalTax)} strong />
                  <Row label="均等割（参考値）" value={yen.format(corpEstimate.perCapitaTaxReference)} />
                </dl>
              </div>
              <div className="border border-stone-300 bg-white p-5">
                <div className="text-xs text-stone-500 mb-3">消費税（概算）</div>
                <dl className="text-sm space-y-2">
                  <Row label="売上に係る税額" value={yen.format(corpEstimate.consumptionTax.salesTax)} />
                  <Row label="仕入に係る税額" value={yen.format(corpEstimate.consumptionTax.purchaseTax)} />
                  <Row label="納税額（概算）" value={yen.format(corpEstimate.consumptionTax.payable)} strong />
                  {corpEstimate.consumptionTax.isLikelyExempt && (
                    <p className="text-xs text-amber-700 pt-1">
                      課税売上高が1,000万円以下です。設立時期・資本金次第で免税事業者の可能性があります（要確認）。
                    </p>
                  )}
                </dl>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-700">
              法人住民税・法人事業税の所得割（自治体・所得により変動）は含まれていません。参考値のみの表示です。
            </p>
            <ul className="mt-4 text-xs text-stone-500 list-disc list-inside space-y-1">
              {corpEstimate.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {mode === "corp" && corpChecklist && (
          <TaxSavingChecklistSection title="一般的な節税制度セルフチェック（マイクロ法人向け）" checklist={corpChecklist} />
        )}

        {rows && (individualEstimate || corpEstimate) && (
          <section>
            <AdvisorReferralBanner />
          </section>
        )}

        {rows && rows.length > 0 && individualEstimate && corpEstimate && (
          <section>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3 print:hidden">
              <h2 className="text-lg font-semibold">書類プレビュー（国税庁様式準拠・概算）</h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  aria-expanded={showDocuments}
                  onClick={() => setShowDocuments((v) => !v)}
                  className="text-sm px-4 py-2 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
                >
                  {showDocuments ? "閉じる" : "表示する"}
                </button>
                {showDocuments && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
                  >
                    印刷 / PDF保存
                  </button>
                )}
              </div>
            </div>
            {showDocuments && (
              <DocumentPreview
                mode={mode}
                rows={rows}
                individualEstimate={individualEstimate}
                corpEstimate={corpEstimate}
                entityName={entityName}
                capitalStock={Number(capitalStock) || 0}
                openingCash={Number(openingCash) || 0}
                shareCount={Number(shareCount) || undefined}
              />
            )}
          </section>
        )}

        {rows && (
          <section className="border-t border-stone-300 pt-6 print:hidden">
            <h2 className="text-lg font-semibold mb-3">送信について</h2>
            <SubmissionGuide
              mode={mode}
              individualEstimate={individualEstimate}
              corpEstimate={corpEstimate}
              entityName={entityName}
            />
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-base" : ""}`}>{value}</dd>
    </div>
  );
}
