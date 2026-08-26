import { Exercise, type ExerciseId, type Pattern } from "../types.ts";

/**
 * Indexed view over the exercise set.
 *
 * The library is passed in rather than imported, so `core` never forces a 1MB
 * JSON into a bundle that may not need it. The app decides when to load it.
 */
export interface Library {
  readonly all: readonly Exercise[];
  /** Exercises eligible for generation. The long tail stays searchable via `all`. */
  readonly core: readonly Exercise[];
  byId(id: ExerciseId | string): Exercise | undefined;
  byPattern(pattern: Pattern): readonly Exercise[];
  /** A progression ladder, easiest first. Empty if the exercise has no chain. */
  chain(chainId: string): readonly Exercise[];
  search(query: string, limit?: number): readonly Exercise[];
}

export function createLibrary(exercises: readonly Exercise[]): Library {
  const byId = new Map<string, Exercise>();
  const byPattern = new Map<Pattern, Exercise[]>();
  const byChain = new Map<string, Exercise[]>();
  const core: Exercise[] = [];

  for (const e of exercises) {
    byId.set(e.id, e);
    const p = byPattern.get(e.pattern);
    if (p) p.push(e);
    else byPattern.set(e.pattern, [e]);

    if (e.chainId) {
      const c = byChain.get(e.chainId);
      if (c) c.push(e);
      else byChain.set(e.chainId, [e]);
    }
    if (e.core) core.push(e);
  }

  for (const list of byChain.values()) {
    list.sort((a, b) => (a.chainRank ?? 0) - (b.chainRank ?? 0));
  }

  const EMPTY: readonly Exercise[] = Object.freeze([]);

  return {
    all: exercises,
    core,
    byId: (id) => byId.get(id as string),
    byPattern: (pattern) => byPattern.get(pattern) ?? EMPTY,
    chain: (chainId) => byChain.get(chainId) ?? EMPTY,
    search(query, limit = 40) {
      const q = query.trim().toLowerCase();
      if (!q) return EMPTY;
      const starts: Exercise[] = [];
      const contains: Exercise[] = [];
      for (const e of exercises) {
        const name = e.name.toLowerCase();
        if (name.startsWith(q)) starts.push(e);
        else if (name.includes(q)) contains.push(e);
        if (starts.length >= limit) break;
      }
      return [...starts, ...contains].slice(0, limit);
    },
  };
}

/**
 * Loads the bundled library. Dynamic so bundlers split it out of the main
 * chunk -- the app has already rendered before this is ever needed.
 */
export async function loadBundledLibrary(): Promise<Library> {
  const mod = (await import("./exercises.json")) as { default: unknown[] };
  const parsed = mod.default.map((raw) => Exercise.parse(raw));
  return createLibrary(parsed);
}

export const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

/** Resolves a stored relative image path to a URL. Empty for hand-authored entries. */
export function imageUrl(path: string): string {
  return IMAGE_BASE + path;
}
