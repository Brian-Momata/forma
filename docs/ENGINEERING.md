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

Enforced by ESLint `no-restricted-imports` and a `dependency-cruiser` rule that fails
CI. This is a gate, not a convention.

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
- Every persisted record carries `id`, `createdAt`, `updatedAt`, `schemaVersion`.
- **Dexie migrations are additive.** Never delete or repurpose a field in place.
- **Every migration ships with a test** that runs it against a fixture database built
  at the previous version and asserts nothing was lost.
- **Never persist derived values.** Plan duration, streak, weekly volume, and total sets
  are computed. Persisted derived values go stale and then lie.

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

---

## 8. Testing strategy

| Layer | Approach | Depth |
|---|---|---|
| `packages/core` | Vitest unit + **property-based** (fast-check) | Heavy — correctness lives here |
| `apps/web/db` | Repository + migration tests on `fake-indexeddb` | Medium |
| UI | Playwright, critical path only | Light |

**We do not write shallow component tests.** They assert that the code is the code.
Test the domain properly and smoke-test the path a real person walks.

**The generator's guarantees are properties, not examples.** Write them as invariants
over arbitrary valid inputs and let fast-check find the edge cases we wouldn't think of:

> For any valid `(profile, setup)`, the generated plan contains no contraindicated
> exercise, no exercise requiring unavailable equipment, no expert movement for a
> beginner, fills every required pattern slot, and fits its time budget.

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
7. A medical disclaimer is shown during onboarding and acknowledged before the first session.

**When two rules conflict, the more conservative one wins.**

---

## 10. Accessibility

- **Timers announce at meaningful intervals** — halfway, ten seconds, done — via
  `aria-live="polite"`. Announcing every second is unusable with a screen reader.
- The end-of-set tone always has a visual equivalent. The design's "TONE" burst already
  does this well; keep it.
- Touch targets ≥44px. The design's 56–60px buttons pass comfortably.
- Respect `prefers-reduced-motion` for all five keyframes.
- Full keyboard operability, including the player controls.

**Known contrast issue, tracked:** the dim label tier `#5B606B` on the `#08090B` screen
background computes to roughly **3.1:1** — below the 4.5:1 AA threshold — and it is used
on small uppercase labels throughout (section headers, stat captions). Resolution is
pending a product decision: lighten the token, or keep the design as drawn and ship a
high-contrast toggle. Until it is resolved, do not propagate this pairing to new surfaces.

---

## 11. Performance budgets

- **The active-workout screen must not re-render the tree every second.** The timer lives
  in an isolated leaf component subscribed via a Zustand selector. This is the single
  most important performance rule in the app.
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
