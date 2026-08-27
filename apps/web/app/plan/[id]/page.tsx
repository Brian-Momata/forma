"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Exercise, Plan, PlanDay, PlanId } from "@form/core";

import { Kicker, Loading, NotFound, PillButton, Screen, ScrollArea, Tag } from "@/components/ui";
import { BackLink } from "@/components/ui/nav";
import { ExerciseSheet } from "@/components/exercise-sheet";
import { dayMinutes, weekdayLabel } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

type SheetState = { mode: "swap"; index: number } | { mode: "add" } | null;

/** Equipment a movement is loaded with, so the editor can offer a target weight. */
const LOADABLE_REQUIREMENTS = [
  "dumbbells",
  "barbell",
  "kettlebell",
  "ez-bar",
  "cable",
  "machines",
  "medicine-ball",
] as const;

export default function PlanPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id as PlanId;

  const { library, plans, profile, setups, activePlan, updatePlan, copyPlan, removePlan, activatePlan } =
    useApp();
  const [dayIndex, setDayIndex] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const setup = setups.find((s) => s.id === plan?.setupId);
  const day = plan?.days[Math.min(dayIndex, (plan?.days.length ?? 1) - 1)];

  if (!ready || !library || !profile) return <Loading />;
  if (!plan || !setup || !day) {
    return (
      <NotFound
        title="That plan is gone"
        body="It may have been deleted, or belonged to a setup that was removed."
        href="/plans"
        label="Back to your plans"
      />
    );
  }

  const safeIndex = Math.min(dayIndex, plan.days.length - 1);
  const working = day.exercises.map((e, i) => ({ ...e, i })).filter((e) => !e.warmup);
  const warmups = day.exercises.map((e, i) => ({ ...e, i })).filter((e) => e.warmup);
  const isActive = plan.id === activePlan?.id;

  /**
   * Every edit goes through here.
   *
   * Editing marks the plan as the person's own, so regenerating the setup can
   * never quietly overwrite their work.
   */
  const mutatePlan = async (fn: (plan: Plan) => Plan) => {
    setSaving(true);
    try {
      await updatePlan({ ...fn(plan), generated: false });
    } finally {
      setSaving(false);
    }
  };

  const mutateDay = (fn: (day: PlanDay) => PlanDay) =>
    mutatePlan((p) => ({ ...p, days: p.days.map((d, i) => (i === safeIndex ? fn(d) : d)) }));

  const move = (index: number, direction: -1 | 1) =>
    mutateDay((d) => {
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
    mutateDay((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) }));

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
      void mutateDay((d) => ({
        ...d,
        exercises: d.exercises.map((item, i) =>
          i === index ? { ...item, exerciseId: exercise.id, prescription } : item
        ),
      }));
    } else {
      void mutateDay((d) => ({
        ...d,
        exercises: [...d.exercises, { exerciseId: exercise.id, warmup: false, prescription }],
      }));
    }
    setSheet(null);
  };

  const adjust = (
    index: number,
    field: "sets" | "reps" | "durationSec" | "restSec" | "targetWeightKg",
    delta: number
  ) =>
    mutateDay((d) => ({
      ...d,
      exercises: d.exercises.map((item, i) => {
        if (i !== index) return item;
        const p = item.prescription;
        const raw = p[field];
        // A target weight that has never been set is "we do not know yet", not
        // "not applicable": it starts from zero rather than refusing the edit.
        // Every other field is absent only when it does not apply at all.
        if (raw === undefined && field !== "targetWeightKg") return item;
        const currentValue = raw ?? 0;
        const limits = {
          sets: [1, 10],
          reps: [1, 100],
          durationSec: [5, 600],
          restSec: [0, 300],
          targetWeightKg: [0, 500],
        } as const;
        const [min, max] = limits[field];
        const step =
          field === "durationSec" || field === "restSec"
            ? 5
            : field === "targetWeightKg"
              ? 2.5
              : 1;
        return {
          ...item,
          prescription: { ...p, [field]: Math.min(max, Math.max(min, currentValue + delta * step)) },
        };
      }),
    }));

  const addDay = () =>
    mutatePlan((p) => ({
      ...p,
      days: [...p.days, { name: `Day ${p.days.length + 1}`, weekday: null, exercises: [] }],
    }));

  const removeDay = async () => {
    if (plan.days.length <= 1) return;
    setDayIndex(Math.max(0, safeIndex - 1));
    await mutatePlan((p) => ({ ...p, days: p.days.filter((_, i) => i !== safeIndex) }));
  };

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <BackLink href="/plans" />

          <DraftInput
            value={plan.name}
            onCommit={(name) => void mutatePlan((p) => ({ ...p, name }))}
            fallback="Untitled plan"
            aria-label="Plan name"
            className="mt-4 w-full bg-transparent outline-none"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 108',
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-.04em",
              lineHeight: 1,
              color: "var(--color-t1)",
            }}
          />

          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-t3">{plan.rationale}</p>
          <div className="mt-2 text-[12px] text-t4">
            {plan.goal.replace("-", " ")} · {setup.name} · {plan.tier.replace("-", " ")}
            {isActive ? " · current plan" : ""}
          </div>

          {plan.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-[6px]">
              {plan.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto px-[22px] pb-5 pt-6">
          {plan.days.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDayIndex(i)}
              className="shrink-0 rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors"
              style={
                i === safeIndex
                  ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--color-screen)" }
                  : { borderColor: "rgba(255,255,255,.14)", color: "var(--color-t2)" }
              }
            >
              {d.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void addDay()}
            aria-label="Add a day"
            className="shrink-0 rounded-full border border-hair-14 px-4 py-2 text-[12.5px] font-semibold text-t4 transition-colors hover:border-acc hover:text-acc"
          >
            + Day
          </button>
        </div>

        <div className="flex items-center gap-3 border-t border-hair-07 px-[22px] py-3">
          <DraftInput
            value={day.name}
            onCommit={(name) => void mutateDay((d) => ({ ...d, name }))}
            fallback="Untitled session"
            aria-label="Session name"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-t2 outline-none"
          />
          {weekdayLabel(day) && (
            <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[.1em] text-t5">
              {weekdayLabel(day)}
            </span>
          )}
          {plan.days.length > 1 && (
            <button
              type="button"
              onClick={() => void removeDay()}
              className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[.1em] text-t5 hover:text-[#FF6B6B]"
            >
              Remove day
            </button>
          )}
        </div>

        {warmups.length > 0 && (
          <>
            <Kicker className="px-[22px] pb-3 pt-6">Warm-up</Kicker>
            {warmups.map((item) => (
              <div
                key={item.i}
                className="flex items-center gap-4 border-t border-hair-07 px-[22px] py-3"
              >
                <div className="flex-1 text-[14px] text-t2">
                  {library.byId(item.exerciseId)?.name ?? "—"}
                </div>
                <div className="text-[12px] text-t4">
                  {item.prescription.durationSec}s
                  {library.byId(item.exerciseId)?.unilateral && (
                    <span className="text-acc"> · both sides</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(item.i)}
                  aria-label="Remove"
                  className="text-[11.5px] font-semibold uppercase tracking-[.1em] text-t5 hover:text-t2"
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}

        <Kicker className="px-[22px] pb-3 pt-7">The work</Kicker>

        {working.length === 0 && (
          <p className="px-[22px] pb-2 text-[13px] leading-[1.55] text-t4">
            Nothing here yet. Add movements below — the whole library is available, and
            you set the sets, reps and rest.
          </p>
        )}

        {working.map((item, order) => {
          const exercise = library.byId(item.exerciseId);
          const p = item.prescription;

          // The player drops what it cannot resolve, so the editor has to show
          // it rather than counting work that silently vanishes at run time.
          if (!exercise) {
            return (
              <div key={item.i} className="border-t border-hair-07 px-[22px] py-[18px]">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-warn">
                      This movement is no longer in the library
                    </div>
                    <div className="mt-[3px] text-[12px] text-t4">
                      It will be skipped. Swap it for something else.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: "swap", index: item.i })}
                    className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[.1em] text-acc"
                  >
                    Swap
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item.i)}
                    className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[.1em] text-t5 hover:text-t2"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          }

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
                    {exercise.name}
                  </div>
                  <div className="mt-[3px] text-[12px] text-t4">
                    {exercise.pattern.replace(/-/g, " ")} · tap to swap
                  </div>
                  {/* Editing these blind is how a one-sided movement ends up
                      prescribed at half or double what was meant. */}
                  {exercise.unilateral && (
                    <div className="mt-[3px] text-[12px] font-semibold text-acc">
                      {exercise.kind === "reps"
                        ? "One side at a time — reps are per side"
                        : "One side at a time — the hold covers both"}
                    </div>
                  )}
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
                    label="hold"
                    unit="s"
                    value={p.durationSec}
                    onChange={(d) => void adjust(item.i, "durationSec", d)}
                  />
                )}
                <Stepper
                  label="rest"
                  unit="s"
                  value={p.restSec}
                  onChange={(d) => void adjust(item.i, "restSec", d)}
                />
                {LOADABLE_REQUIREMENTS.some((r) => exercise.requires.includes(r)) &&
                  p.reps !== undefined && (
                    <Stepper
                      label="target"
                      unit={profile.units}
                      value={
                        profile.units === "lb"
                          ? Math.round((p.targetWeightKg ?? 0) * 2.2046226)
                          : (p.targetWeightKg ?? 0)
                      }
                      onChange={(d) => void adjust(item.i, "targetWeightKg", d)}
                    />
                  )}
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

        <Kicker className="px-[22px] pb-3 pt-10">This plan</Kicker>
        {!isActive && (
          <button
            type="button"
            onClick={() => void activatePlan(plan.id)}
            className="w-full border-t border-hair-07 px-[22px] py-4 text-left text-[14px] text-t2 hover:text-acc"
          >
            Make this my current plan
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const copy = await copyPlan(plan);
            router.replace(`/plan/${copy.id}`);
          }}
          className="w-full border-t border-hair-07 px-[22px] py-4 text-left text-[14px] text-t2 hover:text-acc"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full border-t border-hair-07 px-[22px] py-4 text-left text-[14px] text-t5 hover:text-[#FF6B6B]"
        >
          Delete plan
        </button>

        {confirmDelete && (
          <div className="px-[22px] py-4">
            <p className="text-[13px] leading-[1.5] text-t3">
              Delete “{plan.name}”? Sessions you have already logged are kept.
            </p>
            <div className="mt-3 flex gap-2">
              <PillButton
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  await removePlan(plan.id);
                  router.replace("/plans");
                }}
              >
                Delete
              </PillButton>
              <PillButton variant="muted" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Keep
              </PillButton>
            </div>
          </div>
        )}

        <div className="h-6" />
      </ScrollArea>

      <div
        className="border-t border-hair-08 bg-screen/85 px-[22px] pt-[14px] backdrop-blur-[18px]"
        style={{ paddingBottom: "max(34px, env(safe-area-inset-bottom))" }}
      >
        <PillButton
          className="w-full"
          disabled={saving || working.length === 0}
          onClick={() => router.push(`/workout/${plan.id}?day=${safeIndex}`)}
        >
          {working.length === 0 ? "Add something first" : `Start · ${dayMinutes(day)} min`}
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

/**
 * A text field that does not write to the database on every keystroke.
 *
 * The value it displays is the stored one, and the stored one used to arrive
 * back asynchronously through a full store refresh -- so typing quickly dropped
 * and reordered characters. The draft is local while the field has focus, and
 * is committed on a pause or on blur. Empty commits fall back rather than
 * persisting a name that fails the Plan schema's own min(1).
 */
function DraftInput({
  value,
  onCommit,
  fallback,
  ...rest
}: {
  value: string;
  onCommit(next: string): void;
  fallback: string;
} & Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const timer = useRef<number | null>(null);

  // Adopt changes from elsewhere -- a regenerate, say -- but never yank the
  // field out from under someone mid-word. Done during render because it is
  // state derived from a prop, not a synchronisation with anything external.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue && !editing) {
    setShownValue(value);
    setDraft(value);
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const commit = (next: string) => {
    const trimmed = next.trim();
    onCommit(trimmed.length > 0 ? trimmed : fallback);
  };

  return (
    <input
      {...rest}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(next), 500);
      }}
      onBlur={() => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        setEditing(false);
        commit(draft);
      }}
    />
  );
}

function Stepper({
  label,
  value,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
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
      <div className="min-w-[52px] text-center text-[11.5px] font-semibold text-t2">
        {value}
        {unit} {label}
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
