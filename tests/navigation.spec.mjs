import { expect, test } from "@playwright/test";
import paquete from "../package.json" with { type: "json" };
import { versionModeloPractica, versionMotorPractica } from "../src/probabilidad/perfil.ts";

test("del tema de la portada al último capítulo y sus fuentes", async ({ page }) => {
  await page.goto("./");
  const primary = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Inicio");
  await page.getByRole("link", { name: /Los cantos/ }).click();
  await expect(page).toHaveURL("reglas/#los-cantos");
  await expect(page.locator(":target").getByRole("heading", { level: 2 })).toHaveText("Los cantos");
  await page.getByRole("link", { name: /^La flor / }).click();
  await expect(page).toHaveURL("reglas/flor/");
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Reglas del Truco");

  const pager = page.getByRole("navigation", { name: "Recorrido del manual" });
  await pager.getByRole("link", { name: /Anterior/ }).click();
  await expect(page).toHaveURL("reglas/envido/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("reglas/flor/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("reglas/truco/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("fuentes/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fuentes y variantes");
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Fuentes");
  await primary.getByRole("link", { name: "Inicio" }).click();
  await expect(page).toHaveURL("./");
});

test("abre una variante de mesa y vuelve al capítulo que la explica", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Consultar variantes" }).click();
  await expect(page).toHaveURL("fuentes/#variantes");
  const variant = page.locator(":target details").filter({ hasText: "Quién puede echar los perros" });
  await variant.locator("summary").click();
  await variant.getByRole("link", { name: "Leer el capítulo" }).click();
  await expect(page).toHaveURL("reglas/truco/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Truco, retruco y vale cuatro");
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el pie de la guía y la práctica identifica las versiones locales", async ({ page }) => {
    const pie = page.getByRole("contentinfo");
    for (const ruta of ["./", "aprender/mano/"]) {
      await page.goto(ruta);
      for (const [etiqueta, valor] of [
        ["Interfaz", "v" + paquete.version],
        ["Motor local", versionMotorPractica],
        ["Modelo local", versionModeloPractica],
      ]) {
        const dato = pie.getByText(etiqueta, { exact: true }).locator("+ dd");
        await expect(dato).toBeVisible();
        await expect(dato).toHaveText(valor);
      }
    }
  });

  test("el enlace de búsqueda abre el índice y permite leer el primer capítulo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: "Buscar en la guía" }).click();
    await expect(page).toHaveURL("reglas/");
    await page.getByRole("link", { name: /^La mesa y el reparto / }).click();
    await expect(page).toHaveURL("reglas/preparacion/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("La mesa y el reparto");
    const pager = page.getByRole("navigation", { name: "Recorrido del manual" });
    await expect(pager.getByRole("link", { name: /Anterior/ })).toHaveCount(0);
    await pager.getByRole("link", { name: /Siguiente/ }).click();
    await expect(page).toHaveURL("reglas/jerarquia/");
  });
});
