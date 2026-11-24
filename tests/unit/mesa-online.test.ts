import assert from "node:assert/strict";
import test from "node:test";
import { esCardId } from "@eltruco/motor/cartas.ts";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, repartirOnline, vistaOnline, type AccionOnline,
  type EstadoOnline, type RepartoOnline,
} from "@eltruco/motor/mesa-online.ts";
import { repartir, type Asiento } from "@eltruco/motor/reparto.ts";

const duelo: RepartoOnline = {
  versionReparto: "online-1", dador: 1, mano: 0, muestra: "copas-06",
  manos: [["oros-03", "espadas-12", "oros-01"], ["copas-03", "oros-12", "copas-01"]],
};

function aplicar(estado: EstadoOnline, accion: AccionOnline) {
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok, JSON.stringify(paso));
  return paso.estado;
}

function descartarEnOrden(estado: EstadoOnline) {
  while (estado.mano.turno !== null) {
    const vista = vistaOnline(estado, estado.mano.turno);
    estado = aplicar(estado, { tipo: "carta", asiento: vista.asiento, carta: vista.cartas[0] });
  }
  return estado;
}

test("el reparto seguro da tres cartas a cada asiento y gira una muestra distinta", () => {
  for (const cantidad of [2, 4] as const) {
    for (let dador = 0; dador < cantidad; dador++) {
      const reparto = repartirOnline(cantidad, dador);
      assert.equal(reparto.mano, (dador + 1) % cantidad);
      assert.equal(reparto.manos.length, cantidad);
      assert.ok(reparto.manos.every(mano => mano.length === 3));
      const cartas = [...reparto.manos.flat(), reparto.muestra];
      assert.ok(cartas.every(esCardId));
      assert.equal(new Set(cartas).size, 3 * cantidad + 1);
      assert.equal("semilla" in reparto, false);
      assert.deepEqual(iniciarOnline(JSON.parse(JSON.stringify(reparto))), iniciarOnline(reparto));
    }
  }
  assert.throws(() => repartirOnline(2, 2), RangeError);
  assert.throws(() => repartirOnline(3 as 2), RangeError);
  assert.throws(() => iniciarOnline({ ...duelo, muestra: duelo.manos[0][0] }), TypeError);
  assert.throws(() => vistaOnline(iniciarOnline(duelo), 2), RangeError);
});

test("el duelo con tres pardas entrega la mano al mano de cada reparto", () => {
  for (const dador of [0, 1] as const) {
    const mano = dador === 0 ? 1 : 0;
    const final = descartarEnOrden(iniciarOnline({ ...duelo, dador, mano }));
    const vista = vistaOnline(final, 1);
    assert.deepEqual(vista.vueltas.map(v => v.resultado.tipo), ["parda", "parda", "parda"]);
    assert.deepEqual(vista.vueltas.map(v => [v.salida, v.jugadas.length]), [[mano, 2], [mano, 2], [mano, 2]]);
    assert.deepEqual(vista.resultado, { equipo: mano, tantos: 1, motivo: "vueltas" });
    assert.equal(elegirAccionOnline(vista), null);
  }
});

test("una parda y una victoria cierran el duelo, y el truco querido duplica el tanto", () => {
  const reparto: RepartoOnline = { ...duelo, manos: [duelo.manos[0], ["copas-03", "oros-04", "copas-01"]] };
  const inicio = iniciarOnline(reparto);
  assert.deepEqual(aplicarOnline(inicio, { tipo: "carta", asiento: 1, carta: "copas-03" }),
    { ok: false, error: "fuera-de-turno" });
  assert.deepEqual(aplicarOnline(inicio, { tipo: "carta", asiento: 0, carta: "copas-03" }),
    { ok: false, error: "carta-ajena" });
  const pendiente = aplicar(inicio, { tipo: "truco", asiento: 0 });
  assert.deepEqual(vistaOnline(pendiente, 0).legales, []);
  assert.ok(vistaOnline(pendiente, 1).legales.includes("quiero"));
  assert.deepEqual(aplicarOnline(pendiente, { tipo: "quiero", asiento: 3 }), { ok: false, error: "accion-invalida" });
  const querido = aplicar(pendiente, { tipo: "quiero", asiento: 1 });
  assert.ok(vistaOnline(querido, 0).legales.includes("carta"));
  assert.ok(!vistaOnline(querido, 0).legales.includes("retruco"));
  const vista = vistaOnline(descartarEnOrden(querido), 0);
  assert.equal(vista.acciones.length, 6);
  assert.deepEqual(vista.vueltas.map(v => v.resultado.tipo), ["parda", "ganada"]);
  assert.deepEqual(vista.resultado, { equipo: 0, tantos: 2, motivo: "vueltas" });
});

