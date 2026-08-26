import { createLibrary, Exercise, type Library } from "@form/core";

let cached: Library | null = null;
let inflight: Promise<Library> | null = null;

/**
 * Loads the exercise library once, lazily.
 *
 * It is roughly a megabyte and the app has already rendered before it is
 * needed, so it must never sit in the main bundle (ENGINEERING.md §11). The
 * service worker precaches it, so this stays instant offline.
 */
export function loadLibrary(): Promise<Library> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = import("@form/core/library/exercises.json")
    .then((mod) => {
      const raw = (mod.default ?? mod) as unknown[];
      cached = createLibrary(raw.map((r) => Exercise.parse(r)));
      return cached;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function peekLibrary(): Library | null {
  return cached;
}
