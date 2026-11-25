import { expect, test } from "@playwright/test";

test("eliminación de datos explica el botón, los 30 días y lo que queda anónimo", async ({ page }) => {
  await page.goto("/eliminacion-de-datos/");
  const contenido = page.locator("main");
  await expect(contenido).toContainText("Eliminar mi cuenta");
  await expect(contenido).toContainText("30 días");
  await expect(contenido).toContainText("una computadora juega en tu lugar");
  await expect(contenido).toContainText("«Jugador»");
  await expect(contenido.getByRole("link", { name: "Mi perfil" }).first()).toHaveAttribute("href", "/perfil/");
  await expect(contenido.getByRole("link", { name: "flabat@flabat.com" })).toHaveAttribute("href", "mailto:flabat@flabat.com");
});

test("la política de privacidad incluye Apple, la eliminación desde el juego y la sesión de la app", async ({ page }) => {
  await page.goto("/privacidad/");
  const contenido = page.locator("main");
  await expect(contenido).toContainText("Apple");
  await expect(contenido).toContainText("revocamos");
  await expect(contenido).toContainText("Keycloak también conserva");
  await expect(contenido).toContainText("Eliminar mi cuenta");
  await expect(contenido).toContainText("la app");
  await expect(contenido).toContainText("30 días");
});
