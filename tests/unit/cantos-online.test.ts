import assert from "node:assert/strict";
import test from "node:test";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, vistaOnline, vistaOnlineV1, type AccionOnline, type EstadoOnline,
  type RepartoOnline, type TipoAccionOnline,
} from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { vocesDelEnvido } from "@eltruco/motor/cantos-online.ts";
import { reparto as tresFlores, hastaLaSubida } from "../fixtures/flor-querida.ts";

const envite: RepartoOnline = {
  versionReparto: "online-1", dador: 1, mano: 0, muestra: "oros-06",
  manos: [["oros-02", "copas-07", "bastos-03"], ["bastos-06", "bastos-10", "espadas-07"]],
};
const flores: RepartoOnline = {
  ...envite, muestra: "oros-01", manos: [["bastos-02", "bastos-03", "bastos-04"], ["copas-05", "copas-06", "copas-07"]],
};
type Canto = Exclude<TipoAccionOnline, "carta">;

function aplicar(estado: EstadoOnline, accion: AccionOnline) {
  const original = JSON.stringify(estado);
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok, JSON.stringify({ accion, paso, legales: vistaOnline(estado, accion.asiento).legales }));
  assert.equal(JSON.stringify(estado), original);
  return paso.estado;
}

function cantar(estado: EstadoOnline, ...cantos: [Asiento, Canto][]) {
  return cantos.reduce((previo, [asiento, tipo]) => aplicar(previo, { tipo, asiento }), estado);
}

test("el envido simple, repetido, real y la falta dan los tantos queridos o el escalón anterior", () => {
  const casos: [Canto[], number, number][] = [
    [["envido"], 2, 1], [["real-envido"], 3, 1], [["envido", "envido"], 4, 2],
    [["envido", "real-envido"], 5, 2], [["envido", "envido", "real-envido"], 7, 4],
    [["falta-envido"], 10, 1], [["envido", "real-envido", "falta-envido"], 10, 5],
  ];
  for (const [tipos, querido, rechazado] of casos) {
    const inicio = iniciarOnline(envite, [18, 30]);
    const pendiente = tipos.reduce((s, tipo, i) => cantar(s, [(i % 2) as Asiento, tipo]), inicio);
    const rival = (tipos.length % 2) as Asiento;
    assert.deepEqual(cantar(pendiente, [rival, "quiero"]).cobros,
      [{ equipo: 0, tantos: querido, motivo: "envido", asiento: 0, tantoGanador: 37 }]);
    assert.deepEqual(cantar(pendiente, [rival, "no-quiero"]).cobros,
      [{ equipo: 1 - rival, tantos: rechazado, motivo: "envido" }]);
  }
  const subida = cantar(iniciarOnline(envite), [0, "envido"], [1, "envido"]);
  assert.ok(!vistaOnline(subida, 0).legales.includes("envido"));
  const cerrado = cantar(subida, [0, "quiero"]);
  assert.ok(!vistaOnline(cerrado, 0).legales.includes("real-envido"));
});

test("la prioridad del envido conserva la oferta de truco y la salida; si llega a la meta termina en el envite", () => {
  for (const inicial of [[0, 0], [38, 39]] as const) {
    const estado = cantar(iniciarOnline(envite, inicial), [0, "truco"], [1, "envido"]);
    const vista = vistaOnline(estado, 0);
    assert.deepEqual(vista.pendiente, { tipo: "envido", asiento: 1 });
    assert.deepEqual(vista.trucoPendiente, { tipo: "truco", asiento: 0 });
    const resuelto = cantar(estado, [0, "quiero"]);
    assert.deepEqual(resuelto.cobros, [{ equipo: 0, tantos: 2, motivo: "envido", asiento: 0, tantoGanador: 37 }]);
    const despues = vistaOnline(resuelto, 1);
    assert.equal(despues.indiceCobroLateral, 2);
    if (inicial[0] === 38) {
      assert.deepEqual(despues.resultado, { equipo: 0, tantos: 2, motivo: "envido" });
      assert.equal(despues.pendiente, null);
      assert.equal(despues.turno, null);
      assert.deepEqual(despues.legales, []);
      assert.deepEqual(despues.pruebasDeTantos, [{ asiento: 0, motivo: "envido", total: 37, cartas: ["oros-02", "copas-07"] }]);
      assert.ok(!JSON.stringify(despues).includes("bastos-03"));
    } else {
      assert.equal(despues.resultado, null);
      assert.equal(despues.pruebasDeTantos, undefined);
      assert.deepEqual(despues.pendiente, vista.trucoPendiente);
      assert.deepEqual(aDecidir(resuelto), [1]);
      const rechazado = cantar(resuelto, [1, "no-quiero"]);
      assert.deepEqual(rechazado.cobros[1], { equipo: 0, tantos: 1, motivo: "truco" });
      assert.equal(rechazado.cobros.length, 2);
      assert.deepEqual(vistaOnline(rechazado, 1).pruebasDeTantos, [{ asiento: 0, motivo: "envido", total: 37, cartas: ["oros-02", "copas-07"] }]);
    }
  }
});

