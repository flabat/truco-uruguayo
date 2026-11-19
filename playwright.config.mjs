import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 4322);
const baseURL = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/unit/**",
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
