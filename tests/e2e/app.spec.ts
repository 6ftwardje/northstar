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

test("login can switch between PWA-safe methods", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: /Welkom terug/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "E-mailcode" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: "Wachtwoord" }).click();
  await expect(page.getByLabel("Wachtwoord")).toBeVisible();
});
