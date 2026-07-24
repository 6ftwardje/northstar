import { expect, test } from "@playwright/test";

test("PWA manifest is installable", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(manifest.name).toContain("Northstar");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
});

test("mobile app has no horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("mobile shell uses four stable top-level tabs", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name === "desktop", "iPhone navigation");

  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Mobiele navigatie",
  });
  await expect(navigation.getByRole("button", { name: "Vandaag" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Coach" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Insights" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Jij" })).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Avond" }),
  ).toHaveCount(0);
});

test("coach composer remains inside the iPhone viewport", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name === "desktop", "iPhone-specific behavior");

  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: "Mobiele navigatie",
  });
  await navigation
    .getByRole("button", { name: "Coach", exact: true })
    .click();

  const layout = await page.locator(".chat-composer").evaluate((composer) => {
    const rect = composer.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);

  await page.evaluate(() => {
    document.documentElement.dataset.keyboard = "open";
  });
  await expect(
    page.getByRole("navigation", { name: "Mobiele navigatie" }),
  ).toBeHidden();
  await expect(page.getByPlaceholder("Vraag Northstar om scherpte…")).toBeVisible();
});

test("login safely reports missing cloud configuration", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByText("Supabase moet nog gekoppeld worden"),
  ).toBeVisible();
});
