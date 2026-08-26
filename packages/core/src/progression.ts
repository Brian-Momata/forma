import { TIERS, type ProgressionMethod } from "./archetypes.ts";
import type { Library } from "./library/index.ts";
import { stepChain, type SelectionContext } from "./selection.ts";
import {
  assertNever,
  type Exercise,
  type ExerciseId,
  type Feel,
  type Plan,
  type PlanExercise,
  type Prescription,
} from "./types.ts";

/**
 * Turns the post-workout "too easy / just right / too hard" into next week's
 * plan.
 *
 * How overload happens depends on the situation, which is the whole point of
 * the tier: a bodyweight plan has no weight to add, so it moves to a harder
 * variation instead. Without this, a no-equipment plan stalls in week three.
 */

const MAX_SETS = 5;
const MIN_SETS = 1;
const MAX_REPS = 25;
const MIN_REPS = 3;
const MAX_REST = 180;
const REST_PENALTY_SEC = 15;
const MAX_WEIGHT_KG = 500;

/**
 * The jump to make when a load-tier session felt easy.
 *
 * Conservative on purpose (ENGINEERING.md §1.4): a compound can absorb a plate
 * change, an isolation movement usually cannot, and nobody was ever injured by
 * a kilo they did not add.
 */
function loadStepKg(mechanic: Exercise["mechanic"]): number {
  return mechanic === "compound" ? 2.5 : 1;
}

function bumpWeight(p: Prescription, current: number, step: number): Prescription {
  return { ...p, targetWeightKg: Math.min(MAX_WEIGHT_KG, current + step) };
}

function bumpReps(p: Prescription, delta: number): Prescription {
  if (p.reps === undefined) return p;
  return { ...p, reps: Math.min(MAX_REPS, Math.max(MIN_REPS, p.reps + delta)) };
}

function bumpDuration(p: Prescription, delta: number): Prescription {
  if (p.durationSec === undefined) return p;
  return { ...p, durationSec: Math.min(300, Math.max(10, p.durationSec + delta)) };
}

function bumpSets(p: Prescription, delta: number): Prescription {
  return { ...p, sets: Math.min(MAX_SETS, Math.max(MIN_SETS, p.sets + delta)) };
}

function easier(item: PlanExercise): PlanExercise {
  // The design's own wording: trim a set and add 15s to every rest.
  const p = bumpSets(item.prescription, -1);
  return {
    ...item,
    prescription: { ...p, restSec: Math.min(MAX_REST, p.restSec + REST_PENALTY_SEC) },
  };
}

/**
 * The heaviest weight logged per exercise in the session just finished.
 *
 * This is what seeds load progression the first time: the plan cannot guess
 * what someone squats, so it learns it from what they actually did.
 */
export type LoggedWeights = ReadonlyMap<ExerciseId | string, number>;

export function applyFeedback(
  library: Library,
  plan: Plan,
  feel: Feel,
  ctx: SelectionContext,
  now: number,
  logged: LoggedWeights = new Map()
): Plan {
  const method: ProgressionMethod = TIERS[plan.tier].progression;

  const days = plan.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((item): PlanExercise => {
      // Warm-ups are not a training stimulus; they never progress.
      if (item.warmup) return item;
      const exercise = library.byId(item.exerciseId);

      switch (feel) {
        case "too-hard":
          return easier(item);

        case "just-right":
          // Hold the load, let the reps creep up.
          return item.prescription.reps !== undefined
            ? { ...item, prescription: bumpReps(item.prescription, 1) }
            : { ...item, prescription: bumpDuration(item.prescription, 5) };

        case "too-easy": {
          if (!exercise) return item;

          if (method === "chain") {
            // Prefer moving up the ladder; that is real progression, where an
            // extra set of the same easy movement is mostly just more time.
            const harder = stepChain(library, exercise, 1, ctx);
            if (harder) {
              return {
                ...item,
                exerciseId: harder.id,
                prescription: {
                  ...item.prescription,
                  reps:
                    item.prescription.reps !== undefined
                      ? (harder.defaults.reps ?? item.prescription.reps)
                      : undefined,
                  durationSec:
                    item.prescription.durationSec !== undefined
                      ? (harder.defaults.durationSec ?? item.prescription.durationSec)
                      : undefined,
                },
              };
            }
          }

          if (method === "duration" || item.prescription.durationSec !== undefined) {
            return { ...item, prescription: bumpDuration(item.prescription, 10) };
          }

          if (method === "load") {
            // Where there is a bar to load, load it: keep the reps and move the
            // weight, which is what the Complete screen promises and what the
            // tier exists to express.
            const known =
              item.prescription.targetWeightKg ?? logged.get(item.exerciseId) ?? null;
            if (known !== null) {
              return {
                ...item,
                prescription: bumpWeight(
                  item.prescription,
                  known,
                  loadStepKg(exercise.mechanic)
                ),
              };
            }
            // Nothing logged yet, so there is no load to add to. Reps until
            // there is -- and the Complete screen says so rather than promising
            // a weight change that cannot happen.
            return { ...item, prescription: bumpReps(item.prescription, 2) };
          }

          // The design's wording: add a set to the compound lifts.
          if (exercise.mechanic === "compound") {
            return { ...item, prescription: bumpSets(item.prescription, 1) };
          }
          return { ...item, prescription: bumpReps(item.prescription, 2) };
        }

        default:
          return assertNever(feel);
      }
    }),
  }));

  return { ...plan, days, week: plan.week + 1, updatedAt: now };
}

/**
 * The sentence shown on the Complete screen.
 *
 * It must describe what `applyFeedback` will actually do -- on a load tier that
 * depends on whether we know what the person lifted, so the caller passes that
 * in rather than the screen promising a weight change that cannot happen.
 */
export function progressionNote(
  feel: Feel,
  plan: Pick<Plan, "tier">,
  hasLoggedLoad = true
): string {
  const method = TIERS[plan.tier].progression;

  switch (feel) {
    case "too-easy":
      return method === "chain"
        ? "Next session moves you up to a harder variation."
        : method === "load"
          ? hasLoggedLoad
            ? "Next session keeps the reps and asks for a little more weight."
            : "Next session adds reps. Log the weight you lift and we can add load instead."
          : "Next session adds a set to your compound lifts.";
    case "too-hard":
      return "Next session trims a set and adds 15s to every rest.";
    case "just-right":
      return method === "load"
        ? "Keeping the same load. Reps go up next week."
        : "Holding steady. Reps go up next week.";
    default:
      return assertNever(feel);
  }
}
