import { isAvailable } from "./equipment.ts";
import type { Library } from "./library/index.ts";
import type { Exercise, Experience, Limitation, Pattern, Setup } from "./types.ts";

/** Everything needed to decide whether a person may do a given exercise today. */
export interface SelectionContext {
  setup: Setup;
  limitations: readonly Limitation[];
  experience: Experience;
}

const EXPERIENCE_RANK: Readonly<Record<Experience, number>> = {
  new: 0,
  returning: 1,
  regular: 2,
  consistent: 3,
};

const LEVEL_REQUIREMENT: Readonly<Record<Exercise["level"], number>> = {
  beginner: 0,
  intermediate: 1,
  expert: 3,
};

/**
 * The safety gate. Every rule here is an invariant from ENGINEERING.md §9 and
 * is asserted as a property in the test suite; none of them is overridable by
 * an archetype. When two rules disagree, the more conservative one wins by
 * construction, because this is a conjunction.
 */
export function isPermitted(exercise: Exercise, ctx: SelectionContext): boolean {
  // 1. Never prescribe an exercise contraindicated by a declared limitation.
  for (const limit of ctx.limitations) {
    if (exercise.contraindications.includes(limit)) return false;
  }

  // 2/5. Never prescribe above the person's demonstrated level.
  if (LEVEL_REQUIREMENT[exercise.level] > EXPERIENCE_RANK[ctx.experience]) return false;

  // 4. Plyometrics need experience, sound knees, and somewhere to land.
  if (exercise.isJumping) {
    if (EXPERIENCE_RANK[ctx.experience] < EXPERIENCE_RANK.regular) return false;
    if (ctx.limitations.includes("knees")) return false;
    if (ctx.setup.constraints.noJumping) return false;
  }

  return isAvailable(exercise, ctx.setup);
}

/** The pool the generator may draw from: curated, available, and permitted. */
export function eligible(library: Library, ctx: SelectionContext): Exercise[] {
  return library.core.filter((e) => isPermitted(e, ctx));
}

/** Eligible exercises for one pattern. */
export function eligibleForPattern(
  library: Library,
  pattern: Pattern,
  ctx: SelectionContext
): Exercise[] {
  return library.byPattern(pattern).filter((e) => e.core && isPermitted(e, ctx));
}

/**
 * Alternatives to an exercise the person cannot or does not want to do right
 * now -- someone is on the bench, or a shoulder is sore today.
 *
 * Ranked by how closely the substitute does the same job: same pattern first,
 * then shared primary muscles, then similar difficulty. Equipment is a hard
 * filter, not a ranking term, because an unavailable substitute is useless.
 */
export function substitutes(
  library: Library,
  exercise: Exercise,
  ctx: SelectionContext,
  limit = 8
): Exercise[] {
  const primary = new Set(exercise.primaryMuscles);
  const candidates = eligibleForPattern(library, exercise.pattern, ctx).filter(
    (e) => e.id !== exercise.id
  );

  const score = (e: Exercise): number => {
    let s = 0;
    for (const m of e.primaryMuscles) if (primary.has(m)) s += 10;
    for (const m of e.secondaryMuscles) if (primary.has(m)) s += 2;
    if (e.kind === exercise.kind) s += 4;
    if (e.mechanic === exercise.mechanic) s += 2;
    // Prefer a substitute that needs no more equipment than the original.
    s -= Math.abs(e.requires.length - exercise.requires.length);
    s -= Math.abs(LEVEL_REQUIREMENT[e.level] - LEVEL_REQUIREMENT[exercise.level]) * 3;
    return s;
  };

  return candidates
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * The next or previous rung on a bodyweight progression ladder.
 *
 * Bodyweight training has no load to add, so overload comes from leverage:
 * wall push-up -> incline -> knee -> full -> decline -> archer. Without this,
 * a no-equipment plan has no way to get harder and stalls in week three.
 */
export function stepChain(
  library: Library,
  exercise: Exercise,
  direction: 1 | -1,
  ctx: SelectionContext
): Exercise | undefined {
  if (!exercise.chainId || exercise.chainRank === null) return undefined;
  const ladder = library.chain(exercise.chainId);
  const currentRank = exercise.chainRank;

  const ordered = direction === 1 ? ladder : [...ladder].reverse();
  return ordered.find((e) => {
    if (e.chainRank === null) return false;
    const higher = direction === 1 ? e.chainRank > currentRank : e.chainRank < currentRank;
    return higher && isPermitted(e, ctx);
  });
}
