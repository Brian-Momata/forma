"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  applyFeedback,
  formatClock,
  progressionNote,
  sessionSeconds,
  type Feel,
  type PlanId,
} from "@form/core";

import { Display, PillButton, Screen } from "@/components/ui";
import { useBootstrap } from "@/lib/use-bootstrap";
import { savePlan } from "@/db/repo";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";

const OPTIONS: Array<{ value: Feel; label: string }> = [
  { value: "too-easy", label: "Too easy" },
  { value: "just-right", label: "Just right" },
  { value: "too-hard", label: "Too hard" },
];

export default function CompletePage() {
  useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id as PlanId;

  const { library, plans, profile, setups, refresh } = useApp();
  const player = useSession((s) => s.player);
  const meta = useSession((s) => s.meta);
  const finish = useSession((s) => s.finish);
  const clear = useSession((s) => s.clear);

  const [feel, setFeel] = useState<Feel>("just-right");
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.id === planId);

  /**
   * The heaviest weight banked per movement this session.
   *
   * This is what teaches load progression what the person actually lifts -- the
   * plan cannot guess, so the first "too easy" on a barbell plan learns it from
   * here rather than promising a weight change it has no number for.
   */
  const loggedWeights = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of player?.records ?? []) {
      if (r.skipped || r.weightKg === null || r.weightKg <= 0) continue;
      out.set(r.exerciseId, Math.max(out.get(r.exerciseId) ?? 0, r.weightKg));
    }
    return out;
  }, [player]);

  const stats = useMemo(() => {
    if (!player) return null;
    // Warm-ups are not training volume, and counting them here would disagree
    // with the exercise and set counts shown everywhere else.
    const warmupIds = new Set(player.items.filter((i) => i.warmup).map((i) => i.exerciseId));
    const logged = player.records.filter((r) => !r.skipped && !warmupIds.has(r.exerciseId));
    return {
      time: formatClock(sessionSeconds(player, player.endedAt ?? player.startedAt)),
      sets: logged.length,
      exercises: new Set(logged.map((r) => r.exerciseId)).size,
    };
  }, [player]);

  // Reaching this page with nothing to show means a stale link or a reload
  // after finishing; send them home rather than showing an empty card.
  useEffect(() => {
    if (!player) router.replace("/");
  }, [player, router]);

  if (!player || !stats) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[13px] text-t4">Wrapping up…</div>
        </div>
      </Screen>
    );
  }

  const done = async () => {
    setSaving(true);
    try {
      await finish(feel);

      // Feedback is what makes next week different from this one.
      if (plan && library && profile) {
        const setup = setups.find((s) => s.id === plan.setupId);
        if (setup) {
          const next = applyFeedback(
            library,
            plan,
            feel,
            { setup, limitations: profile.limitations, experience: profile.experience },
            Date.now(),
            loggedWeights
          );
          await savePlan(next);
        }
      }

      await refresh();
      clear();
      router.replace("/");
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { k: "Time", v: stats.time },
    { k: "Sets logged", v: String(stats.sets) },
    { k: "Exercises", v: String(stats.exercises) },
  ];

  return (
    <Screen>
      <div className="pt-[46px]" />
      <div
        className="flex flex-1 flex-col overflow-y-auto rounded-t-[22px] px-[22px] pb-[30px] pt-[26px]"
        style={{
          background: "var(--acc)",
          color: "var(--color-screen)",
          animation: "riseIn .45s ease-out",
        }}
      >
        <div className="text-[10.5px] font-extrabold uppercase tracking-[.24em] opacity-60">
          {meta?.dayName ?? plan?.name ?? "Session"} · complete
        </div>
        <Display size="done" className="-ml-[6px] mt-3">
          DONE
        </Display>

        <div className="mt-6 h-px" style={{ background: "rgba(8,9,11,.22)" }} />
        {rows.map((row) => (
          <div
            key={row.k}
            className="flex items-baseline justify-between py-[14px]"
            style={{ borderBottom: "1px solid rgba(8,9,11,.18)" }}
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] opacity-60">
              {row.k}
            </div>
            <Display size="stat" tabular>
              {row.v}
            </Display>
          </div>
        ))}

        <div className="mt-[26px] text-[11px] font-extrabold uppercase tracking-[.18em] opacity-60">
          How did that feel?
        </div>
        <div className="mt-3 flex gap-2">
          {OPTIONS.map((option) => {
            const on = feel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFeel(option.value)}
                aria-pressed={on}
                className="relative flex h-[46px] flex-1 items-center justify-center text-[12.5px] font-bold"
                style={{
                  border: "1px solid rgba(8,9,11,.28)",
                  background: on ? "var(--color-screen)" : "transparent",
                  color: on ? "var(--acc)" : "inherit",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="mt-[14px] text-[13px] font-semibold leading-[1.5] opacity-72">
          {progressionNote(
            feel,
            { tier: plan?.tier ?? "bodyweight" },
            loggedWeights.size > 0 ||
              (plan?.days ?? []).some((d) =>
                d.exercises.some((e) => (e.prescription.targetWeightKg ?? null) !== null)
              )
          )}
        </p>

        <div className="flex-1" />
        <PillButton className="mt-8 h-[60px]" variant="dark" onClick={done} disabled={saving}>
          {saving ? "Saving…" : "Done"}
        </PillButton>
      </div>
    </Screen>
  );
}
