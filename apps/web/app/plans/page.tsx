"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Display, Kicker, PillButton, Screen, ScrollArea, Tag } from "@/components/ui";
import { TabBar } from "@/components/ui/nav";
import { summarise } from "@/lib/plan";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

export default function PlansPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const { plans, setups, activeSetup, regeneratePlan } = useApp();

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <Display size="title">Plans</Display>
          <p className="mt-[10px] pb-2 text-[13.5px] leading-[1.55] text-t3">
            One plan per setup, built for what that place actually has.
          </p>
        </div>

        {!ready && <div className="px-[22px] pt-6 text-[13px] text-t4">Loading…</div>}

        {setups.map((setup) => {
          const setupPlans = plans.filter((p) => p.setupId === setup.id);
          return (
            <div key={setup.id} className="pt-7">
              <div className="flex items-baseline justify-between px-[22px] pb-3">
                <Kicker tone={setup.id === activeSetup?.id ? "accent" : "muted"}>
                  {setup.name}
                </Kicker>
                {setupPlans.length === 0 && (
                  <button
                    type="button"
                    onClick={() => void regeneratePlan(setup)}
                    className="text-[12px] font-semibold text-t4 hover:text-acc"
                  >
                    Build one
                  </button>
                )}
              </div>

              {setupPlans.map((plan) => {
                const days = summarise(plan);
                const total = days.reduce((n, d) => n + d.minutes, 0);
                return (
                  <Link
                    key={plan.id}
                    href={`/plan/${plan.id}`}
                    className="block border-t border-hair-07 px-[22px] py-[18px] transition-colors hover:bg-white/3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-[16px] font-semibold tracking-[-.012em]">
                        {plan.name}
                      </div>
                      <div className="shrink-0 text-[12px] text-t4">week {plan.week}</div>
                    </div>
                    <div className="mt-[3px] text-[12px] text-t4">
                      {plan.days.length} sessions · {total} min a week ·{" "}
                      {plan.generated ? "generated" : "edited by you"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-[6px]">
                      {plan.tags.slice(0, 4).map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}

        <div className="px-[22px] pt-10">
          <PillButton variant="outline" className="w-full" onClick={() => router.push("/setups/new")}>
            Add a setup
          </PillButton>
        </div>
        <div className="h-6" />
      </ScrollArea>
      <TabBar />
    </Screen>
  );
}
