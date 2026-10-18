// @vitest-environment happy-dom
import { Button, Card, ErrorNotice, Notice, ProgressBar, StatusTag, type StatusTone } from "@skatingx/ui";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

// UI v1, phase 0 (docs/design/ui-redesign-v1.md). No page uses the new looks yet; these tests hold
// what the components promise, and that the looks every page uses today did not move.

const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

describe("Button", () => {
  it("brand: flame fill, navy text (not white), still a 44px target", () => {
    const { container } = render(<Button variant="brand">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(classesOf(button)).toEqual(expect.arrayContaining(["bg-brand-flame", "text-brand-navy", "rounded-control"]));
    expect(classesOf(button)).not.toContain("text-white");
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });

  it("brand: can be disabled", () => {
    render(
      <Button variant="brand" disabled>
        Save
      </Button>,
    );
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["brand", "outline", "danger-outline"] as const)(
    "%s has exactly one font weight and one text colour, so no class clash decides the look",
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      const classes = classesOf(screen.getByRole("button", { name: "Go" })).filter((c) => !c.includes(":"));
      expect(classes.filter((c) => /^font-(medium|semibold|bold)$/.test(c))).toHaveLength(1);
      expect(classes.filter((c) => /^text-(white|slate-\d+|brand-navy|status-danger)$/.test(c))).toHaveLength(1);
    },
  );

  it("outline: navy text and border, no fill; danger-outline: error red, not the brand flame", () => {
    render(
      <>
        <Button variant="outline">Out</Button>
        <Button variant="danger-outline">Del</Button>
      </>,
    );
    expect(classesOf(screen.getByRole("button", { name: "Out" }))).toEqual(
      expect.arrayContaining(["text-brand-navy", "border-brand-navy/50", "bg-transparent"]),
    );
    const danger = screen.getByRole("button", { name: "Del" });
    expect(classesOf(danger)).toContain("text-status-danger");
    expect(danger.className).not.toMatch(/brand-flame/);
  });

  it("without a variant the button is the brand button, and no old blue or grey look is left", () => {
    render(<Button>Plain</Button>);
    const classes = classesOf(screen.getByRole("button", { name: "Plain" }));
    expect(classes).toEqual(expect.arrayContaining(["rounded-control", "bg-brand-flame", "text-brand-navy"]));
    expect(classes.some((c) => /(sky|slate)-\d/.test(c))).toBe(false);
    expect(classes).not.toContain("text-white");
  });
});

describe("Card", () => {
  it("without a variant the card is the raised card, with no old slate classes", () => {
    const { container } = render(<Card title="Points">12</Card>);
    const article = container.querySelector("article")!;
    expect(article.getAttribute("class")).toBe("rounded-card border border-brand-navy/10 bg-white p-4 shadow-card");
    expect(article.outerHTML).not.toMatch(/slate-\d/);
    expect(screen.getByRole("heading", { name: "Points" }).className).toContain("text-brand-navy");
    expect(screen.getByText("12").className).toContain("text-brand-navy");
  });

  it("raised: large radius, navy text", () => {
    const { container } = render(
      <Card title="Streak" variant="raised">
        3
      </Card>,
    );
    expect(classesOf(container.querySelector("article")!)).toEqual(expect.arrayContaining(["rounded-card", "bg-white", "shadow-card"]));
  });

  it("hero: gradient with navy text only, because white fails on the energy end", () => {
    const { container } = render(
      <Card title="Next" variant="hero">
        <span className="sx-numeric">500</span>
      </Card>,
    );
    const article = container.querySelector("article")!;
    expect(classesOf(article)).toEqual(expect.arrayContaining(["sx-energy-gradient", "text-brand-navy"]));
    expect(article.className).not.toMatch(/text-white/);
    expect(screen.getByRole("heading", { name: "Next" }).className).not.toMatch(/text-white/);
  });

  it("renders no body when there are no children", () => {
    const { container } = render(<Card title="Empty" variant="hero" />);
    expect(container.querySelectorAll("div").length).toBe(0);
  });
});

describe("StatusTag", () => {
  const tones: StatusTone[] = ["pending", "success", "danger", "neutral", "brand"];

  it.each(tones)("%s shows words and a glyph, so it is never colour alone", (tone) => {
    const { container } = render(<StatusTag tone={tone}>Label {tone}</StatusTag>);
    expect(screen.queryByText(`Label ${tone}`)).not.toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // The glyph is decoration; the words are what a screen reader reads.
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives the pending and danger tags different glyph shapes (both are warm colours)", () => {
    const shape = (tone: StatusTone) => {
      const { container, unmount } = render(<StatusTag tone={tone}>x</StatusTag>);
      const html = container.querySelector("svg")!.innerHTML;
      unmount();
      return html;
    };
    expect(shape("pending")).not.toBe(shape("danger"));
    expect(shape("danger")).not.toBe(shape("success"));
  });

  it("danger uses the error colour, never the brand flame", () => {
    const { container } = render(<StatusTag tone="danger">Failed</StatusTag>);
    const tag = container.querySelector("span")!;
    expect(classesOf(tag)).toEqual(expect.arrayContaining(["text-status-danger", "bg-status-danger-tint"]));
    expect(tag.className).not.toMatch(/brand-flame/);
  });
});

describe("ErrorNotice", () => {
  it("is an alert with an icon and the words, in the error red", () => {
    const { container } = render(<ErrorNotice>Could not save</ErrorNotice>);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Could not save");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(alert)).toEqual(expect.arrayContaining(["text-status-danger", "bg-status-danger-tint"]));
    expect(alert.className).not.toMatch(/brand-flame/);
  });
});

describe("ProgressBar", () => {
  it("is a named progress bar with its numbers", () => {
    render(<ProgressBar label="Tasks done" value={3} max={4} />);
    const bar = screen.getByRole("progressbar", { name: "Tasks done" });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("75%");
  });

  it("reads value as a percentage when max is left out", () => {
    render(<ProgressBar label="Loaded" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Loaded" });
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("40%");
  });

  it("empty state: 0 of 0 is an empty bar", () => {
    render(<ProgressBar label="Tasks done" value={0} max={0} />);
    const bar = screen.getByRole("progressbar", { name: "Tasks done" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
  });

  it("error path: bad numbers draw an empty bar, not NaN%", () => {
    render(<ProgressBar label="Broken" value={Number.NaN} max={4} />);
    const bar = screen.getByRole("progressbar", { name: "Broken" });
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });

  it("never fills past the end", () => {
    render(<ProgressBar label="Over" value={9} max={4} />);
    expect((screen.getByRole("progressbar", { name: "Over" }).firstElementChild as HTMLElement).style.width).toBe("100%");
  });
});

describe("Notice", () => {
  it.each(["info", "success", "pending"] as const)("%s: an icon next to the words, navy text", (tone) => {
    const { container } = render(<Notice tone={tone}>Something happened</Notice>);
    const box = container.firstElementChild!;
    expect(box.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Something happened")).toBeTruthy();
    expect(classesOf(box)).toContain("text-brand-navy");
    expect(classesOf(box)).not.toContain("text-white");
  });

  it("each tone has a different icon shape, so the kind can be told without colour", () => {
    const shapes = (["info", "success", "pending"] as const).map((tone) => {
      const { container, unmount } = render(<Notice tone={tone}>x</Notice>);
      const shape = container.querySelector("svg")!.innerHTML;
      unmount();
      return shape;
    });
    expect(new Set(shapes).size).toBe(3);
  });

  it("a title is shown above the body; without one there is no empty heading line", () => {
    const withTitle = render(<Notice tone="success" title="Done">Body</Notice>);
    expect(screen.getByText("Done").className).toContain("font-semibold");
    withTitle.unmount();
    const without = render(<Notice tone="info">Body</Notice>);
    expect(without.container.querySelectorAll("p")).toHaveLength(0);
  });

  it("the role is only set when asked for", () => {
    const quiet = render(<Notice tone="info">Body</Notice>);
    expect(quiet.container.firstElementChild!.getAttribute("role")).toBeNull();
    quiet.unmount();
    render(<Notice tone="info" role="status">Body</Notice>);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
