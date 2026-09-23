import { expect, test, type Page } from "@playwright/test";

/**
 * The controls have to be on the screen.
 *
 * The design is drawn for a tall phone and its heights were fixed, so on an SE
 * -- or in landscape, or a desktop window dragged small -- the player ran past
 * the bottom of a screen that deliberately cannot scroll: the weight stepper
 * was half cut off and "Set complete" was not on the page at all. The rest
 * clock did the same sideways, losing its last digit.
 *
 * So this walks a whole session at cramped viewports and asserts that every
 * button stays inside the screen box.
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

/** Every button currently on screen that is not fully inside the screen box. */
async function offscreenControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const screen = document.querySelector("div.mx-auto") as HTMLElement | null;
    if (!screen) return [];
    const box = screen.getBoundingClientRect();
    const out: string[] = [];
    for (const button of document.querySelectorAll("button")) {
      const r = button.getBoundingClientRect();
      if (r.width === 0) continue;
      const escapes =
        r.bottom > window.innerHeight + 0.5 ||
        r.top < -0.5 ||
        r.right > box.right + 0.5 ||
        r.left < box.left - 0.5;
      if (escapes) {
        const name = (button.textContent || button.getAttribute("aria-label") || "?").trim();
        out.push(`${name} at ${Math.round(r.top)}-${Math.round(r.bottom)} of ${window.innerHeight}`);
      }
    }
    return out;
  });
}

// An iPhone SE, and a phone turned on its side mid-set.
for (const vp of [
  { name: "375x667", width: 375, height: 667 },
  { name: "740x360", width: 740, height: 360 },
]) {
  test(`the player keeps its controls on screen at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await onboard(page);

    await page.clock.install();
    await page.getByRole("button", { name: "Start workout" }).click();

    const offscreen = new Set<string>();
    const done = page.getByText("How did that feel?");
    for (let i = 0; i < 200; i++) {
      for (const control of await offscreenControls(page)) offscreen.add(control);
      if (await done.isVisible().catch(() => false)) break;
      const setComplete = page.getByRole("button", { name: "Set complete" });
      if (await setComplete.isVisible().catch(() => false)) {
        // Only reachable if it is on the screen, which is the point.
        await setComplete.click();
      }
      await page.clock.runFor(4000);
    }

    expect([...offscreen]).toEqual([]);
  });
}
