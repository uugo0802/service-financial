import { TransactionRow } from "../db/supabaseClient";
import { filterTransactions } from "../db/transactionSearch";
import { DocumentWithTransaction, LinkedTransactionFields, filterDocuments } from "../documents/documentSearch";
import { COUNTERPARTY_KIND_LABELS, Counterparty } from "../clients/clientMaster";
import { listCounterparties } from "../clients/clientMaster";
import { ReceivableInvoiceInput } from "../invoice/receivables";

// ------------------------------------------------------------------
// テナントに1年分程度の記帳データが蓄積すると、「取引」「証憑」「取引先」の
// どこに目当ての情報があったか思い出せなくなる、という横断検索のUXギャップに
// 対応するためのモジュール。
//
// 既存の各エンティティ向け検索（db/transactionSearch.ts, documents/documentSearch.ts,
// clients/clientMaster.ts の listCounterparties）はそれぞれ独立して存在するが、
// 一つのキーワードで3つ全てを串刺し検索できる場所が無かった。本モジュールは
// それらの検索・絞り込みロジックを一切複製せず、既存の純粋関数をそのまま呼び出して
// 結果を集約するだけの「薄い」層として実装する（マッチング条件を変えたい場合は、
// 各エンティティ側のモジュールを直す）。
//
// 証憑（DocumentWithTransaction）は、documentSearch.ts の設計方針どおり
// リンク先取引が無い（transaction: null）場合はキーワード照合できないため、
// filterDocuments 側の挙動により自然と検索結果から除外される
// （documents/page.tsx の「未紐付けの証憑」注記と同じ前提）。
// ------------------------------------------------------------------

export type GlobalSearchResultKind = "transaction" | "document" | "client" | "invoice";

interface GlobalSearchResultBase {
  /** 元データのID（取引ID・証憑ID・取引先ID）。同じkind内で一意。 */
  id: string;
  /** 結果一覧の主見出しとして表示するテキスト。 */
  title: string;
  /** 主見出しの補足情報（取引先名・種別・メモなど）。無ければundefined。 */
  subtitle?: string;
  /** 並び替え用のISO日付（"YYYY-MM-DD"等）。取得できない場合は空文字列（常に最後尾扱い）。 */
  sortDate: string;
  /** 結果をクリックした際の遷移先。既存の一覧・検索画面への導線。 */
  href: string;
}

export interface TransactionSearchResult extends GlobalSearchResultBase {
  kind: "transaction";
  /** 取引金額（収入は正、支出は負）。 */
  amount: number;
}

export interface DocumentSearchResultItem extends GlobalSearchResultBase {
  kind: "document";
  /** 保存ファイル名（storage_pathの末尾）。 */
  fileName: string;
  /** リンク先取引の金額。取引にリンクしている証憑のみ検索対象になるため常に値を持つ。 */
  amount: number;
}

export interface ClientSearchResult extends GlobalSearchResultBase {
  kind: "client";
  /** 売上先（顧客）か仕入先か。 */
  counterpartyKind: Counterparty["kind"];
}

export interface InvoiceSearchResult extends GlobalSearchResultBase {
  kind: "invoice";
  /** 請求金額合計（税込、円）。 */
  amount: number;
}

/** 横断検索結果の統一表現。UI側は`kind`で判別して表示を出し分ける。 */
export type GlobalSearchResult =
  | TransactionSearchResult
  | DocumentSearchResultItem
  | ClientSearchResult
  | InvoiceSearchResult;

export interface GlobalSearchSources {
  transactions?: TransactionRow[];
  documents?: DocumentWithTransaction[];
  clients?: Counterparty[];
  invoices?: ReceivableInvoiceInput[];
}

function toTransactionResult(row: TransactionRow): TransactionSearchResult {
  return {
    kind: "transaction",
    id: row.id,
    title: row.description,
    subtitle: row.note ?? undefined,
    sortDate: row.date,
    amount: row.amount,
    href: "/transactions",
  };
}

function extractFileName(storagePath: string): string {
  const segments = storagePath.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : "(ファイル名不明)";
}

function toDocumentResult(
  row: DocumentWithTransaction & { transaction: LinkedTransactionFields }
): DocumentSearchResultItem {
  return {
    kind: "document",
    id: row.id,
    title: row.transaction.description,
    subtitle: row.transaction.counterparty ?? undefined,
    sortDate: row.transaction.date,
    amount: row.transaction.amount,
    fileName: extractFileName(row.storage_path),
    href: "/documents",
  };
}

