export async function ingresarConClaveLocal(page, usuario) {
  await page.getByRole("button", { name: "Ingresar al juego", exact: true }).click();
  const nombre = page.locator("#username");
  await nombre.waitFor({ state: "attached" });
  const opcionLocal = page.locator("#truco-existing-account:not([open]) > summary");
  if (await opcionLocal.isVisible()) await opcionLocal.click();
  await nombre.fill(usuario);
  await page.locator("#password").fill("truco-local");
  await page.locator("#kc-login").click();
}
