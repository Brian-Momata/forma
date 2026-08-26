import { GYM_PRESETS, HOME_EQUIPMENT, type EquipmentId } from "@form/core";

/**
 * Onboarding content.
 *
 * Wording is ported from the design's own `OB` array. The structure differs in
 * one deliberate way: the location and equipment steps now build a *Setup*,
 * because the situation is the input to the plan rather than a filter over it.
 * That is also why the gym path asks for a preset and then what is missing --
 * "my gym has no leg press" should take two taps, not an inventory audit.
 */

export interface Option {
  value: string;
  label: string;
  note: string;
}

export interface Step {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  multi: boolean;
  /** A choice that clears every other choice in the same step. */
  exclusive?: string;
  options: Option[];
}

export const GOAL_STEP: Step = {
  key: "goal",
  kicker: "Goal",
  title: "What are you training for?",
  sub: "This sets the shape of every session.",
  multi: false,
  options: [
    { value: "strength", label: "Build strength", note: "Heavier sets, longer rest" },
    { value: "fat-loss", label: "Lose fat", note: "Circuits, shorter rest" },
    { value: "mobility", label: "Improve mobility", note: "Stretching and control" },
    { value: "endurance", label: "Build endurance", note: "Higher reps, steady pace" },
    { value: "general", label: "General fitness", note: "A balanced mix" },
  ],
};

export const PLACE_STEP: Step = {
  key: "place",
  kicker: "Location",
  title: "Where will you train?",
  sub: "You can add more places later and switch between them.",
  multi: false,
  options: [
    { value: "home", label: "At home", note: "Small space, quiet options" },
    { value: "gym", label: "At the gym", note: "Full equipment access" },
    { value: "outdoors", label: "Outdoors", note: "Park, track, open space" },
  ],
};

export const HOME_KIT_STEP: Step = {
  key: "kit",
  kicker: "Equipment",
  title: "What do you have access to?",
  sub: "Pick everything available. Nothing selected means bodyweight only.",
  multi: true,
  exclusive: "none",
  options: [
    { value: "none", label: "Bodyweight only", note: "No equipment" },
    ...HOME_EQUIPMENT.map((e) => ({ value: e.id, label: e.label, note: e.note })),
  ],
};

export const GYM_PRESET_STEP: Step = {
  key: "preset",
  kicker: "Your gym",
  title: "Which kind of gym is it?",
  sub: "Start close, then tell us what yours is missing.",
  multi: false,
  options: GYM_PRESETS.map((p) => ({ value: p.id, label: p.name, note: p.note })),
};

const EQUIPMENT_LABELS: Record<EquipmentId, { label: string; note: string }> = {
  dumbbells: { label: "Dumbbells", note: "Adjustable or fixed" },
  bands: { label: "Resistance bands", note: "Loops or tubes" },
  kettlebell: { label: "Kettlebell", note: "Single or pair" },
  "pullup-bar": { label: "Pull-up bar", note: "Or an assisted machine" },
  bench: { label: "Bench", note: "Flat or adjustable" },
  mat: { label: "Mat", note: "For floor work" },
  barbell: { label: "Barbell", note: "With plates" },
  rack: { label: "Squat rack", note: "Or a power cage" },
  cable: { label: "Cable machine", note: "Any pulley station" },
  machines: { label: "Machines", note: "Press, pulldown, leg press" },
  "medicine-ball": { label: "Medicine ball", note: "Any weight" },
  "exercise-ball": { label: "Exercise ball", note: "Swiss ball" },
  "foam-roller": { label: "Foam roller", note: "For release work" },
  "ez-bar": { label: "EZ curl bar", note: "Cambered bar" },
  box: { label: "Plyo box or step", note: "Any stable platform" },
  suspension: { label: "Suspension trainer", note: "TRX or rings" },
  "cardio-machine": { label: "Cardio machines", note: "Bike, rower, treadmill" },
};

export function gymConfirmStep(presetId: string): Step {
  const preset = GYM_PRESETS.find((p) => p.id === presetId) ?? GYM_PRESETS[0]!;
  return {
    key: "gymKit",
    kicker: "Equipment",
    title: "Anything missing?",
    sub: "Tap anything your gym does not have, so we never build around it.",
    multi: true,
    options: preset.equipment.map((id) => ({
      value: id,
      label: EQUIPMENT_LABELS[id]?.label ?? id,
      note: EQUIPMENT_LABELS[id]?.note ?? "",
    })),
  };
}

export const CONSTRAINTS_STEP: Step = {
  key: "constraints",
  kicker: "Your space",
  title: "Anything about the space?",
  sub: "These are what actually ruin home workouts, so we design around them.",
  multi: true,
  options: [
    { value: "tightSpace", label: "Tight on space", note: "No room to lie down or lunge" },
    { value: "noJumping", label: "No jumping", note: "Neighbours below" },
    { value: "quiet", label: "Keep it quiet", note: "No dropping weights" },
  ],
};

export const LEVEL_STEP: Step = {
  key: "level",
  kicker: "Experience",
  title: "How much recent training?",
  sub: "Honest answers make better first weeks.",
  multi: false,
  options: [
    { value: "new", label: "Brand new", note: "Never trained regularly" },
    { value: "returning", label: "Coming back", note: "Off for a few months" },
    { value: "regular", label: "Fairly regular", note: "1-3 sessions a week" },
    { value: "consistent", label: "Very consistent", note: "4+ sessions a week" },
  ],
};

export const TIME_STEP: Step = {
  key: "time",
  kicker: "Schedule",
  title: "How often, and how long?",
  sub: "We build a week that fits, not one that guilts you.",
  multi: false,
  options: [
    { value: "2:20", label: "2 days · 20 min", note: "Easing in" },
    { value: "3:30", label: "3 days · 30 min", note: "Most popular" },
    { value: "4:30", label: "4 days · 30 min", note: "Steady progress" },
    { value: "5:45", label: "5 days · 45 min", note: "Serious block" },
  ],
};

export const LIMITS_STEP: Step = {
  key: "limits",
  kicker: "Limitations",
  title: "Anything we should work around?",
  sub: "We remove every exercise that loads these areas. Nothing is suggested that we are not confident about.",
  multi: true,
  exclusive: "none",
  options: [
    { value: "none", label: "Nothing right now", note: "Full range" },
    { value: "knees", label: "Knees", note: "No jumping or deep squats" },
    { value: "lower-back", label: "Lower back", note: "No loaded flexion" },
    { value: "shoulders", label: "Shoulders", note: "No overhead pressing" },
    { value: "wrists", label: "Wrists", note: "Fists or handles" },
    { value: "neck", label: "Neck", note: "No neck-loaded holds" },
  ],
};
