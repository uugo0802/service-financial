"use client";

import { ThemeToggle } from "@/components/ThemeToggle";

export default function AppearanceSettingsPage() {
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-xl font-semibold mb-2">表示設定</h1>
      <p className="text-sm text-stone-500 mb-6">
        アプリの配色を選択できます。「システム」を選ぶとOSのライト/ダーク設定に自動で追従します。
      </p>
      <ThemeToggle />
    </div>
  );
}
