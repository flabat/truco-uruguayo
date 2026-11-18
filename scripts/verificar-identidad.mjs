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
} finally {
  await browser.close();
}
