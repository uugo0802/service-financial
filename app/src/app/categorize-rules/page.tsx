"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { CategorizeRuleEditor } from "@/components/CategorizeRuleEditor";
import { PageTitle } from "@/components/ui/PageTitle";

export default function CategorizeRulesPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">ユーザー辞書編集</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            「取引先名」など、ご自身の事業に特有のキーワードと勘定科目・税区分の対応関係を登録しておくと、共通の分類辞書よりも優先して自動分類に反映されます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mt-2">
            このツールが提示する勘定科目・税区分はルールに基づく簡易な自動判定であり、正式な税務判断ではありません。ここで登録した内容も含め、最終的な確定は必ずご自身でご確認ください（本サービスは税理士法上の税務代理・個別税務相談を行うものではなく、本人申告を支援するツールです）。
          </p>
        </section>

        <CategorizeRuleEditor />

        <p className="text-xs text-muted-foreground">
          この画面は開発中のプロトタイプです。登録したルールはこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
        </p>
      </PageContainer>
    </div>
  );
}
