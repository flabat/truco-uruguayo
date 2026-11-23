import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { proyectarTercetos } from "../api/partidas-tercetos.ts";
import { aplicarOnline, iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { crearIndicacionPie, versionSenasPie, vistaDelPie } from "../src/motor/senas-pie.ts";

const id = "294dda42-c1f9-404f-b0fd-f7956d9b50b1";
const pico = JSON.parse(readFileSync(new URL("./fixtures/pico-tercetos-v2.json", import.meta.url), "utf8"));
const manos = [
  ["copas-02", "bastos-01", "oros-03"], ["bastos-06", "copas-07", "espadas-05"],
  ["copas-04", "bastos-02", "oros-07"], ["oros-12", "copas-03", "bastos-04"],
  ["copas-05", "bastos-07", "oros-05"], ["oros-06", "espadas-11", "bastos-12"],
];

// Cada cara debe seguir en movimiento mientras está visible, incluso al volver a la mesa.
async function comprobarBucle(contenedor, cantidad) {
  await expect.poll(() => contenedor.locator(".j-cara-sena").evaluateAll(caras =>
    caras.filter(cara => cara.getAnimations({ subtree: true }).some(animacion =>
      animacion.playState === "running" && animacion.effect.getTiming().iterations === Infinity
    )).length
  )).toBe(cantidad);
}

async function comprobarGestos(contenedor, categorias) {
  const gestos = contenedor.getByRole("listitem");
  await expect(gestos).toHaveText(categorias.map(() => ""), { useInnerText: true });
  for (const [i, categoria] of categorias.entries()) {
    await expect(gestos.nth(i)).toHaveAccessibleName(new RegExp(categoria + "$"));
  }
  await comprobarBucle(contenedor, categorias.length);
}

for (const modo of ["2v2", "3v3"]) {
  test(modo + " muestra los gestos en el asiento y publica la indicación con destinatario", async ({ page, isMobile }) => {
    const seis = modo === "3v3";
    const nombres = seis ? ["Ana","Beto","Mateo","Diego","Clara","Luis"] : ["Ana","Beto","Clara","Diego"];
    const pie = nombres.length - 2;
    const formato = seis ? "triples" : "pairs-private-senas";
    const asientos = nombres.map((nombre, asiento) => ({ nombre, asiento, equipo: asiento % 2, tipo: "humano" }));
    const meta = seis ? 50 : 40;
    const categorias = seis ? ["2 de copas","As bravo","Tres"] : ["2 de copas","As bravo"];
    const reparto = manos.slice(0,nombres.length);
    if (!seis) reparto[0] = ["copas-02", "bastos-01", "oros-04"];
    let asiento = pie;
    let estado = iniciarOnline({ versionReparto: seis ? "online-2" : "online-1", mano: 0, dador: nombres.length - 1,
      muestra: "copas-06", manos: reparto }, [0,0], meta);
    const mesa = () => ({ id, modo, formato, versionSenas: versionSenasPie, meta, miAsiento: asiento, creadorId: "jugador-"+pie,
      asientos, lista: true, invitacion: "/jugar/?invitacion=amigos" });
    const indicaciones = [];
    const sockets = [];
    await page.routeWebSocket("**/vivo", socket => sockets.push(socket));
    await page.route("**/api/**", async route => {
      const req = route.request(), ruta = new URL(req.url()).pathname;
      let json;
      if (ruta === "/api/jugador") json = { id: "jugador-"+asiento, nombre: nombres[asiento], salonHabilitado: true };
      if (ruta === "/api/modalidades") json = { modos: ["1v1","2v2","3v3"], senasPie: ["2v2","3v3"] };
      if (ruta === "/api/salon/mesas") json = { mesas: [] };
      if (ruta === "/api/mesas") {
        expect(req.postDataJSON()).toEqual({modo, formato, publica: !seis, versionSenas: versionSenasPie});
        json = mesa();
      }
      if (ruta.endsWith("/"+id)) json = mesa();
      if (ruta.endsWith("/indicaciones")) {
        const {id: comando, version, indicacion} = req.postDataJSON();
        expect(comando).toBeTruthy();
        expect(version).toBe(1 + estado.acciones.length);
        expect(indicacion).toEqual(indicaciones.length ? {destinatario: seis ? 2 : 0, frase: "voy-a-vos", vuelta: 2} :
          {destinatario: 0, frase: "veni", vuelta: 1});
        const palabra = crearIndicacionPie(estado, asiento, indicacion.destinatario, indicacion.frase, indicacion.vuelta, indicaciones);
        expect(palabra).toBeDefined();
        indicaciones.push(palabra);
        json = {};
      }
      if (ruta.endsWith("/partida")) {
        const version = 1 + estado.acciones.length;
        const lectura = seis ? proyectarTercetos(estado, estado.lance.tipo === "redondilla" ? 1 : 2, version, asiento) :
          { version, manoNumero: 1, meta, puntos:[0,0], ganadorPartida: null, formato, vista: vistaOnline(estado,asiento) };
        json = {...lectura, versionSenas: versionSenasPie, indicaciones, pie: vistaDelPie(estado,asiento,indicaciones)};
      }
      await route.fulfill({ json });
    });
    if (isMobile) await page.setViewportSize({width:320,height:780});
    await page.goto("jugar/");
    await page.getByRole("button", {name:"Crear mi mesa"}).click();
    if (seis) await page.getByRole("radio",{name:/3 contra 3/}).check();
    await page.getByRole("checkbox",{name:/Señas automáticas al pie/}).check();
    await page.getByRole("button",{name:"Crear mesa",exact:true}).click();
    const tapete = page.getByRole("region",{name:"Tapete"});
    const globo = page.getByRole("region",{name:"Señas privadas de Ana"});
    const boton = page.getByRole("button",{name:"Señas de Ana ("+categorias.length+")"});
    await comprobarGestos(globo, categorias);
    await expect(globo.getByRole("listitem").first()).toHaveAccessibleName("Ana · alza ambas cejas · 2 de copas");
    await expect(boton).toHaveAttribute("aria-expanded","true");
    await expect(page.getByRole("combobox",{name:"Seña para esta jugada"})).toHaveCount(0);
    if (isMobile) expect((await boton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.emulateMedia({reducedMotion:"reduce"});
    await expect.poll(() => globo.locator(".j-cara-sena").evaluateAll(caras =>
      caras.flatMap(cara => cara.getAnimations({subtree:true})).length
    )).toBe(0);
    await expect(tapete.locator(".j-globo-senas")).toHaveCount(1);
    const punto = await globo.evaluate(el => {
      const b = el.getBoundingClientRect();
      const tip = parseFloat(getComputedStyle(el, "::before").left);
      return { x:b.left + tip, y:b.top };
    });
    const r = await boton.boundingBox();
    expect(Math.abs(punto.x - (r.x + r.width/2))).toBeLessThan(2);
    expect(punto.y - (r.y + r.height)).toBeLessThan(18);
    for (const btn of await tapete.locator(".j-boton-senas").all()) {
      const asiento = btn.locator("..");
      const persona = await asiento.locator(".j-persona").boundingBox();
      expect(persona.y + persona.height).toBeLessThanOrEqual((await btn.boundingBox()).y);
    }
    if (process.env.CAPTURAS_PIE && (seis === isMobile)) {
      const archivo = seis ? "pie-redondilla.png" : "pie-parejas.png";
      await tapete.screenshot({path:process.env.CAPTURAS_PIE+"/"+archivo});
    }

    await page.emulateMedia({reducedMotion:"no-preference"});
    await globo.getByRole("button",{name:"Cerrar señas"}).press("Escape");
    await expect(boton).toBeFocused();
    await expect(globo).toHaveCount(0);
    if (seis) {
      const otro = page.getByRole("button",{name:"Señas de Mateo (3)"});
      if (isMobile) await otro.tap(); else await otro.press("Enter");
      const segunda = page.getByRole("region",{name:"Señas privadas de Mateo"});
      await comprobarGestos(segunda, ["4 de copas", "Siete bravo", "Dos común"]);
    }
    if (isMobile) await boton.tap(); else await boton.press("Enter");
    await expect(globo).toBeVisible();
    await comprobarBucle(globo, categorias.length);
    await expect(page.locator(".j-globo-senas")).toHaveCount(1);
    const ocupados = await tapete.evaluate(el => {
      const b = el.querySelector(".j-globo-senas").getBoundingClientRect();
      return [...el.querySelectorAll(".j-persona,.j-boton-senas,.j-jugada,.j-muestra,.j-mano,.j-zona-tapete")].filter(other => {
        const r = other.getBoundingClientRect();
        return r.width && r.height && r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
      }).map(other => other.className);
    });
    expect(ocupados).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const hablar = page.getByRole("group",{name:"Decirle a Ana en voz alta"});
    await hablar.getByRole("button",{name:"Vení"}).click();
    const historia = page.getByRole("region",{name: seis ? "Historial de la redondilla" : "Historial de la mano"});
    await expect(historia.getByRole("listitem")).toHaveText(["Clara le dijo a Ana «Vení»."]);
    await expect(tapete.getByRole("status",{name:"Clara dice"})).toHaveText("Ana, vení");
    await expect(hablar).toHaveCount(0);
    await page.reload();
    await expect(globo).toBeVisible();
    await comprobarBucle(globo, categorias.length);
    await expect(historia.getByRole("listitem")).toHaveCount(1);

    await globo.getByRole("button",{name:"Cerrar señas"}).click();
    const primeraVuelta = seis ? ["oros-03","bastos-06","bastos-02","oros-12","copas-05","oros-06"] :
      ["oros-04","bastos-06","copas-04","oros-12"];
    for (const [asiento, carta] of primeraVuelta.entries()) {
      const paso = aplicarOnline(estado, { asiento, tipo:"carta", carta });
      expect(paso.ok).toBe(true);
      estado = paso.estado;
    }
    // El bot Ana dispone de cuatro segundos. Las cartas y los cantos agrupados
    // en esta notificación no deben retrasar el turno que ya recibió el pie.
    asientos[0].tipo = "computadora";
    for (const accion of [
      { asiento:pie, tipo:"carta", carta:seis ? "bastos-07" : "bastos-02" },
      { asiento:pie+1, tipo:"truco" },
      { asiento:0, tipo:"quiero" },
      { asiento:pie+1, tipo:"carta", carta:seis ? "bastos-12" : "bastos-04" },
    ]) {
      const paso = aplicarOnline(estado, accion);
      expect(paso.ok, JSON.stringify(accion)).toBe(true);
      estado = paso.estado;
    }
    const lecturaRecibida = page.waitForResponse(res => res.url().endsWith("/partida"));
    sockets.at(-1).send(JSON.stringify({tipo:"actualizar"}));
    await lecturaRecibida;
    await expect(page.getByRole("group",{name:"Decirle a Ana en voz alta"}).getByRole("button",{name:"Voy a vos"}))
      .toBeEnabled({timeout:900});
    await comprobarGestos(globo, ["2 de copas", "As bravo"]);
    const destinatario = seis ? "Mateo" : "Ana";
    const hablarDespues = page.getByRole("group",{name:"Decirle a "+destinatario+" en voz alta"});
    await expect(hablarDespues.getByRole("button")).toHaveText(["Voy a vos"]);
    const cantidadSockets = sockets.length;
    sockets.at(-1).close({code:1001});
    await expect.poll(() => sockets.length).toBeGreaterThan(cantidadSockets);
    await comprobarBucle(globo, 2);
    if (seis) {
      await page.getByRole("button",{name:"Señas de Mateo (2)"}).click();
      const segunda = page.getByRole("region",{name:"Señas privadas de Mateo"});
      await comprobarGestos(segunda, ["4 de copas", "Siete bravo"]);
    }
    await hablarDespues.getByRole("button",{name:"Voy a vos"}).click();
    const publica = "Clara le dijo a "+destinatario+" «Voy a vos».";
    await expect(historia.getByRole("listitem").last()).toHaveText(publica);
    await expect(tapete.getByRole("status",{name:"Clara dice"})).toHaveText(destinatario+", voy a vos");
    await expect(page.locator(".j-globo-senas")).toBeVisible();

    asientos[0].tipo = "humano";
    asiento = 0;
    await page.reload();
    const enviadas = page.locator(".j-senas-enviadas");
    await enviadas.getByText("Tus señas a Clara · 2").click();
    await comprobarGestos(enviadas, ["2 de copas", "As bravo"]);
    await expect(page.locator(".j-globo-senas,.j-boton-senas,.j-indicaciones-pie")).toHaveCount(0);
    await expect(historia.getByRole("listitem").last()).toHaveText(publica);
    if (seis) {
      estado = iniciarOnline(pico.reparto,pico.puntosInicio,pico.meta,pico.numero);
      await page.reload();
      await expect(page.getByRole("region",{name:"Historial del duelo"})).toBeVisible();
      await expect(page.locator(".j-globo-senas,.j-boton-senas,.j-indicaciones-pie,.j-senas-enviadas")).toHaveCount(0);
    }
  });
}

test("dos pies que hablan al reparto se oyen en orden, también cuando se vuelve a la mesa", async ({ page }) => {
  const nombres = ["Ana", "Beto", "Clara", "Diego"];
  const asientos = nombres.map((nombre, asiento) => ({ nombre, asiento, equipo: asiento % 2, tipo: "humano" }));
  const formato = "pairs-private-senas";
  const estado = iniciarOnline({ versionReparto:"online-1", mano:0, dador:3, muestra:"copas-06", manos:manos.slice(0,4) });
  const indicaciones = [
    crearIndicacionPie(estado,2,0,"veni",1,[]),
    crearIndicacionPie(estado,3,1,"juga",1,[]),
  ];
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", route => {
    const ruta = new URL(route.request().url()).pathname;
    let json;
    if (ruta === "/api/jugador") json = { id:"a",nombre:"Ana",salonHabilitado:true };
    if (ruta === "/api/salon/mesas") json = {mesas:[]};
    if (ruta === "/api/modalidades") json = {modos:["1v1","2v2"],senasPie:["2v2"]};
    if (ruta === "/api/mesas" || ruta.endsWith("/"+id)) json = { id,modo:"2v2",formato,versionSenas:versionSenasPie,
      lista:true,miAsiento:0,creadorId:"a",asientos };
    if (ruta.endsWith("/partida")) json = { version:1,manoNumero:1,meta:40,puntos:[0,0],ganadorPartida:null,formato,
      versionSenas:versionSenasPie,vista:vistaOnline(estado,0),pie:vistaDelPie(estado,0,indicaciones),indicaciones };
    return route.fulfill({json});
  });
  await page.goto("jugar/");
  await page.getByRole("button",{name:"Crear mi mesa"}).click();
  await page.getByRole("checkbox",{name:/Señas automáticas al pie/}).check();
  await page.getByRole("button",{name:"Crear mesa",exact:true}).click();
  const primera = page.getByRole("status",{name:"Clara dice"});
  const ultima = page.getByRole("status",{name:"Diego dice"});
  await expect(primera).toHaveText("Ana, vení");
  await expect(ultima).toHaveText("Beto, jugá");
  await page.reload();
  await expect(ultima).toHaveText("Beto, jugá");
  await expect(primera).toHaveCount(0);
});

test("las once señas cambian de expresión en el segundo ciclo", async ({ page }) => {
  const asientos = ["Ana", "Beto", "Clara", "Diego"].map((nombre, asiento) =>
    ({ nombre, asiento, equipo: asiento % 2, tipo: "humano" }));
  const muestras = [
    [["copas-02", "copas-04", "copas-05"], ["cejas", "beso", "nariz"]],
    [["copas-11", "copas-10", "bastos-01"], ["ojo-derecho", "ojo-izquierdo", "labios-derecha"]],
    [["oros-07", "oros-03", "oros-02"], ["labios-izquierda", "labio-inferior", "boca"]],
    [["oros-01", "copas-12", "bastos-12"], ["lengua"]],
    [["copas-12", "bastos-12", "espadas-12"], ["ojos-cerrados"]],
  ];
  let cartas;
  const mesa = { id, modo: "2v2", formato: "pairs-private-senas", versionSenas: versionSenasPie,
    meta: 40, miAsiento: 2, asientos, lista: true, creadorId: "clara" };
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async route => {
    const ruta = new URL(route.request().url()).pathname;
    let json;
    if (ruta === "/api/jugador") json = { id: "clara", nombre: "Clara", salonHabilitado: true };
    if (ruta.endsWith("/" + id)) json = mesa;
    if (ruta.endsWith("/partida")) {
      const estado = iniciarOnline({ versionReparto: "online-1", dador: 3, mano: 0, muestra: "copas-06",
        manos: [cartas, ["oros-04", "oros-05", "bastos-04"], ["oros-06", "bastos-06", "espadas-06"],
          ["espadas-04", "espadas-05", "bastos-05"]] }, [0, 0], 40);
      json = { ...mesa, version: 1, manoNumero: 1, puntos: [0, 0], ganadorPartida: null, indicaciones: [],
        vista: vistaOnline(estado, 2), pie: vistaDelPie(estado, 2, []) };
    }
    await route.fulfill({ json: json ?? {} });
  });
  for (const [mano, gestos] of muestras) {
    cartas = mano;
    await page.goto("jugar/?mesa=" + id);
    const caras = page.getByRole("region", { name: "Señas privadas de Ana" }).locator(".j-cara-sena");
    await expect(caras).toHaveCount(gestos.length);
    for (const [i, gesto] of gestos.entries()) {
      const cara = caras.nth(i);
      await expect(cara).toHaveAttribute("data-gesto", gesto);
      const cambia = await cara.evaluate(svg => {
        const animaciones = svg.getAnimations({ subtree: true }).filter(a =>
          a.playState === "running" && a.effect.getTiming().iterations === Infinity);
        // Comparar la pose de la cara en distintos instantes de la misma repetición.
        const poses = [0, .25, .5, .75].map(fraccion => {
          for (const a of animaciones) {
            const {duration, delay} = a.effect.getTiming();
            a.currentTime = delay + duration * (1 + fraccion);
          }
          return animaciones.map(a => {
            const estilo = getComputedStyle(a.effect.target);
            return estilo.transform + " " + estilo.opacity;
          }).join("|");
        });
        return new Set(poses).size > 1;
      });
      expect(cambia, gesto).toBe(true);
    }
  }
});
