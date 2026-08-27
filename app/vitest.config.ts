import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// このプロジェクトはNext.js内蔵のSWC/webpackが"@/*" → "./src/*"のパスエイリアス
// （tsconfig.jsonのcompilerOptions.paths）を解決しているが、Vitest単体では
// 明示的なresolve.aliasを設定しない限りこのエイリアスを常に正しく解決できるとは
// 限らない（Viteのtsconfig自動解決は、依存関係グラフを辿ってどのファイルから
// 最初に解決されたかに左右される既知の不安定さがあり、実際にこのリポジトリでも
// src/lib/配下からのimportはたまたま解決できていたが、src/components/配下の
// 新規テストファイル（AppShell.test.tsx等）からの"@/lib/..."importは解決に
// 失敗することを確認した）。そのため明示的にaliasを設定し、配置場所に関わらず
// 常に確実に解決できるようにする。
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
