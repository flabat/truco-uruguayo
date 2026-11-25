// Lo que la app suma para no perder nada de /jugar/ (#403): avisos de red en la web, `?crear=1`,
// conteos anónimos y el aviso de la comunidad.
import assert from "node:assert/strict";
import test from "node:test";
import type { Guardado } from "../../app/src/ingreso/almacen.ts";
import { crearAvisosDeRed, type EstadoDeLaApp, type Ventana } from "../../app/src/salon/avisos-red.ts";
import { discordComunidad as delSitio } from "../../src/lib/comunidad.ts";
import { crearAvisoDeComunidad, discordComunidad } from "../../app/src/salon/comunidad.ts";
import { consultaDe, destinoDeEnlace, destinoPendiente, rutaDe } from "../../app/src/salon/enlaces.ts";
import { crearContador } from "../../app/src/salon/eventos.ts";
import { textoVisibilidad } from "../../app/src/salon/mesa-nueva.ts";

function app() {
  let alCambiar: ((estado: string) => void) | null = null;
  const estado: EstadoDeLaApp & { cambiar(e: string): void; suscripto(): boolean } = {
    addEventListener: (_evento, f) => {
      alCambiar = f;
      return { remove: () => { alCambiar = null; } };
    },
    cambiar: e => alCambiar?.(e),
    suscripto: () => alCambiar !== null,
  };
  return estado;
}

function ventana() {
  const oyentes = new Map<string, Set<() => void>>();
  const v: Ventana & { avisar(e: string): void; cuantos(): number } = {
    addEventListener: (e, f) => { if (!oyentes.has(e)) oyentes.set(e, new Set()); oyentes.get(e)!.add(f); },
    removeEventListener: (e, f) => { oyentes.get(e)?.delete(f); },
    avisar: e => oyentes.get(e)?.forEach(f => f()),
    cuantos: () => [...oyentes.values()].reduce((n, s) => n + s.size, 0),
  };
  return v;
}

test("en la web la mesa vuelve a leer con la red y la página, y marca la falta de red", () => {
  const estado = app();
  const v = ventana();
  const llamadas: string[] = [];
  const dejar = crearAvisosDeRed({ app: estado, ventana: v })({ leer: () => llamadas.push("leer"), sinRed: () => llamadas.push("sinRed") });
  v.avisar("offline");
  v.avisar("online");
  v.avisar("pageshow");
  estado.cambiar("background");
  estado.cambiar("active");
  assert.deepEqual(llamadas, ["sinRed", "leer", "leer", "leer"]);
  dejar();
  assert.equal(v.cuantos(), 0);
  assert.equal(estado.suscripto(), false);
});

test("en las apps alcanza con volver a primer plano", () => {
  const estado = app();
  const llamadas: string[] = [];
  const dejar = crearAvisosDeRed({ app: estado, ventana: null })({ leer: () => llamadas.push("leer"), sinRed: () => llamadas.push("sinRed") });
  estado.cambiar("active");
  assert.deepEqual(llamadas, ["leer"]);
  dejar();
  assert.equal(estado.suscripto(), false);
});

test("el enlace para crear una mesa sobrevive al ingreso como en /jugar/", () => {
  const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(destinoDeEnlace({ crear: "1" }), { tipo: "crear" });
  assert.equal(destinoDeEnlace({ crear: "0" }), null);
  // Una invitación, una mesa o un enlace para mirar mandan sobre crear.
  assert.deepEqual(destinoDeEnlace({ crear: "1", mesa: uuid }), { tipo: "mesa", id: uuid });
  assert.deepEqual(destinoDeEnlace({ crear: "1", mirar: uuid }), { tipo: "mirar", id: uuid });
  assert.equal(rutaDe({ tipo: "crear" }), "/crear");
  assert.equal(consultaDe({ tipo: "crear" }), "?crear=1");
  assert.equal(consultaDe({ tipo: "mesa", id: uuid }), "?mesa=" + uuid);
  assert.equal(consultaDe({ tipo: "invitacion", token: "tok" }), "?invitacion=tok");
  let valor: string | null = null;
  const guardado = { leer: () => valor, guardar: (v: string | null) => { valor = v; } };
  destinoPendiente(guardado, { tipo: "crear" });
  assert.deepEqual(destinoPendiente(guardado, null), { tipo: "crear" });
});

test("los conteos anónimos van a /eventos/ solo en la web y sin datos del jugador", async () => {
  const pedidos: { ruta: string; opciones: RequestInit }[] = [];
  const pedir = async (ruta: string, opciones: RequestInit) => { pedidos.push({ ruta, opciones }); };
  crearContador({ web: true, pedir })("compartir-mesa");
  crearContador({ web: true, pedir })("ingreso-mesa");
  crearContador({ web: false, pedir })("discord");
  assert.deepEqual(pedidos.map(p => p.ruta), ["/eventos/compartir-mesa.txt", "/eventos/ingreso-mesa.txt"]);
  assert.equal(pedidos[0].opciones.referrerPolicy, "no-referrer");
  assert.equal(pedidos[0].opciones.cache, "no-store");
  // Un conteo que falla no rompe nada.
  crearContador({ web: true, pedir: async () => { throw new Error("sin red"); } })("discord");
  crearContador({ web: true, pedir: () => { throw new Error("sin fetch"); } })("discord");
  crearContador({ web: true })("discord");
});

test("el aviso de la comunidad se oculta por jugador con la clave de /jugar/", async () => {
  const datos = new Map<string, string>();
  const guardado: Guardado = {
    leer: async clave => datos.get(clave) ?? null,
    guardar: async (clave, valor) => { datos.set(clave, valor); },
    borrar: async clave => { datos.delete(clave); },
  };
  const aviso = crearAvisoDeComunidad(guardado);
  assert.equal(await aviso.visible("j1"), true);
  await aviso.ocultar("j1");
  assert.equal(datos.get("truco.comunidad.oculta.j1"), "1");
  assert.equal(await aviso.visible("j1"), false);
  assert.equal(await aviso.visible("j2"), true);
  const roto: Guardado = {
    leer: async () => { throw new Error("sin almacenamiento"); },
    guardar: async () => { throw new Error("sin almacenamiento"); },
    borrar: async () => {},
  };
  assert.equal(await crearAvisoDeComunidad(roto).visible("j1"), true);
  await crearAvisoDeComunidad(roto).ocultar("j1");
  assert.equal(discordComunidad, delSitio);
});

test("la visibilidad de la mesa dice lo mismo que /jugar/", () => {
  assert.equal(textoVisibilidad(true),
    "Mesa pública. Quienes ingresen al salón pueden ver las jugadas y, si la voz está habilitada, entrar al Discord de esta mesa.");
  assert.equal(textoVisibilidad(false), "Mesa privada por invitación.");
});
