import assert from "node:assert/strict";
import test from "node:test";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada } from "@eltruco/motor/mano.ts";
import { repartir, type Asiento, type Equipo, type RepartoV1 } from "@eltruco/motor/reparto.ts";

function jugar(estado: EstadoMano, asiento: Asiento, carta: CardId): EstadoMano {
  const paso = jugarCarta(estado, { asiento, carta });
  assert.ok(paso.ok, JSON.stringify(paso));
  return paso.estado;
}

const asientos = [0, 1, 2, 3] as const;
type Fallo = Equipo | "parda";

// Cada fila reserva dos máximas empatadas y dos inferiores. Las doce cartas
// son distintas y ninguna es pieza con el 6 de copas de muestra.
const filas = [
  ["oros-03", "copas-03", "oros-04", "bastos-04"],
  ["oros-12", "espadas-12", "oros-05", "espadas-05"],
  ["oros-01", "copas-01", "oros-06", "bastos-06"],
] as const;

function repartoPara(fallos: readonly Fallo[], dador: Asiento): RepartoV1 {
  const porVuelta = filas.map(([mayor, igual, menor, otra], i) => {
    switch (fallos[i]) {
      case 0: return [mayor, menor, igual, otra];
      case 1: return [menor, mayor, otra, igual];
      default: return [menor, mayor, igual, otra];
    }
  });
  const terna = (asiento: Asiento): RepartoV1["manos"][Asiento] =>
    [porVuelta[0][asiento], porVuelta[1][asiento], porVuelta[2][asiento]];
  return {
    versionReparto: 1, semilla: 0, dador, mano: ((dador + 1) % 4) as Asiento,
    manos: [terna(0), terna(1), terna(2), terna(3)], muestra: "copas-06",
  };
}

const casos: [Fallo[], Equipo | "mano"][] = [
  [[0, 0], 0], [[1, 1], 1],
  [[0, "parda"], 0], [[1, "parda"], 1],
  [["parda", 0], 0], [["parda", 1], 1],
  [[0, 1, 0], 0], [[0, 1, 1], 1], [[0, 1, "parda"], 0],
  [[1, 0, 0], 0], [[1, 0, 1], 1], [[1, 0, "parda"], 1],
  [["parda", "parda", 0], 0], [["parda", "parda", 1], 1], [["parda", "parda", "parda"], "mano"],
];

test("salidas, turnos y cierre de las quince secuencias posibles con cada dador", () => {
  for (const [fallos, ganador] of casos) {
    for (const dador of asientos) {
      const reparto = repartoPara(fallos, dador);
      let estado = iniciarMano(reparto);
      let salida = reparto.mano;
      for (const [vuelta, fallo] of fallos.entries()) {
        const jugadas: Jugada[] = [];
        for (const avance of asientos) {
          const asiento = ((salida + avance) % 4) as Asiento;
          const carta = reparto.manos[asiento][vuelta];
          assert.equal(estado.equipoGanador, null);
          assert.equal(estado.turno, asiento);
          assert.deepEqual(estado.vueltaActual, { salida, jugadas });
          estado = jugar(estado, asiento, carta);
          jugadas.push({ asiento, carta });
        }
        const primeraMaxima = jugadas.find(({ asiento }) => asiento % 2 === fallo);
        const resultado = primeraMaxima
          ? { tipo: "ganada", equipo: fallo, asiento: primeraMaxima.asiento }
          : { tipo: "parda" };
        assert.deepEqual(estado.vueltas[vuelta], { salida, jugadas, resultado });
        salida = primeraMaxima?.asiento ?? reparto.mano;
      }
      assert.equal(estado.equipoGanador, ganador === "mano" ? reparto.mano % 2 : ganador);
      assert.equal(estado.vueltas.length, fallos.length);
      assert.equal(estado.turno, null);
      assert.equal(estado.vueltaActual, null);
      assert.deepEqual(estado.restantes, reparto.manos.map((terna) => terna.slice(fallos.length)));
    }
  }
});

