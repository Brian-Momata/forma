"use client";

import { useParams, useRouter } from "next/navigation";
import type { SetupId } from "@form/core";

import { Loading, NotFound, Screen } from "@/components/ui";
import { SetupEditor } from "@/components/setup-editor";
import { deleteSetup } from "@/db/repo";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

export default function EditSetupPage() {
  const ready = useBootstrap();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { setups, plans, upsertSetup, regenerateForSetup, refresh } = useApp();

  const setup = setups.find((s) => s.id === (params.id as SetupId));

  if (!ready) return <Loading />;
  if (!setup) {
    return (
      <NotFound
        title="That setup is gone"
        body="It may have been deleted on this device."
        href="/setups"
        label="Back to your setups"
      />
    );
  }

  return (
    <Screen>
      <SetupEditor
        initial={setup}
        planCount={plans.filter((p) => p.setupId === setup.id).length}
        onCancel={() => router.back()}
        onSave={async (next) => {
          const saved = await upsertSetup(next);
          // Equipment changed means the situation changed, so the plan must be
          // rebuilt -- that is the whole premise.
          await regenerateForSetup(saved);
          router.replace("/setups");
        }}
        onDelete={async () => {
          await deleteSetup(setup.id);
          await refresh();
          router.replace("/setups");
        }}
      />
    </Screen>
  );
}
