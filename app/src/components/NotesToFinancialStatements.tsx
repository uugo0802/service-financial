import { NotesForm, notesFormSections } from "@/lib/tax/notesForm";

// ------------------------------------------------------------------
// 個別注記表の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// ------------------------------------------------------------------

export function NotesToFinancialStatements({ form }: { form: NotesForm }) {
  const sections = notesFormSections(form);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">個別注記表</h2>
      <div className="flex flex-col gap-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2">{section.title}</h3>
            <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800">
              {section.lines.map((line, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-3 py-2 text-sm">
                  <div className="text-stone-500 dark:text-stone-400 sm:w-64 shrink-0">{line.label}</div>
                  <div className="leading-relaxed">{line.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
