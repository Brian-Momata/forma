import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { ImportError, exportAll, importAll, parseBundle, saveSetup } from "./repo";
import { db } from "./schema";
import { newId } from "./repo";
import type { Setup, SetupId } from "@form/core";

/**
 * Import is the only place a stranger's bytes reach the database, and the
 * database is someone's entire training history. Everything here is about the
 * file being parsed rather than trusted (ENGINEERING.md §4, §1.5).
 */
const setup = (over: Partial<Setup> = {}): Setup => ({
  id: newId("setup") as SetupId,
  name: "Home",
  location: "home",
  equipment: ["dumbbells"],
  constraints: { tightSpace: false, noJumping: false, quiet: false },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("restoring a backup", () => {
  it("refuses a file that is not a backup at all", () => {
    expect(() => parseBundle(null)).toThrow(ImportError);
    expect(() => parseBundle("nope")).toThrow(ImportError);
    expect(() => parseBundle({ hello: "world" })).toThrow(ImportError);
  });

  it("refuses a plausible file whose records are the wrong shape", () => {
    // This is the dangerous one: it survives JSON.parse and looks like a
    // bundle, so a cast would have written it and left the app crashing on a
    // plan with no days -- with the real data already gone.
    expect(() =>
      parseBundle({
        schemaVersion: 2,
        setups: [],
        sessions: [],
        plans: [{ id: "p", name: "Broken", setupId: "s" }],
      })
    ).toThrow(ImportError);
  });

  it("names what was wrong instead of shrugging", () => {
    try {
      parseBundle({ schemaVersion: 2, setups: [{ id: "s" }], plans: [], sessions: [] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      expect((error as Error).message).toContain("setups");
    }
  });

  it("refuses a backup from a newer version rather than mangling it", () => {
    expect(() =>
      parseBundle({ schemaVersion: 99, setups: [], plans: [], sessions: [] })
    ).toThrow(/newer version/);
  });

  it("backfills a v1 bundle, because the Dexie upgrade never runs on import", () => {
    const bundle = parseBundle({
      schemaVersion: 1,
      setups: [setup({ id: "s1" as SetupId })],
      sessions: [],
      plans: [
        {
          id: "plan_old",
          setupId: "s1",
          name: "Old Plan",
          tier: "dumbbell",
          rationale: "…",
          tags: [],
          days: [
            { name: "A", weekday: null, exercises: [] },
            { name: "B", weekday: null, exercises: [] },
          ],
          week: 4,
          generated: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    // Without this the restore reintroduces "undefined days a week", which is
    // exactly what the v1 -> v2 migration exists to prevent.
    expect(bundle.plans[0]?.schedule).toEqual({ daysPerWeek: 2, minutesPerSession: 30 });
    expect(bundle.plans[0]?.goal).toBe("general");
    expect(bundle.plans[0]?.week).toBe(4);
  });

  it("round-trips a real export without losing anything", async () => {
    await db.delete();
    await db.open();
    const mine = setup({ name: "Garage" });
    await saveSetup(mine);

    const exported = await exportAll();
    await db.setups.clear();

    const restored = await importAll(JSON.parse(JSON.stringify(exported)));
    expect(restored.setups).toHaveLength(1);
    expect((await db.setups.toArray())[0]?.name).toBe("Garage");
  });

  it("writes nothing when the file is bad", async () => {
    await db.delete();
    await db.open();
    await saveSetup(setup({ name: "Untouched" }));

    await expect(importAll({ setups: "not an array" })).rejects.toThrow(ImportError);
    expect((await db.setups.toArray())[0]?.name).toBe("Untouched");
  });
});
