"use client";

import type { EquipmentId, Setup } from "@form/core";

import { Kicker } from "@/components/ui";

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

const CONSTRAINTS = [
  ["tightSpace", "Tight on space", "No room to lie down or lunge"],
  ["noJumping", "No jumping", "Neighbours below"],
  ["quiet", "Keep it quiet", "No dropping weights"],
] as const;

export function equipmentLabel(id: EquipmentId): string {
  return ALL_EQUIPMENT.find((e) => e.id === id)?.label ?? id;
}

/** One line naming what is actually there, for screens that only confirm it. */
export function equipmentSummary(equipment: EquipmentId[]): string {
  if (equipment.length === 0) return "Bodyweight only — nothing else needed";
  const named = ALL_EQUIPMENT.filter((e) => equipment.includes(e.id)).map((e) => e.label);
  return named.join(", ");
}

export function constraintSummary(constraints: Setup["constraints"]): string[] {
  return CONSTRAINTS.filter(([key]) => constraints[key]).map(([, label]) => label);
}

/**
 * The equipment and space questions, shared by the setup editor and the
 * new-plan screen. Both are asking the same thing -- what is actually here --
 * and a plan built against a stale answer is the failure this prevents.
 */
export function EquipmentPicker({
  equipment,
  constraints,
  onEquipmentChange,
  onConstraintsChange,
}: {
  equipment: EquipmentId[];
  constraints: Setup["constraints"];
  onEquipmentChange(next: EquipmentId[]): void;
  onConstraintsChange(next: Setup["constraints"]): void;
}) {
  const toggle = (id: EquipmentId) =>
    onEquipmentChange(
      equipment.includes(id) ? equipment.filter((e) => e !== id) : [...equipment, id]
    );

  return (
    <>
      {GROUPS.map((group) => (
        <div key={group}>
          <Kicker className="px-[22px] pb-2 pt-7">{group}</Kicker>
          {ALL_EQUIPMENT.filter((e) => e.group === group).map((item) => {
            const on = equipment.includes(item.id);
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
                    on ? { background: "var(--acc)" } : { border: "1px solid var(--color-line1)" }
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
      {CONSTRAINTS.map(([key, label, note]) => {
        const on = constraints[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onConstraintsChange({ ...constraints, [key]: !constraints[key] })}
            aria-pressed={on}
            className="flex w-full items-center gap-3 border-t border-hair-07 px-[22px] py-[14px] text-left transition-colors hover:bg-white/3"
          >
            <div
              className="h-[9px] w-[9px] shrink-0"
              style={on ? { background: "var(--acc)" } : { border: "1px solid var(--color-line1)" }}
            />
            <div className="flex-1">
              <div
                className="text-[15px]"
                style={{ color: on ? "var(--color-t1)" : "var(--color-t3)" }}
              >
                {label}
              </div>
              <div className="mt-[2px] text-[12px] text-t5">{note}</div>
            </div>
          </button>
        );
      })}
    </>
  );
}
