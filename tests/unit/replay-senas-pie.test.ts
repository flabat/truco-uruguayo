import assert from "node:assert/strict";
import test from "node:test";
import parejas from "../fixtures/replay-chico/parejas.json" with { type: "json" };
import tercetos from "../fixtures/replay-chico/tercetos.json" with { type: "json" };
import { reproducirChico } from "../../src/motor/replay-chico.ts";
import { versionSenasPie } from "../../src/motor/senas-pie.ts";
import { iniciarChicoOnline } from "../../src/motor/replay-chico-online.ts";
import { tableroEspectador } from "../../api/tablero-espectador.ts";

const cabecera = { ...parejas, version: "chico-v2", versionSenas: versionSenasPie };
const indicacion = { emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 0 } as const;
const palabra = { tipo: "indicacion", indicacion, secuencia: 2 };
const reparto = parejas.eventos[0];
const replay = { ...cabecera, eventos: [reparto, palabra] };

test("una palabra entre reparto y carta llega a los cuatro en su propia secuencia", () => {
  const decisiones = structuredClone(parejas.eventos.slice(1));
  for (const e of decisiones) {
    e.secuencia++;
    if (e.accion) delete e.accion.sena;
  }
  const chico = { ...replay, eventos: [...replay.eventos, ...decisiones] };
  for (const asiento of [0, 1, 2, 3]) {
    const antes = reproducirChico(chico, asiento, 1).vista;
    const despues = reproducirChico(chico, asiento, 2).vista;
    assert.ok(antes && despues && "pie" in despues && "indicaciones" in antes);
    assert.deepEqual(antes.indicaciones, []);
    assert.deepEqual(despues.indicaciones, [indicacion]);
    assert.deepEqual(antes.acciones, despues.acciones);
    assert.deepEqual(despues.pie?.grupos.map(g => g.emisor), [asiento % 2]);
    assert.deepEqual(reproducirChico(chico, asiento).puntos, [2, 0]);
  }
});

test("el gesto puede cambiar en la vista del pie sin cambiar la palabra, el espectador ni las vistas rivales", () => {
  assert.ok(reparto.reparto);
  const otro = structuredClone(reparto);
  otro.reparto!.manos[0] = ["oros-02", "bastos-02", "copas-04"];
  const variante = { ...replay, eventos: [otro, palabra] };
  for (const asiento of [1, 3]) assert.deepEqual(reproducirChico(replay, asiento), reproducirChico(variante, asiento));
  assert.notDeepEqual(reproducirChico(replay, 2).vista, reproducirChico(variante, 2).vista);
  function observar(dado: typeof reparto) {
    const { motor } = iniciarChicoOnline("pairs-private-senas", dado.reparto, [0, 0], 2, 1);
    return tableroEspectador(motor, [indicacion]);
  }
  assert.deepEqual(observar(reparto), observar(otro));
  assert.deepEqual(observar(reparto).indicaciones, [indicacion]);
  assert.equal("pie" in observar(reparto), false);
});

test("el lector rechaza un consejo inválido, duplicado, fuera de posición o en el formato anterior", () => {
  for (const cambio of [{ emisor: 1 }, { destinatario: 2 }, { frase: "voy-a-vos" }, { indiceAccion: 1 }, { vuelta: 2 }]) {
    assert.throws(() => reproducirChico({ ...replay,
      eventos: [reparto, { ...palabra, indicacion: { ...indicacion, ...cambio } }] }, 0), /Secuencia 2/);
  }
  assert.throws(() => reproducirChico({ ...replay, eventos: [...replay.eventos, { ...palabra, secuencia: 3 }] }, 0), /Secuencia 3/);
  assert.throws(() => reproducirChico({ ...parejas, eventos: replay.eventos }, 0), /Secuencia 2/);
  assert.throws(() => reproducirChico(cabecera, 0), /automáticamente/);
});

test("la proyección de tercetos cierra las señas al pasar de la redondilla al primer duelo", () => {
  const chico = { ...tercetos, version: "chico-v2", versionSenas: versionSenasPie };
  for (const asiento of [0, 1, 2, 3, 4, 5]) {
    const redondilla = reproducirChico(chico, asiento, 1).vista;
    assert.ok(redondilla && "pie" in redondilla && redondilla.pie);
    assert.equal(redondilla.pie.grupos.length, redondilla.pie.pie === asiento ? 2 : 1);
    const duelo = reproducirChico(chico, asiento, 8).vista;
    assert.ok(duelo && "lance" in duelo && duelo.lance?.tipo === "pico-a-pico");
    assert.equal(duelo.pie, undefined);
    assert.deepEqual(duelo.indicaciones, []);
  }
});
