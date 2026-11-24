import { test, expect } from "@playwright/test";
import { iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { tableroEspectador } from "../api/tablero-espectador.ts";
import { turnosDeEquipo } from "../api/turnos.ts";
import { commitTurn } from "../training/signals/index.ts";
import { teamSignalsVersion } from "../training/contracts/index.ts";

const id = "8349aa42-c1f9-404f-b0fd-f7956d9b50b1";
const formato = "pairs-private-senas";
const asientos = ["A", "B", "C", "D"].map((nombre, asiento) => ({
  asiento, nombre, equipo: asiento % 2, tipo: "computadora",
}));
const sala = miAsiento => ({ id, modo: "2v2", formato, creadorId: "s0", miAsiento, lista: true, asientos });
const reparto = {
  versionReparto: "online-1", mano: 0, dador: 3, muestra: "bastos-01",
  manos: [
    ["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"],
    ["oros-01", "copas-03", "espadas-07"], ["copas-05", "espadas-02", "oros-03"],
  ],
};

test("un gesto se confirma junto a la jugada y se recupera una sola vez", async ({page,isMobile}) => {
  if (isMobile) await page.setViewportSize({width:320,height:780});
  const mesa = sala(0);
  let state = iniciarOnline(reparto);
  const turns = [];
  const sent = [];
  function registrar(asiento, jugada) {
    const paso = commitTurn(state, asiento, "pairs-private-senas", jugada);
    state = paso.state;
    turns.push(paso.turn);
  }
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async route => {
    const req=route.request(), path=new URL(req.url()).pathname;
    let data={id:"s0",nombre:"A",salonHabilitado:true};
    if (path === "/api/salon/mesas") data={mesas:[]};
    else if (path === "/api/mesas") {
      expect(req.postDataJSON()).toEqual({modo:"2v2",publica:true,formato:"pairs-private-senas"});
      data=mesa;
    } else if(path.endsWith(id)) data=mesa;
    else if(path.endsWith("/acciones")) {
      const {accion}=req.postDataJSON();
      sent.push(accion);
      registrar(0, accion.sena + "/" + accion.tipo);
    } else if(path.endsWith("/partida")) data={version:turns.length+1,manoNumero:1,puntos:[0,0],meta:40,
      ganadorPartida:null,formato:"pairs-private-senas",versionSenas:teamSignalsVersion,turnos:turnosDeEquipo(turns, 0),vista:vistaOnline(state,0)};
    await route.fulfill({json:data});
  });
  await page.goto("jugar/");
  await page.getByRole("button", { name: "Crear mi mesa" }).click();
  const check=page.getByRole("checkbox",{name:"Permitir señas entre compañeros"});
  await check.focus(); await check.press("Space");
  await page.getByRole("button",{name:"Crear mesa",exact:true}).click();
  const selector=page.getByRole("combobox",{name:"Seña para esta jugada"});
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveAccessibleDescription("La seña la ven vos y tu compañero al confirmar la jugada.");
  await expect(selector).toHaveValue("");
  await expect(selector.locator("option")).toHaveCount(14);
  await selector.focus(); await selector.press("a");
  await expect(selector).toHaveValue("cejas");
  expect(sent).toEqual([]);
  if(process.env.CAPTURAS_SENAS) {
    await page.screenshot({path:process.env.CAPTURAS_SENAS+"/senas-"+test.info().project.name+".jpg",quality:80,fullPage:true});
  }
  await page.getByRole("button",{name:"Falta envido",exact:true}).press("Enter");
  const entries=page.getByRole("region",{name:"Señas de esta mano"}).getByRole("listitem");
  const publicas=page.getByRole("region",{name:"Historial de la mano",exact:true}).getByRole("listitem");
  await expect(page.getByRole("button", { name: "Reportar esta jugada" })).toHaveCount(0);
  await expect(entries).toHaveText(["A · Alzar ambas cejas · falta envido"]);
  await expect(publicas).toHaveText(["A dijo «Falta envido»."]);
  await page.reload();
  await expect(entries).toHaveText(["A · Alzar ambas cejas · falta envido"]);
  await expect(publicas).toHaveText(["A dijo «Falta envido»."]);
  expect(sent).toEqual([{tipo:"falta-envido",sena:"cejas"}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  registrar(1, "quiero");
  registrar(2, "cejas/paso-flor");
  await page.reload();
  await expect(entries).toHaveText(["A · Alzar ambas cejas · falta envido", "C · Alzar ambas cejas · Yo no canto"]);
});

test("rivales y espectador reciben y muestran la misma jugada con seña que en silencio", async ({ page, context }) => {
  let asiento = 1;
  let paso;
  const marcador = { manoNumero: 1, meta: 40, puntos: [0, 0], ganadorPartida: null };
  const privada = () => ({
    ...marcador, version: 2, formato, versionSenas: teamSignalsVersion,
    turnos: turnosDeEquipo([paso.turn], asiento), vista: vistaOnline(paso.state, asiento),
  });
  const publica = () => ({
    ...marcador, id, modo: "2v2", origen: "exhibicion", estado: "en-juego",
    humanos: 0, computadoras: 4, asientos, tablero: tableroEspectador(paso.state),
  });
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/jugador", r => r.fulfill({ json: { id: "s" + asiento, nombre: "CPU", salonHabilitado: true, puedeReportar: true } }));
  await page.route("**/api/mesas/" + id, r => r.fulfill({ json: sala(asiento) }));
  await page.route("**/partida", r => r.fulfill({ json: privada() }));
  await page.route("**/api/salon/mesas/" + id, r => r.fulfill({ json: publica() }));

  for (const observador of [1, 3, "espectador"]) {
    const mira = observador === "espectador";
    if (!mira) asiento = observador;
    const capturas = [];
    for (const movimiento of ["espadas-03", "cejas/espadas-03"]) {
      paso = commitTurn(iniciarOnline(reparto), 0, formato, movimiento);
      await page.goto("/jugar/?" + (mira ? "mirar=" : "mesa=") + id);
      const historia = page.getByRole("region", { name: "Historial de la mano" });
      await expect(historia.getByRole("listitem")).toHaveText(["A jugó 3 de espadas."]);
      const tapete = page.getByRole("region", { name: "Tapete" });
      if (mira) {
        await expect(historia.getByRole("button", { name: "Reportar esta jugada" })).toHaveCount(0);
        await expect(tapete.getByRole("button")).toHaveCount(0);
        await expect(tapete.getByRole("combobox")).toHaveCount(0);
        await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
      } else {
        await expect(tapete.getByRole("heading", { name: "Reconectando con tu mesa…" })).toHaveCount(0);
      }
      await expect(page.getByRole("region", { name: "Señas de esta mano" })).toHaveCount(0);
      capturas.push({ datos: mira ? publica() : privada(), tapete: await tapete.innerHTML(), historial: await historia.innerHTML() });
    }
    expect(capturas[1]).toEqual(capturas[0]);
  }
  for (asiento of [0, 2]) {
    await page.goto("/jugar/?mesa=" + id);
    await expect(page.getByRole("region", { name: "Señas de esta mano" }).getByRole("listitem"))
      .toHaveText(["A · Alzar ambas cejas · 3 de espadas"]);
  }

  // Una persona habilitada vio la seña. El formulario envía sólo la posición pública en otra pestaña.
  const ruta = "/api/mesas/" + id + "/reportes";
  await context.route("**" + ruta, route => route.fulfill({ contentType: "text/plain", body: "Borrador de prueba" }));
  const recibida = context.waitForEvent("request", { predicate: req => new URL(req.url()).pathname === ruta });
  const abierta = context.waitForEvent("page");
  const reportar = page.getByRole("button", { name: "Reportar esta jugada" });
  await reportar.focus();
  await expect(reportar).toBeFocused();
  await reportar.press("Enter");
  const solicitud = await recibida;
  expect(solicitud.method()).toBe("POST");
  expect(await solicitud.headerValue("origin")).toBe(new URL(page.url()).origin);
  const { cliente, ...datos } = Object.fromEntries(new URLSearchParams(solicitud.postData()));
  expect(datos).toEqual({ mano: "1", posicion: "1", vuelta: "1", puntos: "0-0", fase: "jugada" });
  const revision = page.getByRole("contentinfo").locator('a[href*="/commit/"]');
  if (await revision.count()) expect(cliente).toBe((await revision.getAttribute("href")).split("/").at(-1));
  else expect(cliente).toBeUndefined();
  const pestana = await abierta;
  await expect(pestana.locator("body")).toHaveText("Borrador de prueba");
  expect(await pestana.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL("/jugar/?mesa=" + id);
  await pestana.close();
});
