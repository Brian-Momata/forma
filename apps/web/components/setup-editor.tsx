"use client";

import { useState } from "react";
import {
  GYM_PRESETS,
  resolveTier,
  type EquipmentId,
  type Setup,
} from "@form/core";

import { Display, Kicker, PillButton, ScrollArea } from "@/components/ui";

const ALL_EQUIPMENT: Array<{ id: EquipmentId; label: string; group: string }> = [
  { id: "dumbbells", label: "Dumbbells", group: "Free weights" },
  { id: "barbell", label: "Barbell", group: "Free weights" },
  { id: "kettlebell", label: "Kettlebell", group: "Free weights" },
  { id: "ez-bar", label: "EZ curl bar", group: "Free weights" },
  { id: "rack", label: "Squat rack", group: "Stations" },
  { id: "bench", label: "Bench or step", group: "Stations" },
  { id: "cable", label: "Cable machine", group: "Stations" },
  { id: "machines", label: "Machines", group: "Stations" },
  { id: "pullup-bar", label: "Pull-up bar", group: "Stations" },
  { id: "cardio-machine", label: "Cardio machines", group: "Stations" },
  { id: "bands", label: "Resistance bands", group: "Small kit" },
  { id: "suspension", label: "Suspension trainer", group: "Small kit" },
  { id: "medicine-ball", label: "Medicine ball", group: "Small kit" },
  { id: "exercise-ball", label: "Exercise ball", group: "Small kit" },
  { id: "box", label: "Plyo box", group: "Small kit" },
  { id: "mat", label: "Mat", group: "Small kit" },
  { id: "foam-roller", label: "Foam roller", group: "Small kit" },
];

const GROUPS = ["Free weights", "Stations", "Small kit"] as const;

const TIER_COPY: Record<string, string> = {
  bodyweight: "Bodyweight programming: higher reps, and you progress by moving to harder variations.",
  minimal: "Minimal kit: time under tension, and you progress by moving to harder variations.",
  dumbbell: "Dumbbell programming: unilateral work, and you progress by adding reps then weight.",
  "home-gym": "Home gym programming: barbell compounds, and you progress by adding weight.",
  "full-gym": "Full gym programming: compounds first, machine accessories, and you progress by adding weight.",
};

/**
 * Editing a setup is editing the plan, because the situation is the input.
 * The tier line updates live so it is obvious that adding a barbell does not
 * merely add barbell exercises -- it changes how the whole plan is built.
 */
