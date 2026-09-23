import { expect, test, type Page } from "@playwright/test";

/**
 * A weight typed in once stays typed in.
 *
 * It used to live only in the session record. The stepper opens on the plan's
 * target, and the only code that ever wrote that target was load progression
 * -- which runs on a barbell plan, and only when you answer "too easy". On a
 * dumbbell plan the number was thrown away after every single session, so the
 * next one asked again from blank and load progression had nothing to progress.
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

/** What the set screen currently says is on the bar. */
const weightField = (page: Page) =>
  page.locator("div.tabular-nums").filter({ hasText: "kg" }).first();

/** Drives the session forward until a movement that takes external load. */
async function reachLoadableSet(page: Page) {
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
  throw new Error("never reached a loadable set");
}

test("the weight comes back next session", async ({ page }) => {
  test.setTimeout(150_000);
  await onboard(page);
  await page.clock.install();
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Get ready")).toBeVisible({ timeout: 30_000 });
  const planUrl = page.url();
  await reachLoadableSet(page);
  for (let k = 0; k < 12; k++) await page.getByRole("button", { name: "More weight" }).click();
  const dialled = (await weightField(page).innerText()).trim();
  console.log("dialled in:", dialled);

  // Bank the set and close the session out the way a real person does.
  await page.getByRole("button", { name: "Set complete" }).click();
  await page.getByRole("button", { name: "End workout" }).click();
  await page.getByRole("button", { name: "End and save" }).click();
  await expect(page.getByText("How did that feel?")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL("**/", { timeout: 20_000 });

  // The same session again, on a freshly loaded app: the stepper must open on
  // that number rather than on a dash.
  await page.goto(planUrl.split("?")[0] + "?day=0");
  await expect(page.getByText("Get ready")).toBeVisible({ timeout: 30_000 });
  await page.clock.install();
  await reachLoadableSet(page);
  const shown = (await weightField(page).innerText()).trim();
  console.log("next session opens on:", shown);
  expect(shown).toBe(dialled);
});
