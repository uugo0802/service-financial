import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { CorporateEstablishmentNotificationForm } from "./CorporateEstablishmentNotificationForm";

export const metadata: Metadata = {
  title: "法人設立時の届出書・申請書一式（下書き作成）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "マイクロ法人の設立直後に必要となる法人設立届出書（税務署・都道府県・市町村向け）、青色申告の承認申請書（法人用）、給与支払事務所等の開設届出書の下書きをまとめて作成するツール（開発中プロトタイプ）。",
};

export default function CorporateEstablishmentNotificationPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen print:bg-white">
      <header className="border-b border-stone-300 bg-white print:hidden">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500">MVP — 法人設立時の届出書・申請書一式（下書き作成）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8 print:max-w-none print:px-0 print:py-0">
        <section className="print:hidden">
          <h1 className="text-2xl font-semibold mb-2">法人設立時の届出書・申請書一式（下書き作成）</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            新しく設立したマイクロ法人が設立直後に提出する必要のある、
            <b className="font-medium">法人設立届出書</b>（税務署・都道府県税事務所・市区町村役場の3通）、
            <b className="font-medium">青色申告の承認申請書（法人用）</b>、
            従業員（代表者本人への役員報酬の支払いのみの場合を含む）に給与を支払う場合の
            <b className="font-medium">給与支払事務所等の開設届出書</b>の下書きデータを、
            基本情報の入力からまとめて作成し、画面表示・印刷／PDF保存できる画面です。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この画面で作成できるのは<b className="font-medium">下書きです。提出はご自身の責任で行ってください。</b>
            実際の提出（e-Tax・eLTAX又は書面）は、内容をご自身で確認のうえ利用者ご自身の責任で行ってください。
            当社が代理で提出することはありません。個別具体的な税務相談には該当しませんので、最終的な判断は
            必要に応じて税理士等の専門家にご相談ください。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed mt-2">
            本サービスはマイナンバー非保持の原則に従い、個人番号（マイナンバー）の入力欄は設けていません。
            法人番号は設立登記完了後に国税庁から指定されるため、この時点では入力を求めません。
            個人事業主（フリーランス）向けの青色申告承認申請書は、別ツールをご利用ください。
          </p>
        </section>

        <CorporateEstablishmentNotificationForm />
      </PageContainer>
    </div>
  );
}