export function SetupEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Setup;
  onSave(setup: Setup): void | Promise<void>;
  onCancel(): void;
  onDelete?: (() => void | Promise<void>) | undefined;
}) {
  const [draft, setDraft] = useState<Setup>(initial);
  const tier = resolveTier(draft.equipment);

  const toggle = (id: EquipmentId) =>
    setDraft((d) => ({
      ...d,
      equipment: d.equipment.includes(id)
        ? d.equipment.filter((e) => e !== id)
        : [...d.equipment, id],
    }));

  const applyPreset = (presetId: string) => {
    const preset = GYM_PRESETS.find((p) => p.id === presetId);
    if (preset) setDraft((d) => ({ ...d, equipment: [...preset.equipment] }));
  };

  return (
    <>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <Display size="title">{initial.name ? "Edit setup" : "New setup"}</Display>
          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-t3">
            A setup is one place you train. Most people have two or three and switch
            between them.
          </p>

          <label className="mt-6 block">
            <Kicker>Name</Kicker>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Home, my gym, hotel…"
              className="mt-2 h-[50px] w-full rounded-full border border-hair-14 bg-transparent px-4 text-[15px] text-t1 outline-none placeholder:text-t5 focus:border-acc"
            />
          </label>

          <Kicker className="mt-6">Where</Kicker>
          <div className="mt-2 flex gap-2">
            {(["home", "gym", "outdoors"] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, location: loc }))}
                className="flex-1 rounded-full border py-3 text-[13px] font-semibold capitalize transition-colors"
                style={
                  draft.location === loc
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--color-screen)" }
                    : { borderColor: "rgba(255,255,255,.14)", color: "var(--color-t2)" }
                }
              >
                {loc}
              </button>
            ))}
          </div>

          {draft.location === "gym" && (
            <>
              <Kicker className="mt-6">Start from a preset</Kicker>
              <div className="mt-2 flex flex-wrap gap-2 pb-2">
                {GYM_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="rounded-full border border-hair-14 px-4 py-2 text-[12.5px] font-semibold text-t2 transition-colors hover:border-acc hover:text-acc"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-[12px] leading-[1.5] text-t5">
                Then untick anything yours does not have.
              </p>
            </>
          )}

          <div
            className="mt-6 rounded-[14px] border border-hair-12 p-4"
            style={{ background: "rgba(255,255,255,.02)" }}
          >
            <Kicker tone="accent">{tier.replace("-", " ")}</Kicker>
            <p className="mt-2 text-[13px] leading-[1.5] text-t2">{TIER_COPY[tier]}</p>
          </div>
        </div>

        {GROUPS.map((group) => (
          <div key={group}>
            <Kicker className="px-[22px] pb-2 pt-7">{group}</Kicker>
            {ALL_EQUIPMENT.filter((e) => e.group === group).map((item) => {
              const on = draft.equipment.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 border-t border-hair-07 px-[22px] py-[14px] text-left transition-colors hover:bg-white/3"
                >
                  <div
                    className="h-[9px] w-[9px] shrink-0"
                    style={
                      on
                        ? { background: "var(--acc)" }
                        : { border: "1px solid var(--color-line1)" }
                    }
                  />
                  <div
                    className="flex-1 text-[15px]"
                    style={{ color: on ? "var(--color-t1)" : "var(--color-t3)" }}
                  >
                    {item.label}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        <Kicker className="px-[22px] pb-2 pt-7">Constraints</Kicker>
        {(
          [
            ["tightSpace", "Tight on space", "No room to lie down or lunge"],
            ["noJumping", "No jumping", "Neighbours below"],
            ["quiet", "Keep it quiet", "No dropping weights"],
          ] as const
        ).map(([key, label, note]) => {
          const on = draft.constraints[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  constraints: { ...d.constraints, [key]: !d.constraints[key] },
                }))
              }
              aria-pressed={on}
              className="flex w-full items-center gap-3 border-t border-hair-07 px-[22px] py-[14px] text-left transition-colors hover:bg-white/3"
            >
              <div
                className="h-[9px] w-[9px] shrink-0"
                style={on ? { background: "var(--acc)" } : { border: "1px solid var(--color-line1)" }}
              />
              <div className="flex-1">
                <div className="text-[15px]" style={{ color: on ? "var(--color-t1)" : "var(--color-t3)" }}>
                  {label}
                </div>
                <div className="mt-[2px] text-[12px] text-t5">{note}</div>
              </div>
            </button>
          );
        })}

        {onDelete && (
          <button
            type="button"
            onClick={() => void onDelete()}
            className="mt-8 w-full border-t border-hair-07 px-[22px] py-5 text-left text-[13px] font-semibold text-t5 hover:text-[#FF6B6B]"
          >
            Delete this setup
          </button>
        )}

        <div className="h-6" />
      </ScrollArea>

      <div
        className="flex gap-3 border-t border-hair-08 bg-screen/85 px-[22px] pt-[14px] backdrop-blur-[18px]"
        style={{ paddingBottom: "max(34px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] font-semibold text-t4 transition-colors hover:text-t1"
        >
          Cancel
        </button>
        <PillButton
          className="flex-1"
          disabled={!draft.name.trim()}
          onClick={() => void onSave(draft)}
        >
          Save setup
        </PillButton>
      </div>
    </>
  );
}
