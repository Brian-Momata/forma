"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { PlanId } from "@form/core";

import { Loading, NotFound, PillButton, Screen } from "@/components/ui";
import { primeAudio } from "@/lib/audio";
import { lastLoggedWeights, resolveDay } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useSessionEngine } from "@/lib/use-session-engine";
import { newSession, readCheckpoint, saveSession } from "@/db/repo";
import { useApp } from "@/store/app";
import { useSession, type SessionCheckpoint } from "@/store/session";

import { ReadyPhase, RestPhase, SetPhase, SwitchPhase, TransitionPhase } from "./phases";

/** Older than this and a checkpoint is a memory, not a session in progress. */
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

function WorkoutScreen() {
  const ready = useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const planId = params.id as PlanId;
  // A hand-typed or stale ?day is not a reason to sit on a spinner forever.
  const rawDay = Number.parseInt(search.get("day") ?? "0", 10);
  const requestedDay = Number.isFinite(rawDay) && rawDay >= 0 ? rawDay : 0;

  const { library, plans, profile } = useApp();
  const plan = plans.find((p) => p.id === planId);
  // Clamped rather than rejected: a plan that lost a day should start the
  // session that does exist, not refuse to open.
  const dayIndex = plan ? Math.min(requestedDay, Math.max(0, plan.days.length - 1)) : requestedDay;
  const player = useSession((s) => s.player);
  const begin = useSession((s) => s.begin);
  const restore = useSession((s) => s.restore);
  const abandon = useSession((s) => s.abandon);
  const [confirmExit, setConfirmExit] = useState(false);

  useSessionEngine();

  // StrictMode mounts effects twice in development; starting a session is not
  // idempotent, so guard it.
  const started = useRef(false);

  useEffect(() => {
    if (!ready || !library || !profile || started.current) return;
    const day = plan?.days[dayIndex];
    if (!plan || !day) return;
    // Safety rule 7: the disclaimer is acknowledged before the first session,
    // not merely stored at onboarding. The redirect below handles this too.
    if (profile.disclaimerAcceptedAt === null) return;

    started.current = true;

    void (async () => {
      // An interrupted session is resumed rather than restarted -- state
      // recomputes from its stored timestamps, so nothing is lost.
      const saved = await readCheckpoint<SessionCheckpoint>();
      const age = saved ? Date.now() - saved.player.startedAt : Infinity;
      if (
        saved &&
        saved.meta.planId === planId &&
        saved.meta.dayIndex === dayIndex &&
        saved.player.phase !== "complete" &&
        // A session left open overnight is not one you are still in the middle
        // of. Resuming it would reuse its row and report a workout that lasted
        // two days.
        age < STALE_SESSION_MS
      ) {
        restore(saved.player, saved.meta);
        return;
      }

      const session = newSession(plan.id, plan.setupId, dayIndex, day.name);
      await saveSession(session);

      // Read at start rather than subscribed to: what someone lifted in past
      // sessions is what the weight control opens on, and re-reading it as the
      // store changes would restart the session.
      const { items } = resolveDay(library, day, lastLoggedWeights(useApp.getState().sessions));
      begin(
        items,
        {
          sessionId: session.id,
          planId: plan.id,
          setupId: plan.setupId,
          dayIndex,
          planName: plan.name,
          dayName: day.name,
        },
        { autoAdvance: profile.autoAdvance, restOverrideSec: profile.restOverrideSec }
      );
    })();
  }, [ready, library, profile, plan, planId, dayIndex, begin, restore]);

  // Nobody trains before acknowledging what the app is and is not.
  useEffect(() => {
    if (ready && profile && profile.disclaimerAcceptedAt === null) {
      router.replace("/onboarding");
    }
  }, [ready, profile, router]);

  // iOS keeps audio muted until a gesture unlocks it; this page is reached by a tap.
  useEffect(() => {
    primeAudio();
  }, []);

  useEffect(() => {
    if (player?.phase === "complete") {
      router.replace(`/workout/${planId}/complete`);
    }
  }, [player?.phase, planId, router]);

  if (ready && library && profile && !plan) {
    return (
      <NotFound
        title="That plan is gone"
        body="It may have been deleted since this link was made."
        href="/plans"
        label="Back to your plans"
      />
    );
  }

  if (ready && plan && plan.days.every((d) => d.exercises.length === 0)) {
    return (
      <NotFound
        title="Nothing to train yet"
        body="This plan has no movements in it. Add some and it is ready to run."
        href={`/plan/${planId}`}
        label="Open the plan"
      />
    );
  }

  if (!player) return <Loading message="Getting your session ready…" />;

  const exit = () => setConfirmExit(true);

  if (confirmExit) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col justify-center px-[22px]">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 108',
              fontSize: 34,
              fontWeight: 900,
              letterSpacing: "-.035em",
              lineHeight: 1.05,
            }}
          >
            End this session?
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-t3">
            The sets you have already finished are kept.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <PillButton
              onClick={() => {
                abandon();
                router.replace(`/workout/${planId}/complete`);
              }}
            >
              End and save
            </PillButton>
            <PillButton variant="outline" onClick={() => setConfirmExit(false)}>
              Keep going
            </PillButton>
          </div>
        </div>
      </Screen>
    );
  }

  switch (player.phase) {
    case "ready":
      return <ReadyPhase state={player} />;
    case "set":
      return <SetPhase state={player} onExit={exit} units={profile?.units ?? "kg"} />;
    case "switch":
      return <SwitchPhase state={player} />;
    case "rest":
      return <RestPhase state={player} onExit={exit} />;
    case "transition":
      return <TransitionPhase state={player} />;
    default:
      return null;
  }
}

export default function WorkoutPage() {
  return (
    <Suspense
      fallback={
        <Screen>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-[13px] text-t4">Loading…</div>
          </div>
        </Screen>
      }
    >
      <WorkoutScreen />
    </Suspense>
  );
}
