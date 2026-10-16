import { describe, expect, it } from "vitest";

import { findHardcodedText } from "./hardcoded-text";

const scan = (source: string, file = "Sample.tsx") => findHardcodedText(file, source);
const kinds = (source: string, file?: string) => scan(source, file).map((f) => f.kind);

describe("findHardcodedText: what it reports", () => {
  it("plain text between tags, in English and Chinese", () => {
    expect(kinds(`const A = () => <h1>Dashboard</h1>;`)).toEqual(["jsx-text"]);
    expect(kinds(`const A = () => <p>今日任务</p>;`)).toEqual(["jsx-text"]);
  });

  it("text next to an expression", () => {
    expect(kinds(`const A = () => <p>Total: {count}</p>;`)).toEqual(["jsx-text"]);
  });

  it("text attributes a person reads or hears", () => {
    expect(kinds(`const A = () => <input aria-label="Search" placeholder="Name" />;`)).toEqual([
      "jsx-attribute",
      "jsx-attribute",
    ]);
    expect(kinds(`const A = () => <img alt={"Logo"} />;`)).toEqual(["jsx-attribute"]);
  });

  it("literals rendered through an expression, including either side of a conditional", () => {
    expect(kinds(`const A = () => <p>{"Hello"}</p>;`)).toEqual(["jsx-expression"]);
    expect(kinds(`const A = () => <b>{busy ? "Saving…" : "Save"}</b>;`)).toEqual([
      "jsx-expression",
      "jsx-expression",
    ]);
    expect(kinds(`const A = () => <b>{ready && "Ready"}</b>;`)).toEqual(["jsx-expression"]);
    expect(kinds("const A = () => <b>{`Saved ${n}`}</b>;")).toEqual(["jsx-expression"]);
  });

  it("display text in object properties, such as navigation items", () => {
    expect(kinds(`export const nav = [{ to: "/a", label: "Tasks" }];`, "nav.ts")).toEqual(["property-text"]);
  });

  it("a comparison with a language code, which is how text gets mixed into components", () => {
    expect(kinds(`const x = language === "en" ? a : b;`, "page.ts")).toEqual(["language-branch"]);
    expect(kinds(`const x = settings.language !== "zh";`, "page.ts")).toEqual(["language-branch"]);
  });

  it("reports the line and a short snippet", () => {
    const [finding] = scan(`const A = () => (\n  <div>\n    <h1>Dashboard</h1>\n  </div>\n);`);
    expect(finding).toMatchObject({ kind: "jsx-text", line: 3, text: "Dashboard" });
  });
});

describe("findHardcodedText: what it leaves alone", () => {
  it("text that comes from the resources", () => {
    expect(
      scan(`const A = () => <h1 title={t(locale, "dashboard.title")}>{t(locale, "dashboard.title")}</h1>;`),
    ).toEqual([]);
  });

  it("class names, routes, ids and other non-text attributes", () => {
    expect(
      scan(
        `const A = () => <a className="flex min-h-11" href="/x" id="field" type="button" data-testid="go" />;`,
      ),
    ).toEqual([]);
  });

  it("punctuation, separators and entities", () => {
    expect(scan(`const A = () => <p>{a} · {b} / {c} &middot; &apos;</p>;`)).toEqual([]);
    expect(scan(`const A = () => <span>–</span>;`)).toEqual([]);
  });

  it("the product name, which is not translated", () => {
    expect(scan(`const A = () => <h1>SkatingX</h1>;`)).toEqual([]);
  });

  it("imports, error messages for developers and keys that are not display text", () => {
    expect(
      scan(
        `import { x } from "@/shared/thing";\nthrow new Error("not ready");\nconst o = { id: "abc", to: "/x", kind: "task" };`,
        "x.ts",
      ),
    ).toEqual([]);
  });

  it("a comparison with something other than a language code", () => {
    expect(scan(`const x = status === "done";`, "x.ts")).toEqual([]);
  });

  it("text inside a call, which is a translator or formatter result", () => {
    expect(scan(`const A = () => <p>{format("long", n)}</p>;`)).toEqual([]);
  });
});
