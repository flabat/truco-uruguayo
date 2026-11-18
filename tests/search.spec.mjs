import { expect, test } from "@playwright/test";

test("busca con y sin tilde, prioriza el título y abre el primer resultado con Enter", async ({ page }) => {
  await page.goto("./");
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Buscar en la guía" });
  const input = dialog.getByRole("searchbox");
  const results = dialog.getByRole("link");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("Capítulos de la guía");

  for (const term of ["jerarquía", "JERARQUIA"]) {
    await input.fill(term);
    await expect(results.first()).toContainText("La jerarquía de las cartas");
    await expect(results.filter({ hasText: "Cómo se gana la mano" })).toBeVisible();
  }
  await input.fill("  jerarquia   zzzxyz  ");
  await expect(results).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("No encontramos");

  await input.fill("cejas alzar");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText("Las señas");
  await input.press("Enter");
  await expect(page).toHaveURL("reglas/senas/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Las señas");
});

test("cierra la búsqueda, devuelve el foco y permite elegir un resultado con el teclado", async ({ page }) => {
  await page.goto("reglas/");
  const trigger = page.getByRole("link", { name: "Buscar en la guía" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("searchbox");
  await input.fill("envido");
  await dialog.getByRole("button", { name: "Cerrar búsqueda" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press("Enter");
  await expect(input).toHaveValue("");
  await input.press("Escape");
  await expect(dialog).toBeHidden();
  await trigger.click();
  await input.fill("envido");
  await input.press("ArrowDown");
  const first = dialog.getByRole("link").first();
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("reglas/envido/");
});
