import { expect, test } from "@playwright/test";

const id = "449e7634-5062-4dec-9063-357975dac55f";
const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena", "Félix"];
const cartas = [
  ["espadas-01", "copas-12", "oros-03"], ["bastos-03", "espadas-03", "copas-05"],
  ["copas-03", "copas-04", "oros-04"], ["oros-01", "oros-02", "bastos-01"],
  ["bastos-02", "bastos-05", "espadas-02"], ["oros-06", "bastos-06", "copas-07"],
];
const jugadores = nombres.map((nombre, asiento) => ({ nombre, id: "jugador-" + asiento }));
const asientos = nombres.map((nombre, asiento) => ({ nombre, asiento, equipo: asiento % 2, tipo: "humano" }));
const crearSala = (miAsiento, plazas = asientos) => ({
  id, modo: "3v3", formato: "triples", meta: 26, creadorId: jugadores[0].id,
  miAsiento, asientos: plazas, lista: plazas.every(a => a.tipo !== "vacio"),
  invitacion: "http://localhost/jugar/?invitacion=seis-personas",
});
const caminos = [ [5, 2], [0, 3], [1, 4] ];
const lanceDe = (duelo) => duelo === null
  ? { tipo: "redondilla", duelo: null, activos: [4, 5, 0, 1, 2, 3] }
  : { tipo: "pico-a-pico", duelo, activos: caminos[duelo - 1] };
const primero = {
  ...lanceDe(1), acciones: [{ tipo: "mazo", asiento: 5 }], vueltas: [],
  resultado: { equipo: 0, tantos: 1, motivo: "mazo" }, cobros: [{ equipo: 0, valor: 1, tantos: 1, motivo: "truco" }],
  puntos: [13, 11],
};

function lectura(asiento, duelo, version, termino = false) {
  const lance = lanceDe(duelo);
  const jugando = lance.activos.includes(asiento) && !termino;
  const estado = termino ? "terminado" : jugando ? "jugando" : "esperando";
  const resultado = termino ? { equipo: 0, tantos: 13, motivo: "envido" } : null;
  const cobros = termino ? [{ equipo: 0, valor: 13, tantos: 13, motivo: "envido", asiento: 0, tantoGanador: 31 }] : [];
  const acciones = termino ? [{ tipo: "falta-envido", asiento: 0 }, { tipo: "quiero", asiento: 3 }] : [];
  const historialLances = duelo === 2 ? [primero] : [];
  if (termino) historialLances.push({ ...lance, resultado, acciones, cobros, vueltas: [], puntos: [26, 11] });
  return {
    formato: "triples", version, meta: 26, manoNumero: duelo === null ? 1 : 2,
    puntos: termino ? [26, 11] : duelo === 2 ? [13, 11] : [12, 11],
    ganadorPartida: termino ? 0 : null, lance, historialLances,
    vista: {
      estado, asiento, muestra: "espadas-04", dador: duelo === null ? 3 : 4, mano: duelo === null ? 4 : 5,
      turno: termino ? null : lance.activos[0], apuesta: "sin-canto", equipoPorAsiento: [0, 1, 0, 1, 0, 1],
      resultado, pendiente: null, trucoPendiente: null, porDeclararFlor: null,
      vueltas: [], vueltaActual: { salida: lance.activos[0], jugadas: [] }, valorTruco: 1,
      acciones, cobros, faltaPorEquipo: duelo === 2 ? [13, 2] : [1, 2],
      legales: jugando && lance.activos[0] === asiento ? ["carta", "envido", "falta-envido", "truco", "mazo"] : [],
      ...(jugando && { cartas: cartas[asiento], tantosPropios: { modalidad: "envido", total: 31 } }),
    },
  };
}

test("la sala de tercetos ofrece cincuenta y guarda los seis asientos y la meta elegida", async ({ page }) => {
  let plazas = asientos.map((a, i) => i === 0 ? a : { ...a, nombre: null, tipo: "vacio" });
  let habilitado = false;
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    let json;
    if (pathname === "/api/jugador") json = jugadores[0];
    if (pathname === "/api/modalidades") json = { modos: habilitado ? ["1v1", "2v2", "3v3"] : ["1v1", "2v2"] };
    if (pathname === "/api/mesas") {
      expect(route.request().postDataJSON()).toEqual({ modo: "3v3", meta: 26 });
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/computadoras")) {
      const { asiento } = route.request().postDataJSON();
      expect(plazas[asiento].tipo).toBe("vacio");
      plazas[asiento] = { ...plazas[asiento], nombre: "Computadora " + asiento, tipo: "computadora" };
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/" + id)) json = crearSala(0, plazas);
    if (pathname.endsWith("/partida")) json = lectura(0, null, 1);
    await route.fulfill({ json });
  });
  await page.goto("jugar/");
  await expect(page.getByRole("radio", { name: /En parejas/ })).toBeVisible();
  const modo = page.getByRole("radio", { name: /3 contra 3/ });
  await expect(modo).toHaveCount(0);
  habilitado = true;
  await page.reload();
  await modo.check();
  const meta = page.getByRole("spinbutton");
  await expect(meta).toHaveValue("50");
  await expect(page.getByText("25 malas y 25 buenas")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  for (const nombre of ["1 contra 1", "2 contra 2"]) {
    await page.getByRole("radio", { name: new RegExp(nombre) }).check();
    await expect(meta).toHaveValue("40");
    await modo.check();
    await expect(meta).toHaveValue("50");
  }
  await meta.fill("26");
  await page.getByRole("button", { name: "Crear mesa", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Esperando jugadores" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Enlace de invitación" })).toHaveValue(/seis-personas/);
  await expect(page.getByText("Chico a 26 tantos.")).toBeVisible();
  await expect(page.locator(".j-lugar small")).toHaveText(["Equipo 1","Equipo 2","Equipo 1","Equipo 2","Equipo 1","Equipo 2"]);
  for (let i = 1; i < 6; i++) await page.getByRole("button", { name: "Agregar computadora al asiento " + (i+1) }).click();
  await expect(page.getByRole("region", { name: "Tapete" })).toBeVisible();
});

