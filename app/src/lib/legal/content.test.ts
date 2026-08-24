import { describe, expect, it } from "vitest";
import {
  getLegalDocument,
  legalDocuments,
  splitParagraphs,
  TBD_PLACEHOLDER,
  type LegalDocumentId,
} from "./content";

const REQUIRED_IDS: LegalDocumentId[] = ["terms", "privacy", "tokushoho"];

describe("legalDocuments", () => {
  it("defines exactly the three required documents (terms, privacy, tokushoho)", () => {
    expect(legalDocuments).toHaveLength(3);
    expect(legalDocuments.map((d) => d.id).sort()).toEqual([...REQUIRED_IDS].sort());
  });

  it.each(REQUIRED_IDS)("exposes a retrievable document for id=%s via getLegalDocument", (id) => {
    const doc = getLegalDocument(id);
    expect(doc.id).toBe(id);
  });

  it("throws for an id that is not one of the three known documents", () => {
    // Cast through unknown to simulate a caller passing an invalid id (e.g. from a dynamic route param)
    // without weakening the exported function's declared type.
    expect(() => getLegalDocument("refund-policy" as unknown as LegalDocumentId)).toThrow();
  });

  it("gives every document a non-empty title, path, effectiveDate, and summary", () => {
    for (const doc of legalDocuments) {
      expect(doc.title.trim().length).toBeGreaterThan(0);
      expect(doc.path.trim().length).toBeGreaterThan(0);
      expect(doc.effectiveDate.trim().length).toBeGreaterThan(0);
      expect(doc.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("routes each document's path to /<id> so links stay in sync with the app router folders", () => {
    for (const doc of legalDocuments) {
      expect(doc.path).toBe(`/${doc.id}`);
    }
  });

  it("gives every section a non-empty heading and non-empty body across all three documents", () => {
    for (const doc of legalDocuments) {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.heading.trim().length).toBeGreaterThan(0);
        expect(section.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate section headings within a single document", () => {
    for (const doc of legalDocuments) {
      const headings = doc.sections.map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it("marks the terms of service as covering user-authority filing and the scope of tax-accountant-law-restricted acts", () => {
    const terms = getLegalDocument("terms");
    const fullText = terms.sections.map((s) => s.body).join("\n");
    // 税理士法上の代理行為を行わないこと、送信は本人操作であることの明記を確認する
    expect(fullText).toContain("税理士法");
    expect(fullText).toContain("下書き");
    expect(fullText).toContain("e-Tax");
    expect(fullText).toContain("eLTAX");
    // 「代行」を意味する表現を使わない、という business-plan.md の要請に沿った文言があること
    expect(fullText).toMatch(/申告書は当社が作成します/); // 文中で「用いない」と明示的に引用されている
  });

  it("marks the privacy policy as covering financial data handling, My Number non-storage, and Supabase", () => {
    const privacy = getLegalDocument("privacy");
    const fullText = privacy.sections.map((s) => s.body).join("\n");
    expect(fullText).toContain("マイナンバー");
    expect(fullText).toContain("Supabase");
    expect(fullText).toMatch(/暗号化/);
  });

  it("marks the tokushoho notice as containing the standard required fields with TBD placeholders for unresolved facts", () => {
    const tokushoho = getLegalDocument("tokushoho");
    const headings = tokushoho.sections.map((s) => s.heading);
    expect(headings).toEqual(
      expect.arrayContaining(["事業者名", "代表責任者", "所在地", "販売価格"])
    );

    const businessName = tokushoho.sections.find((s) => s.heading === "事業者名");
    const address = tokushoho.sections.find((s) => s.heading === "所在地");
    expect(businessName?.body).toContain(TBD_PLACEHOLDER);
    expect(address?.body).toContain(TBD_PLACEHOLDER);

    // 特商法表記は業績数値を捏造してはならない: 具体的な売上・利益の金額表現が含まれていないこと
    const fullText = tokushoho.sections.map((s) => s.body).join("\n");
    expect(fullText).not.toMatch(/¥[\d,]+/);
    expect(fullText).not.toMatch(/\d+円/);
  });

  it("distinguishes the natural-person legal representative from the 'AI CEO Jarvis' persona in both terms and tokushoho", () => {
    for (const id of ["terms", "tokushoho"] as const) {
      const doc = getLegalDocument(id);
      const fullText = doc.sections.map((s) => s.body).join("\n");
      expect(fullText).toContain("ジャービス");
      expect(fullText).toContain("自然人");
    }
  });
});

describe("splitParagraphs", () => {
  it("splits a multi-paragraph body on blank lines into trimmed, non-empty paragraphs", () => {
    const body = "第一段落。\n\n第二段落。\n\n第三段落。";
    expect(splitParagraphs(body)).toEqual(["第一段落。", "第二段落。", "第三段落。"]);
  });

  it("returns a single-element array for a body with no blank-line separators", () => {
    expect(splitParagraphs("一つの段落のみ。")).toEqual(["一つの段落のみ。"]);
  });

  it("drops empty paragraphs produced by extra blank lines", () => {
    const body = "段落A。\n\n\n\n段落B。";
    expect(splitParagraphs(body)).toEqual(["段落A。", "段落B。"]);
  });

  it("every section body in every document round-trips to at least one non-empty paragraph", () => {
    for (const doc of legalDocuments) {
      for (const section of doc.sections) {
        expect(splitParagraphs(section.body).length).toBeGreaterThan(0);
      }
    }
  });

  it("returns an empty array for an empty string", () => {
    expect(splitParagraphs("")).toEqual([]);
  });

  it("returns an empty array for a body consisting only of blank-line separators", () => {
    expect(splitParagraphs("\n\n\n\n")).toEqual([]);
  });

  it("trims leading/trailing whitespace from each paragraph", () => {
    const body = "  段落A。  \n\n  段落B。  ";
    expect(splitParagraphs(body)).toEqual(["段落A。", "段落B。"]);
  });
});
