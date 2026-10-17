/**
 * Chinese text uses full-width punctuation (，：；？！（）), as the rest of the app's Chinese
 * already does. A half-width mark that touches a Chinese character is the mistake this finds.
 * Marks between Latin letters or digits are left alone on purpose: the time 0:49.80, the format
 * M:SS.xx and the address https:// are not Chinese punctuation.
 */
const CJK = "\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef";
const HALF_WIDTH_NEXT_TO_CJK = new RegExp(`[${CJK}][,;:?!()]|[,;:?!()][${CJK}]`, "g");

/** The offending pairs in `text`, for example ["据:" ]. Empty means the text is fine. */
export function halfWidthPunctuation(text: string): string[] {
  return text.match(HALF_WIDTH_NEXT_TO_CJK) ?? [];
}