test("en parejas el bot aprovecha la salida y entrega cartas bajas cuando su compañero ya gana", () => {
  const reparto: RepartoOnline = {
    versionReparto: "online-1", dador: 3, mano: 0, muestra: "copas-06",
    manos: [
      ["copas-02", "oros-05", "bastos-04"], ["espadas-01", "oros-04", "espadas-06"],
      ["bastos-01", "oros-06", "espadas-03"], ["copas-04", "oros-07", "bastos-06"],
    ],
  };
  let estado = iniciarOnline(reparto);
  estado = aplicar(estado, { tipo: "truco", asiento: 0 });
  estado = aplicar(estado, { tipo: "quiero", asiento: 1 });
  while (estado.mano.turno !== null) {
    const vista = vistaOnline(estado, estado.mano.turno);
    // Se fija el contrato de truco a dos. El bot sigue eligiendo cada carta de la baza.
    const accion = elegirAccionOnline({ ...vista, legales: ["carta"] });
    assert.ok(accion);
    estado = aplicar(estado, accion);
  }
  assert.deepEqual(estado.mano.vueltas.map(v => v.resultado), [
    { tipo: "ganada", equipo: 0, asiento: 0 },
    { tipo: "ganada", equipo: 1, asiento: 3 },
    { tipo: "ganada", equipo: 1, asiento: 3 },
  ]);
  assert.deepEqual(estado.resultado, { equipo: 1, tantos: 2, motivo: "vueltas" });
});

test("cientos de manos deterministas terminan con bots que solo reciben la vista pública y sus cartas", () => {
  const tipos = new Set<string>();
  for (const cantidad of [2, 4] as const) {
    for (let semilla = 0; semilla < 200; semilla++) {
      const dador = (semilla % cantidad) as Asiento;
      const { manos, muestra } = repartir(semilla, dador);
      const reparto: RepartoOnline = { versionReparto: "online-1", manos: manos.slice(0, cantidad), muestra,
        dador, mano: ((dador + 1) % cantidad) as Asiento };
      const inicio = iniciarOnline(reparto);
      let estado = inicio;
      while (!estado.resultado) {
        const decision = aDecidir(estado);
        assert.ok(decision.length > 0);
        for (const asiento of decision) {
          const vista = vistaOnline(estado, asiento);
          const accion = elegirAccionOnline(vista);
          assert.ok(accion && vista.legales.includes(accion.tipo));
          assert.deepEqual(accion, elegirAccionOnline(vista));
        }
        const accion = elegirAccionOnline(vistaOnline(estado, decision[0]))!;
        tipos.add(accion.tipo);
        estado = aplicar(estado, accion);
        assert.ok(estado.acciones.length < 36);
      }
      assert.deepEqual(estado.acciones.reduce(aplicar, inicio), estado);
      assert.deepEqual(aDecidir(estado), []);
    }
  }
  assert.deepEqual([...tipos].sort(), [
    "carta", "truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor",
    "con-flor-envido", "contraflor-al-resto", "quiero", "no-quiero", "paso-flor",
  ].sort());
});

test("cada asiento ve solo su mano y las jugadas públicas, también después de que otro tire", () => {
  const { manos, muestra } = repartir(217, 3);
  const base: RepartoOnline = { versionReparto: "online-1", dador: 3, mano: 0, manos, muestra };
  let estado = iniciarOnline(base);
  // Las declaraciones previas, cuando corresponden, también pasan por el motor.
  while (!vistaOnline(estado, 0).legales.includes("carta")) {
    const opciones = vistaOnline(estado, aDecidir(estado)[0]);
    const tipo = opciones.legales.find(a => ["flor", "paso-flor", "quiero"].includes(a));
    assert.ok(tipo && tipo !== "carta");
    estado = aplicar(estado, { asiento: opciones.asiento, tipo });
  }
  const jugada = { tipo: "carta", asiento: 0, carta: manos[0][0], privado: manos } as const;
  estado = aplicar(estado, jugada);
  const ultima = estado.acciones.at(-1);
  assert.deepEqual(ultima, { tipo: "carta", asiento: 0, carta: manos[0][0] });
  for (const asiento of [0, 1, 2, 3] as const) {
    const vista = vistaOnline(estado, asiento);
    const json = JSON.stringify(vista);
    assert.deepEqual(vista.cartas, asiento === 0 ? manos[0].slice(1) : manos[asiento]);
    for (const [otro, ajenas] of manos.entries()) {
      if (otro !== asiento) for (const carta of ajenas) {
        assert.equal(json.includes(carta), carta === jugada.carta);
      }
    }
    Reflect.set(vista.acciones[0], "asiento", 99);
    assert.ok(!estado.acciones.some(a => Number(a.asiento) === 99));
  }
});
