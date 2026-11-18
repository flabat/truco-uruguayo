import { expect, test } from "@playwright/test";

test("del ejemplo del rey a los comodines y a la imagen ampliada", async ({ page }) => {
  await page.goto("reglas/jerarquia/#rey-pieza");
  await page.getByRole("link", { name: "Ver la baraja completa" }).click();
  await expect(page).toHaveURL("baraja/");
  await page.getByRole("link", { name: "Comodines y reverso", exact: true }).click();
  await expect(page).toHaveURL("baraja/#extras");
  const extras = page.locator(":target");
  await expect(extras.getByRole("link")).toHaveCount(3);
  await extras.getByRole("link", { name: "Ampliar comodín del conejo" }).click();
  await expect(page).toHaveURL("img/cartas/tatu/comodin-02.webp");
  await expect(page.locator("img")).toHaveJSProperty("naturalWidth", 384);
});

test("el mazo cubre el centro de la muestra y deja visible su esquina superior", async ({ page }) => {
  await page.goto("reglas/jerarquia/#rey-pieza");
  const muestra = page.locator('.mazo img[src$="/copas-04.webp"]');
  await muestra.scrollIntoViewIfNeeded();
  const cartasVisibles = await muestra.evaluate((carta) => {
    const { x, y, width, height } = carta.getBoundingClientRect();
    return [0.12, 0.65].map((fraccion) => {
      const elemento = document.elementFromPoint(x + width * 0.2, y + height * fraccion);
      return elemento?.getAttribute("src")?.split("/").pop();
    });
  });
  expect(cartasVisibles).toEqual(["copas-04.webp", "reverso.webp"]);
});
