# FORM — Engineering Guide

This is the contract the build follows. It exists so that a hundred small decisions
get made once, here, instead of a hundred times, inconsistently, later.

Read this before writing code. If you find yourself fighting a rule, change the rule
in a PR — don't quietly work around it.

---

## 0. What we are building

An installable, offline-first PWA that generates **situation-aware** strength and
conditioning plans, and runs the workout with a timer.

The one-sentence product thesis, which several rules below exist to protect:

> **The situation is the input to the plan.** "Home with dumbbells", "a gym with no
> leg press", and "home with nothing, never trained" are three different plans — not
> one plan with substitutions.

Equipment changes a plan's *structure*, not just its exercise names. A bodyweight plan
that is a barbell plan with the barbells removed is a bad plan.

| Tier | Structure | How you get stronger |
|---|---|---|
| `bodyweight` | Full-body, higher reps, circuits | Leverage, tempo, unilateral progressions |
| `minimal` | Bands / one bell, time-under-tension | Tension and range |
| `dumbbell` | Unilateral emphasis, moderate reps | Reps first, then the next dumbbell |
| `home-gym` | Barbell compounds, limited accessories | Load |
| `full-gym` | Barbell + machine accessories, lower reps | Load |

"Load" is a number, not a slogan: `Prescription.targetWeightKg` holds it, the set screen
logs what was actually lifted, and `applyFeedback` raises it from there. Weight is stored
in kilograms always — the profile's `units` is a display choice and never a storage one.
Until something has been logged, a load tier progresses by reps and the Complete screen
says so, because promising "more weight next week" with no number behind it is a lie the
app cannot act on.

---

## 1. Principles

1. **Offline is the default, not a feature.** Every screen works in airplane mode.
   Network is for updates only. Gyms are concrete boxes with no signal.
2. **The core is pure.** Domain logic never touches React, the DOM, storage, or the clock.
3. **The design is the spec.** Where code and artboard disagree, the artboard wins —
   or we change the artboard deliberately, not by drift.
4. **Conservative beats clever in programming logic.** When the generator is uncertain,
   it prescribes *less*. Nobody was ever injured by a set they didn't do.
5. **Losing someone's training history is the worst bug we can ship.** Migrations and
   persistence get more care than features.

---

## 2. Repository layout and module boundaries

```
workout/
├─ docs/ENGINEERING.md      this file
├─ packages/core/           pure TypeScript domain. No React, DOM, Next, or Dexie.
│  └─ src/
│     ├─ types.ts           setup / plan / session / profile models + branded IDs
│     ├─ equipment.ts       inventory → EquipmentTier
│     ├─ library/           exercise data, overrides, accessors
│     ├─ archetypes/        programming templates, as data
│     ├─ generator.ts       (profile, setup) → Plan
│     ├─ selection.ts       pool filtering + same-pattern swap
│     ├─ progression.ts     feedback → next-week adjustment, per tier
│     └─ player.ts          workout state machine (pure reducer)
└─ apps/web/                Next.js PWA
   ├─ app/                  routes
   ├─ components/           design-system + feature components
   ├─ db/                   Dexie schema, migrations, repositories
   └─ store/                Zustand stores wrapping core
```

### The boundary rule (enforced, not suggested)

- `packages/core` may import **only** its own files and `zod`.
  No React. No DOM types. No Dexie. No Next. No `node:` builtins in shipped code.
- `apps/web` imports `@form/core` freely. Core never imports web.

Enforced twice, and both run in CI (`.github/workflows/ci.yml`):

- ESLint `no-restricted-imports` in `packages/core/eslint.config.mjs`, so it fails in
  the editor.
- `packages/core/test/boundaries.test.ts`, which scans the source. It catches what a
  lint rule cannot: `Date.now`, `setInterval` and `setTimeout` anywhere in the domain
  (§3), including inside a file that imports nothing.

This is a gate, not a convention.

