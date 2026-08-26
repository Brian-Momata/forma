"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Goal, Limitation } from "@form/core";

import { Display, Kicker, PillButton, Screen, ScrollArea } from "@/components/ui";
import { TabBar } from "@/components/ui/nav";
import { exportAll, importAll, type ExportBundle } from "@/db/repo";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

const ACCENTS = ["#D4FF3F", "#3DE0E0", "#FF8A5B", "#FFB020"];
const REST_COLORS = ["#8A7BFF", "#4E8CFF", "#FF6FA8"];

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "fat-loss", label: "Lose fat" },
  { value: "mobility", label: "Mobility" },
  { value: "endurance", label: "Endurance" },
  { value: "general", label: "General" },
];

const LIMITATIONS: Limitation[] = ["knees", "lower-back", "shoulders", "wrists", "neck"];

export default function YouPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const { profile, updateProfile, regenerateAll, refresh } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!ready || !profile) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[13px] text-t4">Loading…</div>
        </div>
        <TabBar />
      </Screen>
    );
  }

  /**
   * Goal and schedule here are only defaults for plans you create next -- they
   * live on each plan, so changing them must not rewrite plans you already have.
   */
  const setDefault = updateProfile;

  /**
   * Limitations are different: they are a safety input to every generated plan,
   * so they rebuild all of them. Hand-edited plans are left alone.
   */
  const changeLimitations = async (limitations: Limitation[]) => {
    await updateProfile({ limitations });
    await regenerateAll();
  };

  const download = async () => {
    const bundle = await exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `form-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported.");
  };

  const upload = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle;
      await importAll(bundle);
      await refresh();
      setStatus("Imported.");
    } catch {
      setStatus("That file could not be read.");
    }
  };

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <Display size="title">You</Display>
        </div>

        <Kicker className="px-[22px] pb-1 pt-8">Default goal</Kicker>
        <p className="px-[22px] pb-3 text-[12px] leading-[1.5] text-t5">
          Used when you create a new plan. Each plan keeps its own goal, so changing
          this never rewrites a plan you already have.
        </p>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {GOALS.map((g) => (
            <Chip
              key={g.value}
              on={profile.goal === g.value}
              onClick={() => void setDefault({ goal: g.value })}
            >
              {g.label}
            </Chip>
          ))}
        </div>

        <Kicker className="px-[22px] pb-3 pt-8">Default schedule</Kicker>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {[2, 3, 4, 5, 6].map((days) => (
            <Chip
              key={days}
              on={profile.schedule.daysPerWeek === days}
              onClick={() =>
                void setDefault({
                  schedule: { ...profile.schedule, daysPerWeek: days },
                })
              }
            >
              {days} days
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-[22px] pt-2">
          {[20, 30, 45, 60].map((minutes) => (
            <Chip
              key={minutes}
              on={profile.schedule.minutesPerSession === minutes}
              onClick={() =>
                void setDefault({
                  schedule: { ...profile.schedule, minutesPerSession: minutes },
                })
              }
            >
              {minutes} min
            </Chip>
          ))}
        </div>

        <Kicker className="px-[22px] pb-1 pt-8">Working around</Kicker>
        <p className="px-[22px] pb-3 text-[12px] leading-[1.5] text-t5">
          Every exercise that loads these is removed from your plan.
        </p>
        <div className="flex flex-wrap gap-2 px-[22px]">
          {LIMITATIONS.map((limit) => {
            const on = profile.limitations.includes(limit);
            return (
              <Chip
                key={limit}
                on={on}
                onClick={() =>
                  void changeLimitations(
                    on
                      ? profile.limitations.filter((l) => l !== limit)
                      : [...profile.limitations, limit]
                  )
                }
              >
                {limit.replace("-", " ")}
              </Chip>
            );
          })}
        </div>

        <Kicker className="px-[22px] pb-3 pt-8">Accent</Kicker>
        <div className="flex gap-3 px-[22px]">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Accent ${color}`}
              onClick={() => void updateProfile({ accent: color })}
              className="h-9 w-9 rounded-full transition-transform hover:scale-110"
              style={{
                background: color,
                outline: profile.accent === color ? "2px solid var(--color-t1)" : "none",
                outlineOffset: 3,
              }}
            />
          ))}
        </div>
        <div className="flex gap-3 px-[22px] pt-3">
          {REST_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Rest colour ${color}`}
              onClick={() => void updateProfile({ restColor: color })}
              className="h-9 w-9 rounded-full transition-transform hover:scale-110"
              style={{
                background: color,
                outline: profile.restColor === color ? "2px solid var(--color-t1)" : "none",
                outlineOffset: 3,
              }}
            />
          ))}
        </div>

        <Kicker className="px-[22px] pb-3 pt-8">During a workout</Kicker>
        <Toggle
          label="Auto-advance between exercises"
          note="Off means you tap to start each one."
          on={profile.autoAdvance}
          onClick={() => void updateProfile({ autoAdvance: !profile.autoAdvance })}
        />
        <Toggle
          label="Higher contrast text"
          note="Lifts the dimmest labels for readability."
          on={profile.highContrast}
          onClick={() => void updateProfile({ highContrast: !profile.highContrast })}
        />
        <div className="border-t border-hair-07 px-[22px] py-[15px]">
          <div className="text-[15px]">Rest between sets</div>
          <div className="mt-[3px] text-[12px] text-t4">
            {profile.restOverrideSec === null
              ? "Using what each exercise prescribes"
              : `Fixed at ${profile.restOverrideSec}s`}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip
              on={profile.restOverrideSec === null}
              onClick={() => void updateProfile({ restOverrideSec: null })}
            >
              Prescribed
            </Chip>
            {[30, 45, 60, 90, 120].map((sec) => (
              <Chip
                key={sec}
                on={profile.restOverrideSec === sec}
                onClick={() => void updateProfile({ restOverrideSec: sec })}
              >
                {sec}s
              </Chip>
            ))}
          </div>
        </div>

        <Kicker className="px-[22px] pb-1 pt-8">Units</Kicker>
        <div className="flex gap-2 px-[22px] pt-2">
          {(["kg", "lb"] as const).map((unit) => (
            <Chip
              key={unit}
              on={profile.units === unit}
              onClick={() => void updateProfile({ units: unit })}
            >
              {unit}
            </Chip>
          ))}
        </div>

        <Kicker className="px-[22px] pb-1 pt-8">Your data</Kicker>
        <p className="px-[22px] pb-3 text-[12px] leading-[1.5] text-t5">
          Everything lives on this device only. Export a copy so a lost phone is not a
          lost history.
        </p>
        <div className="flex gap-2 px-[22px]">
          <PillButton variant="outline" className="flex-1" onClick={() => void download()}>
            Export
          </PillButton>
          <PillButton
            variant="outline"
            className="flex-1"
            onClick={() => fileRef.current?.click()}
          >
            Import
          </PillButton>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
        {status && <p className="px-[22px] pt-3 text-[12px] text-acc">{status}</p>}

        <button
          type="button"
          onClick={() => router.push("/onboarding")}
          className="mt-8 w-full border-t border-hair-07 px-[22px] py-5 text-left text-[13px] font-semibold text-t5 hover:text-t2"
        >
          Run onboarding again
        </button>

        <p className="px-[22px] py-6 text-[11.5px] leading-[1.6] text-t5">
          FORM builds general fitness plans and is not medical advice. Stop if something
          hurts. Exercise data from free-exercise-db, public domain.
        </p>
      </ScrollArea>
      <TabBar />
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
      className="rounded-full border px-4 py-2 text-[12.5px] font-semibold capitalize transition-colors"
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

function Toggle({
  label,
  note,
  on,
  onClick,
}: {
  label: string;
  note: string;
  on: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex w-full items-center gap-4 border-t border-hair-07 px-[22px] py-[15px] text-left"
    >
      <div className="flex-1">
        <div className="text-[15px]">{label}</div>
        <div className="mt-[2px] text-[12px] text-t4">{note}</div>
      </div>
      <div
        className="h-[26px] w-[44px] shrink-0 rounded-full p-[3px] transition-colors"
        style={{ background: on ? "var(--acc)" : "rgba(255,255,255,.14)" }}
      >
        <div
          className="h-5 w-5 rounded-full bg-screen transition-transform"
          style={{ transform: on ? "translateX(18px)" : "none" }}
        />
      </div>
    </button>
  );
}
