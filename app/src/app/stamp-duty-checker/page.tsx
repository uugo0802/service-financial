"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import {
  CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD,
  RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD,
  checkContractStampDuty,
  checkReceiptStampDuty,
  type StampDutyDocumentFormat,
} from "@/lib/tax/stampDutyChecker";

type StampDutyDocumentType = "receipt" | "contract";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";

const DOCUMENT_TYPE_LABEL: Record<StampDutyDocumentType, string> = {
  receipt: "領収書（第17号の1文書・売上代金の受取書）",
  contract: "請負契約書（第2号文書）",
};

export default function StampDutyCheckerPage() {
  const [documentType, setDocumentType] = useState<StampDutyDocumentType>("receipt");
  const [amount, setAmount] = useState<number>(100_000);
  const [format, setFormat] = useState<StampDutyDocumentFormat>("paper");
  const [amountStated, setAmountStated] = useState<boolean>(true);

  const { result, error } = useMemo(() => {
    try {
      const input = { amount, format, amountStated };
      return {
        result: documentType === "receipt" ? checkReceiptStampDuty(input) : checkContractStampDuty(input),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [documentType, amount, format, amountStated]);

  const exemptionThreshold =
    documentType === "receipt" ? RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD : CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-muted-foreground">MVP — 印紙税チェッカー</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">印紙税チェッカー（領収書・請負契約書）</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            フリーランス・マイクロ法人が発行することの多い領収書（売上代金の受取書）や請負契約書について、
            記載金額と「紙で作成・交付するか／電子的に作成・交付するか」を入力すると、必要な収入印紙の金額
            （印紙税額）を国税庁公表の税額表に基づいて機械的に判定します。領収書は5万円未満、契約書は1万円未満が
            それぞれ非課税（免税点）で、いずれもPDF等の電子的方法のみで作成・交付する場合は金額にかかわらず
            印紙税は課税されません。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この判定結果は一般的な税額表に基づく機械的な当てはめであり、個別具体的な税務相談・助言には
            該当しません。建設工事請負契約書の軽減税率や、売上代金以外の受取書、他の号の文書は対象外です。
          </p>
        </section>

        <section className="flex flex-col gap-4 bg-surface border border-border rounded p-4">
          <h2 className="text-sm font-semibold text-foreground">文書の入力</h2>

          <div>
            <span className={labelClass}>文書の種類</span>
            <div className="flex gap-3 flex-wrap">
              {(Object.keys(DOCUMENT_TYPE_LABEL) as StampDutyDocumentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={documentType === type}
                  onClick={() => setDocumentType(type)}
                  className={`text-sm px-4 py-2 border transition-colors ${
                    documentType === type
                      ? "bg-accent border-accent text-white"
                      : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {DOCUMENT_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className={labelClass} htmlFor="stamp-duty-amount">
                {documentType === "receipt" ? "受取金額（円）" : "契約金額（円）"}
              </label>
              <input
                id="stamp-duty-amount"
                type="number"
                min="0"
                value={amount}
                disabled={!amountStated}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="例：100000"
                className={`${inputClass} disabled:bg-surface disabled:text-muted-foreground`}
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!amountStated}
                  onChange={(e) => setAmountStated(!e.target.checked)}
                />
                金額の記載のない文書として判定する
              </label>
            </div>

            <div>
              <span className={labelClass}>作成・交付の方法</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  aria-pressed={format === "paper"}
                  onClick={() => setFormat("paper")}
                  className={`flex-1 text-sm px-4 py-2 border transition-colors ${
                    format === "paper"
                      ? "bg-accent border-accent text-white"
                      : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  紙で作成・交付
                </button>
                <button
                  type="button"
                  aria-pressed={format === "electronic"}
                  onClick={() => setFormat("electronic")}
                  className={`flex-1 text-sm px-4 py-2 border transition-colors ${
                    format === "electronic"
                      ? "bg-accent border-accent text-white"
                      : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  電子的に作成・交付
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            免税点（この金額未満は非課税）: {exemptionThreshold.toLocaleString("ja-JP")}円。
            紙で相手方に交付した後に金額を書き足す等の変更をした場合や、電子的に作成した文書を後から印刷して
            相手方に交付した場合は、別途課税対象となることがあります（本ツールでは判定していません）。
          </p>

          {error && <p className="text-sm text-red-700">{error}</p>}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">判定結果</h2>
          {result ? (
            <div className="flex flex-col gap-4">
              <div
                className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${
                  result.isTaxableDocument ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"
                }`}
              >
                <div>
                  <span
                    className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${
                      result.isTaxableDocument ? "bg-amber-700 text-white" : "bg-emerald-700 text-white"
                    }`}
                  >
                    {result.isTaxableDocument ? "課税文書に該当" : "印紙税は課税されません"}
                  </span>
                  <div className="text-lg font-semibold mt-1">{DOCUMENT_TYPE_LABEL[documentType]}</div>
                </div>
                <div className="text-sm text-muted-foreground text-right">
                  <div>
                    必要な収入印紙の金額:{" "}
                    <span className="font-semibold text-foreground text-base">
                      {result.stampDutyAmount.toLocaleString("ja-JP")}円
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">判定理由</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{result.reason}</p>
              </div>

              <p className="text-xs text-amber-700 leading-relaxed">{result.disclaimer}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">入力内容をご確認ください。</p>
          )}
        </section>
      </PageContainer>
    </div>
  );
}
