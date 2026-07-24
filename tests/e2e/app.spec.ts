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

  const bottomGap = await navigation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return window.innerHeight - rect.bottom;
  });
  expect(Math.abs(bottomGap)).toBeLessThanOrEqual(1);
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

  await expect(page.getByPlaceholder("Vraag Northstar om scherpte…")).toBeVisible();

  const keyboardLayout = await page.evaluate(() => {
    document.documentElement.dataset.keyboard = "open";
    document.documentElement.style.setProperty("--app-viewport-height", "500px");
    document.documentElement.style.setProperty("--app-viewport-top", "120px");

    const composer = document.querySelector(".chat-composer");
    const navigation = document.querySelector(".bottom-nav");
    const topbar = document.querySelector(".topbar");
    if (!composer || !navigation || !topbar) {
      throw new Error("Mobile coach shell is incomplete");
    }

    return {
      bottom: composer.getBoundingClientRect().bottom,
      navigationDisplay: getComputedStyle(navigation).display,
      topbarDisplay: getComputedStyle(topbar).display,
      expectedBottom: 620,
    };
  });
  expect(keyboardLayout.navigationDisplay).toBe("none");
  expect(keyboardLayout.topbarDisplay).toBe("none");
  expect(
    Math.abs(keyboardLayout.bottom - keyboardLayout.expectedBottom),
  ).toBeLessThanOrEqual(1);
});

test("entry sheet fits the visible keyboard viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "iPhone-specific behavior");

  await page.goto("/");
  await page.getByRole("button", { name: "Nieuwe entry" }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.keyboard = "open";
    document.documentElement.style.setProperty("--app-viewport-height", "500px");
    document.documentElement.style.setProperty("--app-viewport-top", "120px");
  });

  const sheet = page.getByPlaceholder(
    "Schrijf vrijuit. Werk, health, gedachten…",
  );
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("button", { name: "Sluiten" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bewaar entry" })).toBeVisible();

  const bounds = await page.locator(".composer-sheet").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(120);
  expect(bounds.bottom).toBeLessThanOrEqual(620);
});

test("hamburger opens a dismissible left-side drawer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "iPhone-specific behavior");

  await page.goto("/");
  await page.getByRole("button", { name: "Menu openen" }).click();

  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu sluiten" })).toBeVisible();
  await expect
    .poll(() =>
      drawer.evaluate((element) => element.getBoundingClientRect().left),
    )
    .toBe(0);

  const bounds = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      viewport: window.innerWidth,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThan(bounds.viewport);

  await page.locator(".menu-overlay").click({
    position: { x: bounds.viewport - 2, y: 300 },
  });
  await expect(drawer).toHaveCount(0);
});

test("login safely reports missing cloud configuration", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByText("Supabase moet nog gekoppeld worden"),
  ).toBeVisible();
});
