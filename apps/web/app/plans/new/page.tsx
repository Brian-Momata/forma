"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveTier, type Goal, type SetupId } from "@form/core";

import { Display, Kicker, PillButton, Screen, ScrollArea } from "@/components/ui";
import { BackLink } from "@/components/ui/nav";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

const GOALS: Array<{ value: Goal; label: string; note: string }> = [
  { value: "strength", label: "Build strength", note: "Heavier sets, longer rest" },
  { value: "fat-loss", label: "Lose fat", note: "Circuits, shorter rest" },
  { value: "mobility", label: "Improve mobility", note: "Stretching and control" },
  { value: "endurance", label: "Build endurance", note: "Higher reps, steady pace" },
  { value: "general", label: "General fitness", note: "A balanced mix" },
];

export default function NewPlanPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const { setups, profile, activeSetup, addGeneratedPlan, addCustomPlan } = useApp();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal>("strength");
  const [setupId, setSetupId] = useState<SetupId | null>(null);
  const [days, setDays] = useState(3);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);

  const chosenSetup = setups.find((s) => s.id === setupId) ?? activeSetup ?? setups[0];

  if (!ready || !profile || !chosenSetup) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="text-[13px] text-t4">
            {ready ? "Add a setup first, so we know where you are training." : "Loading…"}
          </div>
        </div>
      </Screen>
    );
  }

  const create = async (mode: "generated" | "custom") => {
    setBusy(true);
    try {
      const schedule = { daysPerWeek: days, minutesPerSession: minutes };
      const plan =
        mode === "generated"
          ? await addGeneratedPlan(chosenSetup, { goal, schedule, ...(name.trim() ? { name: name.trim() } : {}) })
          : await addCustomPlan(chosenSetup, {
              goal,
              schedule,
              name: name.trim() || "My plan",
            });
      if (plan) router.replace(mode === "custom" ? `/plan/${plan.id}` : "/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <BackLink href="/plans" />
          <Display size="title" className="mt-4">
            New plan
          </Display>
          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-t3">
            You can keep as many plans as you like — a strength block at the gym and a
            mobility plan at home run side by side.
          </p>

          <label className="mt-7 block">
            <Kicker>Name</Kicker>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional — we'll name it for you"
              className="mt-2 h-[50px] w-full rounded-full border border-hair-14 bg-transparent px-4 text-[15px] text-t1 outline-none placeholder:text-t5 focus:border-acc"
            />
          </label>
        </div>

        <Kicker className="px-[22px] pb-3 pt-8">Where</Kicker>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {setups.map((setup) => (
            <Chip
              key={setup.id}
              on={chosenSetup.id === setup.id}
              onClick={() => setSetupId(setup.id)}
            >
              {setup.name}
            </Chip>
          ))}
        </div>
        <p className="px-[22px] pt-2 text-[12px] text-t5">
          {resolveTier(chosenSetup.equipment).replace("-", " ")} — the plan is built for
          what is actually there.
        </p>

        <Kicker className="px-[22px] pb-3 pt-8">Training for</Kicker>
        {GOALS.map((option) => {
          const on = goal === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setGoal(option.value)}
              aria-pressed={on}
              className="flex h-[62px] w-full items-center gap-3 border-t border-hair-07 px-[22px] text-left transition-colors hover:bg-white/3"
              style={on ? { background: "var(--acc)" } : undefined}
            >
              <div
                className="h-[9px] w-[9px] shrink-0"
                style={
                  on ? { background: "var(--color-screen)" } : { border: "1px solid var(--color-line1)" }
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
                style={{ color: on ? "rgba(8,9,11,.62)" : "var(--color-t4)" }}
              >
                {option.note}
              </div>
            </button>
          );
        })}

        <Kicker className="px-[22px] pb-3 pt-8">Each week</Kicker>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <Chip key={d} on={days === d} onClick={() => setDays(d)}>
              {d} {d === 1 ? "day" : "days"}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-[22px] pt-2">
          {[20, 30, 45, 60, 75].map((m) => (
            <Chip key={m} on={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </Chip>
          ))}
        </div>

        <div className="px-[22px] pb-8 pt-10">
          <PillButton className="w-full" disabled={busy} onClick={() => void create("generated")}>
            {busy ? "Building…" : "Build it for me"}
          </PillButton>
          <PillButton
            variant="outline"
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => void create("custom")}
          >
            Start empty and pick my own
          </PillButton>
          <p className="mt-3 text-[12px] leading-[1.5] text-t5">
            An empty plan gives you the whole exercise library and your own sets, reps
            and rest. You can edit a built plan just as freely.
          </p>
        </div>
      </ScrollArea>
    </Screen>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors"
      style={
        on
          ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--color-screen)" }
          : { borderColor: "rgba(255,255,255,.14)", color: "var(--color-t2)" }
      }
    >
      {children}
    </button>
  );
}
