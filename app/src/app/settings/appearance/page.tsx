"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { PageContainer } from "@/components/ui/PageContainer";

export default function AppearanceSettingsPage() {
  return (
    <PageContainer as="main" maxWidth="xl">
      <h1 className="text-xl font-semibold mb-2">表示設定</h1>
      <p className="text-sm text-muted-foreground mb-6">
        アプリの配色を選択できます。「システム」を選ぶとOSのライト/ダーク設定に自動で追従します。
      </p>
      <ThemeToggle />
    </PageContainer>
  );
}
