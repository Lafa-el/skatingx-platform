/**
 * Chinese text in the Academy content is written with full-width brackets (ADR-004 A5). The legacy
 * source wrote them half-width with a space before the opening one, like "蹲位保持 (静态速滑位)".
 *
 * Only the brackets occur in the content. Commas, colons and the like are already full-width.
 *
 * The space before "(" goes: it is written for Latin text and looks wrong next to a full-width
 * bracket. The space AFTER ")" goes only when Chinese follows ("滑行板 (Slide Board) 训练"), and
 * never in a weekly-plan label. There that space separates the name from its amount
 * ("负重深蹲 (杠铃/哑铃) 5组x6次"), and `fallbackCandidate` in the web app splits a label at spaces.
 */
const CJK = "\\u3400-\\u9fff\\uff00-\\uffef";

export function toFullWidthBrackets(text, { isPlanLabel = false } = {}) {
  if (!new RegExp(`[${CJK}]`).test(text)) {
    return text; // English and numbers are not touched
  }
  let out = text.replace(new RegExp(`([${CJK}]) \\(`, "g"), "$1(");
  if (!isPlanLabel) {
    out = out.replace(new RegExp(`\\) ([${CJK}])`, "g"), ")$1");
  }
  return out.replace(/\(/g, "（").replace(/\)/g, "）");
}
