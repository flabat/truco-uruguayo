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
