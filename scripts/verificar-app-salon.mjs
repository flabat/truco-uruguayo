// Desde el host, contra la web del stack descartable: en la exportación web de la app (/jugar/), eva crea una
// mesa de parejas (siempre con señas automáticas al pie), diego entra por la invitación sin sesión, clara
// la mira desde el salón y las computadoras completan la mesa. También: volver a la mesa, los enlaces
// ?mesa= y ?mirar=, los viejos /app/… y /volver/?mesa=, la precarga de las cartas y un duelo con computadoras en escritorio.
// Además, lo que la app suma para no perder nada de la pantalla anterior (#403): ?crear=1, los conteos de
// /eventos/, el aviso de la comunidad, el enlace a «Mis partidas» y el aviso sin red.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { mazo } from "@eltruco/motor/cartas.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const browser = await chromium.launch();
const espera = { timeout: 25_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });
const movil = { width: 375, height: 760 };
const uuid = "[a-f0-9-]{36}";

async function pagina(viewport = movil) {
  const context = await browser.newContext({ baseURL: web, viewport });
  const p = await context.newPage();
  p.setDefaultTimeout(25_000);
  return p;
}

/** Ingresa desde la pantalla de ingreso de la app, con el título que corresponda al enlace. */
async function ingresar(p, usuario, encabezado = "Entrá a jugar") {
  await expect(titulo(p, encabezado)).toBeVisible(espera);
  await boton(p, "Ingresar").click();
  await ingresarDesdeIdentidad(p, usuario);
}

async function api(p, ruta) {
  const r = await p.request.get(ruta);
  assert.equal(r.status(), 200, ruta + " · " + r.status());
  return r.json();
}

const idDeLaRuta = (p, prefijo) => new URL(p.url()).pathname.replace(prefijo, "");

async function crearMesa(p, { modalidad, meta, computadoras = false }) {
  await boton(p, "Crear mesa").click();
  await expect(titulo(p, "Crear una mesa")).toBeVisible();
  // Nunca se ofrece la seña elegida a mano: la única casilla es la del salón.
  await expect(p.getByRole("checkbox")).toHaveCount(1);
  await expect(p.getByRole("checkbox", { name: "Mostrar en el salón" })).toHaveAttribute("aria-checked", "true");
  const { modos } = await api(p, "/api/modalidades");
  await expect(p.getByRole("radio")).toHaveCount(modos.includes("3v3") ? 3 : 2);
  await p.getByRole("radio", { name: new RegExp("^" + modalidad) }).click();
  await expect(p.getByRole("radio", { name: new RegExp("^" + modalidad) })).toHaveAttribute("aria-checked", "true");
  const campo = p.getByRole("textbox", { name: "Tantos para ganar el chico" });
  await campo.fill("31");
  await expect(p.getByText("Elegí un número par desde 2.")).toBeVisible();
  await expect(boton(p, "Crear mesa")).toHaveAttribute("aria-disabled", "true");
  await campo.fill(String(meta));
  await expect(p.getByText(`${meta / 2} malas y ${meta / 2} buenas`)).toBeVisible();
  await boton(p, computadoras ? "Jugar con computadoras" : "Crear mesa").click();
}

