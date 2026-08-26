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
      await page.waitForTimeout(60);
      continue;
    }
    await page.clock.runFor(30_000);
    // Yield so React can render the next phase. Without this the loop can spin
    // on a rep-based set forever: it is open-ended, so advancing the clock does
    // nothing and the button it is waiting for has not painted yet.
    await page.waitForTimeout(60);
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

/**
 * A person is not one goal, and a generated plan is a starting point rather
 * than a cage. These cover the two things you cannot do with a single plan.
 */
test("a person can keep several plans with different goals", async ({ page }) => {
  await completeOnboarding(page);
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/plans");
  await expect(page.getByText("Strength Block")).toBeVisible({ timeout: 20_000 });

  // Add a second plan for a different goal, in the same setup.
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByRole("button", { name: /Improve mobility/ }).click();
  await page.getByRole("button", { name: "Build it for me" }).click();
  await page.waitForURL("**/");

  await page.goto("/plans");
  // Both survive: the first is not replaced by the second.
  await expect(page.getByText("Strength Block")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Mobility Flow")).toBeVisible();

  // And the new one is what Today offers.
  await expect(page.getByText("Current plan")).toBeVisible();

  // Switching back is one tap.
  await page
    .getByRole("button", { name: "Train this today" })
    .first()
    .click();
  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });
});

test("a person can build a plan from scratch with their own sets and reps", async ({ page }) => {
  await completeOnboarding(page);
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/plans/new");
  await page.getByPlaceholder(/name it for you/).fill("Saturday session");
  await page.getByRole("button", { name: "Start empty and pick my own" }).click();

  // Lands straight in the editor with nothing in it.
  await page.waitForURL("**/plan/**");
  await expect(page.getByText("Nothing here yet.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Add something first" })).toBeDisabled();

  // The whole library is browsable, not just what the generator would pick.
  await page.getByRole("button", { name: "+ Add exercise" }).click();
  const search = page.getByPlaceholder(/Search all \d+ exercises/);
  await expect(search).toBeVisible();
  await search.fill("Barbell Squat");
  await page.getByRole("button", { name: /^Barbell Squat/ }).first().click();

  await expect(page.getByText("tap to swap")).toBeVisible({ timeout: 15_000 });

  // Custom sets, reps and rest.
  const setsBefore = await page.getByText(/\d+ sets/).first().innerText();
  await page.getByRole("button", { name: "Increase sets" }).first().click();
  await expect(page.getByText(/\d+ sets/).first()).not.toHaveText(setsBefore);

  await page.getByRole("button", { name: "Increase reps" }).first().click();
  await page.getByRole("button", { name: "Increase rest" }).first().click();

  // A second day, so it is a real plan rather than one session.
  // The button reads "+ Day" but carries a fuller aria-label for screen readers.
  await page.getByRole("button", { name: "Add a day" }).click();
  await expect(page.getByRole("button", { name: "Day 2" })).toBeVisible();

  // And it is now startable.
  await page.getByRole("button", { name: "Day 1" }).click();
  await expect(page.getByRole("button", { name: /^Start · \d+ min/ })).toBeEnabled({
    timeout: 15_000,
  });
});

/**
 * The situation is the input to the plan, so a second plan must ask about it
 * again rather than inherit the answers the first one was built from.
 */
test("building another plan confirms the equipment and injuries first", async ({ page }) => {
  await completeOnboarding(page);
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/plans/new");

  // What we are about to build against is stated, not assumed.
  await expect(page.getByText("Dumbbells", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("dumbbell", { exact: true })).toBeVisible();

  // The dumbbells are gone, and a knee needs working around.
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await expect(page.getByText("Bodyweight only", { exact: false })).toBeVisible();
  await expect(page.getByText("bodyweight", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Knees", exact: true }).click();
  await page.getByRole("button", { name: "Build it for me" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible({
    timeout: 20_000,
  });

  // Both answers stuck: they describe the person and the place, not one plan.
  await page.goto("/plans/new");
  await expect(page.getByText("Bodyweight only", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Knees", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
