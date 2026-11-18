import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 4322);
const path = new URL(process.env.PAGES_URL ?? "https://example.org/").pathname;
const baseURL = new URL(path, `http://127.0.0.1:${port}`).href;

export default defineConfig({
  testDir: "./tests",
  workers: 2,
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run preview -- --ignore-lock --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
