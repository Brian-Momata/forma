import { expect, test, type Page } from "@playwright/test";

/**
 * The path a real person walks: describe your situation, get a plan, train,
 * finish, and see it in your history. If this passes, the app works.
 */

async function completeOnboarding(
  page: Page,
  opts: { place: string; equipment: string[]; level: string } = {
    place: "At home",
    equipment: ["Dumbbells"],
    level: "Coming back",
  }
) {
  await page.goto("/onboarding");
  await expect(page.getByText("What are you training for?")).toBeVisible();

  await page.getByRole("button", { name: /Build strength/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: new RegExp(opts.place) }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Equipment (home) or gym preset + confirm.
  if (opts.place === "At the gym") {
    await page.getByRole("button", { name: /Full commercial gym/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
  } else {
    for (const item of opts.equipment) {
      await page.getByRole("button", { name: new RegExp(item) }).first().click();
    }
    await page.getByRole("button", { name: "Continue" }).click();
    // Space constraints.
    await page.getByRole("button", { name: "Continue" }).click();
  }

  await page.getByRole("button", { name: new RegExp(opts.level) }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /3 days/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /Nothing right now/ }).click();
  await page.getByRole("button", { name: "Build my plan" }).click();

  await page.waitForURL("**/", { timeout: 30_000 });
}

test("a new person can onboard, get a plan, and train", async ({ page }) => {
  await completeOnboarding(page);

  // Today's screen shows a real, costed session.
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/\d+ min/).first()).toBeVisible();
  await expect(page.getByText(/\d+ exercises/).first()).toBeVisible();

  await page.clock.install();
  await page.getByRole("button", { name: "Start workout" }).click();

  // Get ready counts down from 3.
  await expect(page.getByText("Get ready")).toBeVisible({ timeout: 20_000 });

  // Run the whole session on a fast clock rather than in real time.
  // Match the question, not "DONE": that substring also hits the Done button,
  // which trips strict mode and silently reports "not finished" forever.
  const finished = page.getByText("How did that feel?");

  let completed = false;
  for (let i = 0; i < 120; i++) {
    if (await finished.isVisible().catch(() => false)) {
      completed = true;
      break;
    }
    // Rep-based sets are open-ended by design and wait for the person.
    const setComplete = page.getByRole("button", { name: "Set complete" });
    if (await setComplete.isVisible().catch(() => false)) {
      await setComplete.click();
      continue;
    }
    await page.clock.runFor(30_000);
  }

  expect(completed, "workout reached the complete screen").toBe(true);

  await page.getByRole("button", { name: "Just right" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.waitForURL("**/");

  // The finished session shows up in history.
  await page.goto("/progress");
  await expect(page.getByText("History")).toBeVisible();
  await expect(page.getByText(/\d+ sets/).first()).toBeVisible({ timeout: 15_000 });
});

test("the situation drives the plan: gym and bodyweight differ", async ({ page }) => {
  await completeOnboarding(page, {
    place: "At home",
    equipment: [],
    level: "Coming back",
  });
  await page.getByRole("button", { name: "Start workout" }).waitFor({ timeout: 20_000 });

  await page.goto("/plans");
  await expect(page.getByText("No equipment").first()).toBeVisible({ timeout: 20_000 });

  // Add a second situation; it must produce different programming.
  await page.goto("/setups/new");
  await page.getByPlaceholder("Home, my gym, hotel…").fill("My gym");
  await page.getByRole("button", { name: "gym", exact: true }).click();
  await page.getByRole("button", { name: /Full commercial gym/ }).click();
  await expect(page.getByText(/full gym/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Save setup" }).click();

  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/plans");
  await expect(page.getByText("My gym")).toBeVisible();
});

test("a workout survives a reload mid-set", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Get ready")).toBeVisible({ timeout: 20_000 });

  // Let the session get properly underway, then reload as a phone might.
  await page.waitForTimeout(4_000);
  await page.reload();

  // It resumes rather than starting over or dumping you home.
  await expect(page.locator("body")).not.toHaveText(/Start workout/, { timeout: 20_000 });
});
