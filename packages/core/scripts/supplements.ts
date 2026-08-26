/**
 * Hand-authored exercises the source dataset lacks.
 *
 * free-exercise-db is broad but skews to gym equipment. It contains no jumping
 * jacks, no burpee, no wall sit, no pike push-up, and almost nothing for
 * bodyweight vertical pushing or pulling. Without these, a no-equipment plan
 * cannot fill several pattern slots at all -- which would break the core
 * promise of the app. These fill the gaps.
 *
 * They carry no photos (the source's images are not ours to remap onto a
 * different movement), so the UI falls back to a cue-forward layout.
 */
import type { Exercise } from "../src/types.ts";

type Draft = Omit<Exercise, "id"> & { id: string };

const ex = (
  id: string,
  name: string,
  rest: Partial<Draft> & Pick<Draft, "pattern" | "cues" | "defaults">
): Draft =>
  ({
    id,
    name,
    requires: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    kind: "reps",
    level: "beginner",
    mechanic: "compound",
    contraindications: [],
    isJumping: false,
    isLoud: false,
    spaceNeeded: "tight",
    unilateral: false,
    images: [],
    chainId: null,
    chainRank: null,
    core: true,
    ...rest,
  }) as Draft;

const reps = (sets: number, r: number, restSec: number) => ({ sets, reps: r, restSec });
const time = (sets: number, durationSec: number, restSec: number) => ({
  sets,
  durationSec,
  restSec,
});

