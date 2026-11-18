import { expect, test } from "@playwright/test";

async function abrir(page) {
  await page.goto("aprender/probabilidad/");
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
}

async function activarConTeclado(boton) {
  await boton.focus();
  await boton.press("Enter");
}

test("comparar las tres salidas con el worker sin consumir una carta ni perder el foco", async ({ page }) => {
  test.setTimeout(90_000);
  const workers = [];
  page.on("worker", worker => workers.push(worker.url()));
  await abrir(page);
  const comparar = page.getByRole("button", { name: "Comparar las cartas" });
  await expect(comparar).toBeDisabled();
  expect(workers).toEqual([]);
  await activarConTeclado(page.getByRole("button", { name: "Predecir 2 de copas" }));
  await activarConTeclado(comparar);
  const tabla = page.getByRole("table", { name: "Victorias de tu pareja por carta jugada" });
  await expect(tabla).toBeVisible({ timeout: 60_000 });
  expect(workers).toHaveLength(1);
  await expect(comparar).toBeFocused();
  await expect(tabla.getByRole("row", { name: /2 de copas/ })).toContainText(/60,1\s?%.*12\.023 de 20\.000/);
  await expect(tabla.getByRole("row", { name: /3 de bastos/ })).toContainText(/68,9\s?%.*13\.779 de 20\.000/);
  await expect(tabla.getByRole("row", { name: /5 de oros/ })).toContainText(/62,7\s?%.*12\.530 de 20\.000/);
  await activarConTeclado(tabla.getByRole("button", { name: "3 de bastos" }));
  await expect(page.getByText(/8,78 puntos porcentuales mayor/)).toBeVisible();
  await expect(page.getByText("Tu predicción: 2 de copas")).toBeVisible();
  await activarConTeclado(page.getByRole("button", { name: "Jugar 3 de bastos" }));
  await expect(tabla).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Predecir / })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "¿Qué carta jugarías?" })).toBeFocused();
});

test("gastar o guardar la pieza en la segunda vuelta, repasar y terminar otra mano a 320 px", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 812 });
  await abrir(page);
  await activarConTeclado(page.getByRole("button", { name: "La segunda vuelta" }));
  await expect(page.getByRole("heading", { name: "¿Gastás la pieza ahora?" })).toBeFocused();
  await activarConTeclado(page.getByRole("button", { name: "Predecir 5 de oros" }));
  await activarConTeclado(page.getByRole("button", { name: "Comparar las cartas" }));
  const tabla = page.getByRole("table", { name: "Victorias de tu pareja por carta jugada" });
  await expect(tabla.getByRole("row", { name: /2 de copas/ })).toContainText(/58,9\s?%.*692 de 1\.175/);
  await expect(tabla.getByRole("row", { name: /5 de oros/ })).toContainText(/0\s?%.*0 de 1\.175/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await activarConTeclado(page.getByRole("button", { name: "Jugar 5 de oros" }));
  await expect(page.getByRole("heading", { name: "La pareja rival ganó la mano" })).toBeVisible();
  await activarConTeclado(page.getByRole("button", { name: "Repasar la mano" }));
  await expect(page.getByText("Jugadas vistas hasta acá", { exact: false })).toHaveCount(0);
  for (let i = 0; i < 7; i++) await activarConTeclado(page.getByRole("button", { name: "Siguiente jugada" }));
  await activarConTeclado(page.getByRole("button", { name: "Comparar las cartas" }));
  await expect(tabla.getByRole("row", { name: /2 de copas/ })).toContainText("692 de 1.175");
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(0);
  await activarConTeclado(page.getByRole("button", { name: "Volver al presente" }));
  await expect(page.getByRole("heading", { name: "La pareja rival ganó la mano" })).toBeVisible();

  await activarConTeclado(page.getByRole("button", { name: "Practicar con otra mano" }));
  for (let turno = 0; turno < 3; turno++) {
    const opciones = page.getByRole("button", { name: /^Predecir / });
    if (!await opciones.count()) break;
    await activarConTeclado(opciones.first());
    await activarConTeclado(page.getByRole("button", { name: "Comparar las cartas" }));
    await activarConTeclado(page.getByRole("button", { name: /^Jugar / }));
  }
  await expect(page.getByRole("heading", { name: /ganó la mano/ })).toBeVisible();
});

test("un fallo del worker permite usar la referencia o reintentar en otra mano y seguir jugando", async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error("Worker bloqueado"); } }; });
  await abrir(page);
  await page.getByRole("button", { name: "Predecir 3 de bastos" }).click();
  await page.getByRole("button", { name: "Comparar las cartas" }).click();
  await expect(page.getByText(/Cálculo de referencia · Estimación por simulación/)).toBeVisible();
  await page.getByRole("button", { name: "Practicar con otra mano" }).click();
  await page.getByRole("button", { name: /^Predecir / }).first().click();
  await page.getByRole("button", { name: "Comparar las cartas" }).click();
  await expect(page.getByRole("status")).toHaveText("No pudimos calcular estas chances.");
  await page.getByRole("button", { name: "Reintentar el cálculo" }).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: /^Jugar / }).click();
  await expect(page.getByRole("status")).toBeEmpty();
  await expect(page.getByRole("button", { name: /^Predecir / })).toHaveCount(2);
});

test("cancelar o jugar descarta la respuesta tardía del turno anterior", async ({ page }) => {
  await page.addInitScript(() => {
    window.pedidosDemorados = [];
    window.Worker = class {
      postMessage() {
        this.pedido = { responderTarde: this.onerror, terminado: false };
        window.pedidosDemorados.push(this.pedido);
      }
      terminate() { this.pedido.terminado = true; }
    };
  });
  await abrir(page);
  await page.getByRole("button", { name: "Predecir 2 de copas" }).click();
  const comparar = page.getByRole("button", { name: "Comparar las cartas" });
  await comparar.click();
  await page.getByRole("button", { name: "Cancelar el cálculo" }).click();
  await expect(comparar).toBeFocused();
  await comparar.click();
  await page.getByRole("button", { name: "Jugar 2 de copas" }).click();
  expect(await page.evaluate(() => {
    for (const pedido of window.pedidosDemorados) pedido.responderTarde();
    return window.pedidosDemorados.map(pedido => pedido.terminado);
  })).toEqual([true, true]);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("status")).toBeEmpty();
});

test.describe("ejemplo estático", () => {
  test.use({ javaScriptEnabled: false });
  test("se puede leer el estudio de apertura sin ejecutar scripts", async ({ page }) => {
    await page.goto("aprender/probabilidad/");
    const tabla = page.getByRole("table");
    await expect(tabla.getByRole("row", { name: /3 de bastos/ })).toContainText("13.779 de 20.000");
    await expect(page.getByRole("button", { name: "Comparar las cartas" })).toHaveCount(0);
  });
});
