// プロジェクト/クライアントタグ付けと、タグ別の収益性集計を行う純粋関数群。
//
// docs/business-plan.md 12節（オーナー修吾の実体験ペイン）にある
// 「自分の小さな法人（今ごえん合同会社）で、どのクライアント/案件が実際に
// 儲かっているのか、高価なツールなしで手軽に把握したい」という課題に対応する。
//
// 意図的に app/src/lib/db/supabaseClient.ts の TransactionRow をインポートしない
// （このモジュールを実DB接続やテナント/勘定科目マスタから疎結合に保つため）。
// 代わりに、集計に必要な最小限のフィールドだけを持つ TaggableTransaction を
// このファイル内で定義する。
//
// 本モジュールは金額の集計・可視化のみを行うものであり、税務代理・税務書類の
// 作成・個別具体の税務相談（税理士法第2条）には一切踏み込まない。

/** タグ（プロジェクト/クライアントなど、ユーザーが自由に定義するラベル） */
export interface Tag {
  id: string;
  label: string;
  /** 一覧・グラフでの識別用の色（任意、CSSカラー値。未指定なら呼び出し側が既定色を割り当てる） */
  color?: string;
}

/** タグ作成・改名フォームの入力値 */
export interface TagDraft {
  label: string;
  color?: string;
}

export type TagFieldErrors = Partial<Record<"label", string>>;

/**
 * タグ付け対象となる取引の最小表現。
 * 実際のDB行（TransactionRow）やAI仕訳結果（CategorizedTransaction）から
 * id/date/description/amount を取り出して渡す想定（amountは収入が正、支出が負）。
 */
export interface TaggableTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
}

/** タグと取引の多対多の紐付け（1取引に複数タグを付けられる） */
export interface TagAssignment {
  tagId: string;
  transactionId: string;
}

/** タグ別の収益性集計結果の1行 */
export interface TagProfitability {
  tagId: string;
  label: string;
  color?: string;
  /** そのタグが付いた取引のうち、収入（amount >= 0）の合計（円、0以上） */
  income: number;
  /** そのタグが付いた取引のうち、支出（amount < 0）の合計の絶対値（円、0以上） */
  expense: number;
  /** income - expense */
  net: number;
  /** そのタグが付いた取引の件数 */
  transactionCount: number;
}

/** 重要性（materiality）閾値未満の取引まで律儀にタグ付けを促すとノイズになるため既定値を用意する。 */
export const DEFAULT_MATERIALITY_THRESHOLD = 30_000;

// ------------------------------------------------------------------
// タグCRUD（バリデーション + 純粋なリスト操作）
// journal/recurringEntries.ts の validateXxxDraft / addXxx / removeXxx と
// 同じ「フォーム値のバリデーションとリスト操作を分離する」流儀に合わせている。
// ------------------------------------------------------------------

/**
 * タグ名のバリデーション。
 * - 空文字（trim後）は不可。
 * - 既存タグと大文字小文字を無視して重複するラベルは不可。
 * - excludeTagId を渡すと、そのタグ自身との比較をスキップする（改名時に自分自身を除外するため）。
 */
