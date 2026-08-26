import { z } from "zod";

/* ---------------------------------------------------------------------------
 * Branded identifiers.
 * Passing a PlanId where an ExerciseId belongs must not compile.
 * ------------------------------------------------------------------------- */

export const ExerciseId = z.string().min(1).brand<"ExerciseId">();
export const SetupId = z.string().min(1).brand<"SetupId">();
export const PlanId = z.string().min(1).brand<"PlanId">();
export const SessionId = z.string().min(1).brand<"SessionId">();

export type ExerciseId = z.infer<typeof ExerciseId>;
export type SetupId = z.infer<typeof SetupId>;
export type PlanId = z.infer<typeof PlanId>;
export type SessionId = z.infer<typeof SessionId>;

/* ---------------------------------------------------------------------------
 * Movement vocabulary
 * ------------------------------------------------------------------------- */

/**
 * The generator fills *pattern slots*, not exercise names. This is what lets a
 * bodyweight plan and a barbell plan be structurally comparable while using
 * entirely different movements.
 */
export const Pattern = z.enum([
  "squat",
  "hinge",
  "lunge",
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "core-brace",
  "core-flexion",
  "rotation",
  "carry",
  "gait",
  "mobility",
]);
export type Pattern = z.infer<typeof Pattern>;

export const Muscle = z.enum([
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower-back",
  "middle-back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
]);
export type Muscle = z.infer<typeof Muscle>;

/** What a person actually has. This is the inventory, in their words. */
export const EquipmentId = z.enum([
  "dumbbells",
  "bands",
  "kettlebell",
  "pullup-bar",
  "bench",
  "mat",
  "barbell",
  "rack",
  "cable",
  "machines",
  "medicine-ball",
  "exercise-ball",
  "foam-roller",
  "ez-bar",
  "box",
  "suspension",
  "cardio-machine",
]);
export type EquipmentId = z.infer<typeof EquipmentId>;

/**
 * The branch point of the whole app. Tier selects the programming archetype,
 * which is why "dumbbells at home" and "full gym" produce structurally
 * different plans rather than the same plan with different names.
 */
export const EquipmentTier = z.enum([
  "bodyweight",
  "minimal",
  "dumbbell",
  "home-gym",
  "full-gym",
]);
export type EquipmentTier = z.infer<typeof EquipmentTier>;

/** Joints the onboarding asks about. Drives hard exclusion, never a warning. */
export const Limitation = z.enum([
  "knees",
  "lower-back",
  "shoulders",
  "wrists",
  "neck",
]);
export type Limitation = z.infer<typeof Limitation>;

export const Level = z.enum(["beginner", "intermediate", "expert"]);
export type Level = z.infer<typeof Level>;

export const Experience = z.enum(["new", "returning", "regular", "consistent"]);
export type Experience = z.infer<typeof Experience>;

export const Goal = z.enum([
  "strength",
  "fat-loss",
  "mobility",
  "endurance",
  "general",
]);
export type Goal = z.infer<typeof Goal>;

export const LocationKind = z.enum(["home", "gym", "outdoors"]);
export type LocationKind = z.infer<typeof LocationKind>;

/** Reps or a clock. Determines which player screen a set uses. */
export const ExerciseKind = z.enum(["reps", "time"]);
export type ExerciseKind = z.infer<typeof ExerciseKind>;

/* ---------------------------------------------------------------------------
 * Exercise
 * ------------------------------------------------------------------------- */

export const Prescription = z.object({
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(100).optional(),
  durationSec: z.number().int().min(5).max(600).optional(),
  restSec: z.number().int().min(0).max(300),
});
export type Prescription = z.infer<typeof Prescription>;

export const Exercise = z.object({
  id: ExerciseId,
  name: z.string().min(1),
  pattern: Pattern,

  /** ALL of these must be available. Empty means bodyweight — always usable. */
  requires: z.array(EquipmentId),

  primaryMuscles: z.array(Muscle),
  secondaryMuscles: z.array(Muscle),

  kind: ExerciseKind,
  level: Level,
  mechanic: z.enum(["compound", "isolation"]).nullable(),

  /** Hard exclusions. A match here means the exercise is never prescribed. */
  contraindications: z.array(Limitation),

  isJumping: z.boolean(),
  isLoud: z.boolean(),
  /**
   * Moves through a range rather than holding an end range.
   *
   * Warm-ups must be dynamic: holding a static stretch before strength work
   * measurably reduces output. Static work belongs in mobility sessions.
   */
  dynamic: z.boolean(),
  spaceNeeded: z.enum(["tight", "normal"]),
  unilateral: z.boolean(),

  /** The design shows exactly two. Long-tail entries fall back to condensed source text. */
  cues: z.array(z.string().min(1)),
  images: z.array(z.string()),

  /**
   * Bodyweight overload has no external load to add, so it climbs a ladder
   * instead: wall push-up -> incline -> knee -> full -> decline -> archer.
   * Same chainId, ascending rank. This is what makes a no-equipment plan progress.
   */
  chainId: z.string().nullable(),
  chainRank: z.number().int().min(0).nullable(),

  /** In the generator's pool? The long tail stays searchable but is never generated. */
  core: z.boolean(),

  defaults: Prescription,
});
export type Exercise = z.infer<typeof Exercise>;

