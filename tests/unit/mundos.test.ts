import assert from "node:assert/strict";
import test from "node:test";
import { esCardId, mazo } from "@eltruco/motor/cartas.ts";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada } from "@eltruco/motor/mano.ts";
import { crearAzar, repartir, type Asiento } from "@eltruco/motor/reparto.ts";
import { clavePosicion, posicionPublica, type PosicionPublicaV1 } from "../../src/probabilidad/informacion.ts";
import { prepararMundos } from "../../src/probabilidad/mundos.ts";

const apertura: PosicionPublicaV1 = {
  version: 1, asiento: 0, dador: 3, muestra: "copas-06", cartas: ["copas-02", "bastos-03", "oros-05"], jugadas: [],
};
const prefijo: readonly Jugada[] = [
  { asiento: 0, carta: "bastos-03" }, { asiento: 1, carta: "copas-11" },
  { asiento: 2, carta: "espadas-04" }, { asiento: 3, carta: "oros-04" },
  { asiento: 1, carta: "oros-06" }, { asiento: 2, carta: "copas-03" }, { asiento: 3, carta: "copas-05" },
];
const segunda: PosicionPublicaV1 = { ...apertura, cartas: ["copas-02", "oros-05"], jugadas: prefijo };

function disponibles(p: PosicionPublicaV1) {
  const mundos = prepararMundos(p);
  assert.equal(mundos.tipo, "disponible");
  return mundos;
}

function jugar(estado: EstadoMano, jugada: Jugada) {
  const r = jugarCarta(estado, jugada);
  assert.ok(r.ok);
  return r.estado;
}

function pasoBot(estado: EstadoMano) {
  const asiento = estado.turno!;
  return jugar(estado, { asiento, carta: elegirJugada(vistaPara(estado, asiento)) });
}

test("cada reparto de apertura conserva la información y reproduce la extracción de la semilla 44", () => {
  const fuente = disponibles(apertura);
  assert.equal(fuente.producto, 7140 ** 3);
  assert.throws(() => [...fuente.enumerar()], RangeError);
  const muestra = fuente.proponer(crearAzar(44))!;
  assert.deepEqual(muestra.reparto.manos.slice(1), [
    ["oros-06", "copas-11", "espadas-06"], ["espadas-04", "copas-03", "espadas-03"], ["oros-10", "oros-04", "copas-05"],
  ]);

  for (const asiento of [0, 1, 2, 3] as const) {
    const posicion = { ...apertura, asiento, dador: ((asiento + 3) % 4) as Asiento };
    const mundo = disponibles(posicion).proponer(crearAzar(25))!;
    assert.equal(mundo.turno, asiento);
    assert.equal(clavePosicion(posicionPublica(vistaPara(mundo, asiento))), clavePosicion(posicion));
    const visibles = [mundo.reparto.muestra, ...mundo.reparto.manos.flat()];
    assert.ok(visibles.every(esCardId));
    assert.equal(new Set(visibles).size, 13);
    assert.equal(mazo.filter(carta => !visibles.includes(carta)).length, 27);
  }
});

test("dos partidas distintas, otro futuro u otro orden de cartas producen la misma consulta pública", () => {
  const sim = disponibles(apertura);
  const a = sim.proponer(crearAzar(58))!;
  const b = sim.proponer(crearAzar(725))!;
  assert.notDeepEqual(a.reparto.manos[1], b.reparto.manos[1]);
  const pa = posicionPublica(vistaPara(a, 0));
  const pb = posicionPublica({ ...vistaPara(b, 0), cartas: [...b.restantes[0]].reverse() });
  const antes = clavePosicion(pa);
  pasoBot(a);
  jugar(b, { asiento: 0, carta: "oros-05" });
  assert.equal(clavePosicion(pb), antes);
  assert.deepEqual(Object.keys(pa).sort(), ["asiento","cartas","dador","jugadas","muestra","version"]);
  const x = disponibles(pa), y = disponibles(pb);
  const ax = crearAzar(286), ay = crearAzar(286);
  for (let i = 0; i < 30; i++) assert.deepEqual(x.proponer(ax), y.proponer(ay));
  assert.notEqual(clavePosicion(segunda), clavePosicion({ ...segunda, jugadas: [...prefijo].reverse() }));
});

