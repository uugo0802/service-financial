import type { Metadata } from "next";
import Link from "next/link";

// Service Worker(public/sw.js)がナビゲーション失敗時にフォールバックする「オフラインシェル」。
// 会計データには一切アクセスせず、再接続を促す静的な案内のみを表示する。
export const metadata: Metadata = {
  title: "オフラインです｜スグル",
  description: "現在オフラインです。ネットワーク接続を確認してください。",
};

export default function OfflinePage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full flex flex-col items-center gap-6 text-center">
        <div className="font-serif text-lg tracking-wide text-stone-500">
          決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl">オフラインです</h1>
        <p className="text-stone-600 leading-relaxed">
          インターネット接続が確認できませんでした。会計・税務データの取得や送信にはネットワーク接続が必要です。
          電波状況やWi-Fi接続をご確認のうえ、もう一度お試しください。
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-red-700 px-6 py-3 text-white font-medium hover:bg-red-800 transition-colors"
        >
          トップページに戻る
        </Link>
        <p className="text-xs text-stone-400 leading-relaxed">
          一部の画面はオフラインでも直前にキャッシュされた内容が表示される場合がありますが、
          最新の会計データではない可能性があります。
        </p>
      </div>
    </div>
  );
}