const conRey: RepartoV1 = {
  versionReparto: 1, semilla: 17, dador: 2, mano: 3, muestra: "copas-04",
  manos: [
    ["oros-03", "oros-12", "oros-01"],
    ["copas-12", "espadas-05", "bastos-01"],
    ["espadas-01", "espadas-12", "bastos-06"],
    ["bastos-03", "oros-05", "oros-06"],
  ],
};

test("el rey pieza supera los tres empatados y al empatar dos compañeros en la segunda sale el 2 antes que el 0", () => {
  let estado = iniciarMano(conRey);
  for (const asiento of [3, 0, 1, 2] as const) estado = jugar(estado, asiento, conRey.manos[asiento][0]);
  assert.deepEqual(estado.vueltas[0].resultado, { tipo: "ganada", equipo: 1, asiento: 1 });
  assert.equal(estado.turno, 1);
  for (const asiento of [1, 2, 3, 0] as const) estado = jugar(estado, asiento, conRey.manos[asiento][1]);
  assert.deepEqual(estado.vueltas[1].resultado, { tipo: "ganada", equipo: 0, asiento: 2 });
  assert.equal(estado.turno, 2);
});

test("el mano que jugó bajo vuelve a salir tras la primera parda y tras la segunda", () => {
  const reparto = repartoPara(["parda", "parda", "parda"], 3);
  let estado = iniciarMano(reparto);
  // En ambas vueltas empatan los asientos 1 y 2. El 0, mano original, abre con 4 y luego con 5.
  for (const vuelta of [0, 1]) {
    for (const asiento of asientos) estado = jugar(estado, asiento, reparto.manos[asiento][vuelta]);
    assert.deepEqual(estado.vueltas[vuelta].resultado, { tipo: "parda" });
    assert.equal(estado.turno, 0);
  }
});

test("los repartos V1 de referencia cierran con las vueltas y el equipo previstos", () => {
  // Enumeración independiente del issue #20. Cada asiento juega en orden de recepción.
  const vectores: [number, Fallo[], Equipo][] = [
    [99121, ["parda", "parda", "parda"], 0],
    [89, ["parda", "parda", 1], 1],
    [4, [0, "parda"], 0],
    [217, [0, 1, "parda"], 0],
  ];
  for (const [semilla, fallos, ganador] of vectores) {
    let estado = iniciarMano(repartir(semilla, 3));
    for (let i = 0; i < fallos.length * 4; i++) {
      const { turno } = estado;
      assert.ok(turno !== null);
      const vista = vistaPara(estado, turno);
      estado = jugar(estado, vista.asiento, vista.cartas[0]);
    }
    const final = vistaPara(estado, 3);
    assert.deepEqual(final.vueltas.map(({ resultado }) =>
      resultado.tipo === "parda" ? "parda" : resultado.equipo), fallos);
    assert.equal(final.turno, null);
    assert.equal(final.vueltaActual, null);
    assert.equal(final.equipoGanador, ganador);
  }
});

test("el mano puede salir con cualquiera de sus tres cartas desde el mismo estado", () => {
  const inicial = iniciarMano(conRey);
  for (const carta of conRey.manos[3]) {
    const siguiente = jugar(inicial, 3, carta);
    assert.deepEqual(siguiente.vueltaActual, { salida: 3, jugadas: [{ asiento: 3, carta }] });
    assert.deepEqual(siguiente.restantes[3], conRey.manos[3].filter((propia) => propia !== carta));
  }
  assert.deepEqual(inicial, iniciarMano(conRey));
});