test("si dos sietes acreditan el tanto, alcanza con el que ya se jugó", () => {
  const reparto: RepartoOnline = { ...envite, manos: [
    ["copas-07", "espadas-07", "bastos-03"], ["oros-01", "espadas-02", "bastos-04"],
  ] };
  const salida = aplicar(iniciarOnline(reparto, [38, 0]), { tipo: "carta", asiento: 0, carta: "espadas-07" });
  const final = cantar(salida, [1, "envido"], [0, "quiero"]);
  const vista = vistaOnline(final, 1);
  assert.deepEqual(vista.pruebasDeTantos, [{ asiento: 0, motivo: "envido", total: 7, cartas: ["espadas-07"] }]);
  assert.doesNotMatch(JSON.stringify(vista), /copas-07|bastos-03/);
  assert.equal(vistaOnlineV1(final, 1).pruebasDeTantos, undefined);
});

test("solo el equipo con el derecho de respuesta puede subir el truco, ahora o en un turno posterior", () => {
  const primero = cantar(iniciarOnline(envite), [0, "truco"]);
  const segundo = cantar(primero, [1, "retruco"]);
  assert.deepEqual(aDecidir(segundo), [0]);
  assert.ok(!vistaOnline(segundo, 0).legales.includes("envido"));
  const cuarto = cantar(segundo, [0, "vale-cuatro"]);
  for (const [estado, responde, tantos] of [[primero, 1, 1], [segundo, 0, 2], [cuarto, 1, 3]] as const) {
    const rechazo = cantar(estado, [responde, "no-quiero"]);
    assert.deepEqual(rechazo.resultado, { equipo: 1 - responde, tantos, motivo: "rechazo" });
    assert.equal(rechazo.cobros.length, 1);
  }
  const aceptado = cantar(cuarto, [1, "quiero"]);
  assert.equal(aceptado.valorTruco, 4);
  assert.ok(!vistaOnline(aceptado, 0).legales.includes("vale-cuatro"));
  const esperado = cantar(primero, [1, "quiero"]);
  assert.ok(!vistaOnline(esperado, 0).legales.includes("retruco"));
  const jugada = aplicar(esperado, { tipo: "carta", asiento: 0, carta: envite.manos[0][0] });
  assert.ok(vistaOnline(jugada, 1).legales.includes("retruco"));
});

test("el motor exige cantar una flor propia y anula el envido sin filtrar la flor ajena", () => {
  const alterno: RepartoOnline = { ...envite, manos: [envite.manos[0], ["espadas-01", "espadas-02", "espadas-03"]] };
  const A = iniciarOnline(envite);
  const B = iniciarOnline(alterno);
  assert.deepEqual(vistaOnline(A, 0), vistaOnline(B, 0));
  assert.deepEqual(elegirAccionOnline(vistaOnline(A, 0)), elegirAccionOnline(vistaOnline(B, 0)));
  const privada = { asiento: 0, tipo: "envido", manos: envite.manos } as const;
  const normal = aplicar(A, privada);
  const conFlor = aplicar(B, privada);
  for (const estado of [normal, conFlor]) {
    assert.deepEqual(vistaOnline(estado, 0).acciones, [{ asiento: 0, tipo: "envido" }]);
    assert.deepEqual(aDecidir(estado), [1]);
    assert.ok(!JSON.stringify(vistaOnline(estado, 0)).includes("espadas-02"));
    for (const dato of ["reparto", "semilla", "restantes", "manos", "flores"]) assert.equal(dato in vistaOnline(estado, 0), false);
  }
  assert.deepEqual(vistaOnline(normal, 0), vistaOnline(conFlor, 0));
  assert.deepEqual(vistaOnline(conFlor, 1).legales, ["flor"]);
  assert.equal(aplicarOnline(conFlor, { asiento: 1, tipo: "no-quiero" }).ok, false);
  assert.deepEqual(cantar(conFlor, [1, "flor"]).cobros, [{ equipo: 1, tantos: 3, motivo: "flor" }]);
});

