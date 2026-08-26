/**
 * Derivation rules: source dataset -> our schema.
 *
 * free-exercise-db has no movement pattern, no contraindications, no
 * prescription, and an equipment vocabulary that does not match a person's
 * actual inventory. Everything below closes that gap mechanically; the
 * hand-authored overrides file then corrects what heuristics get wrong.
 */
import type {
  EquipmentId,
  ExerciseKind,
  Level,
  Limitation,
  Muscle,
  Pattern,
  Prescription,
} from "../src/types.ts";

export interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const rx = (s: string) => new RegExp(s, "i");

/* -------------------------------------------------------------------------
 * Movement pattern — ordered, first match wins. Name beats muscles, because
 * "Barbell Row" is a pull whatever its listed muscles say.
 * ----------------------------------------------------------------------- */

const PATTERN_BY_NAME: ReadonlyArray<[RegExp, Pattern]> = [
  [rx("stretch|mobility|foam roll|-smr|cat.?cow|fold|opener|circles"), "mobility"],
  [rx("carry|farmer|suitcase|waiter'?s walk"), "carry"],
  [rx("lunge|split squat|bulgarian|step.?up|curtsy"), "lunge"],
  [rx("pull.?up|chin.?up|pulldown|lat pull|muscle.?up"), "vertical-pull"],
  [rx("\\brow\\b|face pull|rear delt|inverted row|reverse fly"), "horizontal-pull"],
  [rx("push.?up|bench press|chest press|\\bfly\\b|\\bdip\\b|floor press|pec deck"), "horizontal-push"],
  [rx("overhead press|shoulder press|military|handstand|push press|lateral raise|front raise|arnold|upright row"), "vertical-push"],
  [rx("deadlift|good.?morning|hip thrust|glute bridge|swing|romanian|\\brdl\\b|back extension|hyperextension|pull.?through|nordic"), "hinge"],
  [rx("squat|leg press|wall sit|hack|sissy|leg extension"), "squat"],
  [rx("plank|hollow|dead ?bug|pallof|ab wheel|ab roller|bird ?dog|\\bhold\\b|l.?sit|superman"), "core-brace"],
  [rx("crunch|sit.?up|leg raise|knee raise|v.?up|jackknife|toe touch"), "core-flexion"],
  [rx("twist|rotation|woodchop|wood chop|windmill|russian"), "rotation"],
  [rx("\\brun\\b|running|walk|jog|sprint|jump rope|jumping jack|burpee|mountain climber|high knee|shuttle|skater|bound|skip"), "gait"],
  [rx("curl|tricep|extension|kickback|shrug|calf|raise"), "isolation-marker" as Pattern],
];

/** Fallback when the name is uninformative: read force + primary muscle. */
function patternFromMuscles(src: SourceExercise): Pattern | null {
  const m = new Set(src.primaryMuscles);
  const has = (...xs: string[]) => xs.some((x) => m.has(x));

  if (src.category === "stretching") return "mobility";
  if (src.category === "cardio") return "gait";

  if (src.force === "static") return has("abdominals") ? "core-brace" : "mobility";

  if (src.force === "push") {
    if (has("chest", "triceps")) return "horizontal-push";
    if (has("shoulders")) return "vertical-push";
    if (has("quadriceps")) return "squat";
    if (has("glutes", "hamstrings")) return "hinge";
    if (has("calves")) return "gait";
  }
  if (src.force === "pull") {
    if (has("lats")) return "vertical-pull";
    if (has("middle back", "traps", "biceps", "forearms")) return "horizontal-pull";
    if (has("hamstrings", "glutes", "lower back")) return "hinge";
    if (has("abdominals")) return "core-flexion";
  }
  return null;
}

export function derivePattern(src: SourceExercise): Pattern | null {
  for (const [re, p] of PATTERN_BY_NAME) {
    if (re.test(src.name)) {
      // Isolation lifts have no pattern slot of their own; place them by muscle.
      if ((p as string) === "isolation-marker") break;
      return p;
    }
  }
  return patternFromMuscles(src);
}

/* -------------------------------------------------------------------------
 * Equipment — source vocabulary is coarse and its "other" bucket is a mess,
 * mixing Band Assisted Pull-Up with Atlas Stones and Conan's Wheel.
 * ----------------------------------------------------------------------- */

