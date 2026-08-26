import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the module boundary from ENGINEERING.md §2.
 *
 * `packages/core` may import only its own files and zod. This is what makes
 * the domain testable without mocks and the eventual native port a copy
 * rather than a rewrite -- so it is a gate, not a convention.
 */
const SRC = join(import.meta.dirname, "..", "src");

const FORBIDDEN: Array<[RegExp, string]> = [
  [/from\s+["']react["']/, "React"],
  [/from\s+["']react-dom/, "React DOM"],
  [/from\s+["']next\//, "Next.js"],
  [/from\s+["']dexie["']/, "Dexie"],
  [/from\s+["']zustand/, "Zustand"],
  [/from\s+["']node:/, "Node builtins"],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("core stays pure", () => {
  const files = sourceFiles(SRC);

  it("finds the source to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("imports no framework, storage, or platform code", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const [pattern, label] of FORBIDDEN) {
        expect(pattern.test(text), `${file} imports ${label}`).toBe(false);
      }
    }
  });

  it("never reads the clock directly", () => {
    // Time is injected (ENGINEERING.md §3). Reaching for Date.now inside the
    // domain is what makes timers untestable and drift correction impossible.
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(/Date\.now\(\)/.test(text), `${file} calls Date.now()`).toBe(false);
      expect(/\bsetInterval\(/.test(text), `${file} calls setInterval`).toBe(false);
      expect(/\bsetTimeout\(/.test(text), `${file} calls setTimeout`).toBe(false);
    }
  });
});