export const SUPPLEMENTS: Draft[] = [
  /* ---------------- gait / conditioning ---------------- */
  ex("Jumping_Jacks", "Jumping Jacks", {
    pattern: "gait",
    kind: "time",
    primaryMuscles: ["calves"],
    secondaryMuscles: ["shoulders", "quadriceps"],
    isJumping: true,
    isLoud: true,
    contraindications: ["knees"],
    cues: ["Land softly through the whole foot", "Keep knees soft, never locked out"],
    defaults: time(2, 40, 20),
  }),
  ex("March_In_Place", "March in Place", {
    pattern: "gait",
    kind: "time",
    primaryMuscles: ["quadriceps"],
    cues: ["Drive the knee to hip height", "Stay tall, ribs stacked over hips"],
    defaults: time(2, 40, 20),
  }),
  ex("High_Knees", "High Knees", {
    pattern: "gait",
    kind: "time",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["calves", "abdominals"],
    isJumping: true,
    isLoud: true,
    contraindications: ["knees"],
    cues: ["Stay on the balls of your feet", "Quick, light contacts with the floor"],
    defaults: time(2, 30, 30),
  }),
  ex("Burpee", "Burpee", {
    pattern: "gait",
    primaryMuscles: ["quadriceps", "chest"],
    secondaryMuscles: ["abdominals", "shoulders"],
    isJumping: true,
    isLoud: true,
    spaceNeeded: "normal",
    level: "intermediate",
    contraindications: ["knees", "wrists", "lower-back"],
    cues: ["Plant both hands before stepping back", "Stand fully tall at the top"],
    defaults: reps(3, 8, 60),
  }),

  /* ---------------- squat ---------------- */
  ex("Wall_Sit", "Wall Sit", {
    pattern: "squat",
    kind: "time",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    contraindications: ["knees"],
    cues: ["Thighs parallel, back flat to the wall", "Push through the heels, breathe steadily"],
    defaults: time(2, 40, 45),
  }),
  ex("Bodyweight_Box_Squat", "Box Squat to Bench", {
    pattern: "squat",
    requires: ["bench"],
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    cues: ["Sit back to the box, don't drop", "Stand up without rocking forward"],
    defaults: reps(3, 12, 60),
  }),
  ex("Assisted_Squat", "Assisted Squat", {
    pattern: "squat",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    chainId: "squat-bw",
    chainRank: 1,
    cues: ["Hold a doorframe for balance only", "Sit between the hips, chest tall"],
    defaults: reps(2, 10, 60),
  }),
  ex("Pistol_Squat", "Pistol Squat", {
    pattern: "squat",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "abdominals"],
    level: "expert",
    unilateral: true,
    core: false,
    chainId: "squat-bw",
    chainRank: 5,
    contraindications: ["knees"],
    cues: ["Reach the arms forward to counterbalance", "Control the descent, no collapsing"],
    defaults: reps(3, 5, 90),
  }),

  /* ---------------- hinge ---------------- */
  ex("Bodyweight_Good_Morning", "Bodyweight Good Morning", {
    pattern: "hinge",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower-back"],
    contraindications: ["lower-back"],
    cues: ["Push the hips back, shins vertical", "Stop when the hamstrings tighten"],
    defaults: reps(2, 12, 45),
  }),
  ex("Glute_Bridge_March", "Glute Bridge March", {
    pattern: "hinge",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "abdominals"],
    unilateral: true,
    cues: ["Keep the hips level as you lift", "Squeeze the glutes, not the lower back"],
    defaults: reps(3, 10, 45),
  }),

  /* ---------------- lunge ---------------- */
  ex("Reverse_Lunge", "Reverse Lunge", {
    pattern: "lunge",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "hamstrings"],
    unilateral: true,
    contraindications: ["knees"],
    cues: ["Step back and drop the back knee", "Keep the front shin near vertical"],
    defaults: reps(3, 10, 60),
  }),
  ex("Bulgarian_Split_Squat", "Bulgarian Split Squat", {
    pattern: "lunge",
    requires: ["bench"],
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    unilateral: true,
    level: "intermediate",
    contraindications: ["knees"],
    cues: ["Front foot far enough forward to stay vertical", "Lower straight down, not forward"],
    defaults: reps(3, 8, 75),
  }),

  /* ---------------- horizontal push (the bodyweight ladder) ---------------- */
  ex("Wall_Push-Up", "Wall Push-Up", {
    pattern: "horizontal-push",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    chainId: "push-bw",
    chainRank: 1,
    cues: ["Body in one line from head to heels", "Elbows back at 45 degrees, not flared"],
    defaults: reps(2, 12, 45),
  }),
  ex("Knee_Push-Up", "Knee Push-Up", {
    pattern: "horizontal-push",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    contraindications: ["wrists"],
    chainId: "push-bw",
    chainRank: 3,
    cues: ["Hips forward so the line stays straight", "Chest to the floor, not the chin"],
    defaults: reps(3, 10, 45),
  }),
  ex("Archer_Push-Up", "Archer Push-Up", {
    pattern: "horizontal-push",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    level: "expert",
    unilateral: true,
    core: false,
    contraindications: ["wrists", "shoulders"],
    chainId: "push-bw",
    chainRank: 6,
    cues: ["Straight arm stays locked and wide", "Lower to the working side only"],
    defaults: reps(3, 5, 90),
  }),

  /* ---------------- vertical push (the gap the dataset leaves) ---------------- */
  ex("Pike_Push-Up", "Pike Push-Up", {
    pattern: "vertical-push",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    level: "intermediate",
    contraindications: ["shoulders", "wrists"],
    chainId: "vpush-bw",
    chainRank: 2,
    cues: ["Hips high, head between the hands", "Crown of the head to the floor"],
    defaults: reps(3, 8, 60),
  }),
  ex("Incline_Pike_Push-Up", "Incline Pike Push-Up", {
    pattern: "vertical-push",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    contraindications: ["shoulders", "wrists"],
    chainId: "vpush-bw",
    chainRank: 1,
    cues: ["Hands on the floor, feet on a step", "Press straight up, ears past the arms"],
    defaults: reps(3, 10, 60),
  }),
  ex("Band_Overhead_Press", "Band Overhead Press", {
    pattern: "vertical-push",
    requires: ["bands"],
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps"],
    contraindications: ["shoulders"],
    cues: ["Stand on the band, brace the ribs down", "Press until the arms are fully long"],
    defaults: reps(3, 12, 60),
  }),

  /* ---------------- horizontal pull (near-empty at bodyweight) ---------------- */
  ex("Doorway_Row", "Doorway Row", {
    pattern: "horizontal-pull",
    primaryMuscles: ["middle-back"],
    secondaryMuscles: ["biceps", "lats"],
    cues: ["Grip both sides of a solid doorframe", "Lean back, pull the chest to the frame"],
    defaults: reps(3, 12, 60),
  }),
  ex("Band_Row", "Band Row", {
    pattern: "horizontal-pull",
    requires: ["bands"],
    primaryMuscles: ["middle-back"],
    secondaryMuscles: ["biceps", "lats"],
    cues: ["Pull the elbows past the ribs", "Shoulder blades together at the end"],
    defaults: reps(3, 14, 60),
  }),
  ex("Band_Pull-Apart", "Band Pull-Apart", {
    pattern: "horizontal-pull",
    requires: ["bands"],
    primaryMuscles: ["middle-back"],
    secondaryMuscles: ["shoulders"],
    mechanic: "isolation",
    cues: ["Arms long, lead with the knuckles", "Slow all the way back to the front"],
    defaults: reps(2, 15, 45),
  }),

  /* ---------------- vertical pull ---------------- */
  ex("Band_Lat_Pulldown", "Band Lat Pulldown", {
    pattern: "vertical-pull",
    requires: ["bands"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps"],
    cues: ["Anchor the band high and kneel", "Drive the elbows down to the ribs"],
    defaults: reps(3, 14, 60),
  }),
  ex("Dead_Hang", "Dead Hang", {
    pattern: "vertical-pull",
    requires: ["pullup-bar"],
    kind: "time",
    primaryMuscles: ["forearms"],
    secondaryMuscles: ["lats"],
    contraindications: ["shoulders"],
    chainId: "vpull-bw",
    chainRank: 1,
    cues: ["Shoulders active, not hanging slack", "Breathe; relax everything below the ribs"],
    defaults: time(3, 25, 60),
  }),
  ex("Negative_Pull-Up", "Negative Pull-Up", {
    pattern: "vertical-pull",
    requires: ["pullup-bar"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "middle-back"],
    level: "intermediate",
    contraindications: ["shoulders"],
    chainId: "vpull-bw",
    chainRank: 2,
    cues: ["Jump to the top, then lower slowly", "Aim for a five second descent"],
    defaults: reps(3, 5, 90),
  }),

  /* ---------------- carry ---------------- */
  ex("Suitcase_Carry", "Suitcase Carry", {
    pattern: "carry",
    requires: ["dumbbells"],
    kind: "time",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["traps", "forearms"],
    unilateral: true,
    spaceNeeded: "normal",
    cues: ["One weight only, stay perfectly upright", "Resist the lean; that is the whole exercise"],
    defaults: time(2, 30, 45),
  }),

  /* ---------------- core ---------------- */
  ex("Bird_Dog", "Bird Dog", {
    pattern: "core-brace",
    kind: "time",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["lower-back", "glutes"],
    unilateral: true,
    cues: ["Reach opposite arm and leg long", "Keep the hips square to the floor"],
    defaults: time(2, 40, 30),
  }),
  ex("Hollow_Hold", "Hollow Hold", {
    pattern: "core-brace",
    kind: "time",
    primaryMuscles: ["abdominals"],
    level: "intermediate",
    contraindications: ["lower-back", "neck"],
    cues: ["Press the lower back into the floor", "Lower the legs only as far as that holds"],
    defaults: time(3, 30, 45),
  }),

  /* ---------------- warm-up / mobility ---------------- */
  ex("Leg_Swings", "Leg Swings", {
    pattern: "mobility",
    kind: "time",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes"],
    mechanic: null,
    unilateral: true,
    cues: ["Hold something solid for balance", "Swing only as high as stays relaxed"],
    defaults: time(1, 30, 0),
  }),
  ex("Cat_Cow", "Cat Cow", {
    pattern: "mobility",
    kind: "time",
    primaryMuscles: ["lower-back"],
    secondaryMuscles: ["abdominals"],
    mechanic: null,
    cues: ["Move one vertebra at a time", "Let the breath set the pace"],
    defaults: time(1, 40, 0),
  }),
  ex("Hip_Circles", "Hip Circles", {
    pattern: "mobility",
    kind: "time",
    primaryMuscles: ["glutes"],
    mechanic: null,
    cues: ["Hands on hips, feet planted wide", "Draw the biggest circle you can"],
    defaults: time(1, 30, 0),
  }),
  ex("Shoulder_Rolls", "Shoulder Rolls", {
    pattern: "mobility",
    kind: "time",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["traps"],
    mechanic: null,
    cues: ["Big, slow circles backwards", "Let the arms stay heavy"],
    defaults: time(1, 25, 0),
  }),
  ex("Torso_Twist", "Standing Torso Twist", {
    pattern: "mobility",
    kind: "time",
    primaryMuscles: ["abdominals"],
    secondaryMuscles: ["lower-back"],
    mechanic: null,
    contraindications: ["lower-back"],
    cues: ["Turn from the ribs, hips facing forward", "Let the arms swing loosely"],
    defaults: time(1, 30, 0),
  }),
];