const EQUIPMENT_MAP: Readonly<Record<string, EquipmentId[]>> = {
  barbell: ["barbell"],
  dumbbell: ["dumbbells"],
  kettlebells: ["kettlebell"],
  bands: ["bands"],
  cable: ["cable"],
  machine: ["machines"],
  "medicine ball": ["medicine-ball"],
  "exercise ball": ["exercise-ball"],
  "foam roll": ["foam-roller"],
  "e-z curl bar": ["ez-bar"],
  "body only": [],
};

/** Triage for the 122 `other` rows and the 77 with no equipment at all. */
const OTHER_BY_NAME: ReadonlyArray<[RegExp, EquipmentId[]]> = [
  [rx("pull.?up|chin.?up|muscle.?up|hang|\\bbar\\b"), ["pullup-bar"]],
  [rx("\\btrx\\b|suspension|ring"), ["suspension"]],
  [rx("bench|incline|decline"), ["bench"]],
  [rx("box|step|platform|bleacher"), ["box"]],
  [rx("\\bball\\b"), ["exercise-ball"]],
  [rx("rope|band"), ["bands"]],
  [rx("treadmill|bike|bicycl|elliptical|rower|row machine"), ["cardio-machine"]],
];

export function deriveEquipment(src: SourceExercise): EquipmentId[] {
  const key = (src.equipment ?? "").toLowerCase();
  const mapped = EQUIPMENT_MAP[key];
  if (mapped) return mapped;

  for (const [re, eq] of OTHER_BY_NAME) {
    if (re.test(src.name)) return eq;
  }
  return [];
}

/* -------------------------------------------------------------------------
 * Exclusions — things nobody is doing in a bedroom or a commercial gym.
 * These stay searchable but are never generated.
 * ----------------------------------------------------------------------- */

const UNUSABLE = rx(
  "atlas stone|conan|circus|car deadlift|yoke|keg|log |tire|sled|sandbag|" +
    "smr|self.?myofascial|wrestler|neck |partner|assisted by|spotter"
);

const EXCLUDED_CATEGORIES = new Set(["strongman", "olympic weightlifting"]);

export function isUsable(src: SourceExercise): boolean {
  if (EXCLUDED_CATEGORIES.has(src.category)) return false;
  if (UNUSABLE.test(src.name)) return false;
  if (src.level === "expert") return false;
  if (src.images.length === 0) return false;
  return true;
}

/* -------------------------------------------------------------------------
 * Physical properties
 * ----------------------------------------------------------------------- */

const JUMPING = rx("jump|hop|bound|plyo|burpee|skater|jack|sprint|skip|leap|depth drop");
const TRAVELS = rx("walking|walk|crawl|sprint|\\brun\\b|running|shuttle|broad|drag|carry|farmer|bear");
const PALM_LOADED = rx("push.?up|plank|handstand|burpee|mountain climber|bear crawl|ab wheel|ab roller|dip|crab");
const NECK_LOADED = rx("neck|headstand|bridge|wrestler");
const SPINAL_FLEXION = rx("sit.?up|crunch|jackknife|v.?up|toe touch|russian twist|leg raise");
const OVERHEAD = rx("overhead|snatch|jerk|behind the neck|handstand|upright row|press");

export function isJumping(src: SourceExercise): boolean {
  return src.category === "plyometrics" || JUMPING.test(src.name);
}

export function isLoud(src: SourceExercise): boolean {
  return isJumping(src) || rx("slam|drop|clean|snatch|jerk").test(src.name);
}

export function spaceNeeded(src: SourceExercise): "tight" | "normal" {
  return TRAVELS.test(src.name) ? "normal" : "tight";
}

const DYNAMIC = rx(
  "circle|swing|march|cat.?cow|inchworm|roll|twist|crawl|walkout|dynamic|" +
    "arm cross|leg cross|windmill|jack|skip|lunge|reach"
);

/** Whether the movement travels through a range instead of holding an end range. */
export function isDynamic(src: SourceExercise, pattern: Pattern | null): boolean {
  if (pattern !== "mobility") return true;
  if (rx("-smr|foam").test(src.name)) return false;
  return DYNAMIC.test(src.name);
}

export function isUnilateral(src: SourceExercise): boolean {
  return rx(
    "single|one.?arm|one.?leg|split|bulgarian|lunge|step.?up|suitcase|side plank|alternating|\\bside\\b"
  ).test(src.name);
}

/* -------------------------------------------------------------------------
 * Contraindications — conservative by policy. A false positive costs variety;
 * a false negative costs a joint. See ENGINEERING.md §9.
 * ----------------------------------------------------------------------- */