test("flor contra flor, con flor envido y contraflor al resto en el chico a 40", () => {
  const primero = cantar(iniciarOnline(flores, [34, 22]), [0, "flor"]);
  assert.equal(vistaOnline(primero, 0).porDeclararFlor, 1);
  const base = cantar(primero, [1, "flor"]);
  assert.deepEqual(aDecidir(base), [1]);
  for (const [subida, valor] of [[null, 3], ["con-flor-envido", 5], ["contraflor-al-resto", 12]] as const) {
    const oferta = subida === null ? base : cantar(base, [1, subida]);
    const rival = subida === null ? 1 : 0;
    assert.deepEqual(vistaOnline(cantar(oferta, [rival, "quiero"]), rival).cobros,
      [{ equipo: 1, tantos: valor, motivo: "flor", asiento: 1, tantoGanador: 38,
        comparacionFlor: { indiceAccion: oferta.acciones.length, participantes: [{ asiento: 0, total: 29 }, { asiento: 1, total: 38 }] } }]);
    assert.deepEqual(cantar(oferta, [rival, "no-quiero"]).cobros,
      [{ equipo: 1 - rival, tantos: 3, motivo: "flor" }]);
  }
  const resubida = cantar(base, [1, "con-flor-envido"], [0, "contraflor-al-resto"]);
  assert.deepEqual(cantar(resubida, [1, "no-quiero"]).cobros, [{ equipo: 0, tantos: 5, motivo: "flor" }]);
});

test("en parejas una flor tardía cancela un envido aceptado y la collera vale seis antes de cobrar el truco rechazado", () => {
  const reparto: RepartoOnline = {
    ...envite, dador: 3, mano: 0,
    manos: [envite.manos[0], envite.manos[1], ["espadas-01", "espadas-02", "espadas-03"], ["copas-04", "copas-05", "copas-06"]],
  };
  const condicion = cantar(iniciarOnline(reparto), [0, "truco"], [1, "envido"], [0, "quiero"]);
  assert.deepEqual(condicion.cobros, []);
  assert.equal(vistaOnline(condicion, 0).porDeclararFlor, 2);
  const florTardia = cantar(condicion, [2, "flor"], [3, "flor"], [3, "quiero"]);
  assert.deepEqual(vistaOnline(florTardia, 1).cobros, [{ motivo: "flor", equipo: 1, tantos: 3, asiento: 3, tantoGanador: 35,
    comparacionFlor: { indiceAccion: 5, participantes: [{ asiento: 2, total: 26 }, { asiento: 3, total: 35 }] } }]);
  assert.deepEqual(vistaOnline(florTardia, 1).pendiente, { tipo: "truco", asiento: 0 });
  const collera: RepartoOnline = { ...reparto, manos: [reparto.manos[0], reparto.manos[2], reparto.manos[1], reparto.manos[3]] };
  // 0 y 2 no tienen flor. El primer rival en responder tiene que declararla.
  const cantado = cantar(iniciarOnline(collera), [0, "truco"], [1, "flor"], [2, "paso-flor"], [3, "flor"]);
  assert.deepEqual(cantado.cobros, [{ equipo: 1, tantos: 6, motivo: "flor" }]);
  assert.deepEqual(cantar(cantado, [3, "no-quiero"]).cobros[1], { equipo: 0, tantos: 1, motivo: "truco" });
  // Si el 1 puede rechazar temprano, la flor aún no declarada del 3 tiene prioridad.
  const sinCollera = { ...collera, manos: [envite.manos[0], envite.manos[1], ["oros-03", "copas-01", "bastos-01"] as const, reparto.manos[3]] };
  const rechazo = cantar(iniciarOnline(sinCollera, [39, 38]), [0, "truco"], [1, "no-quiero"], [2, "paso-flor"], [3, "flor"]);
  assert.deepEqual(rechazo.resultado, { equipo: 1, tantos: 3, motivo: "flor" });
  assert.equal(rechazo.cobros.length, 1);
  assert.equal(vistaOnline(rechazo, 0).pruebasDeTantos, undefined);
});

