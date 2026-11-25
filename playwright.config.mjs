import { defineConfig, devices } from "@playwright/test";

// Puertos de la ranura de este worktree (#378); las variables ya definidas tienen prioridad.
try { process.loadEnvFile(new URL(".env.trabajo", import.meta.url)); } catch (error) { if (error.code !== "ENOENT") throw error; }
const port = Number(process.env.TEST_PORT ?? 4322);
const baseURL = `http://127.0.0.1:${port}/`;
// En la Mac (10 núcleos) la mitad de los núcleos baja Playwright a menos de la mitad del
// tiempo con 2. PLAYWRIGHT_WORKERS acepta un número o un porcentaje ("25%").
const workers = process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? "2" : "50%");

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/unit/**",
  workers: /^\d+$/.test(workers) ? Number(workers) : workers,
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