**Why this is worth the discipline:** it makes the eventual React Native port a copy
rather than a rewrite, and it lets the entire domain be tested with zero mocks. Every
mock you don't write is a test that can't lie to you.

---

## 3. Time is injected

> **No `Date.now()`, `setInterval`, or `setTimeout` anywhere in `packages/core`.**

Reducers and generators take `now: number` as an explicit parameter.

```ts
// yes
export function tick(state: PlayerState, now: number): PlayerState

// no
export function tick(state: PlayerState): PlayerState  // reaches for Date.now() inside
```

This single rule buys three things that are otherwise expensive:

1. **Tests run instantly and deterministically** — no fake timers, no flake.
2. **Drift correction becomes possible.** Elapsed time derives from timestamp deltas,
   never from counting ticks. A backgrounded phone drops `setInterval` callbacks; if we
   counted ticks, every locked screen would silently shorten the workout.
3. **Resume is replay.** A session restored from storage recomputes its true state from
   a stored start timestamp.

The React layer owns the interval, and it is the only place that may read the clock.

---

## 4. TypeScript standards

`tsconfig` runs `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`.

- **No `any`.** Boundaries accept `unknown` and Zod-parse into a type.
- **Branded IDs.** `type SetupId = string & { readonly __brand: 'SetupId' }`.
  Passing a `PlanId` where an `ExerciseId` belongs must not compile. Every entity gets one.
- **Discriminated unions for every state machine**, with an `assertNever` default case,
  so adding a phase is a compile error rather than a silent no-op:

  ```ts
  export function assertNever(x: never): never {
    throw new Error(`Unhandled variant: ${JSON.stringify(x)}`)
  }
  ```
- **Prefer parsing to validating.** Make illegal states unrepresentable in the type
  rather than checking for them at every call site.
- Exported functions in `core` are documented with a one-line comment saying what
  invariant they preserve, not what they do — the name already says what they do.

---

## 5. Data, schema and migrations

- **Zod schemas are the source of truth.** TypeScript types come from `z.infer`.
  Never hand-write a type that a schema already describes.
- Every persisted record carries `id`, `createdAt` and `updatedAt`.
- **The schema version is per database, not per record.** Dexie owns it, and
  `SCHEMA_VERSION` in `db/schema.ts` is the single source of truth. Records do not carry
  their own version because nothing would read it: every row in an IndexedDB database is
  migrated together, on open, before any of it is handed out.
  The one place a version genuinely travels with the data is an export bundle, which
  carries `schemaVersion` and is migrated by `parseBundle` on the way in — the Dexie
  upgrade never fires for an import, so that path backfills separately.
- **Dexie migrations are additive.** Never delete or repurpose a field in place. A new
  optional field needs no version bump; a new *meaning* for an existing one always does.
- **Restoring a backup is a migration too.** `importAll` takes `unknown`, Zod-parses it,
  and runs the same backfills, because the Dexie upgrade hook only fires on a version
  change and a restored v1 bundle would otherwise walk straight past it.
- **Every migration ships with a test** that runs it against a fixture database built
  at the previous version and asserts nothing was lost.
- **Never persist derived values.** Plan duration, streak, weekly volume, and total sets
  are computed. Persisted derived values go stale and then lie.

**Goal and schedule live on the plan, not the person.** A person is not one
goal: someone can run a strength block at the gym and a mobility plan at home in
the same week. The profile holds defaults for the *next* plan they create, and
changing them must never rewrite a plan that already exists.

**The situation is not a preference, so it does rewrite plans.** A setup's
equipment and constraints, and the person's limitations and experience, are the
inputs the generator derived those plans from. When one of them changes, every
*generated* plan built on it is wrong — it prescribes a barbell that has been
sold, or loads a knee that now hurts — so all of them are rebuilt, each keeping
its own id, name, goal and schedule. Plans a person edited or built themselves
are never rewritten: those are theirs.

