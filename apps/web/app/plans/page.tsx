"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Display, Kicker, PillButton, Screen, ScrollArea, Tag } from "@/components/ui";
import { TabBar } from "@/components/ui/nav";
import { summarise } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

const GOAL_LABEL: Record<string, string> = {
  strength: "Strength",
  "fat-loss": "Fat loss",
  mobility: "Mobility",
  endurance: "Endurance",
  general: "General",
};

export default function PlansPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const { plans, setups, activePlan, activatePlan } = useApp();

  const use = async (id: (typeof plans)[number]["id"]) => {
    await activatePlan(id);
    router.push("/");
  };

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <Display size="title">Plans</Display>
          <p className="mt-[10px] text-[13.5px] leading-[1.55] text-t3">
            Keep as many as you like. A strength block at the gym and a mobility plan at
            home can run in the same week.
          </p>
          <PillButton className="mt-5 w-full" onClick={() => router.push("/plans/new")}>
            New plan
          </PillButton>
        </div>

        {!ready && <div className="px-[22px] pt-8 text-[13px] text-t4">Loading…</div>}

        {ready && plans.length === 0 && (
          <p className="px-[22px] pt-8 text-[13px] leading-relaxed text-t4">
            No plans yet. Build one, or start empty and pick every exercise yourself.
          </p>
        )}

        {setups.map((setup) => {
          const setupPlans = plans.filter((p) => p.setupId === setup.id);
          if (setupPlans.length === 0) return null;

          return (
            <div key={setup.id} className="pt-7">
              <Kicker className="px-[22px] pb-3">{setup.name}</Kicker>

              {setupPlans.map((plan) => {
                const days = summarise(plan);
                const total = days.reduce((n, d) => n + d.minutes, 0);
                const active = plan.id === activePlan?.id;
                const empty = days.every((d) => d.exercises === 0);

                return (
                  <div key={plan.id} className="border-t border-hair-07 px-[22px] py-[18px]">
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{
                          background: active ? "var(--acc)" : "var(--color-line2)",
                          boxShadow: active ? "0 0 12px var(--acc)" : undefined,
                        }}
                      />
                      <Link href={`/plan/${plan.id}`} className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="truncate text-[16px] font-semibold tracking-[-.012em]">
                            {plan.name}
                          </div>
                          <div className="shrink-0 text-[12px] text-t4">week {plan.week}</div>
                        </div>
                        <div className="mt-[3px] text-[12px] text-t4">
                          {GOAL_LABEL[plan.goal] ?? plan.goal} · {plan.days.length} sessions ·{" "}
                          {empty ? "nothing added yet" : `${total} min a week`}
                        </div>
                        {plan.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-[6px]">
                            {plan.tags.slice(0, 4).map((tag) => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </div>
                        )}
                      </Link>
                    </div>

                    {!active && !empty && (
                      <button
                        type="button"
                        onClick={() => void use(plan.id)}
                        className="ml-[19px] mt-3 rounded-full border border-hair-14 px-4 py-2 text-[12px] font-semibold text-t2 transition-colors hover:border-acc hover:text-acc"
                      >
                        Train this today
                      </button>
                    )}
                    {active && (
                      <div className="ml-[19px] mt-3 text-[11.5px] font-semibold uppercase tracking-[.14em] text-acc">
                        Current plan
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="px-[22px] pt-10">
          <PillButton
            variant="outline"
            className="w-full"
            onClick={() => router.push("/setups/new")}
          >
            Add a setup
          </PillButton>
        </div>
        <div className="h-6" />
      </ScrollArea>
      <TabBar />
    </Screen>
  );
}
