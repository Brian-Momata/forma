"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Exercise, Plan, PlanDay, PlanId } from "@form/core";

import {
  Display,
  Kicker,
  PillButton,
  Screen,
  ScrollArea,
  Tag,
} from "@/components/ui";
import { BackLink } from "@/components/ui/nav";
import { ExerciseSheet } from "@/components/exercise-sheet";
import { dayMinutes } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { savePlan } from "@/db/repo";
import { useApp } from "@/store/app";

type SheetState = { mode: "swap"; index: number } | { mode: "add" } | null;

export default function PlanPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id as PlanId;

  const { library, plans, profile, setups, refresh } = useApp();
  const [dayIndex, setDayIndex] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const setup = setups.find((s) => s.id === plan?.setupId);
  const day = plan?.days[dayIndex];

  const working = day?.exercises.map((e, i) => ({ ...e, i })).filter((e) => !e.warmup) ?? [];

  if (!ready || !plan || !day || !library || !profile || !setup) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[13px] text-t4">Loading…</div>
        </div>
      </Screen>
    );
  }

  /** Every edit goes through here so the plan is always persisted as edited. */
  const mutate = async (fn: (day: PlanDay) => PlanDay) => {
    setSaving(true);
    try {
      const next: Plan = {
        ...plan,
        // A plan someone has edited is theirs; regeneration must not clobber it.
        generated: false,
        days: plan.days.map((d, i) => (i === dayIndex ? fn(d) : d)),
      };
      await savePlan(next);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, direction: -1 | 1) =>
    mutate((d) => {
      const items = [...d.exercises];
      const target = index + direction;
      if (target < 0 || target >= items.length) return d;
      const a = items[index];
      const b = items[target];
      if (!a || !b || a.warmup !== b.warmup) return d;
      items[index] = b;
      items[target] = a;
      return { ...d, exercises: items };
    });

  const remove = (index: number) =>
    mutate((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) }));

  const pick = (exercise: Exercise) => {
    if (!sheet) return;
    const prescription = {
      sets: exercise.defaults.sets,
      ...(exercise.defaults.reps !== undefined ? { reps: exercise.defaults.reps } : {}),
      ...(exercise.defaults.durationSec !== undefined
        ? { durationSec: exercise.defaults.durationSec }
        : {}),
      restSec: exercise.defaults.restSec,
    };

    if (sheet.mode === "swap") {
      const index = sheet.index;
      void mutate((d) => ({
        ...d,
        exercises: d.exercises.map((item, i) =>
          i === index ? { ...item, exerciseId: exercise.id, prescription } : item
        ),
      }));
    } else {
      void mutate((d) => ({
        ...d,
        exercises: [...d.exercises, { exerciseId: exercise.id, warmup: false, prescription }],
      }));
    }
    setSheet(null);
  };

  const adjust = (index: number, field: "sets" | "reps" | "durationSec" | "restSec", delta: number) =>
    mutate((d) => ({
      ...d,
      exercises: d.exercises.map((item, i) => {
        if (i !== index) return item;
        const p = item.prescription;
        const currentValue = p[field];
        if (currentValue === undefined) return item;
        const limits = {
          sets: [1, 8],
          reps: [1, 50],
          durationSec: [5, 300],
          restSec: [0, 300],
        } as const;
        const [min, max] = limits[field];
        const step = field === "durationSec" || field === "restSec" ? 5 : 1;
        return {
          ...item,
          prescription: {
            ...p,
            [field]: Math.min(max, Math.max(min, currentValue + delta * step)),
          },
        };
      }),
    }));

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <BackLink href="/" />
          <Display size="title" className="mt-4">
            {plan.name}
          </Display>
          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-t3">{plan.rationale}</p>
          <div className="mt-4 flex flex-wrap gap-[6px] pb-[26px]">
            {plan.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        </div>

        {plan.days.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-[22px] pb-5">
            {plan.days.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDayIndex(i)}
                className="shrink-0 rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors"
                style={
                  i === dayIndex
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--color-screen)" }
                    : { borderColor: "rgba(255,255,255,.14)", color: "var(--color-t2)" }
                }
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        <Kicker className="px-[22px] pb-3">Warm-up</Kicker>
        {day.exercises
          .map((e, i) => ({ ...e, i }))
          .filter((e) => e.warmup)
          .map((item) => {
            const exercise = library.byId(item.exerciseId);
            return (
              <div
                key={item.i}
                className="flex items-center gap-4 border-t border-hair-07 px-[22px] py-3"
              >
                <div className="flex-1 text-[14px] text-t2">{exercise?.name ?? "—"}</div>
                <div className="text-[12px] text-t4">{item.prescription.durationSec}s</div>
              </div>
            );
          })}

        <Kicker className="px-[22px] pb-3 pt-7">The work</Kicker>
        {working.map((item, order) => {
          const exercise = library.byId(item.exerciseId);
          const p = item.prescription;
          return (
            <div key={item.i} className="border-t border-hair-07 px-[22px] py-[18px]">
              <div className="flex items-center gap-4">
                <div
                  className="shrink-0 text-line2"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontVariationSettings: '"wdth" 118',
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-.03em",
                  }}
                >
                  {String(order + 1).padStart(2, "0")}
                </div>
                <button
                  type="button"
                  onClick={() => setSheet({ mode: "swap", index: item.i })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[16px] font-semibold tracking-[-.012em]">
                    {exercise?.name ?? "Unknown"}
                  </div>
                  <div className="mt-[3px] text-[12px] text-t4">
                    {exercise?.pattern.replace(/-/g, " ")} · tap to swap
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={() => void move(item.i, -1)}
                    className="px-2 text-[11px] text-t4 hover:text-acc"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    onClick={() => void move(item.i, 1)}
                    className="px-2 text-[11px] text-t4 hover:text-acc"
                  >
                    ↓
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 pl-[38px]">
                <Stepper label="sets" value={p.sets} onChange={(d) => void adjust(item.i, "sets", d)} />
                {p.reps !== undefined && (
                  <Stepper label="reps" value={p.reps} onChange={(d) => void adjust(item.i, "reps", d)} />
                )}
                {p.durationSec !== undefined && (
                  <Stepper
                    label="sec"
                    value={p.durationSec}
                    onChange={(d) => void adjust(item.i, "durationSec", d)}
                  />
                )}
                <Stepper
                  label="rest"
                  value={p.restSec}
                  onChange={(d) => void adjust(item.i, "restSec", d)}
                />
                <button
                  type="button"
                  onClick={() => void remove(item.i)}
                  className="ml-auto text-[11.5px] font-semibold uppercase tracking-[.1em] text-t5 hover:text-t2"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setSheet({ mode: "add" })}
          className="w-full border-t border-hair-07 px-[22px] py-[18px] text-left text-[14px] font-semibold text-t4 transition-colors hover:text-acc"
        >
          + Add exercise
        </button>

        <div className="h-6" />
      </ScrollArea>

      <div
        className="border-t border-hair-08 bg-screen/85 px-[22px] pt-[14px] backdrop-blur-[18px]"
        style={{ paddingBottom: "max(34px, env(safe-area-inset-bottom))" }}
      >
        <PillButton
          className="w-full"
          disabled={saving}
          onClick={() => router.push(`/workout/${plan.id}?day=${dayIndex}`)}
        >
          Start · {dayMinutes(day)} min
        </PillButton>
      </div>

      {sheet && (
        <ExerciseSheet
          library={library}
          setup={setup}
          profile={profile}
          current={
            sheet.mode === "swap"
              ? library.byId(day.exercises[sheet.index]?.exerciseId ?? "")
              : undefined
          }
          onPick={pick}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(delta: -1 | 1): void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-hair-12 px-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(-1)}
        className="h-7 w-6 text-[13px] text-t4 hover:text-acc"
      >
        −
      </button>
      <div className="min-w-[46px] text-center text-[11.5px] font-semibold text-t2">
        {value} {label}
      </div>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(1)}
        className="h-7 w-6 text-[13px] text-t4 hover:text-acc"
      >
        +
      </button>
    </div>
  );
}
