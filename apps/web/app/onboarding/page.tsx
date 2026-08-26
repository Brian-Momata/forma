"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GYM_PRESETS, type EquipmentId, type Experience, type Goal, type Limitation, type Setup, type SetupId } from "@form/core";

import { Display, Kicker, Loading, PillButton, Screen, ScrollArea, Segments } from "@/components/ui";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";
import { defaultProfile, newId, setActiveSetupId } from "@/db/repo";
import {
  CONSTRAINTS_STEP,
  GOAL_STEP,
  GYM_PRESET_STEP,
  HOME_KIT_STEP,
  LEVEL_STEP,
  LIMITS_STEP,
  PLACE_STEP,
  TIME_STEP,
  gymConfirmStep,
  type Step,
} from "./steps";

type Answers = Record<string, string[]>;

function OnboardingFlow() {
  const router = useRouter();
  useBootstrap();
  const search = useSearchParams();
  const updateProfile = useApp((s) => s.updateProfile);
  const upsertSetup = useApp((s) => s.upsertSetup);
  const regenerateForSetup = useApp((s) => s.regenerateForSetup);
  const profile = useApp((s) => s.profile);
  const activeSetup = useApp((s) => s.activeSetup);

  // Re-running onboarding revises the setup you already have. Minting a new one
  // left people with two places both called "Home", each with their own plans.
  const rerun = search.get("again") === "1";

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ place: ["home"] });
  const [busy, setBusy] = useState(false);

  /**
   * The step list is computed, not fixed: where someone trains changes what we
   * need to ask next. A gym gets a preset then "anything missing"; a home gets
   * an equipment list then the space constraints that actually matter there.
   */
  const steps = useMemo<Step[]>(() => {
    const place = answers["place"]?.[0] ?? "home";
    const list: Step[] = [GOAL_STEP, PLACE_STEP];

    if (place === "gym") {
      list.push(GYM_PRESET_STEP);
      const preset = answers["preset"]?.[0];
      if (preset) list.push(gymConfirmStep(preset));
    } else {
      list.push(HOME_KIT_STEP, CONSTRAINTS_STEP);
    }

    list.push(LEVEL_STEP, TIME_STEP, LIMITS_STEP);
    return list;
  }, [answers]);

  const step = steps[Math.min(index, steps.length - 1)]!;
  const picked = answers[step.key] ?? [];
  const isLast = index === steps.length - 1;

  const choose = (value: string) => {
    setAnswers((prev) => {
      const current = prev[step.key] ?? [];
      if (!step.multi) return { ...prev, [step.key]: [value] };

      // "Bodyweight only" and "Nothing right now" clear everything else.
      if (step.exclusive && value === step.exclusive) {
        return { ...prev, [step.key]: current.includes(value) ? [] : [value] };
      }
      const without = current.filter((v) => v !== step.exclusive);
      return {
        ...prev,
        [step.key]: without.includes(value)
          ? without.filter((v) => v !== value)
          : [...without, value],
      };
    });
  };

  const canContinue = step.multi || picked.length > 0;

  const finish = async () => {
    setBusy(true);
    try {
      const [days, minutes] = (answers["time"]?.[0] ?? "3:30").split(":").map(Number);
      const limits = (answers["limits"] ?? []).filter((l) => l !== "none") as Limitation[];
      const place = (answers["place"]?.[0] ?? "home") as Setup["location"];

      let equipment: EquipmentId[];
      if (place === "gym") {
        const preset = GYM_PRESETS.find((p) => p.id === answers["preset"]?.[0]);
        // The confirm step records what is MISSING, so remove those.
        const missing = new Set(answers["gymKit"] ?? []);
        equipment = (preset?.equipment ?? []).filter((id) => !missing.has(id));
      } else {
        equipment = (answers["kit"] ?? []).filter((v) => v !== "none") as EquipmentId[];
      }

      const constraints = answers["constraints"] ?? [];
      const now = Date.now();
      const existing = rerun ? activeSetup : null;
      const setup: Setup = {
        id: existing?.id ?? (newId("setup") as SetupId),
        name:
          existing?.name ??
          (place === "gym" ? "My gym" : place === "outdoors" ? "Outdoors" : "Home"),
        location: place,
        equipment,
        constraints: {
          tightSpace: constraints.includes("tightSpace"),
          noJumping: constraints.includes("noJumping"),
          quiet: constraints.includes("quiet"),
        },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      // Only the answers this flow actually asked for. Spreading a whole default
      // profile reset the accent, units, contrast and workout settings every
      // time someone came back through here.
      await updateProfile({
        ...(profile ? {} : defaultProfile()),
        goal: (answers["goal"]?.[0] ?? "general") as Goal,
        experience: (answers["level"]?.[0] ?? "returning") as Experience,
        schedule: { daysPerWeek: days ?? 3, minutesPerSession: minutes ?? 30 },
        limitations: limits,
        // Safety rule 7: pressing the button under the disclaimer is the
        // acknowledgement, and the workout route refuses to start without it.
        disclaimerAcceptedAt: now,
      });

      const saved = await upsertSetup(setup);
      await setActiveSetupId(saved.id);
      await useApp.getState().activateSetup(saved.id);
      await regenerateForSetup(saved);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <div className="px-[22px] pt-[60px]">
        <Segments total={steps.length} filled={index + 1} />

        <div className="mt-[26px] flex items-baseline gap-[10px]">
          <div
            className="text-acc"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 112',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "-.01em",
            }}
          >
            {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
          </div>
          <Kicker>{step.kicker}</Kicker>
        </div>

        <Display size="step" className="mt-3">
          {step.title}
        </Display>
        <p className="mt-[10px] pb-[22px] text-[14px] leading-[1.5] text-t3">{step.sub}</p>
      </div>

      <ScrollArea className="border-t border-hair-08">
        {step.options.map((option) => {
          const on = picked.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              aria-pressed={on}
              className="relative flex h-[62px] w-full items-center gap-3 border-b border-hair-07 px-[22px] text-left transition-colors hover:bg-white/3"
              style={on ? { background: "var(--acc)" } : undefined}
            >
              <div
                className="h-[9px] w-[9px] shrink-0"
                style={
                  on
                    ? { background: "var(--color-screen)" }
                    : { border: "1px solid var(--color-line1)" }
                }
              />
              <div
                className="flex-1 text-[16.5px] tracking-[-.01em]"
                style={{
                  fontWeight: on ? 600 : 500,
                  color: on ? "var(--color-screen)" : "var(--color-t1)",
                }}
              >
                {option.label}
              </div>
              <div
                className="max-w-[132px] text-right text-[11.5px] leading-[1.3]"
                style={{
                  fontWeight: on ? 600 : 400,
                  color: on ? "rgba(8,9,11,.62)" : "var(--color-t4)",
                }}
              >
                {option.note}
              </div>
            </button>
          );
        })}

        {isLast && (
          <div className="border-t border-hair-08 px-[22px] py-5">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.2em] text-t4">
              Before you start
            </div>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-t3">
              FORM builds general fitness plans and is not medical advice. If you have an
              injury or a condition, check with a professional before starting. Stop if
              something hurts.
            </p>
            <p className="mt-2 text-[12px] leading-[1.6] text-t5">
              Building your plan confirms you have read this.
            </p>
          </div>
        )}
      </ScrollArea>

      <div
        className="flex items-center gap-4 border-t border-hair-08 bg-bar px-[22px] pt-4"
        style={{ paddingBottom: "max(34px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-[13px] font-semibold tracking-[.02em] text-t4 transition-colors hover:text-t1 disabled:opacity-30"
        >
          Back
        </button>
        <PillButton
          className="flex-1"
          disabled={!canContinue || busy}
          onClick={() => (isLast ? void finish() : setIndex((i) => i + 1))}
        >
          {busy ? "Building…" : isLast ? "Build my plan" : "Continue"}
        </PillButton>
      </div>
    </Screen>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OnboardingFlow />
    </Suspense>
  );
}
