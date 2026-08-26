"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  resolveTier,
  type EquipmentId,
  type Experience,
  type Goal,
  type Limitation,
  type Setup,
  type SetupId,
} from "@form/core";

import {
  EquipmentPicker,
  constraintSummary,
  equipmentSummary,
} from "@/components/equipment-picker";
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

const LEVELS: Array<{ value: Experience; label: string }> = [
  { value: "new", label: "Brand new" },
  { value: "returning", label: "Coming back" },
  { value: "regular", label: "Fairly regular" },
  { value: "consistent", label: "Very consistent" },
];

const LIMITS: Array<{ value: Limitation; label: string }> = [
  { value: "knees", label: "Knees" },
  { value: "lower-back", label: "Lower back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "wrists", label: "Wrists" },
  { value: "neck", label: "Neck" },
];

const sameSet = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

type KitDraft = {
  setupId: SetupId;
  equipment: EquipmentId[];
  constraints: Setup["constraints"];
};

/**
 * Building a plan asks every question onboarding asked, because every one of
 * them changes the plan. Equipment moves, gyms replace machines, and a knee
 * that was fine in January is not automatically fine in June -- so the answers
 * are confirmed here rather than inherited silently from the first plan.
 */
export default function NewPlanPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const {
    setups,
    profile,
    activeSetup,
    addGeneratedPlan,
    addCustomPlan,
    upsertSetup,
    updateProfile,
    regenerateAll,
  } = useApp();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal>("strength");
  const [setupId, setSetupId] = useState<SetupId | null>(null);
  const [days, setDays] = useState(3);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [openKit, setOpenKit] = useState(false);

  // Null means "whatever the setup and profile already say". Switching setups
  // drops a kit draft that belonged to a different place, which is why the
  // draft carries its own setupId rather than living in an effect.
  const [kitDraft, setKitDraft] = useState<KitDraft | null>(null);
  const [levelDraft, setLevelDraft] = useState<Experience | null>(null);
  const [limitDraft, setLimitDraft] = useState<Limitation[] | null>(null);

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

  const kit: KitDraft =
    kitDraft && kitDraft.setupId === chosenSetup.id
      ? kitDraft
      : {
          setupId: chosenSetup.id,
          equipment: chosenSetup.equipment,
          constraints: chosenSetup.constraints,
        };

  const experience = levelDraft ?? profile.experience;
  const limitations = limitDraft ?? profile.limitations;

  const kitChanged =
    !sameSet(kit.equipment, chosenSetup.equipment) ||
    (["tightSpace", "noJumping", "quiet"] as const).some(
      (key) => Boolean(kit.constraints[key]) !== Boolean(chosenSetup.constraints[key])
    );
  const profileChanged =
    experience !== profile.experience || !sameSet(limitations, profile.limitations);

  const tier = resolveTier(kit.equipment);
  const spaceNotes = constraintSummary(kit.constraints);

  const toggleLimit = (value: Limitation) =>
    setLimitDraft(
      limitations.includes(value)
        ? limitations.filter((l) => l !== value)
        : [...limitations, value]
    );

  const create = async (mode: "generated" | "custom") => {
    setBusy(true);
    try {
      // Corrections land before the plan is built, so it is built from what is
      // true now -- and so every other generated plan stops being wrong too.
      let target = chosenSetup;
      if (kitChanged) {
        target = await upsertSetup({
          ...chosenSetup,
          equipment: kit.equipment,
          constraints: kit.constraints,
        });
      }
      if (profileChanged) await updateProfile({ experience, limitations });
      if (kitChanged || profileChanged) await regenerateAll();

      const schedule = { daysPerWeek: days, minutesPerSession: minutes };
      const plan =
        mode === "generated"
          ? await addGeneratedPlan(target, {
              goal,
              schedule,
              ...(name.trim() ? { name: name.trim() } : {}),
            })
          : await addCustomPlan(target, {
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
            Everything that shapes a plan is on this screen. Change whatever has moved
            since last time — the plan is built from these answers, not the old ones.
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
          <Link
            href="/setups/new"
            className="rounded-full border border-dashed border-hair-14 px-4 py-2 text-[12.5px] font-semibold text-t4 transition-colors hover:border-acc hover:text-acc"
          >
            Add a place
          </Link>
        </div>

        <div className="px-[22px] pt-5">
          <div
            className="rounded-[14px] border border-hair-12 p-4"
            style={{ background: "rgba(255,255,255,.02)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <Kicker tone="accent">{tier.replace("-", " ")}</Kicker>
              <button
                type="button"
                onClick={() => setOpenKit((v) => !v)}
                aria-expanded={openKit}
                className="shrink-0 text-[12px] font-semibold text-t3 underline underline-offset-4 transition-colors hover:text-acc"
              >
                {openKit ? "Done" : "Change"}
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-t2">
              {equipmentSummary(kit.equipment)}
            </p>
            {spaceNotes.length > 0 && (
              <p className="mt-[6px] text-[12px] text-t4">{spaceNotes.join(" · ")}</p>
            )}
            <p className="mt-[6px] text-[12px] leading-[1.45] text-t5">
              The plan is built for what is actually here. Nothing you do not have is
              ever prescribed.
            </p>
          </div>
        </div>

        {openKit && (
          <>
            <EquipmentPicker
              equipment={kit.equipment}
              constraints={kit.constraints}
              onEquipmentChange={(equipment) => setKitDraft({ ...kit, equipment })}
              onConstraintsChange={(constraints) => setKitDraft({ ...kit, constraints })}
            />
            <p className="px-[22px] pt-4 text-[12px] leading-[1.5] text-t5">
              This is what {chosenSetup.name} has, so saving it also rebuilds the other
              plans we built for {chosenSetup.name}. Plans you edited yourself are left
              alone.
            </p>
          </>
        )}

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

        <Kicker className="px-[22px] pb-3 pt-8">Recent training</Kicker>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {LEVELS.map((level) => (
            <Chip
              key={level.value}
              on={experience === level.value}
              onClick={() => setLevelDraft(level.value)}
            >
              {level.label}
            </Chip>
          ))}
        </div>
        <p className="px-[22px] pt-2 text-[12px] leading-[1.5] text-t5">
          This caps how much we prescribe and which movements are allowed at all.
        </p>

        <Kicker className="px-[22px] pb-3 pt-8">Working around</Kicker>
        <div className="flex flex-wrap gap-2 px-[22px]">
          <Chip on={limitations.length === 0} onClick={() => setLimitDraft([])}>
            Nothing right now
          </Chip>
          {LIMITS.map((limit) => (
            <Chip
              key={limit.value}
              on={limitations.includes(limit.value)}
              onClick={() => toggleLimit(limit.value)}
            >
              {limit.label}
            </Chip>
          ))}
        </div>
        <p className="px-[22px] pt-2 text-[12px] leading-[1.5] text-t5">
          Every exercise that loads these is removed. This is about your body rather
          than one plan, so changing it rebuilds every plan we built for you.
        </p>

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