async function probarParejas() {
  const eva = await pagina();
  const cartas = new Map();
  eva.on("response", r => {
    const nombre = /\/jugar\/assets\/_public\/img\/cartas\/tatu\/([a-z0-9-]+)\.[a-f0-9]+\.webp$/.exec(new URL(r.url()).pathname)?.[1];
    if (nombre) cartas.set(nombre, r.status());
  });
  await eva.goto("/jugar/");
  await ingresar(eva, "eva");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  assert.deepEqual((await api(eva, "/api/mis-mesas")).mesas, []);
  await expect(eva.getByRole("region", { name: "Mis mesas" })).toHaveCount(0);
  await expect(boton(eva, "Volver a mi mesa")).toHaveCount(0);
  // Las cartas se precargan en el salón, antes de la mesa.
  await expect.poll(() => cartas.size, espera).toBe(41);
  assert.deepEqual([...cartas.keys()].sort(), [...mazo, "reverso"].sort());
  assert.ok([...cartas.values()].every(estado => estado === 200), "todas las cartas responden 200");

  await crearMesa(eva, { modalidad: "2 contra 2", meta: 30 });
  await eva.waitForURL(new RegExp(`/jugar/sala/${uuid}\\?nueva=1$`));
  await expect(titulo(eva, "Esperando jugadores")).toBeVisible();
  const id = idDeLaRuta(eva, "/jugar/sala/");
  const mesa = await api(eva, "/api/mesas/" + id);
  assert.equal(mesa.modo, "2v2");
  assert.equal(mesa.formato, "pairs-private-senas");
  assert.equal(mesa.versionSenas, versionSenasPie);
  assert.equal(mesa.meta, 30);
  assert.equal(mesa.publica, true);
  await expect(eva.getByText("Faltan 3 jugadores para repartir.")).toBeVisible();
  await expect(eva.getByText(/^Señas automáticas al pie/)).toBeVisible();
  const enlace = await eva.getByRole("textbox", { name: "Enlace de invitación" }).inputValue();
  assert.match(enlace, new RegExp(`^${web}/jugar/\\?invitacion=[A-Za-z0-9_-]+$`));
  assert.equal(new URL(enlace).searchParams.get("invitacion"), new URL(mesa.invitacion).searchParams.get("invitacion"));

  // diego abre la invitación sin sesión: ingresa y vuelve a la invitación.
  const diego = await pagina();
  await diego.goto(enlace);
  await ingresar(diego, "diego", "Te invitaron a una mesa");
  await diego.waitForURL(/\/jugar\/invitacion\//, espera);
  await boton(diego, "Ocupar mi asiento").click();
  await diego.waitForURL(new RegExp(`/jugar/sala/${id}$`));
  await expect(titulo(diego, "Esperando jugadores")).toBeVisible();
  await expect(eva.getByText("Faltan 2 jugadores para repartir.")).toBeVisible(espera);
  // La misma invitación, ya sentado, lleva a la sala.
  await diego.goto(enlace);
  await diego.waitForURL(new RegExp(`/jugar/sala/${id}$`), espera);

  // Las computadoras completan la mesa y todos pasan a la mesa en juego.
  for (const asiento of [3, 4]) {
    await boton(eva, `Agregar computadora al asiento ${asiento}`).click();
    if (asiento === 3) await expect(eva.getByText("Falta un jugador para repartir.")).toBeVisible(espera);
  }
  await Promise.all([eva, diego].map(p => p.waitForURL(`/jugar/mesa?id=${id}`, espera)));
  // La mesa carga CanvasKit: con la máquina cargada tarda más que el plazo por defecto.
  await Promise.all([eva, diego].map(p => expect(p.getByTestId("mesa")).toBeVisible(espera)));

  // clara la ve en el salón y la mira.
  const clara = await pagina();
  await clara.goto("/jugar/");
  await ingresar(clara, "clara");
  await expect(titulo(clara, "Mesas en juego")).toBeVisible(espera);
  const fila = clara.getByTestId("mesa-" + id);
  await expect(fila).toBeVisible(espera);
  await expect(fila).toContainText("Parejas");
  await expect(fila).toContainText("2 personas y 2 computadoras");
  await boton(fila, "Mirar").click();
  await clara.waitForURL(`/jugar/mirar/${id}`);
  // La mesa nueva, sin mano ni Cantos: el tanteador nombra a cada pareja.
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.getByRole("heading", { level: 2, name: "La mano en juego" })).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando")).toBeVisible();
  await expect(boton(clara, "Volver al salón")).toBeVisible();
  await expect(boton(clara, "Cantos")).toHaveCount(0);
  // Las computadoras pueden haber cobrado algo (una flor) mientras clara entraba. Entre las piezas del
  // tanteador van espacios duros (\u00a0): `\s` los acepta.
  await expect(clara.getByLabel("Tanteador")).toHaveText(/^Jugador\s1\sy\sComputadora\s3\s\d+\s·\s\d+\sJugador\s2\sy\sComputadora\s4\s·\sa\s\d+$/);
  // El enlace ?mirar= nunca ocupa un asiento, aunque lleve también una invitación.
  await clara.goto(`/jugar/?mirar=${id}&invitacion=${new URL(enlace).searchParams.get("invitacion")}`);
  await clara.waitForURL(`/jugar/mirar/${id}`, espera);
  assert.equal((await clara.request.get("/api/mesas/" + id)).status(), 404, "mirar no sienta a clara");
  assert.ok(!(await api(clara, "/api/mis-mesas")).mesas.some(m => m.id === id), "mirar no agrega la mesa a la cuenta");

  // eva vuelve al salón y retoma su mesa; las rutas profundas resisten una recarga.
  // Con una hoja que pide respuesta (eva tiene flor o le tocaron envido), «Más» no abre: eva responde primero.
  await expect(async () => {
    for (const respuesta of ["Flor", "Quiero"]) {
      if (await boton(eva, respuesta).isVisible()) await boton(eva, respuesta).click();
    }
    await boton(eva, "Más").click({ timeout: 2_000 });
    await boton(eva, "Salir al salón").click({ timeout: 2_000 });
  }).toPass(espera);
  await expect(titulo(eva, "Mesas en juego")).toBeVisible();
  await boton(eva, "Volver a mi mesa").click();
  await eva.waitForURL(`/jugar/mesa?id=${id}`, espera);
  await eva.reload();
  await expect(eva.getByTestId("mesa")).toBeVisible(espera);
  await diego.goto(`/jugar/?mesa=${id}`);
  await diego.waitForURL(`/jugar/mesa?id=${id}`, espera);
  await diego.goto(`/jugar/sala/${id}`);
  await diego.waitForURL(`/jugar/mesa?id=${id}`, espera);
  // Los enlaces ya compartidos llegan a la misma pantalla: la dirección de prueba /app/… y el regreso
  // de Discord /volver/?mesa=, que sienta a quien juega y abre la mesa para mirar a quien no.
  await diego.goto(`/app/?mesa=${id}`);
  await diego.waitForURL(`/jugar/mesa?id=${id}`, espera);
  await diego.goto(`/volver/?mesa=${id}`);
  await diego.waitForURL(`/jugar/mesa?id=${id}`, espera);
  await clara.goto(`/app/mirar/${id}`);
  await clara.waitForURL(`/jugar/mirar/${id}`, espera);
  const desdeDiscord = await pagina();
  await desdeDiscord.goto(`/volver/?mesa=${id}`);
  assert.equal(new URL(desdeDiscord.url()).pathname, "/jugar/");
  await ingresar(desdeDiscord, "clara", "Volvé a tu mesa");
  await desdeDiscord.waitForURL(`/jugar/mirar/${id}`, espera);
  await expect(desdeDiscord.getByText("👁 Mirando")).toBeVisible(espera);
  await Promise.all([eva, diego, clara, desdeDiscord].map(p => p.context().close()));
  return id;
}

