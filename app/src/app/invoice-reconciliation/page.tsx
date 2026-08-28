import type { Metadata } from "next";
import { InvoiceReconciliationClient } from "./InvoiceReconciliationClient";

export const metadata: Metadata = {
  title: "入金消込（請求書マッチング）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "取り込んだ銀行の入金取引と、発行済みの未収請求書を自動で突き合わせ、どの入金がどの請求書への支払いかの候補を確認できるツール（開発中プロトタイプ）。",
};

export default function InvoiceReconciliationPage() {
  return <InvoiceReconciliationClient />;
}
