import type { Metadata } from "next";
import { Cta } from "./Cta";

export const metadata: Metadata = {
  title: "税理士に毎月払う顧問料、AIに置き換えませんか｜ジャービス（早期アクセス登録）",
  description:
    "記帳〜仕訳〜申告書下書き〜送信ガイドまで、AIが一気通貫で伴走するセルフ申告のコパイロット。マイクロ法人・フリーランス向け早期アクセス登録受付中。",
};

export default function EarlyAccessPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16 flex flex-col gap-20">
        {/* Hero */}
        <section className="flex flex-col gap-6 text-center items-center">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight max-w-2xl">
            税理士に毎月払う顧問料、AIに置き換えませんか。
          </h1>
          <p className="text-stone-600 max-w-xl">
            記帳・仕訳・申告書下書き・e-Tax/eLtax送信ガイドまでを、AIエージェントが一気通貫で伴走する
            「セルフ申告のコパイロット」。今なら早期アクセスに登録できます。
          </p>
          <Cta label="早期アクセスに登録する（メールのみ・1分）" segment="general" placement="hero" />
        </section>

        {/* Segments */}
        <section className="grid sm:grid-cols-2 gap-8">
          <div className="border border-stone-300 bg-white rounded-lg p-6 flex flex-col gap-4">
            <h2 className="font-serif text-xl">マイクロ法人（一人社長）の方へ</h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              一人社長の経理、もうあなたが仕訳を確認する必要はありません。AIが自動確定、あなたは送信ボタンを押すだけ。
              決算・法人税・消費税、まるごと一気通貫でサポートします。
            </p>
            <Cta label="マイクロ法人向けに登録" segment="corp" placement="segment-card" />
          </div>
          <div className="border border-stone-300 bg-white rounded-lg p-6 flex flex-col gap-4">
            <h2 className="font-serif text-xl">フリーランス・個人事業主の方へ</h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              確定申告、簿記の知識はいりません。AIが仕訳から申告書下書きまで全部終わらせます。
              毎年この時期に憂鬱になるあなたへ、e-Tax送信までナビします。
            </p>
            <Cta label="フリーランス向けに登録" segment="freelance" placement="segment-card" />
          </div>
        </section>

        {/* Why */}
        <section className="flex flex-col gap-6">
          <h2 className="font-serif text-xl text-center">既存のクラウド会計と何が違うのか</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-sm text-stone-600">
            <div className="flex flex-col gap-2">
              <div className="font-medium text-stone-900">仕訳確認ゼロを目指す</div>
              <p>AIによる自動仕訳の確定率を最大化。人間のレビューは例外処理のみに絞ります。</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="font-medium text-stone-900">送信完了まで伴走</div>
              <p>申告書下書きの作成で終わらず、e-Tax/eLtax送信までチェックリスト形式でナビゲートします。</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="font-medium text-stone-900">低価格・低運用コスト</div>
              <p>AIオペレーション前提の設計で、税理士顧問料よりも大幅に低い価格帯を目指します。</p>
            </div>
          </div>
        </section>

        <section className="text-center">
          <Cta label="早期アクセスに登録する（メールのみ・1分）" segment="general" placement="footer" />
        </section>
      </main>

      <footer className="border-t border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本サービスは開発中のプロトタイプであり、現時点では税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          申告書の下書き作成・送信操作は、常にご本人の判断と操作によって行われます。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
