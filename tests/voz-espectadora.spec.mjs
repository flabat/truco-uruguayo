import { expect, test } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000233";
const ruta = "/api/salon/mesas/" + id;
const enlace = "https://discord.gg/exhibicion-de-prueba";
const inicio = new Date("2026-11-20T18:15:00Z");

test("la voz de la exhibición se abre a pedido y la partida avanza durante un fallo de Discord", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.clock.install({ time: inicio });
  let pedidos = 0, jugada = false, disponible = true;
  let vence = inicio.getTime() + 600_000;
  const inesperadas = [];
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    // El pie pide la versión del servidor; sin ella queda oculto, como en el sitio estático.
    if (path === "/api/version") return route.fulfill({ status: 404 });
    if (path === "/api/jugador") return route.fulfill({ json: { id: "invitada", nombre: "Eva", salonHabilitado: true } });
    if (path === ruta + "/voz" && req.method() === "POST") {
      expect(req.postDataJSON()).toEqual({});
      if (++pedidos === 1) return route.fulfill({ status: 503, json: { error: "Discord no pudo abrir la voz de la mesa." } });
      return route.fulfill({ json: { enlace, vence: new Date(vence).toISOString() } });
    }
    if (path !== ruta || req.method() !== "GET") {
      inesperadas.push(req.method() + " " + path);
      return route.fulfill({ status: 404, json: {} });
    }
    const cartas = jugada ? [{ asiento: 0, carta: "oros-07" }] : [];
    return route.fulfill({ json: {
      id, modo: "1v1", formato: "duel", origen: "exhibicion", humanos: 0, computadoras: 2,
      manoNumero: 1, puntos: [0, 0], meta: 40, ultimaActividad: inicio.toISOString(), vozDisponible: disponible,
      asientos: [0, 1].map(asiento => ({ asiento, equipo: asiento, tipo: "computadora", nombre: "Computadora " + (asiento + 1) })),
      estado: "en-juego", tablero: {
        dador: 1, mano: 0, muestra: "copas-06", vueltas: [], valorTruco: 1,
        vueltaActual: { salida: 0, jugadas: cartas }, turnoDeCartas: cartas.length, resultado: null, cobros: [],
        acciones: cartas.map(c => ({ ...c, tipo: "carta" })),
      },
    } });
  });
  await page.goto("/jugar/?mirar=" + id);
  const voz = page.getByRole("region", { name: "Voz de la mesa" });
  const abrir = voz.getByRole("button", { name: "Abrir voz de la mesa" });
  const discord = voz.getByRole("link", { name: /Entrar a Discord/ });
  await expect(abrir).toHaveAccessibleDescription(/Jugadores y espectadores pueden conversar.*computadoras juegan sin audio/);
  await expect(discord).toHaveCount(0);
  expect(pedidos).toBe(0);
  await abrir.press("Enter");
  await expect(voz.getByRole("status")).toHaveText("Discord no pudo abrir la voz de la mesa.");
  jugada = true;
  await page.clock.fastForward(2_100);
  await expect(page.getByRole("region", { name: "Historial de la mano" })).toContainText("Computadora 1 jugó 7 de oros.");
  await abrir.press("Enter");
  await expect(discord).toBeFocused();
  await expect(discord).toHaveAttribute("href", enlace);
  await expect(discord).toHaveAttribute("rel", /noopener/);
  if (process.env.CAPTURAS_VOZ_ESPECTADORA) {
    await voz.screenshot({ path: process.env.CAPTURAS_VOZ_ESPECTADORA + "/voz-" + test.info().project.name + ".png", scale: "css" });
  }
  await page.clock.fastForward(600_000);
  await expect(discord).toHaveCount(0);
  await expect(abrir).toBeFocused();
  await expect(voz.getByRole("status")).toContainText("El enlace venció");
  vence += 600_000;
  await abrir.press("Enter");
  await expect(discord).toHaveAttribute("href", enlace);
  expect(pedidos).toBe(3);
  disponible = false;
  await page.clock.fastForward(2_100);
  await expect(voz).toHaveCount(0);
  await expect(page.getByText("La voz de esta mesa en Discord está desactivada.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Tanteador" })).toBeVisible();
  expect(inesperadas).toEqual([]);
});
