import fc from "fast-check";

import { createLibrary, type Library } from "../src/library/index.ts";
import {
  Exercise,
  type EquipmentId,
  type Experience,
  type Goal,
  type Limitation,
  type Profile,
  type Setup,
  type SetupId,
} from "../src/types.ts";
import raw from "../src/library/exercises.json" with { type: "json" };

export const library: Library = createLibrary(
  (raw as unknown[]).map((r) => Exercise.parse(r))
);

export const GOALS: Goal[] = ["strength", "fat-loss", "mobility", "endurance", "general"];
export const EXPERIENCES: Experience[] = ["new", "returning", "regular", "consistent"];
export const LIMITATIONS: Limitation[] = ["knees", "lower-back", "shoulders", "wrists", "neck"];
export const EQUIPMENT: EquipmentId[] = [
  "dumbbells", "bands", "kettlebell", "pullup-bar", "bench", "mat",
  "barbell", "rack", "cable", "machines", "medicine-ball", "exercise-ball",
  "foam-roller", "ez-bar", "box", "suspension", "cardio-machine",
];

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    goal: "strength",
    experience: "returning",
    schedule: { daysPerWeek: 3, minutesPerSession: 30 },
    limitations: [],
    units: "kg",
    accent: "#D4FF3F",
    restColor: "#8A7BFF",
    autoAdvance: true,
    restOverrideSec: null,
    disclaimerAcceptedAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function makeSetup(over: Partial<Setup> = {}): Setup {
  return {
    id: "setup-1" as SetupId,
    name: "Home",
    location: "home",
    equipment: [],
    constraints: { tightSpace: false, noJumping: false, quiet: false },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/* -------------------------------------------------------------------------
 * Arbitraries. The generator's guarantees are properties over every valid
 * situation, not a handful of examples we happened to think of.
 * ----------------------------------------------------------------------- */

export const arbProfile = fc
  .record({
    goal: fc.constantFrom(...GOALS),
    experience: fc.constantFrom(...EXPERIENCES),
    daysPerWeek: fc.integer({ min: 1, max: 6 }),
    minutesPerSession: fc.integer({ min: 10, max: 90 }),
    limitations: fc.uniqueArray(fc.constantFrom(...LIMITATIONS), { maxLength: 5 }),
  })
  .map(({ goal, experience, daysPerWeek, minutesPerSession, limitations }) =>
    makeProfile({
      goal,
      experience,
      limitations,
      schedule: { daysPerWeek, minutesPerSession },
    })
  );

export const arbSetup = fc
  .record({
    equipment: fc.uniqueArray(fc.constantFrom(...EQUIPMENT), { maxLength: 10 }),
    location: fc.constantFrom("home" as const, "gym" as const, "outdoors" as const),
    tightSpace: fc.boolean(),
    noJumping: fc.boolean(),
    quiet: fc.boolean(),
  })
  .map(({ equipment, location, tightSpace, noJumping, quiet }) =>
    makeSetup({ equipment, location, constraints: { tightSpace, noJumping, quiet } })
  );
