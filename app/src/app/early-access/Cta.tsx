"use client";

import { track } from "@vercel/analytics";

const FORM_URL = "https://forms.gle/8WVJnLD9ewkRnoRE8";

export type Segment = "corp" | "freelance" | "general";

interface CtaProps {
  label: string;
  segment: Segment;
  /** ページ内のどのボタンが押されたか区別するための位置ラベル（hero/segment-card/footerなど） */
  placement: string;
}

export function Cta({ label, segment, placement }: CtaProps) {
  return (
    <a
      href={FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("early_access_cta_click", { segment, placement })}
      className="inline-block rounded-md bg-red-700 px-6 py-3 text-white font-medium hover:bg-red-800 transition-colors"
    >
      {label}
    </a>
  );
}