export function validateTagLabel(label: string, tags: Tag[], excludeTagId?: string): TagFieldErrors {
  const errors: TagFieldErrors = {};
  const trimmed = label.trim();

  if (!trimmed) {
    errors.label = "タグ名を入力してください";
    return errors;
  }

  const isDuplicate = tags.some(
    (tag) => tag.id !== excludeTagId && tag.label.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (isDuplicate) {
    errors.label = "同じ名前のタグが既に存在します";
  }

  return errors;
}

export function hasTagFieldErrors(errors: TagFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateTagId(): string {
  return `tag-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 新規タグを追加する。呼び出し側は事前に validateTagLabel でバリデーションし、
 * hasTagFieldErrors が false であることを確認してから呼び出す想定（本関数自体は
 * バリデーションエラーがあっても例外を投げず、入力をtrimしてそのまま追加する）。
 */
export function addTag(tags: Tag[], draft: TagDraft): Tag[] {
  const newTag: Tag = {
    id: generateTagId(),
    label: draft.label.trim(),
    color: draft.color,
  };
  return [...tags, newTag];
}

/** 既存タグの名前・色を変更する（対象IDが見つからない場合は元のリストをそのまま返す） */
export function renameTag(tags: Tag[], tagId: string, newLabel: string, newColor?: string): Tag[] {
  return tags.map((tag) =>
    tag.id === tagId ? { ...tag, label: newLabel.trim(), color: newColor ?? tag.color } : tag
  );
}

/** タグを削除する（紐付け=TagAssignmentの掃除は removeTagAndAssignments を使うこと） */
export function removeTag(tags: Tag[], tagId: string): Tag[] {
  return tags.filter((tag) => tag.id !== tagId);
}

/** タグを削除し、そのタグに紐づく取引の紐付け（TagAssignment）も同時に取り除く */
export function removeTagAndAssignments(
  tags: Tag[],
  assignments: TagAssignment[],
  tagId: string
): { tags: Tag[]; assignments: TagAssignment[] } {
  return {
    tags: removeTag(tags, tagId),
    assignments: assignments.filter((a) => a.tagId !== tagId),
  };
}

// ------------------------------------------------------------------
// タグの紐付け（取引 ↔ タグ）
// ------------------------------------------------------------------

/** 取引にタグを付与する。既に同じ組み合わせがあれば何もしない（冪等） */
export function assignTag(assignments: TagAssignment[], tagId: string, transactionId: string): TagAssignment[] {
  const alreadyAssigned = assignments.some((a) => a.tagId === tagId && a.transactionId === transactionId);
  if (alreadyAssigned) return assignments;
  return [...assignments, { tagId, transactionId }];
}

/** 取引からタグを外す */
export function unassignTag(assignments: TagAssignment[], tagId: string, transactionId: string): TagAssignment[] {
  return assignments.filter((a) => !(a.tagId === tagId && a.transactionId === transactionId));
}

/** 指定した取引に付いているタグIDの一覧を返す */
export function tagIdsForTransaction(assignments: TagAssignment[], transactionId: string): string[] {
  return assignments.filter((a) => a.transactionId === transactionId).map((a) => a.tagId);
}

// ------------------------------------------------------------------
// 収益性集計（タグ別の収入・支出・純額）
// ------------------------------------------------------------------

/**
 * タグごとの収益性（収入合計・支出合計・純額）を集計する。
 *
 * - 1つの取引に複数タグが付いている場合、その取引の金額はタグそれぞれの集計に
 *   そのまま計上される（按分はしない = 案件をまたぐ共通経費は、ユーザーが
 *   複数タグを付けた場合、意図的に両方に全額計上される設計）。
 * - タグに紐づく取引が存在しない場合は income/expense/net/transactionCount が
 *   すべて0の行として返る（タグ一覧に「まだ実績なし」として表示できるようにするため）。
 * - 戻り値は net（純額）の降順でソートする（expenseBreakdown.ts が金額降順にする
 *   のと同じ考え方で、儲かっている/いないタグを見つけやすくする）。
 */
export function computeTagProfitability(
  tags: Tag[],
  assignments: TagAssignment[],
  transactions: TaggableTransaction[]
): TagProfitability[] {
  const transactionsById = new Map(transactions.map((tx) => [tx.id, tx]));

  const rows = tags.map((tag) => {
    const transactionIds = assignments.filter((a) => a.tagId === tag.id).map((a) => a.transactionId);

    let income = 0;
    let expense = 0;
    let transactionCount = 0;

    for (const transactionId of transactionIds) {
      const tx = transactionsById.get(transactionId);
      if (!tx) continue; // 存在しない/削除済みの取引IDを指す紐付けは無視する
      transactionCount += 1;
      if (tx.amount >= 0) {
        income += tx.amount;
      } else {
        expense += Math.abs(tx.amount);
      }
    }

    return {
      tagId: tag.id,
      label: tag.label,
      color: tag.color,
      income,
      expense,
      net: income - expense,
      transactionCount,
    };
  });

  return rows.sort((a, b) => b.net - a.net || a.label.localeCompare(b.label, "ja"));
}

// ------------------------------------------------------------------
// 未タグ付け取引の検出（重要性閾値ベースのナッジ）
// ------------------------------------------------------------------

/**
 * まだ1つもタグが付いていない取引のうち、金額の絶対値が threshold 以上のものを
 * 抽出する（小額の雑費まで律儀にタグ付けを促すとノイズになるため、
 * 「重要性（materiality）」の考え方で閾値を設ける）。
 *
 * 戻り値は金額の絶対値が大きい順（=タグ付けの優先度が高い順）にソートする。
 */
export function findUntaggedAboveThreshold(
  transactions: TaggableTransaction[],
  assignments: TagAssignment[],
  threshold: number = DEFAULT_MATERIALITY_THRESHOLD
): TaggableTransaction[] {
  const taggedTransactionIds = new Set(assignments.map((a) => a.transactionId));

  return transactions
    .filter((tx) => !taggedTransactionIds.has(tx.id) && Math.abs(tx.amount) >= threshold)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
