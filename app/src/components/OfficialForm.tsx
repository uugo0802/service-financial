"use client";

// 国税庁・地方税の申告書様式に寄せた、罫線ボックス欄を再現するための共通パーツ。
// 実物は「十億｜百万｜千｜円」のように3桁区切りのマス目に数字を右詰めで
// 1マス1文字ずつ記入する形式のため、それを模してレンダリングする。

const GROUPS = [1, 3, 3, 3, 2]; // 十億の上位1桁｜百万｜千｜円（一〜百）｜十円未満は使わない想定の簡易分割
const TOTAL_DIGITS = GROUPS.reduce((a, b) => a + b, 0);

function splitIntoGroups(digits: string[]): string[][] {
  const groups: string[][] = [];
  let cursor = 0;
  for (const size of GROUPS) {
    groups.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

export function DigitAmount({ value }: { value: number }) {
  const rounded = Math.max(0, Math.round(value));
  const digits = rounded.toString().padStart(TOTAL_DIGITS, " ").slice(-TOTAL_DIGITS).split("");
  const groups = splitIntoGroups(digits);
  return (
    <>
      {/* 1マス1文字のマス目表示は装飾目的の再現であり、スクリーンリーダーには意味のある金額として読み上げる */}
      <div className="inline-flex border border-stone-800 shrink-0" aria-hidden="true">
        {groups.map((group, gi) => (
          <div key={gi} className={`flex ${gi > 0 ? "border-l-2 border-stone-800" : ""}`}>
            {group.map((d, i) => (
              <span
                key={i}
                className="w-[0.95em] sm:w-[1.15em] h-[1.3em] sm:h-[1.5em] flex items-center justify-center border-l border-stone-300 first:border-l-0 text-[0.68rem] sm:text-[0.82rem] tabular-nums"
              >
                {d.trim()}
              </span>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">{rounded.toLocaleString("ja-JP")}円</span>
    </>
  );
}

export function OfficialFormFrame({
  scheduleLabel,
  formTitle,
  children,
}: {
  scheduleLabel: string;
  formTitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <div className="border-2 border-stone-800 flex min-w-[20rem]">
        <div className="flex-1 p-3 sm:p-4 min-w-0">
          <div className="text-center text-sm font-semibold tracking-widest border-b-2 border-stone-800 pb-2 mb-3">
            {formTitle}
          </div>
          {children}
        </div>
        <div className="w-8 border-l-2 border-stone-800 flex items-start justify-center py-3 shrink-0">
          <span
            className="text-xs font-semibold tracking-[0.3em]"
            style={{ writingMode: "vertical-rl" }}
          >
            {scheduleLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

export function OfficialRow({
  label,
  symbol,
  amount,
  indent,
  strong,
}: {
  label: string;
  symbol?: string;
  amount: number;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-1 border-b border-dotted border-stone-300 ${indent ? "pl-4" : ""}`}>
      <span className="w-7 text-[0.68rem] text-stone-500 shrink-0">{symbol}</span>
      <span className={`flex-1 min-w-0 text-[0.82rem] ${strong ? "font-semibold" : ""}`}>{label}</span>
      <DigitAmount value={amount} />
    </div>
  );
}

export function OfficialSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="bg-stone-100 text-[0.7rem] font-semibold px-2 py-1 border-y border-stone-400">{title}</div>
      <div className="px-1">{children}</div>
    </div>
  );
}
