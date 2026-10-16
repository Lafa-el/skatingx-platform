import ts from "typescript";

/**
 * Finds user-visible text written directly in source instead of coming from the i18n resources
 * (AGENTS.md: zh/en text lives in resources keyed by domain, never inline in components).
 *
 * It reads the syntax tree rather than grepping, so `className="flex"` or an import path is never
 * mistaken for text, while `{loading ? "Saving…" : "Save"}` and `language === "en" ? … : …` are
 * caught. It is a test helper: it never runs in the app bundle.
 */

export type FindingKind =
  | "jsx-text"
  | "jsx-attribute"
  | "jsx-expression"
  | "property-text"
  | "language-branch";

export interface Finding {
  kind: FindingKind;
  line: number;
  text: string;
}

/** Attributes whose value a person reads or hears (labels, tooltips, screen-reader names). */
const TEXT_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "heading",
  "subtitle",
  "hint",
  "emptyText",
]);

/** Object keys that hold display text (navigation items, option lists, messages). */
const TEXT_PROPERTIES = new Set([
  "label",
  "title",
  "description",
  "message",
  "placeholder",
  "text",
  "heading",
  "subtitle",
  "hint",
]);

/** Product names are not translated. */
const NON_TRANSLATED = new Set(["SkatingX"]);

const LETTER = /\p{L}/u;

function hasWords(raw: string): boolean {
  // Entities such as `&apos;` and `&middot;` are punctuation, not words.
  const text = raw.replace(/&#?\w+;/g, " ").trim();
  return LETTER.test(text) && !NON_TRANSLATED.has(text);
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 45)}...` : flat;
}

/** String literals a JSX expression can render directly: `{"a"}`, `{x ? "a" : "b"}`, `{x && "a"}`. */
function renderedLiterals(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) {
    return renderedLiterals(node.expression);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    return [node];
  }
  if (ts.isConditionalExpression(node)) {
    return [...renderedLiterals(node.whenTrue), ...renderedLiterals(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return renderedLiterals(node.right);
    }
  }
  return [];
}

function literalText(node: ts.Expression): string {
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  }
  return (node as ts.StringLiteral).text;
}

function isLanguageLiteral(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) && (node.text === "en" || node.text === "zh");
}

export function findHardcodedText(fileName: string, source: string): Finding[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const findings: Finding[] = [];

  const add = (node: ts.Node, findingKind: FindingKind, text: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    findings.push({ kind: findingKind, line: line + 1, text: snippet(text) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      add(node, "jsx-text", node.text);
    }

    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(file)) && node.initializer) {
      const init = node.initializer;
      const values = ts.isStringLiteral(init)
        ? [init]
        : ts.isJsxExpression(init) && init.expression
          ? renderedLiterals(init.expression)
          : [];
      for (const value of values) {
        if (hasWords(literalText(value))) {
          add(value, "jsx-attribute", literalText(value));
        }
      }
    }

    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const value of renderedLiterals(node.expression)) {
        if (hasWords(literalText(value))) {
          add(value, "jsx-expression", literalText(value));
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      TEXT_PROPERTIES.has(node.name.text)
    ) {
      for (const value of renderedLiterals(node.initializer)) {
        if (hasWords(literalText(value))) {
          add(value, "property-text", literalText(value));
        }
      }
    }

    // `language === "en" ? a : b` is how text gets mixed into components; the choice belongs to the
    // translator, so the comparison itself is the finding.
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      const equality =
        op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
      if (equality && (isLanguageLiteral(node.left) || isLanguageLiteral(node.right))) {
        add(node, "language-branch", node.getText(file));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(file);
  return findings;
}