**Every screen that generates a plan asks the whole question.** Situation
answers are confirmed at the point of building, never inherited silently from
the first plan. Someone whose gym replaced its cables in March should not have
to remember that a plan generated in June was built from a March answer.

---

## 6. State ownership

| Layer | Holds | Test for "does it belong here?" |
|---|---|---|
| **Dexie** | Durable truth: profile, setups, plans, sessions | Must survive a hard reload |
| **Zustand** | Active session, resolved plan, UI mode | Rebuildable from Dexie |
| **React state** | Sheet open, input focus, transient animation | Losing it costs nothing |

Rule of thumb: **if losing it mid-workout would annoy a real person, it goes in Dexie.**
The in-progress session is checkpointed on every tick — someone forty minutes into a
session who takes a phone call must not lose it.

---

## 7. Design fidelity

The design is `Home Workout v2.dc.html` in the Claude Design project
`83ce1840-819d-4b13-98e9-369562f96daa`.

- **No raw hex or px values in components.** Tokens only, from `tokens.css`.
- Every component matches its artboard at **402×874** before merge.
- All five keyframes (`chimeRing`, `chimePop`, `riseIn`, `sweep`, `drift`) ship with
  `prefers-reduced-motion` variants.
- **Archivo's `wdth` axis is the app's signature.** The design sets it at 104–118 on
  every heading and numeral. A static fallback looks visibly wrong, so the variable font
  is a hard requirement with an explicit loading strategy.
- All numerals are `tabular-nums`. A timer whose digits change width is a broken timer.

The canvas scaffolding files in the design project — `ios-frame.jsx`, `image-slot.js`,
`support.js` — are a mock device bezel, a drag-to-fill placeholder, and the template
runtime. **None of it ships.**

### Where the artboard and the app deliberately differ

Four of them: three on `Welcome` and `Install prompt`, and one across every screen
that the artboard draws bigger than the phone running it. Each is written down because
"it does not match the artboard" is otherwise indistinguishable from a mistake.

- **The Welcome headline wraps to three lines, not the artboard's two.** `IOSDevice`
  is 402px wide and the screen's gutter is 22px, so a line has 358px; "wherever you
  are." at 46px `wdth` 106 wants 425. The break the artboard draws cannot happen at
  the size it draws it at. We keep the size — it is the loudest thing on the screen —
  and let `text-wrap: balance` place the breaks, which gives three even lines here and
  the artboard's two as soon as the column is wide enough.
- **"I already have an account" is "I already have a backup".** There are no accounts;
  everything lives in this browser (§5). The one case that slot really covers is
  someone arriving on a new phone with the JSON they exported from the old one, so it
  restores through `importAll` — the same path as the You screen's Import.
- **The install sheet's rows change per platform.** The artboard's two rows are
  Safari's Share-menu steps, which are right for iOS (`addsByHand`) and meaningless on
  Chromium, where we have a real prompt to fire. There the rows become what installing
  gets you and the pill fires the prompt. An "Add to home screen" button that cannot
  add anything is the one thing that sheet must not be.
- **The player's numerals shrink on a screen smaller than the artboard.** The design
  sizes them in fixed px -- the rest clock at 158px -- and at 402pt "1:20" wants 378px
  inside a 358px column, so the artboard's own width cannot draw the screen it draws.
  The fixed heights had the same problem downwards: on a 667pt-tall phone the set
  screen's weight stepper was half cut off and its buttons were below the fold of a
  screen that cannot scroll. `Display`'s `fit` prop caps each numeral at the design's
  size and shrinks it where the room is not there, the demo well gives ground first
  (`min(272px, 34vh)`), `short:` trims padding under 700pt of height, and `tiny:` --
  560pt, which means a landscape turn rather than a small phone -- drops the copy that
  is encouragement rather than instruction. At the artboard's own size nothing changes
  but the clock, which loses 5px so that all four digits exist.

