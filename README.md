# FORM

An offline-first workout app that builds plans for **your situation** — at home,
at the gym, with whatever equipment is actually there.

## The idea

The situation is the input to the plan, not a filter over it.

- *"Home, dumbbells only"* → a dumbbells plan
- *"At the gym, but it has no leg press"* → a plan built around what that gym has
- *"Home, no equipment, never trained"* → a beginner bodyweight plan

Those are three different plans, not one plan with substitutions, because
equipment changes a plan's **structure** rather than just its exercise names:

| Situation | Reps | Rest | How you get stronger |
|---|---|---|---|
| Bodyweight | 10–16 | 63s | Move to a harder variation |
| Bands / one bell | 9–15 | 68s | Move to a harder variation |
| Dumbbells | 7–12 | 81s | Add reps, then weight |
| Garage gym | 5–9 | 108s | Add weight |
| Full gym | 5–8 | 117s | Add weight |

A **Setup** is one place you train. Most people have two or three and switch
between them; each gets its own plan, and history follows the person.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

## Commands

```bash
npm run dev          # start the web app
npm run build        # production build
npm run typecheck    # tsc across the workspace
npm run lint         # eslint, including the module boundary rule
npm run test         # vitest (core domain)
npm run test:e2e     # playwright (critical path)
npm run library      # rebuild the exercise library from source
```

## Layout

```
docs/ENGINEERING.md   the contract this build follows — read it first
packages/core/        pure TypeScript domain. No React, DOM, Next, or Dexie.
apps/web/             Next.js PWA
```

`packages/core` holds the exercise library, the situation → plan generator, the
safety gate, the workout state machine, and progression. It imports nothing but
`zod` and never reads the clock, which is enforced in CI. That keeps the domain
testable without mocks and makes a native port a copy rather than a rewrite.

## Exercise data

Seeded from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(873 exercises, Unlicense / public domain). The source has no movement pattern,
no injury contraindications, and no prescription, and its equipment vocabulary
does not match what a person actually owns — `scripts/build-library.ts` derives
those, and hand-authored overrides correct what heuristics get wrong.

It is also missing staples entirely (no jumping jacks, no burpee, no wall sit,
no pike push-up, almost nothing for bodyweight vertical push or pull), so
`scripts/supplements.ts` adds them. Without those, a no-equipment plan cannot
fill several pattern slots at all.

Rebuild with `npm run library`; add `-- --check-images` to verify every image
resolves before someone finds a broken one in a gym.

## Safety

The app prescribes physical training, so a few rules are enforced in the
generator *and* asserted as properties over arbitrary inputs:

1. Never prescribe an exercise contraindicated by a declared limitation
2. Never prescribe an expert movement, nor anything above beginner to a beginner
3. Every session has a dynamic warm-up
4. Plyometrics need experience, sound knees, and somewhere to land
5. Beginner volume is capped whatever the template asks for

Where two rules disagree, the more conservative wins. Full detail in
`docs/ENGINEERING.md`.

FORM builds general fitness plans and is not medical advice.