test("una acción ilegal identifica el error y conserva íntegro el estado recibido", () => {
  const reparto = repartoPara([0, 0], 3);
  let estado = iniciarMano(reparto);
  function rechaza(jugada: Jugada, error: string) {
    const antes = structuredClone(estado);
    assert.deepEqual(jugarCarta(estado, jugada), { ok: false, error });
    assert.deepEqual(estado, antes);
  }
  rechaza({ asiento: 1, carta: reparto.manos[1][0] }, "fuera-de-turno");
  rechaza({ asiento: 0, carta: reparto.manos[1][0] }, "carta-ajena");
  rechaza({ asiento: 0, carta: reparto.muestra }, "carta-ajena");
  rechaza({ asiento: 0, carta: "oros-08" } as unknown as Jugada, "jugada-invalida");
  const inicial = structuredClone(estado);
  const siguiente = jugar(estado, 0, reparto.manos[0][0]);
  assert.deepEqual(estado, inicial);
  estado = siguiente;
  for (const asiento of [1, 2, 3] as const) estado = jugar(estado, asiento, reparto.manos[asiento][0]);
  rechaza({ asiento: 0, carta: reparto.manos[0][0] }, "carta-ya-jugada");
  for (const asiento of asientos) estado = jugar(estado, asiento, reparto.manos[asiento][1]);
  rechaza({ asiento: 0, carta: reparto.manos[0][2] }, "mano-cerrada");
});

test("iniciarMano valida los repartos recibidos y toma una copia de las cartas", () => {
  const reparto = repartir(0, 2);
  for (const invalido of [
    null, {}, { ...reparto, versionReparto: 2 }, { ...reparto, semilla: -1 },
    { ...reparto, mano: 2 }, { ...reparto, manos: reparto.manos.slice(1) },
    { ...reparto, manos: [[], ...reparto.manos.slice(1)] },
    { ...reparto, manos: [reparto.manos[1], ...reparto.manos.slice(1)] },
    { ...reparto, muestra: "copas-08" }, { ...reparto, muestra: reparto.manos[0][0] },
  ]) assert.throws(() => iniciarMano(invalido as RepartoV1), TypeError);
  const estado = iniciarMano(reparto);
  const antes = structuredClone(estado);
  Reflect.set(reparto.manos[0], 0, reparto.muestra);
  assert.deepEqual(estado, antes);
});

test("cada asiento ve sus cartas y los hechos públicos, incluso con otra semilla y otras cartas ocultas", () => {
  for (const asiento of asientos) {
    const otro = ((asiento + 1) % 4) as Asiento;
    const tercero = ((asiento + 2) % 4) as Asiento;
    const alterno = structuredClone({ ...conRey, semilla: 99 });
    Reflect.set(alterno.manos[otro], 2, conRey.manos[tercero][2]);
    Reflect.set(alterno.manos[tercero], 2, conRey.manos[otro][2]);
    let mesa = iniciarMano(conRey);
    let otraMesa = iniciarMano(alterno);
    for (const jugador of [3, 0, 1, 2] as const) {
      const jugada = { semilla: 17, asiento: jugador, carta: conRey.manos[jugador][0] };
      const a = jugarCarta(mesa, jugada);
      const b = jugarCarta(otraMesa, jugada);
      assert.ok(a.ok && b.ok);
      mesa = a.estado;
      otraMesa = b.estado;
    }
    mesa = jugar(mesa, 1, "espadas-05");
    otraMesa = jugar(otraMesa, 1, "espadas-05");
    const vista = vistaPara(mesa, asiento);
    assert.deepEqual(vista, vistaPara(otraMesa, asiento));
    assert.deepEqual(vista, {
      asiento, cartas: conRey.manos[asiento].slice(asiento === 1 ? 2 : 1),
      muestra: "copas-04", dador: 2, mano: 3, equipoPorAsiento: [0, 1, 0, 1],
      turno: 2, vueltaActual: { salida: 1, jugadas: [{ asiento: 1, carta: "espadas-05" }] },
      vueltas: [{
        salida: 3, resultado: { tipo: "ganada", equipo: 1, asiento: 1 },
        jugadas: [
          { asiento: 3, carta: "bastos-03" }, { asiento: 0, carta: "oros-03" },
          { asiento: 1, carta: "copas-12" }, { asiento: 2, carta: "espadas-01" },
        ],
      }],
      equipoGanador: null,
    });
    const antes = structuredClone(mesa);
    (vista.cartas as CardId[]).pop();
    (vista.vueltas[0].jugadas as Jugada[]).pop();
    assert.deepEqual(mesa, antes);
  }
  assert.throws(() => vistaPara(iniciarMano(conRey), 4 as Asiento), RangeError);
});
