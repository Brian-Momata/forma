/**
 * Builds packages/core/src/library/exercises.json from free-exercise-db.
 *
 * Re-runnable. Hand-authored overrides always win over derived values, so an
 * upstream change can never silently undo a correction we made on purpose.
 *
 *   npm run library            rebuild from cache (fetches once)
 *   npm run library -- --fresh re-fetch the source
 *   npm run library -- --check-images verify every image URL resolves
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Exercise } from "../src/types.ts";
import { OVERRIDES, type Override } from "./overrides.ts";
import { SUPPLEMENTS } from "./supplements.ts";
import {
  deriveContraindications,
  deriveCues,
  deriveDefaults,
  deriveEquipment,
  deriveKind,
  deriveLevel,
  derivePattern,
  isDynamic,
  isJumping,
  isLoud,
  isUnilateral,
  isUsable,
  mapMuscles,
  spaceNeeded,
  type SourceExercise,
} from "./derive.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CACHE = join(HERE, ".cache", "exercises.json");
const OUT = join(ROOT, "src", "library", "exercises.json");
const META = join(ROOT, "src", "library", "meta.json");

const SOURCE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
export const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

const args = new Set(process.argv.slice(2));

async function loadSource(): Promise<SourceExercise[]> {
  if (!args.has("--fresh") && existsSync(CACHE)) {
    return JSON.parse(await readFile(CACHE, "utf8")) as SourceExercise[];
  }
  process.stdout.write(`fetching ${SOURCE_URL}\n`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`source fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, text);
  return JSON.parse(text) as SourceExercise[];
}

async function main(): Promise<void> {
  const source = await loadSource();
  const overrides: Record<string, Override> = OVERRIDES;

  // A typo'd override key is silent data loss -- the correction simply never
  // applies. Fail loudly instead.
  const sourceIds = new Set(source.map((s) => s.id));
  const supplementIds = new Set(SUPPLEMENTS.map((s) => s.id));
  const orphans = Object.keys(overrides).filter(
    (k) => !sourceIds.has(k) && !supplementIds.has(k)
  );
  if (orphans.length) {
    throw new Error(
      `overrides reference ${orphans.length} unknown exercise id(s):\n  ${orphans.join("\n  ")}`
    );
  }

  const built: Exercise[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];

  for (const src of source) {
    const ov = overrides[src.id] ?? {};
    if (ov.drop) {
      rejected.push({ id: src.id, reason: "dropped by override" });
      continue;
    }

    const pattern = ov.pattern ?? derivePattern(src);
    if (!pattern) {
      rejected.push({ id: src.id, reason: "no pattern could be derived" });
      continue;
    }

    const level = ov.level ?? deriveLevel(src);
    const kind = ov.kind ?? deriveKind(src, pattern);

    const candidate = {
      id: src.id,
      name: ov.name ?? src.name,
      pattern,
      requires: ov.requires ?? deriveEquipment(src),
      primaryMuscles: ov.primaryMuscles ?? mapMuscles(src.primaryMuscles),
      secondaryMuscles: ov.secondaryMuscles ?? mapMuscles(src.secondaryMuscles),
      kind,
      level,
      mechanic:
        ov.mechanic ??
        (src.mechanic === "compound" || src.mechanic === "isolation" ? src.mechanic : null),
      contraindications: ov.contraindications ?? deriveContraindications(src, pattern),
      isJumping: ov.isJumping ?? isJumping(src),
      isLoud: ov.isLoud ?? isLoud(src),
      dynamic: ov.dynamic ?? isDynamic(src, pattern),
      spaceNeeded: ov.spaceNeeded ?? spaceNeeded(src),
      unilateral: ov.unilateral ?? isUnilateral(src),
      cues: ov.cues ?? deriveCues(src),
      images: ov.images ?? src.images,
      chainId: ov.chainId ?? null,
      chainRank: ov.chainRank ?? null,
      // An override that supplies cues is a deliberate curation: trust it into the pool.
      core: ov.core ?? (isUsable(src) && Boolean(ov.cues)),
      defaults: ov.defaults ?? deriveDefaults(kind, pattern, level),
    };

    const parsed = Exercise.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        id: src.id,
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    built.push(parsed.data);
  }

  // Hand-authored exercises the dataset lacks entirely.
  for (const draft of SUPPLEMENTS) {
    const parsed = Exercise.safeParse({ ...draft, ...(overrides[draft.id] ?? {}) });
    if (!parsed.success) {
      rejected.push({
        id: draft.id,
        reason: `supplement invalid -- ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      });
      continue;
    }
    built.push(parsed.data);
  }

  const seen = new Set<string>();
  for (const e of built) {
    if (seen.has(e.id)) throw new Error(`duplicate exercise id: ${e.id}`);
    seen.add(e.id);
  }

  built.sort((a, b) => a.name.localeCompare(b.name));

  if (args.has("--check-images")) await checkImages(built);

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(built));

  const meta = {
    source: SOURCE_URL,
    license: "Unlicense (public domain)",
    imageBase: IMAGE_BASE,
    builtAt: new Date().toISOString(),
    sourceCount: source.length,
    supplements: SUPPLEMENTS.length,
    total: built.length,
    core: built.filter((e) => e.core).length,
    checksum: createHash("sha256").update(JSON.stringify(built)).digest("hex").slice(0, 16),
  };
  await writeFile(META, JSON.stringify(meta, null, 2) + "\n");

  report(built, rejected, meta);
}

async function checkImages(built: Exercise[]): Promise<void> {
  const targets = built.filter((e) => e.core);
  process.stdout.write(`checking ${targets.length} core exercise images...\n`);
  const bad: string[] = [];
  // A broken image discovered in a gym is a broken image. Catch it at build time.
  for (const e of targets) {
    for (const img of e.images) {
      const res = await fetch(IMAGE_BASE + img, { method: "HEAD" });
      const len = Number(res.headers.get("content-length") ?? "0");
      if (!res.ok || len < 2000) bad.push(`${e.id} -> ${img} (${res.status}, ${len}b)`);
    }
  }
  if (bad.length) {
    process.stdout.write(`\n  BROKEN IMAGES (${bad.length}):\n`);
    for (const b of bad) process.stdout.write(`    ${b}\n`);
  } else {
    process.stdout.write("  all core images ok\n");
  }
}

function report(
  built: Exercise[],
  rejected: Array<{ id: string; reason: string }>,
  meta: Record<string, unknown>
): void {
  const byPattern = new Map<string, { total: number; core: number; bw: number }>();
  for (const e of built) {
    const row = byPattern.get(e.pattern) ?? { total: 0, core: 0, bw: 0 };
    row.total += 1;
    if (e.core) {
      row.core += 1;
      if (e.requires.length === 0) row.bw += 1;
    }
    byPattern.set(e.pattern, row);
  }

  process.stdout.write(`\nbuilt ${meta["total"]} exercises (${meta["core"]} core), ${rejected.length} rejected\n`);
  process.stdout.write(`\n  pattern            total   core   bodyweight\n`);
  for (const [p, r] of [...byPattern].sort()) {
    const warn = r.bw < 3 ? "  <-- thin" : "";
    process.stdout.write(
      `  ${p.padEnd(18)} ${String(r.total).padStart(5)} ${String(r.core).padStart(6)} ${String(r.bw).padStart(12)}${warn}\n`
    );
  }

  const reasons = new Map<string, number>();
  for (const r of rejected) {
    const key = r.reason.slice(0, 40);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  if (reasons.size) {
    process.stdout.write(`\n  rejected by reason:\n`);
    for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`    ${String(n).padStart(4)}  ${r}\n`);
    }
  }
  process.stdout.write(`\nwrote ${OUT}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
