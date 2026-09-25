import { expect, test, type Page } from "@playwright/test";

/**
 * How a session ends decides whether the plan moves on.
 *
 * The Complete screen is the only place feedback is applied, so a reload
 * there used to drop it -- the plan never progressed, and the weights lifted
 * were never written back. And ending a session before doing anything used to
 * count as a day trained, skip the plan to its next day, and progress it.
 */

async function onboard(page: Page) {
  await page.goto("/onboarding");
  await expect(page.getByText("What are you training for?")).toBeVisible();
  await page.getByRole("button", { name: /Build strength/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /At home/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Dumbbells/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Coming back/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /3 days/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Nothing right now/ }).click();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await page.waitForURL("**/", { timeout: 30_000 });
}

/** Drives the session past the warm-up to the first working set that takes load. */
async function reachWorkingSet(page: Page) {
  const more = page.getByRole("button", { name: "More weight" });
  for (let i = 0; i < 200; i++) {
    if (await more.isVisible().catch(() => false)) return;
    for (const label of ["Set complete", "Start now", "Skip rest", "Skip"]) {
      const b = page.getByRole("button", { name: label });
      if (await b.isVisible().catch(() => false)) {
        await b.click();
        break;
      }
    }
    await page.clock.runFor(4000);
  }
  throw new Error("never reached a working set");
}

async function endSession(page: Page) {
  await page.getByRole("button", { name: "End workout" }).click();
  await page.getByRole("button", { name: "End and save" }).click();
}

test("a reload on the Complete screen still asks how it felt", async ({ page }) => {
  test.setTimeout(150_000);
  await onboard(page);
  await page.clock.install();
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Get ready")).toBeVisible({ timeout: 30_000 });
  await reachWorkingSet(page);
  await page.getByRole("button", { name: "Set complete" }).click();
  await endSession(page);
  await expect(page.getByText("How did that feel?")).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByText("How did that feel?")).toBeVisible({ timeout: 20_000 });

  // And reopening the app at Home brings it back too, until it is answered.
  await page.goto("/");
  await expect(page.getByText("How did that feel?")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL("**/", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
});

test("ending a session before doing anything does not count it", async ({ page }) => {
  test.setTimeout(90_000);
  await onboard(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/day=0/);
  // Past the three-second get-ready and into the first set, then straight out.
  await expect(page.getByRole("button", { name: "End workout" })).toBeVisible({
    timeout: 30_000,
  });
  await endSession(page);

  // Nothing to rate, so straight home, and still on the day never trained.
  await page.waitForURL("**/", { timeout: 20_000 });
  await expect(page.getByText("How did that feel?")).toHaveCount(0);
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/day=0/);
});
