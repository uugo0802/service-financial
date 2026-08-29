import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { ClientMasterTable } from "@/components/ClientMasterTable";
import { Counterparty } from "@/lib/clients/clientMaster";

export const metadata: Metadata = {
  title: "取引先・仕入先マスタ｜決算書作成から税務申告までワンクリック（スグル）",
  description: "売上先（顧客）・仕入先の基本情報（名称・種別・既定の勘定科目・インボイス登録番号）を一元管理する画面（開発中プロトタイプ）。",
};

// DB未接続の現状に合わせ、実データの代わりにサンプルデータを表示する
// （business-plan.mdが想定する「今ごえん合同会社」的なマイクロ法人の取引先まわりのサンプル）。
const SAMPLE_COUNTERPARTIES: Counterparty[] = [
  {
    id: "cp-1",
    name: "株式会社サンプル商事",
    kind: "client",
    defaultAccountName: "売上高",
    invoiceRegistrationNumber: "T2120901007402",
    notes: "月次コンサルティング契約",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T00:00:00Z",
  },
  {
    id: "cp-2",
    name: "〇〇不動産",
    kind: "vendor",
    defaultAccountName: "地代家賃",
    invoiceRegistrationNumber: undefined,
    notes: "事務所賃借。免税事業者のため登録番号なし",
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
  },
  {
    id: "cp-3",
    name: "合同会社パートナーズ",
    kind: "vendor",
    defaultAccountName: "外注費",
    invoiceRegistrationNumber: "T7000012050002",
    notes: undefined,
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
  },
];

export default function ClientsPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-muted-foreground">取引先・仕入先マスタ</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">取引先・仕入先マスタ</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            売上先（顧客）・仕入先を一度登録しておくと、名称の表記ゆれを防ぎ、既定の勘定科目やインボイス登録番号を取引明細・請求書作成のたびに入力し直す手間を減らせます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mt-2">
            この画面は取引先情報の整理を支援するものであり、個別具体の税務相談・税務代理を行うものではありません（本サービスは税理士法上の本人申告支援ツールです）。インボイス登録番号は形式・チェックデジットのみを検証しており、実在確認や仕入税額控除の適用可否の最終判断は、国税庁「適格請求書発行事業者公表サイト」でのご確認とあわせ、必ずご自身（または顧問税理士）で行ってください。
          </p>
        </section>

        <ClientMasterTable initialRecords={SAMPLE_COUNTERPARTIES} />

        <p className="text-xs text-muted-foreground">
          この画面は開発中のプロトタイプです。登録した取引先情報はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
        </p>
      </PageContainer>
    </div>
  );
}
