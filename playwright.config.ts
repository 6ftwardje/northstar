import { defineConfig, devices } from "@playwright/test";

const projects = [
  {
    name: "iPhone",
    use: {
      ...devices["iPhone 14"],
      browserName: "chromium" as const,
    },
  },
  {
    name: "desktop",
    use: {
      ...devices["Desktop Chrome"],
    },
  },
  ...(process.env.CI
    ? [
        {
          name: "iPhone WebKit",
          use: {
            ...devices["iPhone 14"],
            browserName: "webkit" as const,
          },
        },
      ]
    : []),
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects,
});
