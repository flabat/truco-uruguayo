import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { prepararReporte, type CursorReporte } from "../../api/reporte-contexto.ts";

const mesa = "646ef96f-9784-4817-ae69-2260be34e9fa";
const reporte = "12345678-1234-4000-8000-abcdef123456";
const web = new URL("https://eltru.co/jugar/?invitacion=secreto");
const cursor: CursorReporte = { mano: 2, posicion: 1, vuelta: 1, puntos: "4-0", fase: "jugada", cliente: "" };
const flor = { asiento: 0, tipo: "flor", duelo: null };
const mano = {
  modo: "1v1", meta: 40, politica: "incumbent-online-v1", perfil: "duel",
  version_reglas: 1, version_reparto: "online-1", regla_flor: "inmediata-v2", tipo_reparto: null,
  mano: 0, dador: 1, computadoras: [false, true], cobros: [{ equipo: 0, tantos: 3, motivo: "flor" }],
  muestra: "bastos-01", puntos_inicio: [1, 0], puntos: [4, 0], build: "sha256:" + "a".repeat(64),
  secuencia: "8", acciones: [flor],
};

function lectura(actual: Record<string, unknown> | null, anteriores = [{ numero: 1, puntos_inicio: [0, 0] }]) {
  const parametros: unknown[][] = [];
  const filas = [actual ? [actual] : [], anteriores];
  const db = { query: async (_sql: string, args: unknown[]) => {
    parametros.push(args);
    return { rows: filas.shift() };
  } } as unknown as PoolClient;
  return { db, parametros };
}

test("el borrador asocia la flor y el tanteador al asiento y al prefijo exacto", async () => {
  const { db, parametros } = lectura({ ...mano, acciones: [{ ...flor, sena: "privada" }],
    invitacion: "secreto", reparto: { manos: [["oros-04"]] }, nombre: "Nombre Privado" });
  const borrador = await prepararReporte(db, mesa, 0, cursor, web, reporte);
  assert.ok(borrador);
  assert.equal(borrador.secuencia, 8);
  assert.deepEqual(parametros, [[mesa, 2, 1], [mesa, 2]]);
  const url = new URL(borrador.url);
  assert.equal(url.origin + url.pathname, "https://github.com/flabat/truco-uruguayo/issues/new");
  assert.match(url.searchParams.get("title")!, /mano 2, vuelta 1/);
  const texto = url.searchParams.get("body")!;
  for (const parte of [mesa, reporte, "secuencia: 8", "posición 1", "Asiento del reporte: A0", "inicio de mano: 1-0",
    "confirmado: 4-0", "Mano 1: 0-0 → 1-0", "V1 · A0 · Flor", "Cobros de la jugada: E0 +3 por flor", "A0 persona, A1 computadora · mano: A0 · dador: A1", "inmediata-v2", "As de bastos", mano.build]) {
    assert.ok(texto.includes(parte), parte);
  }
  assert.doesNotMatch(texto, /privada|secreto|oros-04|Nombre Privado|invitacion/i);
});

test("el historial público identifica cada vuelta y reinicia la cuenta en cada duelo del pico", async () => {
  const acciones = [
    { tipo: "carta", carta: "copas-02", asiento: 1, duelo: 1 },
    { tipo: "carta", carta: "espadas-03", asiento: 4, duelo: 1 },
    { tipo: "truco", asiento: 1, duelo: 1 },
    { tipo: "no-quiero", asiento: 4, duelo: 1 },
    { tipo: "carta", carta: "bastos-04", asiento: 2, duelo: 2 },
  ];
  const { db } = lectura({ ...mano, modo: "3v3", acciones, tipo_reparto: "pico-a-pico" });
  const borrador = await prepararReporte(db, mesa, 2, { ...cursor, posicion: 5, duelo: 2, fase: "presentacion", voz: 1 }, web, reporte);
  const texto = new URL(borrador!.url).searchParams.get("body")!;
  assert.match(texto, /duelo 2 · posición 5 · vuelta visible 1 · presentacion, voz 1/);
  assert.match(texto, /2\. D1 · V1 · A4 · 3 de espadas\n3\. D1 · V2 · A1 · Truco\n4\. D1 · V2 · A4 · No quiero\n5\. D2 · V1 · A2 · 4 de bastos/);
});

test("una consulta de flor histórica se omite sin cambiar la posición de las jugadas públicas", async () => {
  const { db } = lectura({ ...mano, acciones: [{ ...flor, tipo: "paso-flor" }, flor] });
  const borrador = await prepararReporte(db, mesa, 0, { ...cursor, posicion: 2 }, web, reporte);
  const texto = new URL(borrador!.url).searchParams.get("body")!;
  assert.doesNotMatch(texto, /Yo no canto|paso-flor/);
  assert.match(texto, /2\. V1 · A0 · Flor/);
});

test("un reparto anterior al replay conserva sus coordenadas y no inventa la secuencia", async () => {
  const { db } = lectura({ ...mano, build: null, puntos: null, secuencia: null, acciones: [] }, []);
  const borrador = await prepararReporte(db, mesa, 1, { ...cursor, mano: 1, posicion: 0 }, web, reporte);
  assert.ok(borrador);
  assert.equal(borrador.secuencia, null);
  const texto = new URL(borrador.url).searchParams.get("body")!;
  assert.match(texto, /secuencia: sin evento de replay/);
  assert.match(texto, /confirmado: 1-0/);
  assert.match(texto, /Sin cartas jugadas/);
});

test("las manos y jugadas omitidas se pueden localizar desde un borrador de longitud acotada", async () => {
  const anteriores = Array.from({ length: 79 }, (_, i) => ({ numero: i + 1, puntos_inicio: [i % 40, 0] }));
  const acciones = Array.from({ length: 80 }, (_, i) => ({ ...flor, tipo: "contraflor-al-resto", asiento: i % 6 }));
  const { db } = lectura({ ...mano, acciones }, anteriores);
  const borrador = await prepararReporte(db, mesa, 0, { ...cursor, mano: 80, posicion: 80 }, web, reporte);
  assert.ok(borrador!.url.length <= 3500);
  const texto = new URL(borrador!.url).searchParams.get("body")!;
  assert.match(texto, /79 manos anteriores en el registro/);
  assert.match(texto, /jugadas anteriores en el registro/);
  assert.match(texto, /80\. V1 · A1 · Contraflor al resto/);
  for (const ubicacion of [mesa, reporte, "Mano 80", "posición 80", "secuencia: 8"]) assert.ok(texto.includes(ubicacion));
});

test("una posición inexistente no genera un enlace ni consulta otro reparto", async () => {
  const { db, parametros } = lectura(null);
  assert.equal(await prepararReporte(db, mesa, 0, cursor, web, reporte), null);
  assert.deepEqual(parametros, [[mesa, 2, 1]]);
});
