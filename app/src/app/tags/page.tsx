import type { Metadata } from "next";
import { TagsClient } from "./TagsClient";

export const metadata: Metadata = {
  title: "タグ・収益性｜決算書作成から税務申告までワンクリック（スグル）",
  description: "取引にクライアント/プロジェクトタグを付け、タグ別の収益性を確認する画面（開発中プロトタイプ）。",
};

export default function TagsPage() {
  return <TagsClient />;
}
