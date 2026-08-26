"use client";

import { useRouter } from "next/navigation";
import type { Setup, SetupId } from "@form/core";

import { Screen } from "@/components/ui";
import { SetupEditor } from "@/components/setup-editor";
import { newId } from "@/db/repo";
import { useBootstrap } from "@/lib/use-bootstrap";
import { useApp } from "@/store/app";

export default function NewSetupPage() {
  useBootstrap();
  const router = useRouter();
  const { upsertSetup, activateSetup, regenerateForSetup } = useApp();

  // Timestamps are stamped on save, not during render.
  const blank: Setup = {
    id: newId("setup") as SetupId,
    name: "",
    location: "home",
    equipment: [],
    constraints: { tightSpace: false, noJumping: false, quiet: false },
    createdAt: 0,
    updatedAt: 0,
  };

  return (
    <Screen>
      <SetupEditor
        initial={blank}
        onCancel={() => router.back()}
        onSave={async (setup) => {
          const saved = await upsertSetup({ ...setup, createdAt: Date.now() });
          await activateSetup(saved.id);
          await regenerateForSetup(saved);
          router.replace("/");
        }}
      />
    </Screen>
  );
}
