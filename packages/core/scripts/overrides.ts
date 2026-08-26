/**
 * Hand-authored corrections to the source dataset.
 *
 * Two jobs:
 *  1. Fix what the source gets wrong. Most importantly it tags pull-ups and
 *     inverted rows as "body only", which would place them in a no-equipment
 *     plan for someone who owns no bar.
 *  2. Curate the generator's pool. Supplying `cues` marks an entry as
 *     deliberately curated, which is what promotes it into `core`.
 *
 * Overrides always win over derived values, so an upstream change can never
 * silently undo a correction made on purpose.
 */
import type { Exercise } from "../src/types.ts";

export type Override = Partial<Omit<Exercise, "id">> & { drop?: boolean };

export const OVERRIDES: Record<string, Override> = {
  /* ================= corrections ================= */

  // Source says "body only". A pull-up needs something to hang from.
  "Chin-Up": {
    requires: ["pullup-bar"],
    chainId: "vpull-bw",
    chainRank: 3,
    cues: ["Palms toward you, shoulders down first", "Chest to the bar, no kicking"],
  },
  Pullups: {
    name: "Pull-Up",
    requires: ["pullup-bar"],
    chainId: "vpull-bw",
    chainRank: 4,
    cues: ["Start from a full hang every rep", "Lead with the chest, elbows to the ribs"],
  },
  Inverted_Row: {
    requires: ["pullup-bar"],
    cues: ["Body straight from head to heels", "Pull the chest to the bar, pause there"],
  },

  // Name-order put this in horizontal-push; it is the archetypal vertical press.
  "Handstand_Push-Ups": { pattern: "vertical-push", core: false },

  // Source classes these as a hinge; they are trunk flexion.
  Flutter_Kicks: {
    pattern: "core-flexion",
    contraindications: ["lower-back"],
    cues: ["Press the lower back into the floor", "Small, fast kicks with straight legs"],
  },

  Farmers_Walk: {
    // Source files this under "strongman", which the usability gate excludes.
    // A loaded carry is a staple, not a strongman event.
    core: true,
    requires: ["dumbbells"],
    spaceNeeded: "normal",
    cues: ["Stand tall, shoulders pulled back", "Short, quick steps, no leaning"],
  },

  /* ================= squat ================= */
  Bodyweight_Squat: {
    chainId: "squat-bw",
    chainRank: 2,
    cues: ["Chest up, weight through mid-foot", "Knees track out over your toes"],
  },
  Goblet_Squat: {
    requires: ["dumbbells"],
    cues: ["Hold the bell tight to the chest", "Elbows brush the inside of the knees"],
  },
  Dumbbell_Squat: {
    cues: ["Weights hang at arm's length", "Sit down between the hips, not back"],
  },
  Barbell_Squat: {
    requires: ["barbell", "rack"],
    cues: ["Big breath, brace before you descend", "Drive the whole foot through the floor"],
  },
  Front_Barbell_Squat: {
    requires: ["barbell", "rack"],
    cues: ["Elbows high, bar rests on the shoulders", "Stay upright the whole way down"],
  },
  Leg_Press: {
    requires: ["machines"],
    cues: ["Feet flat, knees track over the toes", "Never lock the knees at the top"],
  },

  /* ================= hinge ================= */
  Butt_Lift_Bridge: {
    name: "Glute Bridge",
    cues: ["Drive through the heels, ribs down", "Squeeze the glutes, pause at the top"],
  },
  Single_Leg_Glute_Bridge: {
    cues: ["Keep both hips level throughout", "Push through the heel of the down leg"],
  },
  // The source ships this one with no instructions at all.
  "One-Arm_Kettlebell_Swings": {
    requires: ["kettlebell"],
    cues: ["Snap the hips, the arm is a rope", "Bell floats to chest height, no higher"],
    unilateral: true,
    steps: [
      "Set the kettlebell on the floor about a foot in front of you.",
      "Stand with your feet a little wider than your shoulders, toes turned slightly out.",
      "Hinge at the hips with a flat back and take the handle in one hand.",
      "Hike the bell back between your legs, keeping your forearm against your inner thigh.",
      "Snap your hips forward hard and stand tall; let the bell float up to chest height.",
      "Keep the working arm relaxed like a rope and the free arm out for balance.",
      "Let the bell fall back between the legs and hinge to meet it, then repeat.",
    ],
  },
  Romanian_Deadlift: {
    requires: ["barbell"],
    cues: ["Push the hips back, bar stays close", "Stop when the hamstrings run out"],
  },
  "Stiff-Legged_Dumbbell_Deadlift": {
    name: "Dumbbell Romanian Deadlift",
    requires: ["dumbbells"],
    cues: ["Soft knees, hinge from the hips", "Flat back the whole way down"],
  },
  Barbell_Deadlift: {
    requires: ["barbell"],
    cues: ["Take the slack out before you pull", "Push the floor away, hips and chest together"],
  },
  Barbell_Hip_Thrust: {
    requires: ["barbell", "bench"],
    cues: ["Chin tucked, ribs down at the top", "Finish with the shins vertical"],
  },

  /* ================= lunge ================= */
  Bodyweight_Walking_Lunge: {
    spaceNeeded: "normal",
    cues: ["Long step, drop the back knee down", "Torso stays tall, no leaning forward"],
  },
  // The source describes a jumping, leg-swapping version. The cues here are for
  // the static split squat, which is one leg at a time -- so the prescription
  // is two sides' worth, because the player runs each side in turn.
  Split_Squats: {
    cues: ["Feet stay in a split the whole set", "Drop straight down, not forward"],
    unilateral: true,
    isJumping: false,
    isLoud: false,
    defaults: { sets: 2, durationSec: 60, restSec: 45 },
    steps: [
      "Step one foot forward into a split stance, about one stride long.",
      "Set your weight mostly on the front foot with the back heel lifted.",
      "Stay tall and square; the feet do not move for the whole set.",
      "Lower straight down by bending both knees until the back knee is just off the floor.",
      "Keep the front shin close to vertical rather than letting the knee drift forward.",
      "Drive through the front heel back to the top and repeat.",
    ],
  },
  Dumbbell_Lunges: {
    requires: ["dumbbells"],
    cues: ["Weights hang heavy at your sides", "Push through the front heel to stand"],
  },
  "Step-up_with_Knee_Raise": {
    requires: ["bench"],
    cues: ["Whole foot on the step, no push-off", "Stand tall before driving the knee"],
  },

  /* ================= horizontal push ================= */
  "Incline_Push-Up": {
    requires: ["bench"],
    chainId: "push-bw",
    chainRank: 2,
    cues: ["Hands on the bench, body in one line", "Lower the chest to the edge"],
  },
  Pushups: {
    name: "Push-Up",
    chainId: "push-bw",
    chainRank: 4,
    cues: ["Elbows at 45 degrees, not flared wide", "Ribs to hips in one straight line"],
  },
  "Decline_Push-Up": {
    requires: ["bench"],
    chainId: "push-bw",
    chainRank: 5,
    cues: ["Feet elevated, hips stay level", "Lower under control, no bouncing"],
  },
  Dumbbell_Bench_Press: {
    requires: ["dumbbells", "bench"],
    cues: ["Wrists stacked over the elbows", "Lower until you feel the chest stretch"],
  },
  Dumbbell_Floor_Press: {
    requires: ["dumbbells"],
    cues: ["Upper arms touch down, then press", "Keeps the shoulder out of end range"],
  },
  "Barbell_Bench_Press_-_Medium_Grip": {
    requires: ["barbell", "bench"],
    cues: ["Shoulder blades pinned to the bench", "Bar to the lower chest, elbows tucked"],
  },
  Bench_Dips: {
    requires: ["bench"],
    contraindications: ["shoulders", "wrists"],
    cues: ["Stay close to the bench the whole way", "Stop when the upper arms are parallel"],
  },

  /* ================= vertical push ================= */
  Dumbbell_Shoulder_Press: {
    requires: ["dumbbells"],
    cues: ["Ribs down, no arching the back", "Press until the arms are fully long"],
  },
  Arnold_Dumbbell_Press: {
    requires: ["dumbbells"],
    cues: ["Rotate the palms as you press up", "Slow through the turn, no swinging"],
  },
  Standing_Military_Press: {
    requires: ["barbell"],
    cues: ["Squeeze the glutes to lock the ribs", "Move the head back, then through"],
  },
  Barbell_Shoulder_Press: {
    requires: ["barbell"],
    cues: ["Brace hard before every rep", "Bar finishes over the mid-foot"],
  },

  /* ================= horizontal pull ================= */
  "One-Arm_Dumbbell_Row": {
    requires: ["dumbbells", "bench"],
    cues: ["Flat back, hips square to the floor", "Pull the elbow past the ribs"],
  },
  Bent_Over_Barbell_Row: {
    requires: ["barbell"],
    contraindications: ["lower-back"],
    cues: ["Hinge to 45 degrees and hold it", "Bar to the belly, no jerking"],
  },
  Seated_Cable_Rows: {
    requires: ["cable"],
    cues: ["Sit tall, no rocking for momentum", "Shoulder blades together at the end"],
  },

  /* ================= vertical pull ================= */
  "Wide-Grip_Lat_Pulldown": {
    requires: ["cable"],
    cues: ["Lean back slightly and stay there", "Bar to the collarbone, elbows down"],
  },

  /* ================= core ================= */
  Plank: {
    cues: ["Ribs down, glutes squeezed", "Breathe steadily through the hold"],
  },
  // Another with no source instructions, and the movement most often done
  // badly: the whole point is the hips, and nobody can see their own.
  Side_Bridge: {
    name: "Side Plank",
    cues: ["Stack the hips, lift them high", "Reach the top arm to the ceiling"],
    unilateral: true,
    steps: [
      "Lie on one side with your legs straight and stacked, one foot on the other.",
      "Set the bottom elbow directly under the shoulder, forearm flat on the floor.",
      "Stack your hips and shoulders so your body is in one flat plane.",
      "Push the bottom forearm down and lift your hips until you are in a straight line.",
      "Reach the top arm to the ceiling or rest it along your side.",
      "Keep your neck long and breathe steadily; drop the bottom knee if the hips sag.",
    ],
  },
  Dead_Bug: {
    cues: ["Lower back glued to the floor", "Move the opposite arm and leg slowly"],
  },
  Superman: {
    cues: ["Lift from the upper back, not the neck", "Small lift, long hold"],
  },
  Crunches: {
    cues: ["Curl the ribs toward the hips", "Hands support the head, never pull it"],
  },
  Air_Bike: {
    name: "Bicycle Crunch",
    cues: ["Opposite elbow toward opposite knee", "Slow and deliberate, not frantic"],
  },
  "Bent-Knee_Hip_Raise": {
    cues: ["Lift the hips, don't swing the legs", "Lower one vertebra at a time"],
  },
  Russian_Twist: {
    cues: ["Rotate from the ribs, not the arms", "Keep the chest tall throughout"],
  },

  /* ================= gait ================= */
  Mountain_Climbers: {
    contraindications: ["wrists"],
    cues: ["Hips stay level with the shoulders", "Drive the knees, keep the hands planted"],
  },

  /* ================= mobility ================= */
  Hamstring_Stretch: {
    name: "Hamstring Fold",
    cues: ["Long spine first, then fold", "Deepen on the exhale, no bouncing"],
  },
  Childs_Pose: {
    cues: ["Sink the hips back to the heels", "Let the ribs settle between the thighs"],
  },
  Kneeling_Hip_Flexor: {
    cues: ["Tuck the tailbone before leaning in", "Squeeze the back glute to open the hip"],
  },
  Cat_Stretch: {
    cues: ["Round and arch one vertebra at a time", "Let the breath set the pace"],
  },
  "90_90_Hamstring": {
    cues: ["Keep the hip at ninety degrees", "Straighten the knee only as far as it goes"],
  },
  Chest_And_Front_Of_Shoulder_Stretch: {
    cues: ["Forearm flat, turn the chest away", "Ease in; never force the shoulder"],
  },

  Arm_Circles: {
    cues: ["Start small and grow the circle", "Reverse direction halfway through"],
  },
  Ankle_Circles: {
    cues: ["Draw slow circles with the big toe", "Go both directions on each foot"],
  },
  Inchworm: {
    contraindications: ["wrists"],
    cues: ["Walk the hands out to a long plank", "Keep the legs as straight as comfortable"],
  },

  /* ================= drops ================= */
  // Strongman implements and partner-assisted work: not usable by anyone here.
  Atlas_Stones: { drop: true },
  Atlas_Stone_Trainer: { drop: true },
  Car_Deadlift: { drop: true },
  Keg_Load: { drop: true },
  Conans_Wheel: { drop: true },
  Circus_Bell: { drop: true },
  Yoke_Walk: { drop: true },
  Tire_Flip: { drop: true },
};
