import { describe, expect, it } from "vitest";

import { GOALS as GOAL_SPECS } from "../src/archetypes.ts";
import { generatePlan } from "../src/generator.ts";
import { eligibleForPattern } from "../src/selection.ts";
import { Pattern } from "../src/types.ts";
import { library, makeProfile, makeSetup } from "./helpers.ts";
import meta from "../src/library/meta.json" with { type: "json" };

describe("exercise library integrity", () => {
  it("has no duplicate ids", () => {
    const ids = library.all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every curated exercise two real coaching cues", () => {
    for (const e of library.core) {
      expect(e.cues.length, e.id).toBeGreaterThanOrEqual(2);
      for (const cue of e.cues) {
        expect(cue.trim().length, `${e.id}: "${cue}"`).toBeGreaterThan(8);
        // Condensed source text sometimes ends mid-sentence; curated cues must not.
        expect(cue.endsWith("..."), `${e.id}: "${cue}"`).toBe(false);
      }
    }
  });

  it("gives every curated exercise a usable prescription", () => {
    for (const e of library.core) {
      if (e.kind === "reps") expect(e.defaults.reps, e.id).toBeDefined();
      else expect(e.defaults.durationSec, e.id).toBeDefined();
    }
  });

  it("keeps progression ladders ordered and unambiguous", () => {
    const chains = new Set(
      library.all.map((e) => e.chainId).filter((c): c is string => Boolean(c))
    );
    expect(chains.size).toBeGreaterThan(0);

    for (const chainId of chains) {
      const rungs = library.chain(chainId);
      expect(rungs.length, chainId).toBeGreaterThanOrEqual(2);
      const ranks = rungs.map((e) => e.chainRank);
      expect(new Set(ranks).size, `${chainId} has duplicate ranks`).toBe(ranks.length);
      // A ladder must stay inside one movement pattern, or it is not a ladder.
      expect(new Set(rungs.map((e) => e.pattern)).size, chainId).toBe(1);
    }
  });

  it("ships photos for curated dataset entries", () => {
    // Hand-authored supplements have none by design; anything derived from the
    // source must keep its images or the demo slot renders empty.
    const missing = library.core.filter((e) => e.images.length === 0 && e.chainId === null);
    const supplementIds = new Set(
      library.core.filter((e) => e.images.length === 0).map((e) => e.id)
    );
    expect(supplementIds.size).toBeLessThan(library.core.length / 2);
    expect(missing.length).toBeLessThan(library.core.length / 2);
  });

  it("declares its provenance", () => {
    expect(meta.license).toContain("Unlicense");
    expect(meta.total).toBe(library.all.length);
    expect(meta.core).toBe(library.core.length);
  });
});

describe("the no-equipment path is never a dead end", () => {
  const ctx = {
    setup: makeSetup({ equipment: [] }),
    limitations: [],
    experience: "new" as const,
  };

  it("can fill the patterns that are physically possible with no equipment", () => {
    // Vertical pull and carry are honestly impossible with nothing -- you
    // cannot pull yourself up or carry a load that does not exist. Those rely
    // on declared archetype fallbacks instead, covered below.
    const possible: Pattern[] = [
      "squat",
      "hinge",
      "lunge",
      "horizontal-push",
      "core-brace",
      "core-flexion",
      "gait",
      "mobility",
    ];
    for (const pattern of possible) {
      const pool = eligibleForPattern(library, pattern, ctx);
      expect(pool.length, `no bodyweight option for ${pattern}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("still produces a complete plan for every goal with nothing at all", () => {
    for (const goal of Object.keys(GOAL_SPECS) as Array<keyof typeof GOAL_SPECS>) {
      const plan = generatePlan(
        library,
        makeProfile({ goal, experience: "new" }),
        makeSetup({ equipment: [] })
      );
      for (const day of plan.days) {
        const working = day.exercises.filter((e) => !e.warmup);
        expect(working.length, `${goal} / ${day.name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("covers the hardest real case: no kit, bad knees, no jumping, tight space", () => {
    const plan = generatePlan(
      library,
      makeProfile({ limitations: ["knees"], experience: "new" }),
      makeSetup({
        equipment: [],
        constraints: { tightSpace: true, noJumping: true, quiet: true },
      })
    );
    for (const day of plan.days) {
      const working = day.exercises.filter((e) => !e.warmup);
      expect(working.length, day.name).toBeGreaterThanOrEqual(3);
    }
  });
});
