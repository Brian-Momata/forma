"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { InstallPrompt } from "@/components/install-prompt";
import { Display, Kicker, Loading, PillButton, Screen, ScrollArea } from "@/components/ui";
import { MediaWell } from "@/components/ui/media";
import { TabBar } from "@/components/ui/nav";
import { useBootstrap, useBootstrapError } from "@/lib/use-bootstrap";
import { useNow } from "@/lib/use-now";
import {
  nextDayIndex,
  streakDays,
  summarise,
  upcomingDays,
  weekProgress,
  weekdayLabel,
} from "@/lib/plan";
import { useApp } from "@/store/app";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const FULL_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function TodayPage() {
  const ready = useBootstrap();
  const { error, retry } = useBootstrapError();
  const router = useRouter();
  const { profile, sessions, activeSetup, activePlan, library } = useApp();

  // No profile means nobody has been through onboarding on this device yet.
  // They go to Welcome, not to question one: onboarding asks what someone is
  // training for before saying what the app will do with the answer.
  useEffect(() => {
    if (ready && !profile) router.replace("/welcome");
  }, [ready, profile, router]);

  const plan = activePlan;

  const now = useNow();
  const days = plan ? summarise(plan) : [];
  const todayIndex = plan ? nextDayIndex(plan, sessions) : 0;
  const today = days[todayIndex];
  const upcoming = upcomingDays(days, todayIndex);

  const streak = streakDays(sessions, now);
  const week = weekProgress(sessions, now);
  const doneThisWeek = week.filter(Boolean).length;
  // The schedule lives on the plan, not the person (ENGINEERING.md §5): the
  // profile only holds a default for the *next* plan, so counting against it
  // told someone running five days a week that they were 2/3 of the way there.
  const target = plan?.schedule.daysPerWeek ?? profile?.schedule.daysPerWeek ?? 3;

  const firstWorking = today?.day.exercises.find((e) => !e.warmup);
  const heroExercise =
    library && firstWorking ? (library.byId(firstWorking.exerciseId) ?? null) : null;

  // `now` is 0 until the clock store is subscribed after mount; rendering a
  // date before then would render the epoch.
  if (!ready || !profile || now === 0) {
    return <Loading error={error} onRetry={retry} />;
  }

  const date = new Date(now);

  return (
    <Screen>
      <ScrollArea>
        <div className="flex items-center justify-between px-[22px] pt-[58px]">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wdth" 118',
              fontSize: 19,
              fontWeight: 900,
              letterSpacing: "-.02em",
            }}
          >
            FORM<span className="text-acc">.</span>
          </div>
          <Link
            href="/setups"
            className="flex h-[34px] items-center rounded-full border border-hair-14 px-3 text-[11.5px] font-semibold text-t2 transition-colors hover:border-acc hover:text-acc"
          >
            {activeSetup?.name ?? "Set up"}
          </Link>
        </div>

        <div className="flex items-end gap-[18px] px-[22px] pb-5 pt-[26px]">
          <div className="flex-1">
            <Kicker>{date.toLocaleDateString(undefined, { weekday: "long" })}</Kicker>
            <Display size="date" className="mt-[6px]" tabular>
              {date.getDate()}
            </Display>
          </div>
          <div className="flex gap-[18px] pb-[6px]">
            <div>
              <Display size="metric" weight={800} tabular style={{ color: "var(--acc)" }}>
                {streak}
              </Display>
              <div className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[.16em] text-t5">
                Streak
              </div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <Display size="metric" weight={800} tabular>
                {doneThisWeek}/{target}
              </Display>
              <div className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[.16em] text-t5">
                Week
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex gap-[3px] px-[22px] pb-6"
          role="group"
          aria-label={`Trained ${doneThisWeek} of the last 7 days`}
        >
          {week.map((done, i) => (
            <div key={i} className="flex-1">
              <div className="relative h-[3px] bg-white/10">
                {done && <div className="absolute inset-0" style={{ background: "var(--acc)" }} />}
              </div>
              <div className="mt-[6px] text-center text-[9.5px] font-semibold text-t5">
                <span aria-hidden>{WEEKDAYS[i]}</span>
                <span className="sr-only">
                  {FULL_WEEKDAYS[i]}: {done ? "trained" : "not trained"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {plan && today ? (
          <>
            <div className="relative h-[196px]">
              <MediaWell
                images={heroExercise?.images ?? []}
                name={heroExercise?.name ?? plan.name}
                        className="h-full w-full"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg,rgba(8,9,11,0) 40%,rgba(8,9,11,.55) 100%)",
                }}
              />
              <div
                className="pointer-events-none absolute left-[22px] top-4 px-[9px] py-[5px] text-[9.5px] font-extrabold uppercase tracking-[.16em]"
                style={{ background: "var(--acc)", color: "var(--color-screen)" }}
              >
                Today · {plan.name} · {plan.tier.replace("-", " ")}
              </div>
            </div>

            <div className="px-[22px] pt-5">
              <Display size="hero">{today.day.name}</Display>
              <div className="mt-3 flex gap-[14px] text-[12px] font-medium text-t2">
                <div>{today.minutes} min</div>
                <div className="text-dim">/</div>
                <div>{today.exercises} exercises</div>
                <div className="text-dim">/</div>
                <div>{today.sets} sets</div>
              </div>
            </div>

            <div className="flex gap-[10px] px-[22px] pt-4">
              <PillButton
                className="flex-1"
                onClick={() => router.push(`/workout/${plan.id}?day=${todayIndex}`)}
              >
                Start workout
              </PillButton>
              <Link
                href={`/plan/${plan.id}`}
                className="flex h-[58px] w-[58px] items-center justify-center rounded-full border border-hair-16 text-[12px] font-bold text-t2 transition-colors hover:border-acc hover:text-acc"
              >
                Edit
              </Link>
            </div>

            <InstallPrompt />

            {upcoming.length > 0 && (
              <>
                <Kicker className="px-[22px] pb-3 pt-[30px]">Coming up</Kicker>
                {upcoming.map((d) => (
                  <Link
                    key={d.index}
                    href={`/workout/${plan.id}?day=${d.index}`}
                    className="flex items-center gap-[14px] border-t border-hair-07 px-[22px] py-[15px] transition-colors hover:bg-white/3"
                  >
                    <div
                      className="w-[26px] shrink-0 text-dim"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontVariationSettings: '"wdth" 112',
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {String(d.index + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <div className="text-[15px] font-semibold tracking-[-.01em]">
                        {d.day.name}
                      </div>
                      <div className="mt-[2px] text-[12px] text-t4">
                        {weekdayLabel(d.day) ? `${weekdayLabel(d.day)} · ` : ""}
                        {d.minutes} min · {d.exercises} exercises
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="px-[22px] py-10">
            <Display size="title">No plan yet</Display>
            <p className="mt-3 text-[14px] leading-relaxed text-t3">
              Tell us where you are training and what you have, and we will build one.
            </p>
            <PillButton className="mt-6 w-full" onClick={() => router.push("/setups/new")}>
              Add a setup
            </PillButton>
          </div>
        )}

        <div className="h-5" />
      </ScrollArea>

      <TabBar />
    </Screen>
  );
}
