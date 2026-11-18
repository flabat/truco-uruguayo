import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let semilla = 0;
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (datos) => datos instanceof Uint32Array && datos.length === 1
      ? datos.fill(semilla++) : original(datos);
  });
});

test("la consulta es libre en el ejemplo y el resultado, y cuenta como ayuda durante la mano", async ({ page }) => {
  await page.goto("aprender/?tema=comparar-cartas");
  const regla = page.locator(".ap-consulta summary");
  const aviso = page.getByText("(cuenta como ayuda)", { exact: true });
  const avance = page.locator("#avance-actual");
  const boton = (name) => page.getByRole("button", { name, exact: true });

  await expect(aviso).toBeHidden();
  await regla.click();
  await expect(page.locator("#regla")).toContainText("Dos cartas del mismo puesto empatan");
  await boton("Probar con otra mano").click();
  await expect(page.locator("#regla")).toBeHidden();
  await expect(aviso).toBeVisible();
  await boton("Rey de copas").click();
  await expect(avance).toContainText("1 mano resuelta sin ayuda");
  await regla.click();
  await expect(aviso).toBeHidden();

  await boton("Otra mano").click();
  await regla.press("Enter");
  await expect(page.locator("#regla")).toBeVisible();
  await expect(page.locator("#regla")).toContainText("as de espadas, as de bastos");
  await expect(page.getByRole("status")).toBeEmpty();
  await regla.press("Space");
  await expect(page.locator("#regla")).toBeHidden();
  await boton("5 de espadas").click();
  await expect(page.getByRole("heading", { name: "Mano resuelta" })).toBeVisible();
  await expect(avance).toContainText("1 mano resuelta sin ayuda");

  await boton("Otra mano").click();
  await boton("Empatan").click();
  await expect(avance).toContainText("En práctica · 2 manos resueltas sin ayuda");
  await page.getByRole("link", { name: "Todos los temas" }).click();
  await page.reload();
  await expect(page.locator('[data-avance="comparar-cartas"]')).toContainText("En práctica · 2 manos");
});

test("al cerrar el capítulo se retoman las cartas, la cuenta y los intentos en el mismo paso", async ({ page }) => {
  await page.goto("aprender/?tema=contar-envido");
  const boton = (name) => page.getByRole("button", { name, exact: true });
  await boton("Probar con otra mano").click();
  await boton("3 de copas").click();
  await boton("2 de copas").click();
  await boton("Confirmar cartas").click();
  const total = page.getByRole("spinbutton", { name: "Tu total" });
  await total.fill("5");
  await total.press("Enter");
  const feedback = page.getByRole("status");
  await expect(feedback).toContainText("20 de base");
  await expect(feedback).not.toContainText("Pista");
  const primerError = await feedback.innerText();

  await page.locator(".ap-consulta summary").press("Enter");
  const enlace = page.getByRole("link", { name: "Leer el capítulo completo en otra pestaña" });
  const abierta = page.waitForEvent("popup");
  await enlace.press("Enter");
  const capitulo = await abierta;
  await expect(capitulo).toHaveURL("reglas/envido/");
  await expect(capitulo.getByRole("heading", { level: 1, name: "El envido" })).toBeVisible();
  await capitulo.close();

  await expect(page).toHaveURL("aprender/?tema=contar-envido");
  await expect(page.locator("#etapa")).toHaveText("Tu turno · Paso 2 de 2");
  await expect(page.locator("#carta-muestra")).toHaveText("3 de espadas");
  await expect(page.locator("#cartas-mano .ap-elegida")).toHaveText(["3 de copas", "2 de copas"]);
  await expect(total).toHaveValue("5");
  await expect(feedback).toHaveText(primerError);
  await total.press("Enter");
  await expect(feedback).toContainText("Pista · Contá los 20 de base una sola vez.");
  await total.fill("25");
  await total.press("Enter");
  await expect(feedback).toContainText("20 + 3 + 2 = 25");
});
