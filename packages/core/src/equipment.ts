import type { EquipmentId, EquipmentTier, Exercise, Setup } from "./types.ts";

/**
 * Equipment that adds comfort but never unlocks a movement. It must not
 * influence the tier — owning a yoga mat does not change your programming.
 */
const INERT: readonly EquipmentId[] = ["mat", "foam-roller", "cardio-machine"];

/** Loadable stations: they make heavy compound work possible without a barbell. */
const STATION: readonly EquipmentId[] = ["machines", "cable"];

/** Small kit: useful, but it cannot carry a load-based progression. */
const SMALL: readonly EquipmentId[] = [
  "bands",
  "kettlebell",
  "pullup-bar",
  "suspension",
  "medicine-ball",
  "exercise-ball",
  "box",
];

/**
 * Resolves an inventory to a programming tier.
 *
 * Ordered and total: every inventory lands in exactly one tier, and the first
 * matching rule wins. Deliberately coarse — the tier picks the *archetype*
 * (rep ranges, session shape, progression method), while the exercise pool
 * handles the fine detail of what is actually available.
 */
export function resolveTier(equipment: readonly EquipmentId[]): EquipmentTier {
  const has = (ids: readonly EquipmentId[]) => ids.some((id) => equipment.includes(id));

  if (has(STATION)) return "full-gym";
  if (equipment.includes("barbell")) return "home-gym";
  if (equipment.includes("dumbbells")) return "dumbbell";
  if (has(SMALL)) return "minimal";
  return "bodyweight";
}

/** Equipment that counts toward the tier — used by the UI to explain a setup. */
export function loadBearing(equipment: readonly EquipmentId[]): EquipmentId[] {
  return equipment.filter((id) => !INERT.includes(id));
}

/**
 * Whether a setup can host an exercise at all.
 *
 * Equipment is an ALL-of check: a barbell bench press needs both the barbell
 * and the bench. Constraints are hard filters, not preferences — someone who
 * told us their neighbours are below must never be shown a jump.
 */
export function isAvailable(exercise: Exercise, setup: Setup): boolean {
  for (const need of exercise.requires) {
    if (!setup.equipment.includes(need)) return false;
  }
  if (setup.constraints.noJumping && exercise.isJumping) return false;
  if (setup.constraints.quiet && exercise.isLoud) return false;
  if (setup.constraints.tightSpace && exercise.spaceNeeded === "normal") return false;
  return true;
}

/**
 * Gym presets, so defining "my gym" is two taps rather than an inventory audit.
 * The user picks the closest preset, then removes whatever their gym lacks.
 */
export const GYM_PRESETS: ReadonlyArray<{
  id: string;
  name: string;
  note: string;
  equipment: EquipmentId[];
}> = [
  {
    id: "commercial",
    name: "Full commercial gym",
    note: "Racks, machines, cables, full dumbbell rack",
    equipment: [
      "barbell",
      "rack",
      "dumbbells",
      "bench",
      "cable",
      "machines",
      "pullup-bar",
      "kettlebell",
      "box",
      "mat",
      "cardio-machine",
    ],
  },
  {
    id: "basic",
    name: "Basic or hotel gym",
    note: "Dumbbells, a few machines, a bench",
    equipment: ["dumbbells", "bench", "machines", "mat", "cardio-machine"],
  },
  {
    id: "garage",
    name: "Garage gym",
    note: "Barbell and rack, no machines",
    equipment: ["barbell", "rack", "bench", "dumbbells", "pullup-bar", "mat"],
  },
];

/** The home equipment list, in the design's own words and order. */
export const HOME_EQUIPMENT: ReadonlyArray<{
  id: EquipmentId;
  label: string;
  note: string;
}> = [
  { id: "dumbbells", label: "Dumbbells", note: "Adjustable or fixed" },
  { id: "bands", label: "Resistance bands", note: "Loops or tubes" },
  { id: "kettlebell", label: "Kettlebell", note: "Single or pair" },
  { id: "pullup-bar", label: "Pull-up bar", note: "Doorway or wall" },
  { id: "bench", label: "Bench or step", note: "A sturdy chair counts" },
  { id: "mat", label: "Yoga mat", note: "For floor work" },
];
