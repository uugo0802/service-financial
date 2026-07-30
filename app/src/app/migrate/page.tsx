import type { Metadata } from "next";
import { MigrationImportForm } from "@/components/MigrationImportForm";

export const metadata: Metadata = {
  title: "freee / マネーフォワードからの移行インポート｜税務申告AI（ジャービス）",
  description: "freee会計・マネーフォワード クラウド会計/確定申告の仕訳帳CSVを取り込み、このアプリの記帳データに変換するツール（開発中プロトタイプ）。",
};

export default function MigratePage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">MVP — 他社会計ソフトからの移行インポート</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">freee / マネーフォワードからの移行インポート</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            freee会計やマネーフォワード クラウド会計/確定申告を使っていた方が、これまでの記帳データを
            ゼロから入力し直さずに済むようにするための移行ツールです。
            各サービスの「仕訳帳（journal）」エクスポート機能でダウンロードしたCSVファイルをそのままアップロードすると、
            借方・貸方の勘定科目や金額を読み取り、このアプリの記帳データ形式にその場で変換してプレビューします。
          </p>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            会計ソフトの乗り換えは、過去データの移行作業が面倒で見送られがちです。
            このツールはその切り替えコストを下げることを目的としたプロトタイプで、
            アップロードしたデータはサーバーには送信されず、お使いのブラウザ内だけで変換処理を行います。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            複式簿記の借方・貸方は、このアプリが採用する「1取引=1件の符号付き金額」というシンプルなモデルに
            機械的に集約されるため、勘定科目・金額の符号・消費税区分の推定が実態と異なる場合があります。
            これはあくまで移行作業を補助する概算の下書き変換であり、正式な記帳・申告内容そのものではありません。
            取り込んだ内容は必ずご自身でご確認・修正のうえご利用ください。個別具体的な税務相談・代理は行っておりません。
          </p>
        </section>

        <MigrationImportForm />
      </main>
    </div>
  );
}
