import { test, expect } from "@playwright/test";
import { confirmar, turnosDeEquipo } from "../api/turnos.ts";
import { iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { teamSignalsVersion } from "../training/contracts/index.ts";
import reparto from "./fixtures/reparto-v1.json" with { type: "json" };

test("la zona conserva seña, foco y versión al girar, reconectar y reintentar por teclado", async ({ page }) => {
  const id = "e4518626-21d0-4529-9f99-4c286c8141e1";
  const formato = "pairs-private-senas";
  const miAsiento = reparto.mano;
  const asientos = reparto.manos.map((_, asiento) => ({
    nombre: "CPU " + (asiento + 1), tipo: "computadora", asiento, equipo: asiento % 2,
  }));
  const mesa = { id, modo: "2v2", formato, asientos, miAsiento, creadorId: "cpu", lista: true };
  // Con esta muestra la mano abre con cartas y cantos libres.
  let mano = { estado: iniciarOnline({ ...reparto, versionReparto: "online-1", muestra: "oros-05" }), turnos: [] };
  const intentos = [];
  const acuse = Promise.withResolvers();
  let socket;
  let lecturaPendiente;
  await page.routeWebSocket("**/vivo", canal => { socket = canal; });
  await page.route("**/api/**", async route => {
    const pedido = route.request();
    const path = new URL(pedido.url()).pathname;
    if (path.endsWith(id)) {
      await lecturaPendiente;
      return route.fulfill({ json: mesa });
    }
    if (path.endsWith("/partida")) return route.fulfill({ json: {
      manoNumero: 1, version: mano.turnos.length + 1, meta: 40, puntos: [0, 0], ganadorPartida: null,
      formato, versionSenas: teamSignalsVersion, vista: vistaOnline(mano.estado, miAsiento),
      turnos: turnosDeEquipo(mano.turnos, miAsiento),
    } });
    if (path.endsWith("/acciones")) {
      const comando = pedido.postDataJSON();
      intentos.push(comando);
      if (intentos.length === 1) {
        mano = confirmar(mano, formato, { ...comando.accion, asiento: miAsiento });
        return route.abort("connectionreset");
      }
      if (comando.id === intentos[0].id) await acuse.promise;
      else mano = confirmar(mano, formato, { ...comando.accion, asiento: miAsiento });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { id: "cpu", nombre: asientos[miAsiento].nombre, salonHabilitado: true } });
  });
  function jugadaAjena(accion) {
    mano = confirmar(mano, formato, accion);
    socket.send(JSON.stringify({ tipo: "actualizar" }));
  }

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("jugar/?mesa=" + id);
  const zona = page.getByRole("region", { name: "Zona de juego" });
  const titulo = zona.getByRole("heading");
  const selector = zona.getByRole("combobox", { name: "Seña para esta jugada" });
  const cartas = zona.getByRole("group", { name: "Tus cartas" }).getByRole("button");
  const truco = zona.getByRole("button", { name: "Truco", exact: true });
  await expect(truco).toBeEnabled();
  await titulo.focus();
  await page.keyboard.press("Tab");
  await expect(selector).toBeFocused();
  await selector.press("a");
  await expect(selector).toHaveValue("cejas");
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(selector).toBeFocused();
  await expect(selector).toHaveValue("cejas");

  const reconexion = Promise.withResolvers();
  lecturaPendiente = reconexion.promise;
  socket.close({ code: 1001, reason: "Corte de prueba" });
  await expect(titulo).toHaveText(/Reconectando/);
  await expect(truco).toBeDisabled();
  await expect(cartas.first()).toBeDisabled();
  expect(intentos).toHaveLength(0);
  reconexion.resolve();
  await expect(truco).toBeEnabled();
  await expect(selector).toHaveValue("cejas");
  await selector.focus();
  await expect(cartas).toHaveCount(3);
  for (const carta of await cartas.all()) {
    await page.keyboard.press("Tab");
    await expect(carta).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(truco).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => intentos.length).toBe(2);
  expect(intentos[0]).toEqual({
    id: expect.stringMatching(/^[\da-f-]{36}$/i), version: 1, accion: { tipo: "truco", sena: "cejas" },
  });
  expect(intentos[1]).toEqual(intentos[0]);
  await expect(titulo).toHaveText("Enviando jugada…");
  await expect(titulo).toBeFocused();
  await expect(truco).toBeDisabled();
  acuse.resolve();
  const historia = page.getByRole("region", { name: "Historial de la mano", exact: true });
  await expect(historia.getByRole("listitem")).toHaveText(["CPU 4 dijo «Truco»."]);
  await expect(titulo).toBeFocused();
  jugadaAjena({ asiento: 0, tipo: "quiero" });
  const tres = zona.getByRole("button", { name: "Jugar 3 de espadas" });
  await expect(tres).toBeEnabled();
  await expect(selector).toHaveValue("");
  await tres.press("Space");
  await expect(tres).toHaveCount(0);
  await expect(titulo).toBeFocused();
  expect(intentos).toHaveLength(3);
  expect(intentos[2].id).not.toBe(intentos[0].id);
  expect(intentos[2]).toMatchObject({ version: 3, accion: { tipo: "carta", carta: "espadas-03" } });

  jugadaAjena({ asiento: 0, tipo: "carta", carta: "copas-01" });
  const anteriores = historia.locator("summary");
  await expect(anteriores).toHaveText("Ver 1 jugada anterior");
  await anteriores.press("Enter");
  jugadaAjena({ asiento: 1, tipo: "carta", carta: "oros-07" });
  await expect(anteriores).toHaveText("Ver 2 jugadas anteriores");
  await expect(anteriores).toBeFocused();
  await expect(historia.locator("details")).toHaveAttribute("open", "");
  expect(intentos).toHaveLength(3);
});
