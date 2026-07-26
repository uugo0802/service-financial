import type { MetadataRoute } from "next";

// PWA化の土台。アイコンは専用デザイン未確定のため、既存のfavicon.icoを暫定利用する。
// 本格運用時は192x192/512x512のPNGアイコンに差し替えること。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "税務申告AI（ジャービス）— 記帳・確定申告下書き支援",
    short_name: "ジャービス",
    description: "マイクロ法人・フリーランス向け記帳/確定申告下書き支援ツール（開発中プロトタイプ）",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#1c1917",
    lang: "ja",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
