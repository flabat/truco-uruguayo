import { expect, test } from "@playwright/test";
import { temas } from "../src/aprendizaje/lecciones/index.ts";
import { comprobarMuestra } from "./helpers/muestra.mjs";

test("la guía, la bienvenida y cada práctica distinguen la muestra de la mano", async ({ page, isMobile }) => {
  for (const width of isMobile ? [320, 609] : [1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 812 });
    await page.goto("reglas/jerarquia/#rey-pieza");
    await comprobarMuestra(page, "copas-04");
    await page.goto("aprender/");
    await comprobarMuestra(page, "bastos-06");
    for (const tema of temas) {
      await test.step(`${tema.titulo} a ${width} px`, async () => {
        await page.goto("aprender/?tema=" + tema.id);
        const texto = await page.locator("#ejemplo-resuelto").innerText();
        const ejemplo = tema.ejemplos.find(({ detalle }) => texto.includes(detalle));
        expect(ejemplo).toBeDefined();
        await comprobarMuestra(page, ejemplo.muestra);
        await page.getByRole("button", { name: "Ir a practicar" }).click();
        await comprobarMuestra(page);
      });
    }
    await page.goto("aprender/?modo=mixta");
    await comprobarMuestra(page);
  }
});
