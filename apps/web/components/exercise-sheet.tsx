"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isPermitted,
  substitutes,
  type Exercise,
  type Library,
  type Pattern,
  type Profile,
  type Setup,
} from "@form/core";

import { Display, Kicker, PillButton } from "@/components/ui";

const PATTERNS: Array<{ value: Pattern | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "squat", label: "Squat" },
  { value: "hinge", label: "Hinge" },
  { value: "lunge", label: "Lunge" },
  { value: "horizontal-push", label: "Push" },
  { value: "vertical-push", label: "Overhead" },
  { value: "horizontal-pull", label: "Row" },
  { value: "vertical-pull", label: "Pull-up" },
  { value: "core-brace", label: "Core hold" },
  { value: "core-flexion", label: "Core" },
  { value: "rotation", label: "Rotation" },
  { value: "carry", label: "Carry" },
  { value: "gait", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
];

const LIMIT = 80;

interface Props {
  library: Library;
  setup: Setup;
  profile: Profile;
  /** Present when swapping an existing exercise; absent when adding a new one. */
  current?: Exercise | undefined;
  onPick(exercise: Exercise): void;
  onClose(): void;
}

/**
 * Browse or search the whole exercise library.
 *
 * Everything is selectable, including movements that need equipment this setup
 * lacks or that load something the person is working around. Those are labelled
 * rather than hidden: the generator must never *prescribe* them (that invariant
 * still holds), but a person building their own plan is entitled to choose, and
 * silently hiding half the library would be the more confusing answer.
 */
export function ExerciseSheet({ library, setup, profile, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState<Pattern | "all">("all");

  const ctx = useMemo(
    () => ({ setup, limitations: profile.limitations, experience: profile.experience }),
    [setup, profile]
  );

  const results = useMemo(() => {
    const q = query.trim();

    // Swapping with no search opens on the closest alternatives, since that is
    // almost always what someone wants.
    let pool: readonly Exercise[];
    if (!q && current && pattern === "all") {
      pool = substitutes(library, current, ctx, 12);
    } else {
      pool = q ? library.search(q, 400) : library.all;
      if (pattern !== "all") pool = pool.filter((e) => e.pattern === pattern);
    }

    // Usable things first; the rest stay reachable underneath. The permission
    // check is computed once per exercise rather than inside the comparator --
    // it is not cheap, and a comparator runs it O(n log n) times on every
    // keystroke across the whole library.
    const ranked = pool
      .map((e) => ({ e, rank: isPermitted(e, ctx) ? 0 : 1 }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.e.core !== b.e.core) return a.e.core ? -1 : 1;
        return a.e.name.localeCompare(b.e.name);
      });

    return { items: ranked.slice(0, LIMIT).map((x) => x.e), total: ranked.length };
  }, [query, pattern, library, current, ctx]);

  /** Why an exercise would not be prescribed here. Empty when it is a clean fit. */
  const flagsFor = (exercise: Exercise): string[] => {
    const flags: string[] = [];
    const missing = exercise.requires.filter((r) => !setup.equipment.includes(r));
    if (missing.length > 0) flags.push(`needs ${missing.join(", ").replace(/-/g, " ")}`);

    const clashes = exercise.contraindications.filter((c) => profile.limitations.includes(c));
    if (clashes.length > 0) flags.push(`loads your ${clashes.join(" and ").replace(/-/g, " ")}`);

    if (exercise.isJumping && setup.constraints.noJumping) flags.push("jumping");
    if (exercise.isLoud && setup.constraints.quiet) flags.push("loud");
    if (exercise.spaceNeeded === "normal" && setup.constraints.tightSpace) flags.push("needs space");
    return flags;
  };

  // A2: a sheet that looks modal has to behave modally. <dialog> brings the
  // focus trap, the Escape key and an inert background with it, none of which
  // an overlay div has -- keyboard focus used to walk the plan editor behind it.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialogRef.current;
    if (node && !node.open) node.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={current ? `Swap ${current.name}` : "Add an exercise"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicks land on the backdrop only when they miss the panel itself.
        if (e.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none bg-black/60 p-0 backdrop-blur-[2px] backdrop:bg-transparent"
    >
      {/* The sheet tracks the phone column, not the viewport: on a wide screen
          the app is a centred 520px column, so a full-width sheet would slide
          out from under it. Screen uses the same max width. */}
      <div className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-end">
        <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

        <div
          className="flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[26px] border-t border-hair-12 bg-screen"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mb-4 mt-[18px] h-[3px] w-[38px] shrink-0 rounded-full bg-white/22" />

          <div className="shrink-0 px-[22px] pb-3">
            <Kicker>{current ? "Swap exercise" : "Add exercise"}</Kicker>
            <Display size="upNext" weight={800} className="mt-2">
              {current ? current.name : "Pick a movement"}
            </Display>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search all ${library.all.length} exercises`}
              className="mt-4 h-[46px] w-full rounded-full border border-hair-14 bg-transparent px-4 text-[14px] text-t1 outline-none placeholder:text-t5 focus:border-acc"
            />
          </div>

          <div className="flex shrink-0 gap-2 overflow-x-auto px-[22px] pb-3">
            {PATTERNS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPattern(p.value)}
                className="shrink-0 rounded-full border px-3 py-[6px] text-[12px] font-semibold transition-colors"
                style={
                  pattern === p.value
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--color-screen)" }
                    : { borderColor: "rgba(255,255,255,.14)", color: "var(--color-t3)" }
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-hair-08">
            {results.items.length === 0 && (
              <p className="px-[22px] py-8 text-center text-[13px] text-t4">
                Nothing matches that.
              </p>
            )}

            {results.items.map((exercise) => {
              const flags = flagsFor(exercise);
              return (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => onPick(exercise)}
                  className="flex w-full items-center gap-3 border-b border-hair-07 px-[22px] py-[14px] text-left transition-colors hover:bg-white/3"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[15px] font-semibold tracking-[-.01em]"
                      style={{ color: flags.length ? "var(--color-t3)" : "var(--color-t1)" }}
                    >
                      {exercise.name}
                    </div>
                    <div className="mt-[3px] truncate text-[12px] text-t4">
                      {exercise.pattern.replace(/-/g, " ")}
                      {exercise.requires.length > 0
                        ? ` · ${exercise.requires.join(", ").replace(/-/g, " ")}`
                        : " · bodyweight"}
                    </div>
                    {flags.length > 0 && (
                      <div className="mt-[5px] text-[11px] font-semibold uppercase tracking-[.08em] text-[#FFB020]">
                        {flags.join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[.1em] text-t5">
                    {exercise.kind === "time" ? "hold" : "reps"}
                  </div>
                </button>
              );
            })}

            {results.total > LIMIT && (
              <p className="px-[22px] py-5 text-center text-[12px] text-t5">
                Showing {LIMIT} of {results.total}. Search or filter to narrow it down.
              </p>
            )}
          </div>

          <div className="shrink-0 px-[22px] pt-4">
            <PillButton variant="outline" className="w-full" onClick={onClose}>
              Cancel
            </PillButton>
          </div>
        </div>
      </div>
    </dialog>
  );
}
