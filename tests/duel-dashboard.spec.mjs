import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const dashboard = fileURLToPath(new URL("../training/selfplay/duel_dashboard.py", import.meta.url));
const arms = ["baseline", "odds", "interactions"];
const plan = { schema: "duel-card-odds-comparison-v2", arms, secondsPerArm: 7200, pairs: 256 };

async function save(run, path, data) {
  const file = join(run, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data) + "\n");
}

async function render(page, run) {
  execFileSync("python3", ["-B", dashboard, run, "--once"]);
  await page.goto(pathToFileURL(join(run, "monitor.html")).href);
}

async function fitsViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
}

test("el tablero muestra el modelo en curso, el tiempo restante y los cruces al finalizar", async ({ page }, info) => {
  const run = info.outputPath("duel-trio");
  await save(run, "plan.json", plan);
  const progress = {
    ts: new Date().toISOString(), status: "running", stage: "self-play", targetSeconds: 7200,
    trainingSeconds: 3600, games: 548, hands: 6500, decisions: 16880, learnerUpdates: 431,
    opponent: "frequent-bluff", action: "Seat 2 · retruco · hand 3",
  };
  await save(run, "baseline/duel/a/progress.json", { ...progress, status: "complete", trainingSeconds: 7200 });
  await save(run, "odds/duel/a/progress.json", progress);
  await save(run, "odds/events/duel-a.jsonl", { ...progress, action: "Seat 1 · oros-05 · hand 8" });
  await render(page, run);

  await expect(page.getByRole("heading", { name: "Duel training", exact: true })).toBeVisible();
  const overview = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training · Card odds", exact: true }) });
  await expect(overview.getByText("Model time left", { exact: true })).toBeVisible();
  await expect(overview.getByText("1h 00m 00s", { exact: true })).toBeVisible();
  await expect(overview.getByText("Total training left", { exact: true })).toBeVisible();
  await expect(overview.getByText("3h 00m 00s", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Card odds training progress" })).toHaveJSProperty("value", 50);
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByText(/Seat 1 · oros-05 · hand 8/)).toBeVisible();
  await expect(page.locator('meta[http-equiv="refresh" i]')).toHaveCount(1);
  await fitsViewport(page);

  const common = { mean: 0.5, lower: 0.45, upper: 0.55 };
  const advantage = { mean: 0.625, lower: 0.56, upper: 0.69 };
  await save(run, "comparison.json", {
    schema: plan.schema, pairs: plan.pairs, secondsPerArm: plan.secondsPerArm,
    arms: Object.fromEntries(arms.map(arm => [arm, {
      trainingSeconds: 7200, games: 1000, weights: arm === "interactions" ? 11264 : 7424,
    }])),
    headToHead: common,
    matchups: { oddsVsBaseline: common, interactionsVsBaseline: common, interactionsVsOdds: advantage },
    againstChampion: { baseline: common, odds: common, interactions: common },
  });
  await render(page, run);
  await expect(page.getByText("Comparison complete", { exact: true })).toBeVisible();
  const result = page.getByRole("row").filter({ hasText: "Card odds + interactions vs Card odds" });
  await expect(result.getByRole("cell", { name: "62.5%" })).toBeVisible();
  await expect(result.getByRole("cell", { name: "56.0% – 69.0%" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open comparison report" })).toHaveAttribute("href", "comparison.json");
  await expect(page.locator('meta[http-equiv="refresh" i]')).toHaveCount(0);
  await fitsViewport(page);
});
