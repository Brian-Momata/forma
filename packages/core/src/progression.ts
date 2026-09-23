import { resolveArchetype, TIERS, type ProgressionMethod } from "./archetypes.ts";
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

/**
 * The jump from one dumbbell to the next.
 *
 * Not `loadStepKg`: a rack goes 2.5, 5, 7.5, 10, and a kilo more than a 5kg
 * dumbbell is a dumbbell nobody owns. The relative jump is large on a light
 * isolation movement, which is exactly what dropping back to the bottom of the
 * rep range is for -- that is the whole shape of double progression.
 */
const DUMBBELL_STEP_KG = 2.5;

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

/**
 * Writes what was actually lifted back onto the prescription.
 *
 * Every finished session, whatever it felt like and whatever the tier: the
 * weight someone dialled in is the answer to "what do I put on the bar", and
 * leaving it in the session record meant the next session asked again from
 * blank. Load progression used to be the only thing that ever wrote this
 * field, so on a dumbbell plan -- which progresses by reps, not load -- a
 * weight typed in every week was never once remembered.
 *
 * The logged weight wins over the stored target: if the plan said 20 and the
 * person did 17.5, 17.5 is where they are.
 */
function remember(item: PlanExercise, logged: LoggedWeights): PlanExercise {
  const kg = logged.get(item.exerciseId);
  if (kg === undefined || kg <= 0 || kg === item.prescription.targetWeightKg) return item;
  return {
    ...item,
    prescription: { ...item.prescription, targetWeightKg: Math.min(MAX_WEIGHT_KG, kg) },
  };
}

/**
 * Reps first, then the next dumbbell.
 *
 * The double progression the `dumbbell` tier is named for: climb inside the
 * prescribed rep range, and when you reach the top of it, take the next
 * dumbbell and drop back to the bottom. Adding reps forever is how a dumbbell
 * plan ends up asking for twenty-five curls -- which is a different exercise,
 * not a harder one -- and the tier's own rationale promises weight.
 *
 * The window is the one the generator prescribed from, per side where the
 * movement is one-sided, so "the top of the range" means the same number here
 * as it did when the plan was written.
 */
function repsThenLoad(
  item: PlanExercise,
  exercise: Exercise,
  window: readonly [number, number]
): PlanExercise {
  const p = item.prescription;
  const reps = p.reps;
  const known = p.targetWeightKg ?? null;

  const [bottom, top] = exercise.unilateral
    ? ([Math.max(3, Math.round(window[0] / 2)), Math.max(3, Math.round(window[1] / 2))] as const)
    : window;

  // Nothing to add load to, and nothing to count: fall back to reps.
  if (reps === undefined) return { ...item, prescription: bumpReps(p, 2) };

  if (reps < top) {
    // Never past the top in one jump -- the range is the prescription.
    return { ...item, prescription: { ...p, reps: Math.min(MAX_REPS, Math.min(top, reps + 2)) } };
  }

  // At the top of the range. This is where the load goes up -- unless we still
  // do not know what is in their hands, in which case reps carry on and the
  // Complete screen asks for the number rather than promising a change.
  if (known === null) return { ...item, prescription: bumpReps(p, 2) };

  return {
    ...item,
    prescription: {
      ...bumpWeight(p, known, DUMBBELL_STEP_KG),
      reps: Math.max(MIN_REPS, Math.min(MAX_REPS, bottom)),
    },
  };
}

/** The rep range this plan was written from. */
function repWindow(plan: Plan, experience: SelectionContext["experience"]): [number, number] {
  const arch = resolveArchetype(plan.goal, plan.tier, experience, plan.schedule.daysPerWeek);
  // The generator's own fallback for a goal that prescribes no range.
  return arch.reps ?? [10, 12];
}

export function applyFeedback(
  library: Library,
  plan: Plan,
  feel: Feel,
  ctx: SelectionContext,
  now: number,
  logged: LoggedWeights = new Map()
): Plan {
  const method: ProgressionMethod = TIERS[plan.tier].progression;
  const window = repWindow(plan, ctx.experience);

  const days = plan.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((entry): PlanExercise => {
      // Warm-ups are not a training stimulus; they never progress.
      if (entry.warmup) return entry;
      const item = remember(entry, logged);
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

          if (method === "reps-then-load") {
            return repsThenLoad(item, exercise, window);
          }

          if (method === "load") {
            // Where there is a bar to load, load it: keep the reps and move the
            // weight, which is what the Complete screen promises and what the
            // tier exists to express.
            const known = item.prescription.targetWeightKg ?? null;
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
      switch (method) {
        case "chain":
          return "Next session moves you up to a harder variation.";
        case "load":
          return hasLoggedLoad
            ? "Next session keeps the reps and asks for a little more weight."
            : "Next session adds reps. Log the weight you lift and we can add load instead.";
        case "reps-then-load":
          // Reps *and* load, because which one moves depends on where in the
          // range each movement currently sits.
          return hasLoggedLoad
            ? "Next session adds reps, and steps the weight up on anything already at the top of its range."
            : "Next session adds reps. Log the weight you lift and we can step it up once you top the range.";
        default:
          return "Next session adds a set to your compound lifts.";
      }
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
