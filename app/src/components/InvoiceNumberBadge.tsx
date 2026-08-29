import { validateInvoiceRegistrationNumber } from "@/lib/categorize/invoiceRegistrationValidator";

/**
 * インボイス登録番号の形式・チェックデジット検証結果を表示する、小さな独立バッジ。
 * データ計算はvalidateInvoiceRegistrationNumber（純粋関数）に委譲し、状態管理は持たない
 * サーバーコンポーネントとして実装（開閉はネイティブ<details>要素でJS不要にしている）。
 *
 * 意図的に「緑＝承認済み」を出さない設計: 形式・チェックデジットが正しい場合でも
 * 国税庁公表サイトでの実在確認や仕入税額控除の可否は自動判定できないため、
 * 有効時もamber（要確認）系の配色に留め、結果が誤って「承認完了」と読めないようにしている。
 */
export function InvoiceNumberBadge({
  registrationNumber,
  className = "",
}: {
  registrationNumber?: string | null;
  className?: string;
}) {
  const trimmed = registrationNumber?.trim() ?? "";

  if (trimmed.length === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded-full border-stone-300 bg-stone-50 text-muted-foreground ${className}`}
      >
        <span aria-hidden="true">－</span>
        登録番号未入力・要確認
      </span>
    );
  }

  const result = validateInvoiceRegistrationNumber(trimmed);

  if (!result.valid) {
    return (
      <details className={`inline-block text-xs ${className}`}>
        <summary
          className="inline-flex items-center gap-1 cursor-pointer marker:content-none px-2 py-0.5 border rounded-full border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
        >
          <span aria-hidden="true">✕</span>
          登録番号エラー・要確認
        </summary>
        <p className="mt-1.5 max-w-xs text-muted-foreground leading-relaxed">{result.message}</p>
      </details>
    );
  }

  return (
    <details className={`inline-block text-xs ${className}`}>
      <summary
        className="inline-flex items-center gap-1 cursor-pointer marker:content-none px-2 py-0.5 border rounded-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
      >
        <span aria-hidden="true">△</span>
        形式チェックOK・要確認
      </summary>
      <p className="mt-1.5 max-w-xs text-muted-foreground leading-relaxed">{result.message}</p>
    </details>
  );
}