The hero photograph is still an empty `image-slot` on the canvas, so `WelcomeHero`
draws the panel in the app's own language — the same call `MediaWell` makes for
exercises that ship no images. The scrim over it is the design's, stop for stop.

---

## 8. Testing strategy

| Layer | Approach | Depth |
|---|---|---|
| `packages/core` | Vitest unit + **property-based** (fast-check) | Heavy — correctness lives here |
| `apps/web/db` | Repository, migration and **import** tests on `fake-indexeddb` | Medium |
| `apps/web/lib` | Vitest unit, for the pure helpers between storage and screens | Medium |
| UI | Playwright, critical path only | Light |

`apps/web/lib` earns tests because it is not glue: session rotation, streak arithmetic
and day resolution are real logic that happens to live in the app rather than the core,
and every one of them has had a bug. Anything in there that *is* glue stays untested.

**We do not write shallow component tests.** They assert that the code is the code.
Test the domain properly and smoke-test the path a real person walks.

**The generator's guarantees are properties, not examples.** Write them as invariants
over arbitrary valid inputs and let fast-check find the edge cases we wouldn't think of:

> For any valid `(profile, setup)`, the generated plan contains no contraindicated
> exercise, no exercise requiring unavailable equipment, no expert movement for a
> beginner, fills every required pattern slot, never repeats a movement inside a
> session, and never overruns its time budget.

**The time budget is a ceiling, not a quota.** Overrunning it is a bug; not filling it
is often correct — a beginner's volume is capped by safety rule 5, and a pool thinned by
a tight room and three limitations runs out of movements before it runs out of minutes.
So it is asserted as three properties rather than a percentage: it never overruns, more
time never yields less training, and the fitter never leaves room for another set it
could have added.

**Plan generation must stay reproducible.** The same answers give the same plan,
so the plan id must never feed the generator's seed. It is tempting (it makes a
second plan for the same situation look different), but it would mean the same
answers produced a different plan on every install, and "we built this from what
you told us" would stop being true.

**Every bug fix begins with a failing test.** No exceptions — a bug that had no test is
a bug that will come back.

---

## 9. Safety rules

This app tells people to move their bodies under load. These are invariants enforced in
the generator **and** asserted as properties in the test suite. They are not
configurable and not overridable by a template.

1. Never prescribe an exercise contraindicated by a declared limitation.
2. Never prescribe an `expert`-level movement to a `brand new` user.
3. Every session includes a warm-up matched to its movement patterns.
4. Plyometrics require **all** of: experience ≥ `fairly regular`, no knee flag,
   no `noJumping` constraint.
5. Beginner training volume is capped regardless of what the archetype requests.
6. Mobility sessions never contain plyometrics or maximal loading.
7. A medical disclaimer is shown during onboarding and acknowledged before the first
   session. Enforced, not merely recorded: `disclaimerAcceptedAt` gates
   `/workout/[id]`, which redirects to onboarding when it is null.

**When two rules conflict, the more conservative one wins.**

**One-sided movements are trained on both sides.** A timed set of a `unilateral`
exercise is halved and run once per side with a `switch` phase between, so the clock
cannot run out on the left leg and move the session on. The prescription is therefore
*both sides' worth* -- a 60s side plank is 30s a side -- and the library asserts it.
Alternating movements (walking lunges, marching bridges) are not `unilateral`: they
already train both sides inside the set. Rep sets are never split, because the person
ends them; the screen says "each side" instead.

### What these rules do and do not govern

They govern what the app **prescribes**: anything the generator puts in front of
someone unasked. They do not govern what a person may **choose** for themselves.

The exercise picker therefore shows the whole library, including movements that
need equipment a setup lacks or that load something the person is working
around — labelled, not hidden. Silently removing half the library from someone
building their own plan would be the more confusing and more paternalistic
answer, and it would not make anyone safer. The generator's invariants are
unaffected, and are still asserted as properties.

