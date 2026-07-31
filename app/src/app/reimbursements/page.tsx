import type { Metadata } from "next";
import {
  OverdueReimbursement,
  ReimbursableExpenseInput,
  ReimbursementsSummary,
  computeReimbursementsSummary,
  isFullyReimbursed,
  markReimbursementSettled,
  outstandingReimbursementAmountOf,
  recordReimbursableExpense,
  reimbursedAmountOf,
} from "@/lib/expense/reimbursement";

export const metadata: Metadata = {
  title: "立替経費（立替金）／未払金｜税務申告AI（ジャービス）",
  description:
    "役員・従業員が個人のお金で立て替えて支払った事業経費（交通費、消耗品費など）と、会社からまだ精算していない未払金を記帳・管理するツール（開発中プロトタイプ）。",
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function bucketAccentClass(key: string): string {
  switch (key) {
    case "0-30":
      return "text-stone-700";
    case "31-60":
      return "text-amber-700";
    case "61-90":
      return "text-orange-700";
    default:
      return "text-red-700";
  }
}

/**
 * 立替経費セクションの表示例データ。
 *
 * 現時点では立替経費の入力フォーム・永続保存はまだ実装されておらず、記録・精算状況の記帳機能は
 * app/src/lib/expense/reimbursement.ts の集計・仕訳候補ロジックのみが実装済みの段階のため、
 * このページでは動作を確認できるよう、実際のユーザーデータではないことが明確な
 * 「（表示例）」ラベル付きのサンプル立替経費を用いている
 * （app/src/app/invoices/page.tsx の未収入金セクションと同じ方針）。
 * 入力フォーム・データの永続化が実装された段階で、実データに置き換える想定。
 */
function buildSampleReimbursableExpenses(asOfDate: string): ReimbursableExpenseInput[] {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const isoDaysAgo = (days: number) => new Date(asOfMs - days * dayMs).toISOString().slice(0, 10);

  const settledOnTime = recordReimbursableExpense({
    id: "（例）REIMB-SAMPLE-0001",
    payerName: "（表示例）代表 修吾",
    description: "（表示例）取引先訪問の電車代",
    paidDate: isoDaysAgo(50),
    reimbursementDueDate: isoDaysAgo(20),
    amount: 3_200,
    account: "旅費交通費",
    taxCategory: "課税仕入10%",
  });

  const overdue45 = recordReimbursableExpense({
    id: "（例）REIMB-SAMPLE-0002",
    payerName: "（表示例）従業員 山田太郎",
    description: "（表示例）打ち合わせ用の文房具",
    paidDate: isoDaysAgo(75),
    reimbursementDueDate: isoDaysAgo(45),
    amount: 8_500,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
  });

  const overdue75 = recordReimbursableExpense({
    id: "（例）REIMB-SAMPLE-0003",
    payerName: "（表示例）代表 修吾",
    description: "（表示例）名刺印刷代",
    paidDate: isoDaysAgo(105),
    reimbursementDueDate: isoDaysAgo(75),
    amount: 15_000,
    account: "広告宣伝費",
    taxCategory: "課税仕入10%",
  });

  const partiallySettledLongOverdue = recordReimbursableExpense({
    id: "（例）REIMB-SAMPLE-0004",
    payerName: "（表示例）従業員 山田太郎",
    description: "（表示例）出張時の宿泊費",
    paidDate: isoDaysAgo(150),
    reimbursementDueDate: isoDaysAgo(120),
    amount: 33_000,
    account: "旅費交通費",
    taxCategory: "課税仕入10%",
  });

  const notYetDue = recordReimbursableExpense({
    id: "（例）REIMB-SAMPLE-0005",
    payerName: "（表示例）代表 修吾",
    description: "（表示例）会議用の飲食代",
    paidDate: isoDaysAgo(10),
    reimbursementDueDate: isoDaysAgo(-20),
    amount: 5_400,
    account: "会議費",
    taxCategory: "課税仕入10%",
  });

  return [
    markReimbursementSettled(settledOnTime, isoDaysAgo(18)),
    overdue45,
    overdue75,
    markReimbursementSettled(partiallySettledLongOverdue, isoDaysAgo(30), 15_000),
    notYetDue,
  ];
}

function OverdueReimbursementRow({ item }: { item: OverdueReimbursement }) {
  return (
    <tr className="border-b border-stone-200 last:border-b-0">
      <td className="py-2.5 px-3">{item.payerName || "（立替者未入力）"}</td>
      <td className="py-2.5 px-3">{item.description || "（摘要未入力）"}</td>
      <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">{item.account}</td>
      <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">{item.paidDate}</td>
      <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">
        {item.reimbursementDueDate ?? "（未設定・立替日基準）"}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums font-medium text-red-700">{item.daysOverdue}日</td>
      <td className="py-2.5 px-3 text-right tabular-nums">
        <Yen v={item.outstandingAmount} />
      </td>
    </tr>
  );
}

function ReimbursementsAgingSection({ summary }: { summary: ReimbursementsSummary }) {
  const hasAnyOutstanding = summary.totalOutstandingCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">未払金（未精算の立替経費）総額（{summary.asOfDate} 時点）</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <Yen v={summary.totalOutstanding} />
          </p>
          <p className="text-xs text-stone-400 mt-1">未精算の立替経費 {summary.totalOutstandingCount}件（精算予定日前を含む）</p>
        </div>
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">精算予定日超過（未精算のうち予定日を過ぎたもの）</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <Yen v={summary.agingBuckets.reduce((sum, b) => sum + b.amount, 0)} />
          </p>
          <p className="text-xs text-stone-400 mt-1">精算予定日超過の立替経費 {summary.overdueReimbursements.length}件</p>
        </div>
      </div>

      <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
              <th className="py-2 px-3 font-semibold">経過区分</th>
              <th className="py-2 px-3 font-semibold text-right">件数</th>
              <th className="py-2 px-3 font-semibold text-right">未精算金額</th>
            </tr>
          </thead>
          <tbody>
            {summary.agingBuckets.map((bucket) => (
              <tr key={bucket.key} className="border-b border-stone-200 last:border-b-0">
                <td className={`py-2.5 px-3 font-medium ${bucketAccentClass(bucket.key)}`}>{bucket.label}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{bucket.count}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  <Yen v={bucket.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">精算予定日超過の立替経費一覧（超過日数の多い順）</h3>
        {!hasAnyOutstanding || summary.overdueReimbursements.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white rounded-lg p-6 text-center text-sm text-stone-500">
            精算予定日を超過している未精算の立替経費はありません。
          </div>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="py-2 px-3 font-semibold">立替者</th>
                  <th className="py-2 px-3 font-semibold">内容（摘要）</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">勘定科目</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">立替日</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">精算予定日</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">超過日数</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">未精算金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.overdueReimbursements.map((item) => (
                  <OverdueReimbursementRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        この一覧は、役員・従業員が個人で立て替えた事業経費のうち、会社からまだ精算（返金）していない
        金額（未払金）を記帳・管理するための集計表示であり、税理士法に定める税務代理・税務相談を
        提供するものではありません。精算状況の確認は必ずご自身の実際の入出金記録（銀行口座等）に
        基づいて行ってください。
      </p>
    </div>
  );
}

function SettledReimbursementsTable({ expenses }: { expenses: ReimbursableExpenseInput[] }) {
  const settled = expenses.filter((e) => isFullyReimbursed(e));

  if (settled.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 bg-white rounded-lg p-6 text-center text-sm text-stone-500">
        精算済みの立替経費はまだありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
            <th className="py-2 px-3 font-semibold">立替者</th>
            <th className="py-2 px-3 font-semibold">内容（摘要）</th>
            <th className="py-2 px-3 font-semibold whitespace-nowrap">立替日</th>
            <th className="py-2 px-3 font-semibold whitespace-nowrap">精算日</th>
            <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">精算金額</th>
          </tr>
        </thead>
        <tbody>
          {settled.map((e) => (
            <tr key={e.id} className="border-b border-stone-200 last:border-b-0">
              <td className="py-2.5 px-3">{e.payerName || "（立替者未入力）"}</td>
              <td className="py-2.5 px-3">{e.description || "（摘要未入力）"}</td>
              <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">{e.paidDate}</td>
              <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">{e.reimbursedAt}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                <Yen v={reimbursedAmountOf(e)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReimbursementsPage() {
  const asOfDate = todayISO();
  const expenses = buildSampleReimbursableExpenses(asOfDate);
  const summary = computeReimbursementsSummary(expenses, asOfDate);
  const outstandingCount = expenses.filter((e) => outstandingReimbursementAmountOf(e) > 0).length;

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">MVP — 立替経費（立替金）／未払金</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">立替経費（立替金）／未払金の管理</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            役員・従業員が交通費・消耗品費などの事業経費を、会社の口座からではなく個人のお金で
            立て替えて支払った場合、会社側から見るとまだ精算（返金）していない金額
            （未払金）が発生します。このページでは、立て替えた経費のうち会社からいくら精算済み・
            未精算かを、精算予定日からの経過日数別（aging）に集計します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            これは記帳・精算管理を補助するための集計ツールです。個別具体の税務相談や、
            経費として計上できるかどうかの判断は行っておりません。勘定科目・消費税区分・
            未払金として計上する金額の最終確認は、必ずご自身（または税理士等の専門家）で行ってください。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">未精算の立替経費（未払金）</h2>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            現時点では立替経費の入力フォーム・永続保存はまだ実装されていないため、以下は集計ロジック
            （<code className="text-xs bg-stone-100 px-1 py-0.5 rounded">src/lib/expense/reimbursement.ts</code>）
            の動作を確認するための表示例（サンプルデータ、実際の立替者・金額ではありません）です。
          </p>
          <p className="text-xs text-stone-500 mb-4">
            未精算 {outstandingCount}件 ／ 記録済み立替経費 {expenses.length}件
          </p>
          <ReimbursementsAgingSection summary={summary} />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">精算済みの立替経費</h2>
          <p className="text-sm text-stone-600 mb-4 max-w-2xl leading-relaxed">
            会社から個人へ全額精算（返金）が完了した立替経費の一覧です（表示例）。
          </p>
          <SettledReimbursementsTable expenses={expenses} />
        </section>
      </main>
    </div>
  );
}
