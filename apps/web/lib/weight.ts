/**
 * The arithmetic behind the set screen's weight stepper.
 *
 * Weight is stored in kilograms always (ENGINEERING.md §0); `unit` only decides
 * what the stepper moves by and what it shows. Doing the stepping in stored
 * kilograms with a step written in pounds is how a tap in lb used to add
 * 2.2 kg -- 4.86 lb -- so nobody on pounds could ever dial in 45.
 */

export type WeightUnit = "kg" | "lb";

export const KG_PER_LB = 0.45359237;

/** How far one tap moves, in the unit on screen. */
const TAP: Record<WeightUnit, number> = { kg: 1, lb: 2.5 };

/**
 * The grid a tapped weight lands on, in the unit on screen.
 *
 * Half a kilo in kg, so a 12.5 kg target stays on its half. The whole tap in
 * lb, because a kilogram target converted to pounds is never round, and the
 * first tap should bring it onto numbers that exist in a pound gym.
 */
const GRID: Record<WeightUnit, number> = { kg: 0.5, lb: 2.5 };

export function toDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

/** What the screen shows for a stored weight: to the half unit. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return Math.round(toDisplay(kg, unit) * 2) / 2;
}

/** One tap of the stepper, returning the new stored weight in kilograms. */
export function stepWeight(kg: number | null, unit: WeightUnit, direction: 1 | -1): number {
  const shown = kg === null ? 0 : toDisplay(kg, unit);
  const grid = GRID[unit];
  // Onto the grid on the side the tap is heading, then the tap: 88.2 lb goes
  // up to 90 and down to 87.5. The slack absorbs pounds that went through
  // kilograms and came back as 44.99999.
  const slack = 1e-6;
  const onGrid =
    direction > 0
      ? Math.floor(shown / grid + slack) * grid
      : Math.ceil(shown / grid - slack) * grid;
  const next = Math.max(0, onGrid + direction * TAP[unit]);
  return unit === "lb" ? next * KG_PER_LB : next;
}
