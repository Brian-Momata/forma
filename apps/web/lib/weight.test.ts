import { describe, expect, it } from "vitest";

import { displayWeight, stepWeight } from "./weight";

/** Taps the stepper `n` times from `kg`, the way a thumb would. */
function tap(kg: number | null, unit: "kg" | "lb", n: number): number | null {
  let current = kg;
  for (let i = 0; i < Math.abs(n); i++) current = stepWeight(current, unit, n > 0 ? 1 : -1);
  return current;
}

describe("the weight stepper", () => {
  it("moves a kilogram at a time in kg, keeping a half-kilo target on its half", () => {
    expect(tap(null, "kg", 3)).toBe(3);
    expect(tap(12.5, "kg", 1)).toBe(13.5);
    expect(tap(12.5, "kg", -1)).toBe(11.5);
  });

  it("lands on the weights a pound gym actually has", () => {
    // Each tap is 2.5 lb, so the plates and dumbbells people own are reachable.
    const shown = [1, 2, 4, 10, 18].map((n) => displayWeight(tap(null, "lb", n)!, "lb"));
    expect(shown).toEqual([2.5, 5, 10, 25, 45]);
  });

  it("snaps a converted kilogram target onto the pound grid rather than drifting off it", () => {
    // 40 kg is 88.2 lb; one tap either way should read as a real number.
    expect(displayWeight(stepWeight(40, "lb", 1), "lb")).toBe(90);
    expect(displayWeight(stepWeight(40, "lb", -1), "lb")).toBe(87.5);
  });

  it("never goes below nothing", () => {
    expect(stepWeight(null, "kg", -1)).toBe(0);
    expect(stepWeight(0.3, "lb", -1)).toBe(0);
  });
});