async function probarDuelo() {
  const eva = await pagina({ width: 1280, height: 800 });
  await eva.goto("/jugar/");
  await ingresar(eva, "eva");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await crearMesa(eva, { modalidad: "1 contra 1", meta: 20, computadoras: true });
  await eva.waitForURL(new RegExp(`/jugar/mesa\\?id=${uuid}$`), espera);
  const id = new URL(eva.url()).searchParams.get("id");
  const mesa = await api(eva, "/api/mesas/" + id);
  assert.equal(mesa.modo, "1v1");
  assert.equal(mesa.meta, 20);
  assert.equal(mesa.versionSenas, undefined);
  assert.equal(mesa.lista, true);
  await eva.context().close();
  return id;
}

async function probarParidadConJugar() {
  const eva = await pagina();
  const eventos = [];
  eva.on("request", r => {
    const evento = /^\/eventos\/([a-z-]+)\.txt$/.exec(new URL(r.url()).pathname)?.[1];
    if (evento) eventos.push(evento);
  });
  // /jugar/?crear=1 es un retorno permitido del ingreso: lleva a crear la mesa después de ingresar.
  await eva.goto("/jugar/?crear=1");
  await ingresar(eva, "eva", "Entrá con tu jugador");
  await expect(titulo(eva, "Crear una mesa")).toBeVisible(espera);
  await eva.goto("/jugar/");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  // El aviso de la comunidad, como en /jugar/: «Ahora no» lo oculta para este jugador.
  const comunidad = eva.getByRole("region", { name: "Comunidad de Discord" });
  await expect(comunidad).toBeVisible();
  await expect(boton(eva, "Unirme al Discord ↗")).toBeVisible();
  await comunidad.getByText("Ahora no", { exact: true }).click();
  await expect(comunidad).toHaveCount(0);
  await eva.reload();
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await expect(comunidad).toHaveCount(0);
  // «Mis partidas» sigue en el perfil del sitio.
  await eva.getByText("Tu perfil", { exact: true }).click();
  await expect(titulo(eva, "Tu perfil")).toBeVisible(espera);
  await eva.getByText("Ver mis partidas", { exact: true }).click();
  await eva.waitForURL(/\/perfil\/#mis-partidas$/, espera);
  await expect(eva.getByRole("heading", { name: "Mis partidas" })).toBeVisible(espera);
  await eva.goto("/jugar/");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await crearMesa(eva, { modalidad: "1 contra 1", meta: 20 });
  await eva.waitForURL(new RegExp(`/jugar/sala/${uuid}\\?nueva=1$`), espera);
  await expect(titulo(eva, "Esperando jugadores")).toBeVisible(espera);
  await boton(eva, "Compartir invitación").click();
  await expect.poll(() => eventos).toContain("compartir-mesa");
  // Sin red, la sala lo dice enseguida y vuelve a leer la mesa cuando vuelve la red.
  await eva.context().setOffline(true);
  await expect(eva.getByText("Reconectando con tu mesa…")).toBeVisible();
  await eva.context().setOffline(false);
  await expect(eva.getByText("Reconectando con tu mesa…")).toHaveCount(0, espera);
  const id = idDeLaRuta(eva, "/jugar/sala/");
  await eva.goto("/jugar/perfil");
  await boton(eva, "Cerrar sesión").click();
  await expect(titulo(eva, "Entrá a jugar")).toBeVisible(espera);
  await eva.context().close();
  return id;
}

async function probarMisMesasDesdeOtroDispositivo(parejas, duelo, sala) {
  const nueva = await pagina();
  await nueva.route("**/api/mis-mesas", r => r.fulfill({ status: 503, json: { error: "Temporalmente no disponible" } }), { times: 1 });
  await nueva.goto("/jugar/");
  await ingresar(nueva, "eva");
  const propias = nueva.getByRole("region", { name: "Mis mesas" });
  const fila = id => propias.getByTestId("mi-mesa-" + id);
  await expect(boton(nueva, "Crear mesa")).toBeVisible(espera);
  await expect(propias.getByText("No se pudieron cargar tus mesas.")).toBeVisible(espera);
  await boton(propias, "Reintentar mis mesas").click();
  await expect(propias).toBeVisible(espera);
  await expect(propias.getByRole("listitem")).toHaveCount(3);
  await expect(fila(sala)).toContainText("Esperando jugadores");
  await expect(fila(parejas)).toContainText("Parejas");
  await expect(fila(duelo)).toContainText("Duelo");
  await expect(boton(nueva, "Volver a mi mesa")).toHaveCount(0);
  const capturas = process.env.CAPTURAS_MIS_MESAS;
  if (capturas) {
    await mkdir(capturas, { recursive: true });
    await nueva.screenshot({ path: join(capturas, "mis-mesas-movil.png") });
    await nueva.setViewportSize({ width: 1280, height: 800 });
    await nueva.screenshot({ path: join(capturas, "mis-mesas-escritorio.png") });
  }
  await fila(parejas).getByRole("button", { name: /^Continuar / }).click();
  await nueva.waitForURL(`/jugar/mesa?id=${parejas}`, espera);
  await expect(nueva.getByTestId("mesa")).toBeVisible(espera);

  // Ocho días sin actividad: las tres siguen disponibles y abren su propio destino.
  await nueva.clock.setFixedTime(new Date(Date.now() + 8 * 86_400_000));
  await nueva.goto("/jugar/");
  const anteriores = boton(propias, "Mesas anteriores (3)");
  await expect(anteriores).toBeVisible(espera);
  await expect(anteriores).toHaveAttribute("aria-expanded", "false");
  await expect(fila(sala)).toHaveCount(0);
  await anteriores.focus();
  await nueva.keyboard.press("Space");
  await expect(anteriores).toHaveAttribute("aria-expanded", "true");
  await expect(propias.getByRole("listitem")).toHaveCount(3);
  await fila(sala).getByRole("button", { name: /^Continuar / }).focus();
  await nueva.keyboard.press("Enter");
  await nueva.waitForURL(`/jugar/sala/${sala}`, espera);
  await expect(titulo(nueva, "Esperando jugadores")).toBeVisible(espera);
  // Un enlace explícito tiene prioridad incluso si la cuenta tiene más de una mesa.
  await nueva.goto(`/jugar/?mesa=${duelo}`);
  await nueva.waitForURL(`/jugar/mesa?id=${duelo}`, espera);
  await nueva.context().close();
}

async function probarCambioDeCuentaEntrePestanas(dueloDeEva) {
  const primera = await pagina();
  const contexto = primera.context();
  await primera.goto("/jugar/");
  await ingresar(primera, "eva");
  await expect(titulo(primera, "Mesas en juego")).toBeVisible(espera);
  const eva = await api(primera, "/api/jugador");
  await expect(primera.getByText("Hola, " + eva.nombre, { exact: true })).toBeVisible(espera);
  await expect(primera.getByTestId("mi-mesa-" + dueloDeEva)).toBeVisible(espera);

  // En Chromium sin ventana ambas pestañas pueden seguir visibles. Simulamos el aviso
  // del navegador para que el primer salón consulte justo después del cambio de cookie.
  const cambiarVisibilidad = estado => primera.evaluate(visibilidad => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: visibilidad });
    document.dispatchEvent(new Event("visibilitychange"));
  }, estado);
  await cambiarVisibilidad("hidden");
  const segunda = await contexto.newPage();
  await segunda.goto("/jugar/perfil");
  await boton(segunda, "Cerrar sesión").click();
  await expect(titulo(segunda, "Entrá a jugar")).toBeVisible(espera);
  // La sesión de juego ya se cerró. Sin el ingreso previo de Keycloak podemos elegir a Clara.
  await contexto.clearCookies();
  await ingresar(segunda, "clara");
  await expect(titulo(segunda, "Mesas en juego")).toBeVisible(espera);
  const clara = await api(segunda, "/api/jugador");
  assert.notEqual(clara.id, eva.id);
  const crear = await segunda.request.post("/api/mesas", {
    data: { modo: "1v1", publica: false }, headers: { Origin: new URL(web).origin },
  });
  assert.equal(crear.status(), 201);
  const salaDeClara = (await crear.json()).id;

  await primera.bringToFront();
  await cambiarVisibilidad("visible");
  await expect(primera.getByText("Hola, " + clara.nombre, { exact: true })).toBeVisible(espera);
  const propias = primera.getByRole("region", { name: "Mis mesas" });
  await expect(propias.getByTestId("mi-mesa-" + salaDeClara)).toBeVisible(espera);
  await expect(propias.getByTestId("mi-mesa-" + dueloDeEva)).toHaveCount(0);
  const anteriores = propias.getByRole("button", { name: /^Mesas anteriores/ });
  if (await anteriores.isVisible()) await anteriores.click();
  const mostradas = await propias.getByRole("listitem").evaluateAll(filas =>
    filas.map(fila => fila.getAttribute("data-testid").slice("mi-mesa-".length)).sort());
  assert.deepEqual(mostradas, (await api(segunda, "/api/mis-mesas")).mesas.map(m => m.id).sort());
  await contexto.close();
}

try {
  const parejas = await probarParejas();
  const duelo = await probarDuelo();
  const sala = await probarParidadConJugar();
  await probarMisMesasDesdeOtroDispositivo(parejas, duelo, sala);
  await probarCambioDeCuentaEntrePestanas(duelo);
  console.log("App web verificada en /jugar/ · salón, crear mesa con señas al pie, invitación, mirar, volver a la mesa, enlaces viejos, precarga de cartas, ?crear=1, conteos, comunidad y aviso sin red.");
} finally {
  await browser.close();
}
