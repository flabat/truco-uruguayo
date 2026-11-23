import { chromium, expect } from "@playwright/test";

const issuer = process.argv[2];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(issuer + "/account/");
  await page.locator("#username").fill("prueba");
  await page.locator("#password").fill("truco-local");
  await page.locator("#kc-login").click();
  await expect(page.getByRole("textbox", { name: /Email/ })).toHaveValue("prueba@example.test");
  await expect(page).toHaveTitle("El Truco");
  const icono = await page.locator('link[rel="icon"]').getAttribute("href");
  await expect(page.getByRole("img", { name: "El Truco" })).toHaveAttribute("src", icono);
} finally {
  await browser.close();
}
