import type { Metadata } from "next";
import { DocumentsClient } from "./DocumentsClient";

export const metadata: Metadata = {
  title: "証憑（レシート・請求書）検索｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "取引年月日・取引金額・取引先で証憑（レシート・請求書）を検索し、書面へ出力できる画面（開発中プロトタイプ）。",
};

export default function DocumentsPage() {
  return <DocumentsClient />;
}
