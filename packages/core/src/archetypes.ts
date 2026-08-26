import type { EquipmentTier, Experience, Goal, Pattern } from "./types.ts";

/**
 * How overload happens. This is the clearest expression of why tier matters:
 * a bodyweight plan cannot add weight, so it climbs a leverage ladder instead.
 */
export type ProgressionMethod = "chain" | "reps-then-load" | "load" | "duration";

export interface Slot {
  pattern: Pattern;
  /**
   * Patterns to try when the primary cannot be filled.
   *
   * Not a convenience. There is no such thing as a bodyweight vertical pull --
   * you cannot pull yourself up with nothing -- so without a declared fallback
   * a no-equipment plan would simply fail to generate.
   */
  fallbacks: Pattern[];
  role: "primary" | "accessory";
}

export interface DayTemplate {
  name: string;
  slots: Slot[];
}

const slot = (pattern: Pattern, fallbacks: Pattern[], role: Slot["role"] = "primary"): Slot => ({
  pattern,
  fallbacks,
  role,
});

/* ---------------------------------------------------------------------------
 * Session shapes. Ordered so the heaviest compound comes first, while the
 * person is freshest.
 * ------------------------------------------------------------------------- */

const FULL_A: DayTemplate = {
  name: "Full Body A",
  slots: [
    slot("squat", ["lunge"]),
    slot("horizontal-push", ["vertical-push"]),
    slot("hinge", ["squat"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("core-brace", ["core-flexion"], "accessory"),
  ],
};

const FULL_B: DayTemplate = {
  name: "Full Body B",
  slots: [
    slot("lunge", ["squat"]),
    slot("vertical-push", ["horizontal-push"]),
    slot("hinge", ["lunge"]),
    slot("vertical-pull", ["horizontal-pull"]),
    slot("core-flexion", ["core-brace"], "accessory"),
  ],
};

const FULL_C: DayTemplate = {
  name: "Full Body C",
  slots: [
    slot("hinge", ["squat"]),
    slot("horizontal-push", ["vertical-push"]),
    slot("squat", ["lunge"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("rotation", ["core-brace"], "accessory"),
  ],
};

const UPPER_A: DayTemplate = {
  name: "Upper A",
  slots: [
    slot("horizontal-push", ["vertical-push"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("vertical-push", ["horizontal-push"]),
    slot("vertical-pull", ["horizontal-pull"]),
    slot("core-brace", ["core-flexion"], "accessory"),
  ],
};

const UPPER_B: DayTemplate = {
  name: "Upper B",
  slots: [
    slot("vertical-pull", ["horizontal-pull"]),
    slot("vertical-push", ["horizontal-push"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("horizontal-push", ["vertical-push"]),
    slot("carry", ["core-brace"], "accessory"),
  ],
};

const LOWER_A: DayTemplate = {
  name: "Lower A",
  slots: [
    slot("squat", ["lunge"]),
    slot("hinge", ["squat"]),
    slot("lunge", ["squat"]),
    slot("core-brace", ["core-flexion"], "accessory"),
  ],
};

const LOWER_B: DayTemplate = {
  name: "Lower B",
  slots: [
    slot("hinge", ["squat"]),
    slot("lunge", ["squat"]),
    slot("squat", ["lunge"]),
    slot("core-flexion", ["core-brace"], "accessory"),
  ],
};

const PUSH_DAY: DayTemplate = {
  name: "Push",
  slots: [
    slot("horizontal-push", ["vertical-push"]),
    slot("vertical-push", ["horizontal-push"]),
    slot("horizontal-push", ["vertical-push"], "accessory"),
    slot("core-brace", ["core-flexion"], "accessory"),
  ],
};

const PULL_DAY: DayTemplate = {
  name: "Pull",
  slots: [
    slot("vertical-pull", ["horizontal-pull"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("hinge", ["squat"]),
    slot("core-flexion", ["core-brace"], "accessory"),
  ],
};

const LEGS_DAY: DayTemplate = {
  name: "Legs",
  slots: [
    slot("squat", ["lunge"]),
    slot("hinge", ["squat"]),
    slot("lunge", ["squat"]),
    slot("carry", ["core-brace"], "accessory"),
  ],
};

const MOBILITY_DAY: DayTemplate = {
  name: "Mobility Flow",
  slots: [
    slot("mobility", []),
    slot("mobility", []),
    slot("mobility", []),
    slot("mobility", []),
    slot("core-brace", ["mobility"], "accessory"),
    slot("mobility", []),
  ],
};

const CONDITIONING_DAY: DayTemplate = {
  name: "Conditioning",
  slots: [
    slot("gait", ["lunge"]),
    slot("squat", ["lunge"]),
    slot("horizontal-push", ["vertical-push"]),
    slot("hinge", ["squat"]),
    slot("horizontal-pull", ["vertical-pull"]),
    slot("core-flexion", ["core-brace"], "accessory"),
  ],
};

/* ---------------------------------------------------------------------------
 * Goal defines the session's shape and intent.
 * ------------------------------------------------------------------------- */

export interface GoalSpec {
  shape: "straight" | "circuit";
  /** Rep window before the tier adjusts it. Null means the goal is time-based. */
  reps: [number, number] | null;
  restSec: number;
  sets: Record<Experience, number>;
  warmupCount: number;
  splitFor(days: number): DayTemplate[];
}

const cycle = (pool: DayTemplate[], days: number): DayTemplate[] =>
  Array.from({ length: days }, (_, i) => pool[i % pool.length] as DayTemplate);

const LETTERS = "ABCDEFG";

/**
 * Makes every day in a plan nameable.
 *
 * A week cycles its templates, so a five-day mobility plan is five copies of
 * "Mobility Flow". The day is how someone refers to a session -- picking it in
 * the editor, reading it back in their history -- so identical names make the
 * plan unusable in exactly the places it matters. Follows the naming the
 * templates already use: Full Body A, Full Body B.
 */
function distinguish(days: DayTemplate[]): DayTemplate[] {
  const totals = new Map<string, number>();
  for (const d of days) totals.set(d.name, (totals.get(d.name) ?? 0) + 1);

  const seen = new Map<string, number>();
  return days.map((d) => {
    if ((totals.get(d.name) ?? 0) < 2) return d;
    const n = seen.get(d.name) ?? 0;
    seen.set(d.name, n + 1);
    return { ...d, name: `${d.name} ${LETTERS[n] ?? String(n + 1)}` };
  });
}

export const GOALS: Readonly<Record<Goal, GoalSpec>> = {
  strength: {
    shape: "straight",
    reps: [6, 10],
    restSec: 90,
    sets: { new: 2, returning: 3, regular: 3, consistent: 4 },
    warmupCount: 3,
    splitFor: (days) => {
      if (days <= 3) return cycle([FULL_A, FULL_B, FULL_C], days);
      if (days === 4) return [UPPER_A, LOWER_A, UPPER_B, LOWER_B];
      return cycle([PUSH_DAY, PULL_DAY, LEGS_DAY, UPPER_A, LOWER_A], days);
    },
  },
  "fat-loss": {
    shape: "circuit",
    reps: [12, 15],
    restSec: 30,
    sets: { new: 2, returning: 3, regular: 3, consistent: 4 },
    warmupCount: 3,
    splitFor: (days) => cycle([CONDITIONING_DAY, FULL_A, CONDITIONING_DAY, FULL_B], days),
  },
  endurance: {
    shape: "straight",
    reps: [15, 20],
    restSec: 45,
    sets: { new: 2, returning: 2, regular: 3, consistent: 3 },
    warmupCount: 3,
    splitFor: (days) => cycle([FULL_A, CONDITIONING_DAY, FULL_B], days),
  },
  mobility: {
    shape: "straight",
    reps: null,
    restSec: 15,
    sets: { new: 1, returning: 1, regular: 2, consistent: 2 },
    warmupCount: 2,
    splitFor: (days) => cycle([MOBILITY_DAY], days),
  },
  general: {
    shape: "straight",
    reps: [10, 12],
    restSec: 60,
    sets: { new: 2, returning: 3, regular: 3, consistent: 3 },
    warmupCount: 3,
    splitFor: (days) => {
      if (days <= 3) return cycle([FULL_A, FULL_B, FULL_C], days);
      if (days === 4) return [UPPER_A, LOWER_A, UPPER_B, LOWER_B];
      return cycle([FULL_A, FULL_B, CONDITIONING_DAY, FULL_C, MOBILITY_DAY], days);
    },
  },
};

/* ---------------------------------------------------------------------------
 * Tier modulates that intent to what the equipment can actually deliver.
 *
 * This is the requirement in one table: the same goal, trained in different
 * situations, produces different rep ranges, different rest, and a different
 * mechanism of getting stronger.
 * ------------------------------------------------------------------------- */

export interface TierSpec {
  progression: ProgressionMethod;
  /** Added to the goal's rep window. Bodyweight needs volume in place of load. */
  repShift: [number, number];
  /** Scales the goal's rest. Heavy loads need longer; bodyweight does not. */
  restScale: number;
  /** Used verbatim in the plan's rationale. */
  label: string;
}

export const TIERS: Readonly<Record<EquipmentTier, TierSpec>> = {
  bodyweight: {
    progression: "chain",
    repShift: [4, 6],
    restScale: 0.7,
    label: "bodyweight only",
  },
  minimal: {
    progression: "chain",
    repShift: [3, 5],
    restScale: 0.75,
    label: "minimal kit",
  },
  dumbbell: {
    progression: "reps-then-load",
    repShift: [1, 2],
    restScale: 0.9,
    label: "dumbbells",
  },
  "home-gym": {
    progression: "load",
    repShift: [-1, -1],
    restScale: 1.2,
    label: "a home gym",
  },
  "full-gym": {
    progression: "load",
    repShift: [-1, -2],
    restScale: 1.3,
    label: "a full gym",
  },
};

/** The composed programme for one situation. */
export interface Archetype {
  days: DayTemplate[];
  sets: number;
  reps: [number, number] | null;
  restSec: number;
  shape: "straight" | "circuit";
  progression: ProgressionMethod;
  warmupCount: number;
  tierLabel: string;
}

export function resolveArchetype(
  goal: Goal,
  tier: EquipmentTier,
  experience: Experience,
  daysPerWeek: number
): Archetype {
  const g = GOALS[goal];
  const t = TIERS[tier];

  const reps: [number, number] | null = g.reps
    ? [
        Math.max(3, g.reps[0] + t.repShift[0]),
        Math.max(5, g.reps[1] + t.repShift[1]),
      ]
    : null;

  // Safety rule 5: beginner volume is capped regardless of what the goal asks.
  const sets = experience === "new" ? Math.min(2, g.sets[experience]) : g.sets[experience];

  return {
    days: distinguish(g.splitFor(daysPerWeek)),
    sets,
    reps,
    restSec: Math.round(g.restSec * t.restScale),
    shape: g.shape,
    progression: t.progression,
    warmupCount: g.warmupCount,
    tierLabel: t.label,
  };
}
