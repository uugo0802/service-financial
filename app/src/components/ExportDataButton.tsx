"use client";

// CSV文字列をブラウザ上でファイルとしてダウンロードさせるためのボタン。
// Blob + object URL方式を使用しており、Node.jsのfs等には依存しない
// （このコンポーネントはクライアントコンポーネントとしてのみ利用可能）。

// Excel等でファイルを開いた際に日本語が文字化けしないよう、UTF-8のBOMを付与する。
const UTF8_BOM = "﻿";

export interface ExportDataButtonProps {
  csvContent: string;
  /**
   * ファイル名の接頭辞（拡張子・日付は含めない）。
   * 日付はダウンロード時点の日付を使うため、ここでは事前計算した日付を渡さないこと
   * （このコンポーネントを利用するページは静的生成されるため、ビルド時の日付を
   * 埋め込むとダウンロードするたびに古い日付のファイル名になってしまう）。
   */
  fileNamePrefix: string;
  label?: string;
  className?: string;
}

const DEFAULT_CLASSNAME =
  "text-sm px-5 py-3 border border-stone-400 bg-white hover:border-red-700 transition-colors dark:bg-stone-900 dark:border-stone-600 dark:text-stone-50 dark:hover:border-red-400";

export function ExportDataButton({ csvContent, fileNamePrefix, label = "CSVをダウンロード", className }: ExportDataButtonProps) {
  function handleDownload() {
    const blob = new Blob([UTF8_BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const fileName = `${fileNamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <button type="button" onClick={handleDownload} className={className ?? DEFAULT_CLASSNAME}>
      {label}
    </button>
  );
}
