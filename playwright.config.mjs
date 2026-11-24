import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 4322);
const baseURL = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/unit/**",
  workers: 2,
  // En los runners de 2 vCPU las simulaciones pesadas pueden pasarse del plazo. Un
  // reintento evita repetir todo el workflow y el reporte igual marca la prueba como flaky.
  retries: process.env.CI ? 1 : 0,
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