test("los seis invitados ven su turno y recuperan su lugar en el pico", async ({ browser, baseURL }, info) => {
  test.setTimeout(75_000);
  let duelo = null, version = 1, termino = false;
  const sockets = new Map(), contextos = [];
  const ancho = info.project.name === "mobile" ? 320 : 1280;
  function avisar() {
    version++;
    for (const ws of sockets.values()) ws.send(JSON.stringify({ tipo: "actualizar" }));
  }
  try {
    const paginas = await Promise.all(asientos.map(async ({ asiento }) => {
      const contexto = await browser.newContext({ baseURL, viewport: { width: ancho, height: 880 } });
      contextos.push(contexto);
      const page = await contexto.newPage();
      await page.routeWebSocket("**/vivo", ws => sockets.set(asiento, ws));
      await page.route("**/api/**", async route => {
        const { pathname } = new URL(route.request().url());
        let json;
        if (pathname === "/api/jugador") json = jugadores[asiento];
        if (pathname.endsWith("/unirse") || pathname.endsWith("/" + id)) json = crearSala(asiento);
        if (pathname.endsWith("/acciones")) {
          expect(asiento).toBe(5);
          expect(route.request().postDataJSON()).toMatchObject({ version, accion: { tipo: "mazo" } });
          duelo = 2;
          avisar();
        }
        if (pathname.endsWith("/partida") || pathname.endsWith("/acciones")) json = lectura(asiento, duelo, version, termino);
        await route.fulfill({ json });
      });
      await page.goto("jugar/?invitacion=seis-personas");
      await expect(page.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
      return page;
    }));
    for (const i of [0, 5]) {
      const puestos = paginas[i].getByRole("group", { name: "Los seis asientos" });
      await expect(puestos.getByRole("group")).toHaveCount(6);
      await expect(puestos.getByRole("group", { name: /Asiento 4/ })).toContainText("Dador");
      await expect(puestos.getByRole("group", { name: new RegExp(nombres[i]) })).toContainText("Vos");
      if (ancho > 760) {
        const yo = await puestos.getByRole("group", { name: new RegExp(nombres[i]) }).boundingBox();
        const enfrente = await puestos.getByRole("group", { name: new RegExp(nombres[(i + 3) % 6]) }).boundingBox();
        expect(yo.y).toBeGreaterThan(enfrente.y + enfrente.height);
        expect(Math.abs((yo.x + yo.width/2) - (enfrente.x + enfrente.width/2))).toBeLessThan(2);
      }
    }
    duelo = 1;
    avisar();
    for (const [i, page] of paginas.entries()) {
      const cartas = page.getByRole("group", { name: "Tus cartas" });
      await expect(page.getByText(/Duelo 1 de 3 ·/)).toBeVisible();
      await expect(cartas).toHaveCount([5, 2].includes(i) ? 1 : 0);
    }
    await paginas[5].getByRole("button", { name: "Irse al mazo" }).press("Enter");
    await expect(paginas[5].getByRole("heading", { name: "Turno de Ana" })).toBeFocused();
    await expect(paginas[5].getByText("Ya jugaste tu duelo. Esperá el próximo reparto.")).toBeVisible();
    await expect(paginas[0].getByRole("heading", { name: "Tu turno" })).toBeVisible();
    await expect(paginas[0].getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
    await expect(paginas[0].getByRole("group", { name: /Asiento 5 · Elena/ })).toContainText("Dador");
    for (const i of [0, 5]) {
      await paginas[i].reload();
      await expect(paginas[i].getByText(/Duelo 2 de 3 · Ana \(equipo 1\) y Diego \(equipo 2\)/)).toBeVisible();
      await expect(paginas[i].getByRole("group", { name: "Tus cartas" })).toHaveCount(i === 0 ? 1 : 0);
      expect(await paginas[i].evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
    }
    await expect(paginas[4].getByText("Te toca en el duelo 3 de 3.")).toBeVisible();
    await expect(paginas[4].getByText("Tus tantos", {exact: true})).toHaveCount(0);
    await expect(paginas[4].getByText("Último cobro · Equipo 1, 1 tanto por truco.")).toBeVisible();
    await expect(paginas[0].getByText("0 buenas", { exact: true })).toHaveCount(1);
    if (process.env.CAPTURAS_TERCETOS) {
      const i = ancho === 320 ? 5 : 0;
      await paginas[i].locator(".j-partida").screenshot({ path: `${process.env.CAPTURAS_TERCETOS}/tercetos-${ancho}.jpg`, type: "jpeg", quality: 84 });
    }
    termino = true;
    avisar();
    for (const [i, page] of paginas.entries()) {
      await expect(page.getByRole("heading", { name: i % 2 ? "El rival ganó el chico" : "Tu equipo ganó el chico" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Repartir otra mano" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Crear otra mesa" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    }
    await paginas[4].getByText(/Duelo 2 de 3 · Ganó el equipo 1/).click();
    await expect(paginas[4].getByText("Equipo 1 · 13 tantos por envido (Ana con 31).")).toBeVisible();
  } finally {
    await Promise.all(contextos.map(ctx => ctx.close()));
  }
});