test("los empates de tantos se deciden por el orden desde mano también en parejas", () => {
  const base: RepartoOnline = {
    ...envite, dador: 1, mano: 2, manos: [
      ["espadas-07", "bastos-04", "copas-11"], ["bastos-07", "espadas-06", "copas-12"],
      ["copas-07", "bastos-06", "espadas-10"], ["oros-07", "espadas-05", "bastos-12"],
    ],
  };
  const igual = cantar(iniciarOnline(base), [2, "envido"], [3, "quiero"], [0, "paso-flor"], [1, "paso-flor"]);
  assert.deepEqual(igual.cobros, [{ equipo: 0, tantos: 2, asiento: 2, motivo: "envido", tantoGanador: 7 }]);
  assert.equal(vistaOnline(igual, 0).indiceCobroLateral, 3);
  // Habla el mano. Su compañero calla y los rivales que no le ganan dicen «son buenas».
  assert.deepEqual(vistaOnline(igual, 1).cobros[0].comparacionEnvido,
    { indiceAccion: 3, participantes: [{ asiento: 2, total: 7 }, { asiento: 3, total: null }, { asiento: 1, total: null }] });
  const duelo = { ...flores, dador: 0, mano: 1, manos: [flores.manos[0], ["espadas-02", "espadas-03", "espadas-04"] as const] } as const;
  const empateFlor = cantar(iniciarOnline(duelo), [1, "flor"], [0, "flor"], [0, "quiero"]);
  assert.deepEqual(vistaOnline(empateFlor, 0).cobros, [{ equipo: 1, tantos: 3, asiento: 1, motivo: "flor", tantoGanador: 29,
    comparacionFlor: { indiceAccion: 2, participantes: [{ asiento: 1, total: 29 }, { asiento: 0, total: 29 }] } }]);
});

test("tres flores con truco pendiente: el Quiero publica solo los totales y conserva el replay de la mano", () => {
  const oferta = hastaLaSubida.reduce(aplicar, iniciarOnline(tresFlores));
  const [primera, segunda, tercera, cuarta] = tresFlores.manos;
  const otrasFlores = iniciarOnline({ ...tresFlores, manos: [cuarta, segunda, tercera, primera] });
  assert.deepEqual(vistaOnline(oferta, 1), vistaOnline(hastaLaSubida.reduce(aplicar, otrasFlores), 1));
  const florQuerida = cantar(oferta, [0, "quiero"]);
  const trucoQuerido = cantar(florQuerida, [0, "quiero"]);
  const guardadas: AccionOnline[] = [...hastaLaSubida, { asiento: 0, tipo: "quiero" }, { asiento: 0, tipo: "quiero" }];
  assert.deepEqual(trucoQuerido.acciones, guardadas);
  const recargado = guardadas.reduce(aplicar, iniciarOnline(tresFlores));
  const cobro = {
    equipo: 1, tantos: 5, motivo: "flor", asiento: 3, tantoGanador: 36,
    comparacionFlor: { indiceAccion: 5, participantes: [{ asiento: 2, total: 30 }, { asiento: 3, total: 36 }, { asiento: 0, total: 32 }] },
  };
  const cobroV1 = { equipo: 1, tantos: 5, motivo: "flor", asiento: 3, tantoGanador: 36 };
  assert.deepEqual(recargado.cobros, [cobroV1]);
  for (const asiento of [0, 1, 2, 3] as const) {
    assert.deepEqual(vistaOnlineV1(recargado, asiento).cobros, [cobroV1]);
    const pendiente = vistaOnline(oferta, asiento);
    assert.deepEqual(pendiente.cobros, []);
    const resuelta = vistaOnline(florQuerida, asiento);
    assert.deepEqual(resuelta.cobros, [cobro]);
    assert.deepEqual(resuelta.pendiente, { tipo: "truco", asiento: 1 });
    const final = vistaOnline(recargado, asiento);
    assert.deepEqual(final, vistaOnline(trucoQuerido, asiento));
    assert.deepEqual(final.cobros, [cobro]);
    assert.equal(final.valorTruco, 2);
    assert.equal(final.pendiente, null);
    for (const carta of tresFlores.manos.filter((_, i) => i !== asiento).flat()) {
      for (const vista of [pendiente, resuelta, final]) assert.ok(!JSON.stringify(vista).includes(carta));
    }
  }
  const cierre = cantar(florQuerida, [0, "no-quiero"]);
  for (const asiento of [0, 1, 2, 3] as const) {
    const final = vistaOnline(cierre, asiento);
    assert.deepEqual(final.pruebasDeTantos, [{ asiento: 3, motivo: "flor", total: 36, cartas: tresFlores.manos[3] }]);
    assert.equal(vistaOnlineV1(cierre, asiento).pruebasDeTantos, undefined);
    for (const [otro, cartas] of tresFlores.manos.entries()) {
      if (otro !== asiento && otro !== 3) {
        for (const carta of cartas) assert.ok(!JSON.stringify(final).includes(carta));
      }
    }
  }
});

