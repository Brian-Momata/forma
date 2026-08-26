"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveTier } from "@form/core";

import { Display, Kicker, PillButton, Screen, ScrollArea } from "@/components/ui";
import { BackLink, TabBar } from "@/components/ui/nav";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

export default function SetupsPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const { setups, plans, activeSetup, activateSetup, activatePlan, regenerateForSetup } =
    useApp();

  const switchTo = async (id: (typeof setups)[number]["id"]) => {
    await activateSetup(id);
    const setup = setups.find((s) => s.id === id);
    if (!setup) return;

    // Switching where you are switches what you train. Use a plan this setup
    // already has; only build one if it has none at all.
    const existing = plans.filter((p) => p.setupId === id);
    if (existing[0]) await activatePlan(existing[0].id);
    else await regenerateForSetup(setup);
    router.push("/");
  };

  return (
    <Screen>
      <ScrollArea>
        <div className="px-[22px] pt-[58px]">
          <BackLink href="/" />
          <Display size="title" className="mt-4">
            Your setups
          </Display>
          <p className="mt-[10px] pb-6 text-[13.5px] leading-[1.55] text-t3">
            Each place you train gets its own plan, built for what is actually there.
            Switch between them whenever.
          </p>
        </div>

        {!ready && <div className="px-[22px] text-[13px] text-t4">Loading…</div>}

        {setups.map((setup) => {
          const active = setup.id === activeSetup?.id;
          const tier = resolveTier(setup.equipment);
          return (
            <div key={setup.id} className="border-t border-hair-07 px-[22px] py-[18px]">
              <div className="flex items-center gap-3">
                <div
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{
                    background: active ? "var(--acc)" : "var(--color-line2)",
                    boxShadow: active ? "0 0 12px var(--acc)" : undefined,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold tracking-[-.012em]">
                    {setup.name}
                  </div>
                  <div className="mt-[3px] text-[12px] text-t4">
                    {setup.location} · {tier.replace("-", " ")} ·{" "}
                    {setup.equipment.length === 0
                      ? "no equipment"
                      : `${setup.equipment.length} items`}
                  </div>
                </div>
                <Link
                  href={`/setups/${setup.id}`}
                  className="shrink-0 text-[12px] font-semibold text-t4 hover:text-acc"
                >
                  Edit
                </Link>
              </div>

              {!active && (
                <button
                  type="button"
                  onClick={() => void switchTo(setup.id)}
                  className="mt-3 rounded-full border border-hair-14 px-4 py-2 text-[12px] font-semibold text-t2 transition-colors hover:border-acc hover:text-acc"
                >
                  Train here today
                </button>
              )}
            </div>
          );
        })}

        {ready && setups.length === 0 && (
          <p className="px-[22px] text-[13px] text-t4">No setups yet.</p>
        )}

        <div className="px-[22px] pt-8">
          <Kicker>Add another</Kicker>
          <p className="mt-2 text-[13px] leading-[1.5] text-t4">
            Travelling, or training somewhere with different equipment? Add it here and
            we will build a plan that fits it.
          </p>
          <PillButton className="mt-4 w-full" onClick={() => router.push("/setups/new")}>
            New setup
          </PillButton>
        </div>

        <div className="h-6" />
      </ScrollArea>
      <TabBar />
    </Screen>
  );
}
