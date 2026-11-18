import { expect, test } from "@playwright/test";

async function abrir(page) {
  await page.goto("aprender/probabilidad/");
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
}

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const mano = page => page.getByRole("group", { name: "Tus cartas en mano" });
const panel = page => page.locator(".mesa-panel");
const tabla = page => panel(page).getByRole("table", { name: "Victorias de tu pareja por carta jugada" });
const ejemplos = page => page.getByRole("group", { name: "Ejemplos guiados" });
const apertura = ["2 de copas", "5 de oros", "3 de bastos"];

test("una sola comparación de la salida, opcional y en el orden del tapete", async ({ page }) => {
  test.setTimeout(90_000);
  const workers = [];
  page.on("worker", worker => workers.push(worker.url()));
  await abrir(page);
  await expect.poll(() => workers.length).toBe(1);
  await expect(ejemplos(page).getByRole("button")).toHaveCount(2);
  await expect(ejemplos(page).getByRole("button", { name: "Repartir otra mano" })).toHaveCount(0);
  await expect(mano(page).getByRole("button")).toHaveText(apertura);
  await expect(mano(page).getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(boton(page, "Jugar carta")).toBeDisabled();
  await boton(page, "Repartir otra mano").focus();
  await page.keyboard.press("Tab");
  await expect(boton(mano(page), "2 de copas")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(boton(page, "Jugar 2 de copas")).toBeEnabled();
  await expect(tabla(page)).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(boton(mano(page), "5 de oros")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(boton(mano(page), "3 de bastos")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(boton(page, "Jugar 2 de copas")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(tabla(page)).toBeVisible({ timeout: 60_000 });
  await expect(boton(page, "Ocultar chances")).toBeFocused();
  await expect(tabla(page).getByRole("rowheader")).toHaveText(apertura);
  await expect(tabla(page).getByRole("button")).toHaveCount(0);
  await expect(tabla(page).getByRole("row", { name: /2 de copas/ })).toContainText(/60,1\s?%.*12\.023 de 20\.000/);
  await expect(tabla(page).getByRole("row", { name: /3 de bastos/ })).toContainText(/68,9\s?%.*13\.779 de 20\.000/);
  await expect(tabla(page).getByRole("row", { name: /5 de oros/ })).toContainText(/62,7\s?%.*12\.530 de 20\.000/);
  await boton(mano(page), "3 de bastos").click();
  await expect(page.getByText(/8,78 puntos porcentuales mayor/)).toBeVisible();
  await boton(page, "Ocultar chances").click();
  await expect(tabla(page)).toHaveCount(0);
  await boton(mano(page), "2 de copas").click();
  await expect(boton(mano(page), "2 de copas")).toHaveAttribute("aria-pressed", "true");
  expect(workers).toHaveLength(1);
  await boton(page, "Jugar 2 de copas").press("Enter");
  await expect(panel(page)).toContainText("Vuelta 2 · Te toca jugar");
  await expect(boton(page, "La salida")).toHaveAttribute("aria-pressed", "true");
  await expect(mano(page).getByRole("button").first()).toBeFocused();
  await expect(tabla(page)).toHaveCount(0);
});

test("tres vueltas y repaso 0 → 1 → 0 de 12 conservan muestra, orden y privacidad", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await abrir(page);
  for (const carta of ["3 de bastos", "2 de copas", "5 de oros"]) {
    await boton(mano(page), carta).click();
    await boton(page, "Jugar " + carta).click();
  }
  await boton(page, "Repasar la mano").click();
  await expect(page.getByRole("heading", { name: "Jugada 0 de 12" })).toBeFocused();
  const muestra = page.getByRole("img", { name: "Muestra 6 de copas" });
  const frente = muestra.locator(".prob-frente");
  const srcMuestra = await frente.getAttribute("src");
  expect(srcMuestra).toMatch(/\/copas-06\.webp$/);
  const otras = page.locator(".tapete .asiento:not(.asiento-0) img");
  await expect(otras).toHaveCount(9);
  expect(await otras.evaluateAll(imgs => imgs.every(img => img.src.endsWith("/reverso.webp")))).toBe(true);
  await expect(mano(page).getByRole("button")).toHaveText(apertura);
  await boton(mano(page), "5 de oros").click();
  await expect(panel(page)).toContainText("Estás explorando el 5 de oros");
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(0);
  await boton(page, "Siguiente jugada").press("Enter");
  await expect(page.getByRole("heading", { name: "Jugada 1 de 12" })).toBeFocused();
  await expect(panel(page)).toContainText("Vuelta 1 · Turno del rival de la derecha");
  await expect(mano(page).getByRole("button")).toHaveCount(0);
  await expect(mano(page).locator(".ap-carta")).toHaveText(["2 de copas", "5 de oros"]);
  await expect(page.locator(".asiento-0 .prob-jugada")).toContainText("Jugada3 de bastos");
  await expect(otras).toHaveCount(9);
  expect(await otras.evaluateAll(imgs => imgs.every(img => img.src.endsWith("/reverso.webp")))).toBe(true);
  await expect(frente).toHaveAttribute("src", srcMuestra);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await boton(page, "Anterior").press("Enter");
  await expect(mano(page).getByRole("button")).toHaveText(apertura);
  await expect(page.locator(".asiento-0 .prob-jugada")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await boton(page, "Siguiente jugada").click();
  await expect(panel(page)).toContainText("Vuelta 2");
  await boton(page, "Anterior").click();
  await expect(panel(page)).toContainText("Vuelta 1");
  await boton(page, "Volver al presente").click();
  await expect(page.getByRole("heading", { name: /ganó la mano/ })).toBeFocused();
});

test("segunda vuelta exacta, exploración en repaso y otro reparto a 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await abrir(page);
  await boton(page, "La segunda vuelta").press("Enter");
  await expect(boton(mano(page), "2 de copas")).toBeFocused();
  await expect(panel(page)).toContainText("Vuelta 2 · Te toca jugar");
  await expect(boton(page, "La segunda vuelta")).toHaveAttribute("aria-pressed", "true");
  await boton(page, "Ver chances").click();
  await expect(mano(page).getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(tabla(page).getByRole("row", { name: /2 de copas/ })).toContainText(/58,9\s?%.*692 de 1\.175/);
  await expect(tabla(page).getByRole("row", { name: /5 de oros/ })).toContainText(/0\s?%.*0 de 1\.175/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await boton(mano(page), "5 de oros").click();
  await boton(page, "Jugar 5 de oros").press("Enter");
  await expect(page.getByRole("heading", { name: "La pareja rival ganó la mano" })).toBeFocused();
  await boton(page, "Repasar la mano").click();
  for (let i = 0; i < 7; i++) await boton(page, "Siguiente jugada").click();
  await boton(mano(page), "2 de copas").click();
  await boton(page, "Ver chances").click();
  await expect(tabla(page).getByRole("row", { name: /2 de copas/ })).toContainText("692 de 1.175");
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(0);
  await boton(page, "Repartir otra mano").press("Enter");
  await expect(ejemplos(page).getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Muestra 6 de copas" })).toHaveCount(0);
  await expect(tabla(page)).toHaveCount(0);
  const opciones = mano(page).getByRole("button");
  await expect(opciones).toHaveCount(3);
  for (let i = 0; i < 3 && await opciones.count(); i++) {
    await opciones.first().press("Enter");
    await page.getByRole("button", { name: /^Jugar / }).press("Enter");
  }
  await expect(page.getByRole("heading", { name: /ganó la mano/ })).toBeVisible();
});

test("un fallo permite consultar la referencia o reintentar y jugar en práctica", async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error("Worker bloqueado"); } }; });
  await abrir(page);
  await boton(page, "Ver chances").click();
  await expect(page.getByText(/Cálculo de referencia · Estimación por simulación/)).toBeVisible();
  await boton(page, "Repartir otra mano").click();
  await boton(page, "Ver chances").click();
  await expect(panel(page).getByRole("status")).toHaveText("No pudimos calcular estas chances.");
  await boton(page, "Reintentar el cálculo").click();
  await expect(boton(page, "Ocultar chances")).toBeFocused();
  await mano(page).getByRole("button").first().click();
  await page.getByRole("button", { name: /^Jugar / }).click();
  await expect(mano(page).getByRole("button")).toHaveCount(2);
});

test("jugar mientras calcula y mover el cursor descartan las respuestas anteriores", async ({ page }) => {
  await page.addInitScript(() => {
    window.demorados = [];
    window.Worker = class {
      postMessage({ posicion }) {
        this.pedido = { posicion, tarde: this.onerror, terminado: false };
        window.demorados.push(this.pedido);
      }
      terminate() { this.pedido.terminado = true; }
    };
  });
  await abrir(page);
  await boton(mano(page), "2 de copas").click();
  await boton(page, "Ver chances").click();
  await expect(panel(page).getByRole("status")).toContainText("Calculando");
  await boton(page, "Cancelar el cálculo").click();
  await expect(boton(page, "Ocultar chances")).toBeFocused();
  await expect(boton(page, "Jugar 2 de copas")).toBeEnabled();
  await boton(page, "Reintentar el cálculo").click();
  await expect(panel(page).getByRole("status")).toContainText("Calculando");
  await boton(page, "Jugar 2 de copas").click();
  await boton(page, "Repasar la mano").click();
  await boton(page, "Siguiente jugada").click();
  await boton(page, "Ver chances").click();
  expect(await page.evaluate(() => {
    for (const p of window.demorados.slice(0, -1)) p.tarde();
    return window.demorados.map(p => p.terminado);
  })).toEqual([true, true, true, false]);
  await expect(panel(page).getByRole("status")).toContainText("Calculando");
  await expect(tabla(page)).toHaveCount(0);
  const primera = await page.evaluate(() => window.demorados[0].posicion);
  expect(Object.keys(primera).sort()).toEqual(["asiento", "cartas", "dador", "jugadas", "muestra", "version"]);
  expect(primera.jugadas).toEqual([]);

  await boton(page, "La salida").click();
  await boton(page, "Ver chances").click();
  await boton(page, "Cancelar el cálculo").focus();
  await page.evaluate(() => window.demorados.at(-1).tarde());
  await expect(tabla(page)).toBeVisible();
  await expect(boton(page, "Ocultar chances")).toBeFocused();
});

test.describe("ejemplo estático", () => {
  test.use({ javaScriptEnabled: false });
  test("se puede revelar el estudio de apertura sin ejecutar scripts", async ({ page }) => {
    await page.goto("aprender/probabilidad/");
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.locator("noscript summary").press("Enter");
    await expect(page.getByRole("row", { name: /3 de bastos/ })).toContainText("13.779 de 20.000");
  });
});