/* ---------------------------------------------------------------------------
 * Setup — the situation. The input to the plan.
 * ------------------------------------------------------------------------- */

export const SetupConstraints = z.object({
  /** No room to lie down or lunge. */
  tightSpace: z.boolean(),
  /** Neighbours below. Excludes every jumping movement. */
  noJumping: z.boolean(),
  /** No dropping weights, no thudding. */
  quiet: z.boolean(),
});
export type SetupConstraints = z.infer<typeof SetupConstraints>;

export const Setup = z.object({
  id: SetupId,
  name: z.string().min(1),
  location: LocationKind,
  equipment: z.array(EquipmentId),
  constraints: SetupConstraints,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Setup = z.infer<typeof Setup>;

/* ---------------------------------------------------------------------------
 * Profile — who is training, independent of where.
 * ------------------------------------------------------------------------- */

export const Schedule = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
  minutesPerSession: z.number().int().min(5).max(180),
});
export type Schedule = z.infer<typeof Schedule>;

export const Profile = z.object({
  goal: Goal,
  experience: Experience,
  schedule: Schedule,
  limitations: z.array(Limitation),
  units: z.enum(["kg", "lb"]),
  accent: z.string(),
  restColor: z.string(),
  /** Lifts the dimmest text tiers; see the contrast note in ENGINEERING.md 10. */
  highContrast: z.boolean(),
  autoAdvance: z.boolean(),
  restOverrideSec: z.number().int().min(10).max(300).nullable(),
  disclaimerAcceptedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Profile = z.infer<typeof Profile>;

/* ---------------------------------------------------------------------------
 * Plan — belongs to a Setup, fully user-editable.
 * ------------------------------------------------------------------------- */

export const PlanExercise = z.object({
  exerciseId: ExerciseId,
  prescription: Prescription,
  /** Warm-up items are prepended by the generator and marked so UI can group them. */
  warmup: z.boolean(),
});
export type PlanExercise = z.infer<typeof PlanExercise>;

export const PlanDay = z.object({
  name: z.string().min(1),
  /** 0 = Monday. Advisory; people train when they train. */
  weekday: z.number().int().min(0).max(6).nullable(),
  exercises: z.array(PlanExercise),
});
export type PlanDay = z.infer<typeof PlanDay>;

export const Plan = z.object({
  id: PlanId,
  setupId: SetupId,
  name: z.string().min(1),
  goal: Goal,
  tier: EquipmentTier,
  /** Short, human sentence explaining why this plan looks the way it does. */
  rationale: z.string(),
  tags: z.array(z.string()),
  days: z.array(PlanDay),
  /** Bumped by progression each time feedback is applied. */
  week: z.number().int().min(1),
  generated: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Plan = z.infer<typeof Plan>;

/* ---------------------------------------------------------------------------
 * Session — what actually happened.
 * ------------------------------------------------------------------------- */

export const Feel = z.enum(["too-easy", "just-right", "too-hard"]);
export type Feel = z.infer<typeof Feel>;

export const SetRecord = z.object({
  exerciseId: ExerciseId,
  setIndex: z.number().int().min(0),
  reps: z.number().int().min(0).nullable(),
  durationSec: z.number().int().min(0).nullable(),
  weightKg: z.number().min(0).nullable(),
  skipped: z.boolean(),
  completedAt: z.number().int(),
});
export type SetRecord = z.infer<typeof SetRecord>;

export const Session = z.object({
  id: SessionId,
  planId: PlanId,
  setupId: SetupId,
  dayIndex: z.number().int().min(0),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  sets: z.array(SetRecord),
  feel: Feel.nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof Session>;

/* ---------------------------------------------------------------------------
 * Utilities
 * ------------------------------------------------------------------------- */

/** Makes an unhandled union variant a compile error rather than a silent no-op. */
export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}