function toClientResult(record: Counterparty): ClientSearchResult {
  return {
    kind: "client",
    id: record.id,
    title: record.name,
    subtitle: [COUNTERPARTY_KIND_LABELS[record.kind], record.notes].filter(Boolean).join(" ／ "),
    sortDate: record.updatedAt,
    counterpartyKind: record.kind,
    href: "/clients",
  };
}

// lib/invoice/receivables.tsは未収入金集計のみを扱う純粋関数群であり、キーワード検索用の
// フィルタ関数を持たないため、他エンティティのように既存関数を再利用できない。ここでは
// transactionSearch.tsのmatchesKeyword()と同じ「小文字化した部分一致」の方針だけを、
// この薄い層の中で最小限実装する（一致対象は請求書番号・取引先名）。
function matchesInvoiceKeyword(invoice: ReceivableInvoiceInput, keyword: string): boolean {
  const haystack = `${invoice.invoiceNumber} ${invoice.clientName}`.toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

function toInvoiceResult(invoice: ReceivableInvoiceInput): InvoiceSearchResult {
  return {
    kind: "invoice",
    id: invoice.invoiceNumber,
    title: invoice.invoiceNumber,
    subtitle: invoice.clientName,
    sortDate: invoice.issueDate,
    amount: invoice.grandTotal,
    href: "/invoices",
  };
}

/**
 * 取引・証憑・取引先を1つのキーワードで横断検索する純粋関数。
 *
 * - queryが空/空白のみの場合は、既存モジュールの「条件未指定＝全件返す」という
 *   個別検索向けの挙動をそのまま横断検索に持ち込むと結果が肥大化しすぎるため、
 *   明示的に空配列を返す（何も入力していない状態では何も表示しない）。
 * - 結果はkindごとにグルーピングされた状態（取引→証憑→取引先→請求書の順）で返す。
 *   各グループ内の並び順は、その元になった検索関数が返す順序をそのまま尊重する
 *   （取引・証憑・請求書は渡された配列の順序、取引先はlistCounterpartiesによる名称順）。
 */
export function globalSearch(query: string, sources: GlobalSearchSources = {}): GlobalSearchResult[] {
  const keyword = query.trim();
  if (!keyword) return [];

  const transactions = sources.transactions ?? [];
  const documents = sources.documents ?? [];
  const clients = sources.clients ?? [];
  const invoices = sources.invoices ?? [];

  const transactionResults: GlobalSearchResult[] = filterTransactions(transactions, { keyword }).map(
    toTransactionResult
  );

  const documentResults: GlobalSearchResult[] = filterDocuments(documents, { keyword })
    .filter(
      (row): row is DocumentWithTransaction & { transaction: LinkedTransactionFields } => row.transaction !== null
    )
    .map(toDocumentResult);

  const clientResults: GlobalSearchResult[] = listCounterparties(clients, { query: keyword }).map(toClientResult);

  const invoiceResults: GlobalSearchResult[] = invoices
    .filter((invoice) => matchesInvoiceKeyword(invoice, keyword))
    .map(toInvoiceResult);

  return [...transactionResults, ...documentResults, ...clientResults, ...invoiceResults];
}

/** 横断検索結果をkindごとに分けたもの。検索結果一覧画面のグルーピング表示用。 */
export type GlobalSearchResultsByKind = {
  transaction: TransactionSearchResult[];
  document: DocumentSearchResultItem[];
  client: ClientSearchResult[];
  invoice: InvoiceSearchResult[];
};

/** globalSearch()の結果をkindごとの配列に分類する（並び順は入力の順序を維持）。 */
export function groupSearchResultsByKind(results: GlobalSearchResult[]): GlobalSearchResultsByKind {
  const grouped: GlobalSearchResultsByKind = { transaction: [], document: [], client: [], invoice: [] };

  for (const result of results) {
    if (result.kind === "transaction") grouped.transaction.push(result);
    else if (result.kind === "document") grouped.document.push(result);
    else if (result.kind === "client") grouped.client.push(result);
    else grouped.invoice.push(result);
  }

  return grouped;
}
