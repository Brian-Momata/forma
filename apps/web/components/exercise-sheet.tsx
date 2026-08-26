"use client";

import { useMemo, useState } from "react";
import {
  eligibleForPattern,
  isPermitted,
  substitutes,
  type Exercise,
  type Library,
  type Profile,
  type Setup,
} from "@form/core";

import { Display, Kicker, PillButton } from "@/components/ui";

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
 * Swap or add an exercise.
 *
 * Only ever offers movements this situation can actually host and this person
 * is cleared for -- the same gate the generator uses, so the editor can never
 * put something in a plan that the generator would have refused.
 */
export function ExerciseSheet({ library, setup, profile, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const ctx = useMemo(
    () => ({ setup, limitations: profile.limitations, experience: profile.experience }),
    [setup, profile]
  );

  const results = useMemo(() => {
    if (query.trim()) {
      return library.search(query, 60).filter((e) => isPermitted(e, ctx));
    }
    if (current) return substitutes(library, current, ctx, 12);
    return library.core.filter((e) => isPermitted(e, ctx)).slice(0, 30);
  }, [query, library, current, ctx]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 cursor-default"
        onClick={onClose}
      />
      <div
        className="max-h-[82dvh] overflow-hidden rounded-t-[26px] border-t border-hair-12 bg-screen"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 mt-[18px] h-[3px] w-[38px] rounded-full bg-white/22" />

        <div className="px-[22px] pb-4">
          <Kicker>{current ? "Swap exercise" : "Add exercise"}</Kicker>
          <Display size="upNext" weight={800} className="mt-2">
            {current ? current.name : "Pick a movement"}
          </Display>
          {current && (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-t4">
              Alternatives that train the same pattern with what you have at {setup.name}.
            </p>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all exercises"
            className="mt-4 h-[46px] w-full rounded-full border border-hair-14 bg-transparent px-4 text-[14px] text-t1 outline-none placeholder:text-t5 focus:border-acc"
          />
        </div>

        <div className="max-h-[46dvh] overflow-y-auto border-t border-hair-08">
          {results.length === 0 && (
            <p className="px-[22px] py-8 text-center text-[13px] text-t4">
              Nothing here fits this setup and what you are working around.
            </p>
          )}
          {results.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className="flex w-full items-center gap-3 border-b border-hair-07 px-[22px] py-[14px] text-left transition-colors hover:bg-white/3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold tracking-[-.01em]">
                  {exercise.name}
                </div>
                <div className="mt-[3px] text-[12px] text-t4">
                  {exercise.pattern.replace(/-/g, " ")}
                  {exercise.requires.length > 0
                    ? ` · ${exercise.requires.join(", ").replace(/-/g, " ")}`
                    : " · bodyweight"}
                </div>
              </div>
              <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[.1em] text-t5">
                {exercise.kind === "time" ? "hold" : "reps"}
              </div>
            </button>
          ))}
        </div>

        <div className="px-[22px] pt-4">
          <PillButton variant="outline" className="w-full" onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </div>
    </div>
  );
}

/** Patterns that still have options in this situation, for the add flow. */
export function availablePatterns(library: Library, setup: Setup, profile: Profile) {
  const ctx = { setup, limitations: profile.limitations, experience: profile.experience };
  return (["squat", "hinge", "lunge", "horizontal-push", "vertical-push", "horizontal-pull", "vertical-pull", "core-brace", "core-flexion", "rotation", "carry", "gait", "mobility"] as const).filter(
    (p) => eligibleForPattern(library, p, ctx).length > 0
  );
}
