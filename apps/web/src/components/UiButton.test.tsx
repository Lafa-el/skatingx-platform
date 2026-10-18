// @vitest-environment happy-dom
import { Button } from "@skatingx/ui";
import { describe, expect, it } from "vitest";

import { render } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

// The shared Button lives in packages/ui, whose tests do not render React; this is where the
// 44px minimum of every button in the app is held.
describe("shared Button: tap target (44px)", () => {
  it.each(["primary", "ghost", "brand", "outline", "danger-outline"] as const)("the %s button asks for 44px, also when a caller adds classes", (variant) => {
    const { container } = render(
      <>
        <Button variant={variant}>OK</Button>
        <Button variant={variant} className="mt-2 !px-3 !py-1.5 text-xs">
          Small
        </Button>
      </>,
    );
    expect(container.querySelectorAll("button").length).toBe(2);
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });
});
