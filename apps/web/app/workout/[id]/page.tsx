"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { PlanId } from "@form/core";

import { PillButton, Screen } from "@/components/ui";
import { primeAudio } from "@/lib/audio";
import { resolveDay } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useSessionEngine } from "@/lib/use-session-engine";
import { newSession, readCheckpoint, saveSession } from "@/db/repo";
import { useApp } from "@/store/app";
import { useSession, type SessionCheckpoint } from "@/store/session";

import { ReadyPhase, RestPhase, SetPhase, TransitionPhase } from "./phases";

function WorkoutScreen() {
  const ready = useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const planId = params.id as PlanId;
  const dayIndex = Number(search.get("day") ?? "0");

  const { library, plans, profile } = useApp();
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
    const plan = plans.find((p) => p.id === planId);
    const day = plan?.days[dayIndex];
    if (!plan || !day) return;

    started.current = true;

    void (async () => {
      // An interrupted session is resumed rather than restarted -- state
      // recomputes from its stored timestamps, so nothing is lost.
      const saved = await readCheckpoint<SessionCheckpoint>();
      if (
        saved &&
        saved.meta.planId === planId &&
        saved.meta.dayIndex === dayIndex &&
        saved.player.phase !== "complete"
      ) {
        restore(saved.player, saved.meta);
        return;
      }

      const session = newSession(plan.id, plan.setupId, dayIndex);
      await saveSession(session);

      begin(
        resolveDay(library, day),
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
  }, [ready, library, profile, plans, planId, dayIndex, begin, restore]);

  // iOS keeps audio muted until a gesture unlocks it; this page is reached by a tap.
  useEffect(() => {
    primeAudio();
  }, []);

  useEffect(() => {
    if (player?.phase === "complete") {
      router.replace(`/workout/${planId}/complete`);
    }
  }, [player?.phase, planId, router]);

  if (!player) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[13px] text-t4">Getting your session ready…</div>
        </div>
      </Screen>
    );
  }

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
      return <SetPhase state={player} onExit={exit} />;
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