test("clasifica entradas inválidas, otro turno, cierre e incompatibilidad demostrable", () => {
  for (const invalida of [null, {}, { ...apertura, version: 2 }, { ...apertura, dador: 4 },
    { ...apertura, asiento: 4 }, { ...apertura, cartas: [] }, { ...apertura, cartas: Array(3) },
    { ...apertura, cartas: ["copas-02","oros-05","copas-02"] }, { ...apertura, muestra: "oros-05" },
    { ...segunda, jugadas: [{ asiento: 1, carta: "bastos-03" }] },
    { ...segunda, jugadas: [...prefijo, prefijo[0]] }, { ...segunda, jugadas: [...prefijo, null] }]) {
    assert.equal(prepararMundos(invalida).tipo, "entrada-invalida");
  }
  assert.equal(prepararMundos({ ...apertura, dador: 0 }).tipo, "fuera-de-turno");
  const imposible = { ...apertura, dador: 2, cartas: ["copas-04","espadas-04","bastos-04"],
    muestra: "espadas-06", jugadas: [{ asiento: 3, carta: "oros-04" }] };
  assert.equal(prepararMundos(imposible).tipo, "incompatible");

  let estado = iniciarMano(repartir(71, 3));
  while (estado.turno !== null) estado = pasoBot(estado);
  const fin = posicionPublica(vistaPara(estado, 0));
  assert.equal(fin.jugadas.length, 8);
  assert.equal(prepararMundos(fin).tipo, "mano-terminada");
  const ajena = mazo.find(c => c !== fin.muestra && !fin.cartas.includes(c) && !fin.jugadas.some(j => j.carta === c))!;
  assert.equal(prepararMundos({ ...fin, jugadas: [...fin.jugadas, { asiento: 3, carta: ajena }] }).tipo, "entrada-invalida");
});

test("una primera parda deja al mano original como líder para todos los mundos", () => {
  let real = iniciarMano(repartir(25, 2));
  for (let i = 0; i < 4; i++) real = pasoBot(real);
  assert.equal(real.vueltas[0].resultado.tipo, "parda");
  const consulta = posicionPublica(vistaPara(real, 3));
  const fuente = disponibles(consulta);
  const azar = crearAzar(48);
  let aceptados = 0;
  for (let i = 0; i < 80; i++) {
    const mundo = fuente.proponer(azar);
    if (!mundo) continue;
    aceptados++;
    assert.equal(mundo.turno, 3);
    assert.deepEqual(posicionPublica(vistaPara(mundo, 3)), consulta);
  }
  assert.ok(aceptados > 0);
});

// Contraste independiente: repartir a los tres asientos una carta distinta y
// reproducir cada decisión del bot con el motor, sin usar listas de hipótesis.
function oraculoSegunda() {
  const originales = apertura.cartas;
  const conocidas = new Set([apertura.muestra, ...originales, ...prefijo.map(j => j.carta)]);
  const libres = mazo.filter(c => !conocidas.has(c));
  const admisibles = new Set<string>();
  let asignaciones = 0;
  for (const a of libres) for (const b of libres) for (const c of libres) {
    if (a === b || a === c || b === c) continue;
    asignaciones++;
    let estado = iniciarMano({
      versionReparto: 1, semilla: 0, dador: 3, mano: 0, muestra: apertura.muestra,
      manos: [["bastos-03","copas-02","oros-05"], ["copas-11","oros-06",a],
        ["espadas-04","copas-03",b], ["oros-04","copas-05",c]],
    });
    for (const jugada of prefijo) {
      if (jugada.asiento && elegirJugada(vistaPara(estado, jugada.asiento)) !== jugada.carta) break;
      estado = jugar(estado, jugada);
    }
    if (estado.vueltaActual?.jugadas.length === 3 && estado.vueltas.length === 1) admisibles.add([a,b,c].join("/"));
  }
  assert.equal(asignaciones, 24360);
  assert.equal(admisibles.size, 1175);
  return admisibles;
}

test("la enumeración y el muestreo de listas condicionadas concuerdan con el oráculo de segunda vuelta", () => {
  const esperados = oraculoSegunda();
  const fuente = disponibles(segunda);
  assert.ok(fuente.producto <= 32768);
  const obtenidos = [...fuente.enumerar()];
  const clave = (e: EstadoMano) => e.restantes.slice(1).map(cartas => cartas[0]).join("/");
  assert.equal(obtenidos.length, esperados.size);
  assert.deepEqual(new Set(obtenidos.map(clave)), esperados);
  for (const mundo of obtenidos) assert.equal(clavePosicion(posicionPublica(vistaPara(mundo, 0))), clavePosicion(segunda));

  const mitad = new Set([...esperados].sort().slice(0, Math.floor(esperados.size / 2)));
  const azar = crearAzar(29);
  let compatibles = 0, enMitad = 0;
  for (let i = 0; i < 5000; i++) {
    const mundo = fuente.proponer(azar);
    if (!mundo) continue;
    const id = clave(mundo);
    assert.ok(esperados.has(id));
    compatibles++;
    if (mitad.has(id)) enMitad++;
  }
  assert.ok(compatibles > 2000 && compatibles < 5000);
  assert.ok(Math.abs(enMitad / compatibles - mitad.size / esperados.size) < 0.04);
});