export function deriveContraindications(
  src: SourceExercise,
  pattern: Pattern | null
): Limitation[] {
  const out = new Set<Limitation>();
  const m = new Set(src.primaryMuscles.concat(src.secondaryMuscles));

  // Knees: impact, and deep knee flexion under load.
  if (isJumping(src)) out.add("knees");
  if (pattern === "squat" || pattern === "lunge") out.add("knees");
  if (rx("leg extension|sissy|hack squat|deep").test(src.name)) out.add("knees");

  // Lower back: loaded hinging, and loaded spinal flexion.
  if (pattern === "hinge" && src.equipment !== "body only") out.add("lower-back");
  if (SPINAL_FLEXION.test(src.name)) out.add("lower-back");
  if (rx("good.?morning|bent.?over|deadlift|hyperextension|superman").test(src.name)) {
    out.add("lower-back");
  }

  // Shoulders: overhead work and deep-stretch pressing.
  if (pattern === "vertical-push") out.add("shoulders");
  if (OVERHEAD.test(src.name)) out.add("shoulders");
  if (rx("\\bdip\\b|behind the neck|upright row").test(src.name)) out.add("shoulders");

  // Wrists: bodyweight front support on open palms.
  if (PALM_LOADED.test(src.name) && (src.equipment === "body only" || !src.equipment)) {
    out.add("wrists");
  }

  // Neck: anything loading the cervical spine.
  if (NECK_LOADED.test(src.name) || m.has("neck")) out.add("neck");

  return [...out].sort();
}

/* -------------------------------------------------------------------------
 * Prescription
 * ----------------------------------------------------------------------- */

const TIMED = rx("plank|hold|wall sit|hang|isometric|carry|farmer|stretch|bridge");

export function deriveKind(src: SourceExercise, pattern: Pattern | null): ExerciseKind {
  if (src.category === "stretching") return "time";
  if (pattern === "mobility" || pattern === "core-brace" || pattern === "carry") return "time";
  if (pattern === "gait") return "time";
  if (TIMED.test(src.name)) return "time";
  return "reps";
}

export function deriveDefaults(
  kind: ExerciseKind,
  pattern: Pattern | null,
  level: Level
): Prescription {
  if (pattern === "mobility") {
    return { sets: 1, durationSec: 45, restSec: 0 };
  }
  if (kind === "time") {
    return { sets: 2, durationSec: level === "beginner" ? 30 : 45, restSec: 30 };
  }
  return {
    sets: level === "beginner" ? 2 : 3,
    reps: level === "beginner" ? 10 : 12,
    restSec: 60,
  };
}

export function deriveLevel(src: SourceExercise): Level {
  if (src.level === "beginner" || src.level === "intermediate" || src.level === "expert") {
    return src.level;
  }
  return "intermediate";
}

/* -------------------------------------------------------------------------
 * Cues — the design shows exactly two short lines. Source instructions are
 * five verbose paragraphs, so condense; the core set is hand-written instead.
 * ----------------------------------------------------------------------- */

export function deriveCues(src: SourceExercise): string[] {
  const usable = src.instructions
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    // Drop setup and rep-count boilerplate; keep the actual execution advice.
    .filter((s) => !/^(this will be|repeat for|return to the starting)/i.test(s))
    .map((s) => {
      const firstSentence = s.split(/(?<=[.!?])\s+/)[0] ?? s;
      const clean = firstSentence.replace(/\s+/g, " ").replace(/\.$/, "");
      return clean.length > 84 ? `${clean.slice(0, 81).trimEnd()}...` : clean;
    });

  const cues = usable.slice(0, 2);
  while (cues.length < 2) cues.push("Move under control through the full range");
  return cues;
}

/* -------------------------------------------------------------------------
 * Muscles — normalise the dataset's spacing to our kebab-case enum.
 * ----------------------------------------------------------------------- */

const MUSCLE_MAP: Readonly<Record<string, Muscle>> = {
  abdominals: "abdominals",
  abductors: "abductors",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "lower-back",
  "middle back": "middle-back",
  neck: "neck",
  quadriceps: "quadriceps",
  shoulders: "shoulders",
  traps: "traps",
  triceps: "triceps",
};

export function mapMuscles(xs: string[]): Muscle[] {
  return xs.map((x) => MUSCLE_MAP[x]).filter((x): x is Muscle => Boolean(x));
}
