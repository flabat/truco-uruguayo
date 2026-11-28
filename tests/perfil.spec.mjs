import { expect, test } from "@playwright/test";

const id = "e47e3038-dc9b-4643-b9cf-41481448f2e0";
const mesa = "26646765-5fab-40a5-b77b-82eecfea738a";
const jugador = { id, nombre: "Ana" };

test("el perfil pide ingreso y vuelve al perfil", async ({ page }) => {
  await page.route("**/api/perfil?*", route => route.fulfill({ status: 401, json: null }));
  await page.goto("/perfil/");
  const boton = page.getByRole("button", { name: "Ingresar al juego" });
  await expect(boton).toBeVisible();
  await page.route("**/api/auth/login?volver=*", route => route.fulfill({ body: "Ingreso" }));
  const [ingreso] = await Promise.all([
    page.waitForRequest(request => new URL(request.url()).pathname === "/api/auth/login"),
    boton.click(),
  ]);
  expect(new URL(ingreso.url()).searchParams.get("volver")).toBe("/perfil/");
});

test("el jugador abre su perfil y navega el historial", async ({ page }, testInfo) => {
  await page.route("**/api/jugador", route => route.fulfill({ json: jugador }));
  await page.route("**/api/perfil?*", route => {
    const pagina = new URL(route.request().url()).searchParams.get("pagina");
    const partidas = pagina === "1" ? [{
      id: mesa, modo: "2v2", meta: 40, mano: 8, resultado: "ganada",
      fecha: "2026-11-19T15:30:00.000Z", puntos: { propios: 40, rivales: 31 },
    }, {
      id: "13b9d260-a762-4f99-be74-efdd3f4988c5", modo: "3v3", meta: 50, mano: 3, resultado: "sin-terminar",
      fecha: "2026-11-17T15:30:00.000Z", puntos: { propios: 12, rivales: 16 },
    }, {
      id: "5c1c3f0e-0f0b-4c52-8d3c-3b0c5c1d9a01", modo: "1v1", meta: 40, mano: 2, resultado: "abandonada",
      fecha: "2026-11-16T15:30:00.000Z", puntos: { propios: 3, rivales: 5 },
    }, {
      id: "5c1c3f0e-0f0b-4c52-8d3c-3b0c5c1d9a02", modo: "1v1", meta: 40, mano: 2, resultado: "desconectada",
      fecha: "2026-11-15T15:30:00.000Z", puntos: { propios: 3, rivales: 5 },
    }] : [{
      id: "774a99d9-f5f2-4c76-8d80-6ebe333f8f0e", modo: "1v1", meta: 40, mano: 1, resultado: "desconocido",
      fecha: null, puntos: null,
    }];
    return route.fulfill({ json: { jugador, partidas, hayMas: pagina === "1" } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Mi perfil" }).click();
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  await expect(page.getByText(id)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parejas · A 40 tantos" })).toBeVisible();
  await expect(page.getByText("Tu equipo 40 · Rivales 31")).toBeVisible();
  await expect(page.getByText("Ganada", { exact: true })).toBeVisible();
  await expect(page.getByText("Abandonada", { exact: true })).toBeVisible();
  await expect(page.getByText("Desconectada", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir mesa" }).first()).toHaveAttribute("href", "/jugar/?mesa=" + mesa);
  const sinDesborde = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(sinDesborde).toBe(true);
  if (process.env.PERFIL_CAPTURAS) {
    await page.screenshot({ path: process.env.PERFIL_CAPTURAS + "/perfil-" + testInfo.project.name + ".png" });
  }
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page.getByText("Página 2")).toBeVisible();
  await expect(page.getByText("Resultado sin datos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveCount(0);
  await page.getByRole("link", { name: "Anterior" }).click();
  await expect(page.getByText("Página 1")).toBeVisible();
});

const confirmacion = "Vas a cerrar sesión en todos tus dispositivos. En las partidas empezadas, una computadora juega en tu lugar; las mesas que creaste y todavía esperan jugadores se cancelan. Tenés 30 días para arrepentirte: si volvés a ingresar, cancelamos la eliminación. Después borramos tu cuenta y tus datos personales.";

async function perfilConCuenta(page) {
  await page.route("**/api/perfil?*", route => route.fulfill({ json: { jugador, partidas: [], hayMas: false } }));
  const pedidos = [];
  await page.route("**/api/cuenta/eliminar", route => {
    pedidos.push(route.request());
    return route.fulfill({ json: { vence: "2026-12-24T15:00:00.000Z" } });
  });
  return pedidos;
}

test("eliminar la cuenta pide confirmación y volver no envía nada", async ({ page }) => {
  const pedidos = await perfilConCuenta(page);
  await page.goto("/perfil/");
  await page.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  const dialogo = page.getByRole("dialog", { name: "Eliminar mi cuenta" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(confirmacion)).toBeVisible();
  await dialogo.getByRole("button", { name: "Volver" }).click();
  await expect(dialogo).toBeHidden();
  expect(pedidos).toHaveLength(0);
});

test("confirmar la eliminación la pide y avisa la fecha", async ({ page }) => {
  const pedidos = await perfilConCuenta(page);
  await page.goto("/perfil/");
  await page.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar mi cuenta" }).click();
  const fecha = new Intl.DateTimeFormat("es-UY", { dateStyle: "long" }).format(new Date("2026-12-24T15:00:00.000Z"));
  await expect(page.getByText("Pediste eliminar tu cuenta. Se elimina el " + fecha + " si no volvés a ingresar.")).toBeVisible();
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].method()).toBe("POST");
});

test("al volver a ingresar se avisa que la eliminación se canceló", async ({ page }) => {
  await perfilConCuenta(page);
  await page.goto("/perfil/?baja=cancelada");
  await expect(page.getByRole("status").filter({ hasText: "Cancelamos la eliminación de tu cuenta." })).toBeVisible();
});
