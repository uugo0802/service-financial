// e-Tax（国税）／eLTAX（地方税）への送信ガイドで表示するステップ文言。
//
// 重要（税理士法対応）: 当社は下書きデータの自動作成のみを行い、実際の電子署名・送信は
// 常にご本人の権限・操作で行っていただく（＝当社が代理送信することはない）。
// これは docs/cto-tech-architecture.md「1.1 e-Tax」「1.2 eLTAX」の結論に基づく前提であり、
// 各ステップの selfOperationNotice には必ずその旨を明記すること。

export type SubmissionSystem = "etax" | "eltax";

export interface SubmissionStep {
  id: number;
  title: string;
  description: string;
  /** このステップが「本人操作」であることを明確にする注意書き（必須） */
  selfOperationNotice: string;
}

export const ETAX_SUBMISSION_STEPS: SubmissionStep[] = [
  {
    id: 1,
    title: "下書きデータをダウンロード",
    description:
      "書類プレビューで作成した確定申告書・決算書等の下書きデータを、e-Taxソフト（WEB版）が読み込める形式（.xtx/CSV）でエクスポートします。",
    selfOperationNotice:
      "ダウンロードされるのは「下書き」データです。内容が正しいかは、次のステップに進む前にご本人が必ず確認してください。",
  },
  {
    id: 2,
    title: "e-Taxソフト（WEB版）にログイン",
    description:
      "国税庁の「e-Taxソフト（WEB版）」に、マイナンバーカード方式または利用者識別番号・暗証番号方式でログインします。",
    selfOperationNotice:
      "ログインは当社のサイトではなく、国税庁の公式サイト（e-Taxソフト（WEB版））で、ご本人のアカウントで行ってください。当社がログイン情報を代行して入力・保持することはありません。",
  },
  {
    id: 3,
    title: "下書きデータを読み込み",
    description:
      "e-Taxソフト（WEB版）の「作成再開」または「他の作成方法から移行」等のメニューから、ステップ1でダウンロードした.xtx/CSVファイルを読み込みます。",
    selfOperationNotice:
      "読み込んだ後の申告書の内容表示は、e-Taxソフト（WEB版）の画面でご本人が確認してください。当社の画面上の下書きと差異がないか突き合わせることをお勧めします。",
  },
  {
    id: 4,
    title: "マイナンバーカードで電子署名",
    description:
      "ICカードリーダー、またはスマートフォンの署名用電子証明書機能を使い、マイナンバーカードでご本人が申告書データに電子署名します。",
    selfOperationNotice:
      "電子署名はご本人のマイナンバーカード（電子証明書）で行う必要があります。当社はマイナンバー自体を預かることも、代わりに署名することもできません。",
  },
  {
    id: 5,
    title: "送信・受付結果の確認",
    description:
      "電子署名した申告書データをe-Taxシステムへ送信し、「受信通知（メッセージボックス）」で受付結果を確認します。",
    selfOperationNotice:
      "送信ボタンを押す操作、および受付結果の確認は、すべてご本人の権限で行ってください。当社が代理送信することはありません。受信通知の控えは大切に保管してください。",
  },
];

export const ELTAX_SUBMISSION_STEPS: SubmissionStep[] = [
  {
    id: 1,
    title: "下書きデータをダウンロード",
    description:
      "書類プレビューで作成した法人住民税・事業税等の申告下書きデータを、地方税ポータルシステム（eLTAX）の「PCdesk」が読み込める形式（CSV）でエクスポートします。",
    selfOperationNotice:
      "ダウンロードされるのは「下書き」データです。内容が正しいかは、次のステップに進む前にご本人が必ず確認してください。",
  },
  {
    id: 2,
    title: "PCdesk（Web版）にログイン",
    description:
      "地方税共同機構が提供する「PCdesk」（Web版またはインストール版）に、ご本人のeLTAX利用者IDで、または法人であればgBizID/マイナンバーカード等でログインします。",
    selfOperationNotice:
      "ログインは当社のサイトではなく、地方税共同機構が提供するPCdeskで、ご本人のアカウントで行ってください。当社がログイン情報を代行して入力・保持することはありません。",
  },
  {
    id: 3,
    title: "下書きデータを読み込み",
    description:
      "PCdeskの申告データ取込機能から、ステップ1でダウンロードしたCSVファイルを読み込み、提出先の都道府県・市区町村を選択します。",
    selfOperationNotice:
      "読み込んだ後の申告内容の表示は、PCdeskの画面でご本人が確認してください。当社の画面上の下書きと差異がないか、特に提出先自治体・税率が正しいかを突き合わせることをお勧めします。",
  },
  {
    id: 4,
    title: "マイナンバーカード等で電子署名",
    description:
      "ICカードリーダー等を使い、マイナンバーカード（法人の場合は代表者の電子証明書等）でご本人が申告データに電子署名します。",
    selfOperationNotice:
      "電子署名はご本人（または法人代表者本人）の電子証明書で行う必要があります。当社はマイナンバー自体を預かることも、代わりに署名することもできません。",
  },
  {
    id: 5,
    title: "送信・受付結果の確認",
    description:
      "電子署名した申告データをeLTAXへ送信し、「eLTAX受付システム」の受信通知で受付結果を確認します。",
    selfOperationNotice:
      "送信ボタンを押す操作、および受付結果の確認は、すべてご本人の権限で行ってください。当社が代理送信することはありません。受信通知の控えは大切に保管してください。",
  },
];

export function getSubmissionSteps(system: SubmissionSystem): SubmissionStep[] {
  return system === "etax" ? ETAX_SUBMISSION_STEPS : ELTAX_SUBMISSION_STEPS;
}
