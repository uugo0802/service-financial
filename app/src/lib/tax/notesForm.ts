// ------------------------------------------------------------------
// 個別注記表の簡易生成（非公開の中小法人向け、簡易試算用）。
//
// 会社法・会社計算規則上、個別注記表には様々な注記項目があるが、このアプリが
// 保持している情報（現金の入出金明細・資本金・期首現金残高のみ）から機械的に
// 埋められる項目に絞った最小限の構成としている：
//   - 継続企業の前提に関する注記（既定は「該当なし」。疑義がある場合のみ利用者が入力）
//   - 重要な会計方針に係る事項に関する注記（現金主義的な簡易処理である旨を明記）
//   - 貸借対照表に関する注記（未払法人税等・未払消費税等。balanceSheetFormの値を参照）
//   - 株主資本等関係注記（equityChangeFormの期末残高・発行済株式数を参照）
//
// 自由記述の文章生成は行わず、常にラベル・値のペアからなるプレーンなデータ構造
// （NoteSection[]）として返す。文言はこのアプリの簡易試算という前提に沿った
// 固定文で、個別具体的な税務・会計上の判断（税理士法上の判断も含む）は行わない。
// ------------------------------------------------------------------

import { EquityChangeForm } from "./equityChangeForm";

export interface NoteLine {
  label: string;
  value: string;
}

export interface NoteSection {
  title: string;
  lines: NoteLine[];
}

export interface NotesFormInputs {
  // 継続企業の前提に重要な疑義を生じさせる事象又は状況がある場合のみtrueを渡す。
  // 既定（未指定・false）では「該当なし」として扱う。
  hasGoingConcernConcern?: boolean;
  // hasGoingConcernConcernがtrueの場合の、疑義の内容・対応策の説明（利用者入力）。
  goingConcernDescription?: string;
  unpaidCorporateTaxes: number; // balanceSheetFormのunpaidCorporateTaxesを参照
  unpaidConsumptionTax: number; // balanceSheetFormのunpaidConsumptionTaxを参照
  equityChange: EquityChangeForm; // buildEquityChangeForm()の出力
  shareCount?: number; // 発行済株式数（任意）
}

export interface NotesForm {
  goingConcern: NoteSection; // 継続企業の前提に関する注記
  significantAccountingPolicies: NoteSection; // 重要な会計方針に係る事項に関する注記
  balanceSheetNotes: NoteSection; // 貸借対照表に関する注記
  equityChangeNotes: NoteSection; // 株主資本等関係注記
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

export function buildNotesForm(inputs: NotesFormInputs): NotesForm {
  const goingConcern: NoteSection = {
    title: "継続企業の前提に関する注記",
    lines: inputs.hasGoingConcernConcern
      ? [
          {
            label: "重要な疑義の内容及び対応策",
            value:
              inputs.goingConcernDescription?.trim() ||
              "継続企業の前提に重要な疑義を生じさせる事象又は状況があるとして選択されていますが、具体的な内容は入力されていません。ご自身で追記してください。",
          },
        ]
      : [
          {
            label: "該当なし",
            value: "継続企業の前提に重要な疑義を生じさせるような事象又は状況は認められません。",
          },
        ],
  };

  const significantAccountingPolicies: NoteSection = {
    title: "重要な会計方針に係る事項に関する注記",
    lines: [
      {
        label: "作成方法（現金主義的な簡易処理である旨）",
        value:
          "本書類は預金口座等の入出金明細（現金の授受）のみを機械的に集計した現金主義的な簡易処理により作成しています。売掛金・買掛金・引当金の計上など発生主義に基づく正式な会計処理は行っていないため、正式な決算書とは数値が異なる場合があります。",
      },
      {
        label: "消費税等の会計処理",
        value: "税込方式を採用しています。",
      },
      {
        label: "固定資産の評価基準及び減価償却の方法",
        value:
          "このアプリは固定資産・棚卸資産の取得・保有情報を保持していないため記載していません。該当がある場合はご自身で追記してください。",
      },
    ],
  };

  const balanceSheetNoteLines: NoteLine[] = [];
  if (inputs.unpaidCorporateTaxes > 0) {
    balanceSheetNoteLines.push({
      label: "未払法人税等（法人税・地方法人税・住民税・事業税等）",
      value: formatYen(inputs.unpaidCorporateTaxes),
    });
  }
  if (inputs.unpaidConsumptionTax > 0) {
    balanceSheetNoteLines.push({
      label: "未払消費税等",
      value: formatYen(inputs.unpaidConsumptionTax),
    });
  }
  const balanceSheetNotes: NoteSection = {
    title: "貸借対照表に関する注記",
    lines:
      balanceSheetNoteLines.length > 0
        ? balanceSheetNoteLines
        : [{ label: "該当なし", value: "期末時点の未払法人税等・未払消費税等はありません。" }],
  };

  const equityChangeNotesLines: NoteLine[] = [
    { label: "資本金の当期末残高", value: formatYen(inputs.equityChange.capitalStock.closingBalance) },
    { label: "利益剰余金の当期末残高", value: formatYen(inputs.equityChange.retainedEarnings.closingBalance) },
    { label: "純資産合計の当期末残高", value: formatYen(inputs.equityChange.netAssetsTotal.closingBalance) },
  ];
  if (inputs.shareCount && inputs.shareCount > 0) {
    equityChangeNotesLines.push({
      label: "発行済株式の種類及び総数",
      value: `普通株式 ${inputs.shareCount.toLocaleString("ja-JP")}株`,
    });
  }
  const equityChangeNotes: NoteSection = {
    title: "株主資本等関係注記",
    lines: equityChangeNotesLines,
  };

  return { goingConcern, significantAccountingPolicies, balanceSheetNotes, equityChangeNotes };
}

/** レンダリング時にセクションを順番通り列挙するためのヘルパー。 */
export function notesFormSections(form: NotesForm): NoteSection[] {
  return [form.goingConcern, form.significantAccountingPolicies, form.balanceSheetNotes, form.equityChangeNotes];
}