test("la falta respeta lo ya aceptado y se cierra la ventana al jugar la carta o aceptar el truco", () => {
  // Faltaba uno al puntero, pero ya se quisieron dos al revirar.
  const oferta = cantar(iniciarOnline(envite, [37, 39]), [0, "envido"], [1, "falta-envido"]);
  assert.deepEqual(cantar(oferta, [0, "quiero"]).cobros, [{ equipo: 0, tantos: 2, motivo: "envido", asiento: 0, tantoGanador: 37 }]);
  const carta = aplicar(iniciarOnline(envite), { tipo: "carta", asiento: 0, carta: envite.manos[0][0] });
  const truco = cantar(carta, [1, "truco"]);
  assert.ok(!vistaOnline(truco, 0).legales.includes("envido"));
  const antes = cantar(iniciarOnline(envite), [0, "truco"], [1, "quiero"]);
  assert.ok(!vistaOnline(antes, 0).legales.includes("envido"));
});

test("el envido querido publica lo que dijo cada uno y oculta el tanto de quien dijo «son buenas»", () => {
  const querido = cantar(iniciarOnline(envite), [0, "envido"], [1, "real-envido"], [0, "quiero"]);
  for (const asiento of [0, 1] as const) {
    const vista = vistaOnline(querido, asiento);
    assert.deepEqual(vista.cobros[0].comparacionEnvido,
      { indiceAccion: 2, participantes: [{ asiento: 0, total: 37 }, { asiento: 1, total: null }] });
    assert.equal("comparacionEnvido" in vistaOnlineV1(querido, asiento).cobros[0], false);
  }
  // El que es mano habla primero aunque pierda: su tanto queda dicho.
  const pie = cantar(iniciarOnline({ ...envite, manos: [envite.manos[1], envite.manos[0]] }), [0, "envido"], [1, "quiero"]);
  const dichos = vistaOnline(pie, 0).cobros[0].comparacionEnvido!.participantes;
  assert.equal(dichos[0].asiento, 0);
  assert.deepEqual(dichos[1], { asiento: 1, total: 37 });
  assert.equal(cantar(iniciarOnline(envite), [0, "envido"], [1, "no-quiero"]).comparacionEnvido, undefined);
});

test("vocesDelEnvido: el empate gana el más mano y quien calló habla si el otro equipo pasa adelante", () => {
  // Asientos 0 y 2 contra 1 y 3, mano 0.
  const dichos = (...totales: number[]) => vocesDelEnvido(totales.map((total, asiento) => ({ asiento: asiento as Asiento, total })));
  assert.deepEqual(dichos(20, 15, 18, 25), [
    { asiento: 0, total: 20 }, { asiento: 1, total: null }, { asiento: 3, total: 25 }, { asiento: 2, total: null },
  ]);
  assert.deepEqual(dichos(20, 25, 30, 28), [
    { asiento: 0, total: 20 }, { asiento: 1, total: 25 }, { asiento: 2, total: 30 }, { asiento: 3, total: null },
  ]);
  // El 2 iguala al 1, que es más mano: son buenas. El 3 calla porque gana su compañero.
  assert.deepEqual(dichos(20, 25, 25, 15), [
    { asiento: 0, total: 20 }, { asiento: 1, total: 25 }, { asiento: 2, total: null },
  ]);
  assert.deepEqual(dichos(33, 33), [{ asiento: 0, total: 33 }, { asiento: 1, total: null }]);
});
