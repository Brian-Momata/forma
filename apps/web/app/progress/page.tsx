"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@form/core";

import { Display, Kicker, Screen, ScrollArea } from "@/components/ui";
import { TabBar } from "@/components/ui/nav";
import { countFinishedSessions } from "@/db/repo";
import { streakDays, weekProgress } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useNow } from "@/lib/use-now";
import { useApp } from "@/store/app";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function ProgressPage() {
  const ready = useBootstrap();
  const { sessions, plans, library, profile } = useApp();
  const now = useNow();

  // The loaded history stops at 100; the lifetime total must not.
  const [lifetime, setLifetime] = useState<number | null>(null);
  useEffect(() => {
    void countFinishedSessions().then(setLifetime);
  }, [sessions.length]);

  const finished = sessions
    .filter((s) => s.endedAt !== null)
    .sort((a, b) => b.startedAt - a.startedAt);

  const totals = (() => {
    const seconds = finished.reduce(
      (sum, s) => sum + Math.max(0, ((s.endedAt ?? s.startedAt) - s.startedAt) / 1000),
      0
    );
    const sets = finished.reduce((n, s) => n + s.sets.filter((r) => !r.skipped).length, 0);
    return { sessions: finished.length, minutes: Math.round(seconds / 60), sets };
  })();

  const week = weekProgress(sessions, now);

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <Display size="title">Progress</Display>
        </div>

        <div className="flex gap-[3px] px-[22px] pb-6 pt-6">
          {week.map((done, i) => (
            <div key={i} className="flex-1">
              <div className="relative h-[3px] bg-white/10">
                {done && <div className="absolute inset-0" style={{ background: "var(--acc)" }} />}
              </div>
              <div className="mt-[6px] text-center text-[9.5px] font-semibold text-t5">
                {WEEKDAYS[i]}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-px bg-white/8 sm:grid-cols-4">
          {[
            { k: "Streak", v: String(streakDays(sessions, now)) },
            { k: "Sessions", v: String(lifetime ?? totals.sessions) },
            { k: "Sets", v: String(totals.sets) },
            { k: "Time", v: `${totals.minutes}m` },
          ].map((stat) => (
            <div key={stat.k} className="bg-screen px-4 py-5">
              <Display size="metric" weight={800} tabular>
                {stat.v}
              </Display>
              <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[.16em] text-t5">
                {stat.k}
              </div>
            </div>
          ))}
        </div>

        <Kicker className="px-[22px] pb-3 pt-8">History</Kicker>
        {!ready && <div className="px-[22px] text-[13px] text-t4">Loading…</div>}
        {ready && finished.length === 0 && (
          <p className="px-[22px] text-[13px] leading-relaxed text-t4">
            Nothing logged yet. Your first finished session shows up here.
          </p>
        )}

        {finished.map((session) => {
          const plan = plans.find((p) => p.id === session.planId);
          const logged = session.sets.filter((r) => !r.skipped);
          // Sessions recorded before day names were snapshotted fall back to
          // the plan, which is the best guess available for them.
          const title =
            session.dayName ?? plan?.days[session.dayIndex]?.name ?? plan?.name ?? "Session";
          const heaviest = logged.reduce(
            (kg, r) => Math.max(kg, r.weightKg ?? 0),
            0
          );
          const minutes = Math.round(
            Math.max(0, ((session.endedAt ?? session.startedAt) - session.startedAt) / 1000)
          );
          return (
            <div key={session.id} className="border-t border-hair-07 px-[22px] py-[15px]">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[15px] font-semibold tracking-[-.01em]">{title}</div>
                <div className="shrink-0 text-[12px] text-t4">
                  {new Date(session.startedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div className="mt-[3px] text-[12px] text-t4">
                {formatClock(minutes)} · {logged.length} sets
                {heaviest > 0
                  ? ` · up to ${
                      profile?.units === "lb"
                        ? `${Math.round(heaviest * 2.2046226)}lb`
                        : `${Math.round(heaviest * 2) / 2}kg`
                    }`
                  : ""}
                {session.feel ? ` · felt ${session.feel.replace("-", " ")}` : ""}
              </div>
              {library && logged.length > 0 && (
                <div className="mt-2 text-[11.5px] leading-[1.5] text-t5">
                  {[...new Set(logged.map((r) => library.byId(r.exerciseId)?.name))]
                    .filter(Boolean)
                    .slice(0, 4)
                    .join(" · ")}
                </div>
              )}
            </div>
          );
        })}

        <div className="h-6" />
      </ScrollArea>
      <TabBar />
    </Screen>
  );
}