---

## 10. Accessibility

- **Timers announce at meaningful intervals** — halfway, ten seconds, done — via
  `aria-live="polite"`. Announcing every second is unusable with a screen reader.
- **Every phase change has a tone, and every tone has a visual equivalent.** The tone is
  chosen from *why* the machine moved (`ChimeKind`), not from the phase it landed in --
  a set ending, an exercise ending and "change sides" are three different instructions,
  and someone with the phone in a pocket has only the sound to tell them apart. The
  design's burst carries the visual half; it is a mark, not the word "TONE", because
  nobody needs to be told a sound is playing while it is playing.
- **Audio is unlocked from a real gesture.** iOS will not resume an `AudioContext`
  outside a gesture handler, and an effect that runs after a tap has already left it.
  `AudioUnlock` is mounted at the root and listens for the first pointer or key event
  anywhere in the app. Without it every timed phase passes in silence while rep sets --
  whose tone fires from a click -- sound fine, which is exactly how the bug hid.
- Touch targets ≥44px. The design's 56–60px buttons pass comfortably.
- Respect `prefers-reduced-motion` for all five keyframes.
- Full keyboard operability, including the player controls.

- **Zoom is never disabled.** No `maximum-scale`, no `user-scalable=no`. Blocking pinch
  zoom fails WCAG 1.4.4, and it bites hardest on the low-contrast labels below.
- The exercise picker is a real `<dialog>` opened with `showModal()`, so it gets a focus
  trap, Escape, and an inert background. A sheet that looks modal must behave modally.
- **Timers announce at halfway, ten seconds, and on the phase changing** — not at zero.
  The machine advances within 200ms of a countdown reaching zero, so a live region
  rendered at zero unmounts before a screen reader reaches it.

**Known contrast issue, resolved as a toggle:** the dim label tier `#5B606B` on the
`#08090B` screen background computes to roughly **3.1:1** — below the 4.5:1 AA threshold —
and it is used on small uppercase labels throughout. The design is kept as drawn and
`data-contrast="high"` lifts the three dimmest tiers for anyone who needs it
(`globals.css`, wired to the profile's `highContrast`). Do not propagate the raw pairing
to new surfaces; use the tokens, which respond to the toggle.

---

## 11. Performance budgets

- **The active-workout screen must not re-render the tree every second.** The timer lives
  in an isolated leaf component subscribed via a Zustand selector. This is the single
  most important performance rule in the app.
  The trap is subtle: a `useRemaining()`-style hook is only a leaf if it is *called* from
  one. Calling it in the phase component re-renders the whole phase — media, cues and all
  — several times a second, which is exactly what the leaves exist to prevent. See
  `app/workout/[id]/phases.tsx`.
- Initial JS < 200KB gzipped.
- The exercise library lazy-loads; it is never in the main bundle.
- Chime animation holds 60fps on a mid-range Android.
- Wake Lock is acquired on session start and released on completion or abandon —
  a leaked wake lock drains a battery in a pocket.

---

## 12. Definition of done

A change is done when **all** of these hold:

- [ ] `typecheck` passes
- [ ] `lint` passes
- [ ] `test` passes, and new logic came with new tests
- [ ] It works in airplane mode
- [ ] It matches the artboard at 402×874
- [ ] The app survives a hard reload while in that state
- [ ] `prefers-reduced-motion` and screen-reader passes are clean

---

## 13. Git and workflow

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Small, focused PRs. Feature branches. No direct commits to `main`.
- Commit messages say **why**, not what — the diff already says what.

---

## 14. Commands

```
npm run dev         # start the web app
npm run build       # production build
npm run typecheck   # tsc across the workspace
npm run lint        # eslint, including the boundary rule
npm run test        # vitest (core + db)
npm run test:e2e    # playwright
npm run library     # rebuild the exercise library from source
```
