import type { Metadata } from "next";
import { TransactionsClient } from "./TransactionsClient";

export const metadata: Metadata = {
  title: "取引検索｜決算書作成から税務申告までワンクリック（スグル）",
  description: "取引年月日・取引金額・取引先で記帳データを検索する画面（開発中プロトタイプ）。",
};

export default function TransactionsPage() {
  return <TransactionsClient />;
}
