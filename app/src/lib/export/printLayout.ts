// ------------------------------------------------------------------
// 決算書類の印刷／PDF保存レイアウト（PrintableStatementLayout.tsx）向けの
// 純粋関数・定数群。
//
// 重要な法的前提（税理士法対応）: このアプリが生成する決算書類はあくまで
// 記帳内容に基づく概算の下書き・シミュレーションであり、当社が正式な決算書・
// 申告書を「作成」「代行提出」するものではない。印刷／PDF保存した書面にも
// この位置づけが常に（除去不可能な形で）表示されるよう、透かし・フッター文言は
// この定数を唯一の出典として参照すること（コンポーネント側での書き換え・弱化は禁止）。
// ------------------------------------------------------------------

/** 印刷ページの透かし（各ページに重ねて表示する短い注記）。 */
export const DRAFT_WATERMARK_LABEL = "下書き ／ シミュレーション";

/** 印刷ページのフッターに常時表示する、より詳細な注記文。 */
export const PRINT_FOOTER_NOTICE =
  "本書類は記帳内容に基づく概算の下書き（シミュレーション）であり、正式な決算書ではありません。" +
  "当社が税務代理・税務書類の作成・税務相談を行うものではなく、申告・決算の確定はご自身または税理士等の専門家が行ってください。";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * ProfitLossStatement.periodStart / periodEnd（"YYYY-MM-DD" 形式、または
 * 明細が1件もない場合の "-" フォールバック）から、印刷ヘッダーに表示する
 * 対象期間の見出し文字列を組み立てる。
 *
 * 年をまたがない期間は「YYYY年M月D日〜M月D日」、年をまたぐ期間は
 * 「YYYY年M月D日〜YYYY年M月D日」の形式にする。日付が解釈できない場合は
 * 未設定であることを明示する文言を返す（タイムゾーン依存の挙動を避けるため
 * Date型ではなく文字列を直接パースする）。
 */
export function formatFiscalYearRange(periodStart: string, periodEnd: string): string {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  if (!start || !end) {
    return "対象期間: 未設定";
  }
  const startLabel = `${start.y}年${start.m}月${start.d}日`;
  const endLabel = start.y === end.y ? `${end.m}月${end.d}日` : `${end.y}年${end.m}月${end.d}日`;
  return `${startLabel}〜${endLabel}`;
}

export interface PrintableField<T = string> {
  /** 一覧内で一意なキー。 */
  key: string;
  label: string;
  value: T;
  /**
   * 印刷ヘッダー等に出したくない項目（UI専用の補足情報など）に false を指定する。
   * 未指定（デフォルト）は印刷対象に含める。
   */
  printable?: boolean;
}

/**
 * 印刷レイアウトのヘッダー等に表示するフィールド一覧から、印刷対象外
 * （printable: false）の項目を取り除く。並び順は入力の順序を保つ。
 */
export function selectPrintVisibleFields<T>(fields: PrintableField<T>[]): PrintableField<T>[] {
  return fields.filter((field) => field.printable !== false);
}

export interface PrintSectionInput {
  /** セクションを一意に識別するID。 */
  id: string;
  /**
   * true の場合、このセクションの直前に強制的な改ページを挿入する。
   * 先頭セクションに指定しても無視される（すでにページ先頭にあるため）。
   */
  forceNewPage?: boolean;
}

export interface PrintSectionPlan {
  id: string;
  /** このセクションの直前に改ページを挿入するか。 */
  breakBeforePage: boolean;
  /** セクションのラッパー要素に付与するTailwindクラス（印刷時のみ有効な print: 系）。 */
  className: string;
}

/**
 * 決算書類の各セクション（貸借対照表・株主資本等変動計算書・個別注記表 等）を
 * どのように改ページするかを決定する。表の行がページ境界で分断されるのを防ぐため
 * 全セクションに print:break-inside-avoid を付与し、forceNewPage が指定された
 * セクション（先頭を除く）には print:break-before-page を追加する。
 */
export function buildPrintSectionPlan(sections: PrintSectionInput[]): PrintSectionPlan[] {
  return sections.map((section, index) => {
    const breakBeforePage = Boolean(section.forceNewPage) && index > 0;
    const classNames = ["print:break-inside-avoid"];
    if (breakBeforePage) {
      classNames.push("print:break-before-page");
    }
    return {
      id: section.id,
      breakBeforePage,
      className: classNames.join(" "),
    };
  });
}
