/**
 * 日本の銀行・カード会社のCSVはShift-JIS（CP932）書き出しであることが多い。
 * UTF-8として厳密デコードを試み、失敗したらShift-JISとして読み直す。
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): { text: string; encoding: "utf-8" | "shift_jis" } {
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    return { text: utf8Decoder.decode(buffer), encoding: "utf-8" };
  } catch {
    const sjisDecoder = new TextDecoder("shift_jis");
    return { text: sjisDecoder.decode(buffer), encoding: "shift_jis" };
  }
}
