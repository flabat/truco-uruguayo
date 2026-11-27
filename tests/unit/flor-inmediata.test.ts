import assert from "node:assert/strict";
import test from "node:test";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, repartirOnline, vistaOnline, vistaTercetos,
  type AccionOnline, type EstadoOnline, type RepartoOnline,
} from "@eltruco/motor/mesa-online.ts";
import { esRepartoOnline, type Asiento, type TresCartas } from "@eltruco/motor/reparto.ts";

import { mesaFabian } from "../fixtures/mesa-flor-fabian.ts";

const salida = { tipo: "carta", asiento: 3, carta: "bastos-12" } as const;
const envido = { tipo: "envido", asiento: 0 } as const;
const flor = { tipo: "flor", asiento: 2 } as const;

function jugar(estado: EstadoOnline, accion: AccionOnline) {
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok, JSON.stringify(accion));
  return paso.estado;
}

test("el rey de bastos, el envido de Fabián y la flor de su pareja son las únicas tres jugadas", () => {
  const estado = [salida, envido].reduce(jugar, iniciarOnline(mesaFabian));
  assert.deepEqual(aDecidir(estado), [2]);
  assert.deepEqual(vistaOnline(estado, 2).legales, ["flor", "con-flor-envido", "contraflor-al-resto"]);
  assert.deepEqual(elegirAccionOnline(vistaOnline(estado, 2)), flor);
  for (const asiento of [0, 1, 3] as const) {
    const vista = vistaOnline(estado, asiento);
    assert.deepEqual(vista.legales, []);
    assert.equal(vista.porDeclararFlor, null);
    for (const carta of mesaFabian.manos[2]) assert.ok(!JSON.stringify(vista).includes(carta));
    for (const tipo of ["quiero", "no-quiero", "real-envido", "falta-envido", "paso-flor"] as const) {
      assert.equal(aplicarOnline(estado, { tipo, asiento }).ok, false);
    }
  }
  const fin = jugar(estado, flor);
  assert.deepEqual(fin.acciones, [salida, envido, flor]);
  assert.deepEqual(fin.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
  assert.equal(fin.indiceCobroLateral, 2);
  assert.equal(fin.lateral, null);
  assert.deepEqual(aDecidir(fin), [0]);
  assert.deepEqual(vistaOnline(fin, 0).legales, ["carta", "truco"]);
  assert.deepEqual(fin.acciones.reduce(jugar, iniciarOnline(JSON.parse(JSON.stringify(mesaFabian)))), fin);
});

test("la misma mano guardada con la regla anterior conserva las siete acciones del historial", () => {
  const { reglaFlor, ...historico } = mesaFabian;
  const acciones: AccionOnline[] = [salida, envido, { tipo: "real-envido", asiento: 3 },
    { tipo: "falta-envido", asiento: 0 }, { tipo: "no-quiero", asiento: 3 }, { tipo: "paso-flor", asiento: 1 }, flor];
  const antiguo = acciones.reduce(jugar, iniciarOnline(historico));
  assert.deepEqual(antiguo.acciones, acciones);
  assert.deepEqual(antiguo.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
});

// Cada asiento tiene dos cartas del mismo palo. La tercera decide si tiene flor.
// Las alternativas son distintas en los seis asientos y ninguna carta es pieza.
const ternas: readonly TresCartas[] = [
  ["copas-01", "copas-03", "copas-07"], ["bastos-01", "bastos-03", "bastos-07"],
  ["espadas-01", "espadas-03", "espadas-07"], ["copas-10", "copas-11", "copas-12"],
  ["bastos-10", "bastos-11", "bastos-12"], ["espadas-10", "espadas-11", "espadas-12"],
];
const sinFlor = ["bastos-04", "espadas-04", "copas-04", "bastos-05", "espadas-05", "copas-05"] as const;

function repartir(cantidad: 2 | 4 | 6, flores: readonly Asiento[]): RepartoOnline {
  return {
    versionReparto: cantidad === 6 ? "online-2" : "online-1", reglaFlor: "inmediata-v2",
    dador: (cantidad - 1) as Asiento, mano: 0, muestra: "oros-01",
    manos: ternas.slice(0, cantidad).map(([a, b, c], i) => [a, b, flores.includes(i as Asiento) ? c : sinFlor[i]]),
  };
}

test("la computadora rival contesta la flor antes del cobro, incluso si termina el chico", () => {
  const reparto = { ...repartir(2, [0]), respondenSinFlor: [1] as const };
  const canto = { tipo: "flor", asiento: 0 } as const;
  const respuesta = { tipo: "paso-flor", asiento: 1 } as const;
  for (const inicio of [1, 39]) {
    const empezar = () => iniciarOnline(reparto, [inicio, 0], 40, 2);
    const consulta = jugar(empezar(), canto);
    assert.deepEqual(aDecidir(consulta), [1]);
    assert.deepEqual(consulta.cobros, []);
    assert.deepEqual(vistaOnline(consulta, 0).legales, []);
    assert.deepEqual(vistaOnline(consulta, 1).legales, ["paso-flor"]);
    assert.deepEqual(elegirAccionOnline(vistaOnline(consulta, 1)), respuesta);
    const resuelta = jugar(consulta, respuesta);
    assert.deepEqual(resuelta.acciones, [canto, respuesta]);
    assert.equal(resuelta.indiceCobroLateral, 1);
    const vista = vistaOnline(resuelta, 0);
    assert.deepEqual(vista.resumenTantos?.totales, [Math.min(3, 40 - inicio), 0]);
    assert.deepEqual(vista.legales, inicio === 39 ? [] : ["carta", "truco"]);
    assert.equal(aplicarOnline(resuelta, respuesta).ok, false);
    assert.deepEqual(resuelta.acciones.reduce(jugar, empezar()), resuelta);
  }
  // Los repartos anteriores no guardaban qué asientos tenían computadora.
  const antiguo = jugar(iniciarOnline(repartir(2, [0])), canto);
  assert.deepEqual(antiguo.acciones, [canto]);
  assert.equal(aplicarOnline(antiguo, respuesta).ok, false);
  assert.deepEqual(aDecidir(antiguo), [0]);
});

test("solo las computadoras rivales activas sin flor contestan y cada una habla una vez", () => {
  const reparto = { ...repartir(6, [0, 2]), respondenSinFlor: [1, 3, 4] as const };
  const canto = { tipo: "flor", asiento: 0 } as const;
  const respuesta = { tipo: "paso-flor", asiento: 1 } as const;
  const consulta = jugar(iniciarOnline(reparto), canto);
  const conRival = jugar(iniciarOnline({ ...repartir(6, [0, 2, 5]), respondenSinFlor: reparto.respondenSinFlor }), canto);
  assert.deepEqual(vistaTercetos(consulta, 1), vistaTercetos(conRival, 1));
  const pasa = jugar(consulta, respuesta);
  assert.equal(aplicarOnline(pasa, { tipo: "paso-flor", asiento: 2 }).ok, false);
  const subida = jugar(pasa, { tipo: "con-flor-envido", asiento: 2 });
  assert.deepEqual(aDecidir(subida), [3]);
  const fin = jugar(subida, { tipo: "paso-flor", asiento: 3 });
  assert.deepEqual(fin.cobros.map(c => c.tantos), [6]);
  assert.deepEqual(aDecidir(fin), [0]);

  const pico = jugar(iniciarOnline(reparto, [1, 1], 50, 2), canto);
  assert.deepEqual(pico.lance?.activos, [0, 3]);
  assert.deepEqual(aDecidir(pico), [3]);
  assert.deepEqual(jugar(pico, { tipo: "paso-flor", asiento: 3 }).cobros.map(c => c.tantos), [3]);
});

test("en un reparto anterior a #431, la computadora que abrió envido contesta después de oír la flor", () => {
  const computadoras = [0] as const;
  const reparto = { ...repartir(2, [1]), respondenSinFlor: computadoras };
  const envite = jugar(iniciarOnline(reparto), envido);
  assert.deepEqual(aDecidir(envite), [1]);
  const flor = jugar(envite, { tipo: "contraflor-al-resto", asiento: 1 });
  assert.deepEqual(vistaOnline(flor, 0).legales, ["paso-flor"]);
  const fin = jugar(flor, { tipo: "paso-flor", asiento: 0 });
  assert.deepEqual(fin.cobros, [{ equipo: 1, motivo: "flor", tantos: 3 }]);
  assert.deepEqual(aDecidir(fin), [0]);
  const sinFlores = { ...repartir(6, []), respondenSinFlor: [1, 2, 3, 4, 5] as const };
  const querido = jugar(jugar(iniciarOnline(sinFlores), envido), { tipo: "quiero", asiento: 1 });
  assert.deepEqual(querido.cobros.map(c => c.motivo), ["envido"]);
  assert.deepEqual(jugar(iniciarOnline(sinFlores), { tipo: "mazo", asiento: 0 }).cobros.map(c => c.motivo), ["truco"]);
});

test("ante una flor en medio de la vuelta, solo contestan las computadoras rivales que todavía no actuaron", () => {
  // #431: la flor se canta en la primera acción. Quien ya jugó una carta o abrió envido no tiene flor.
  const computadoras = [1, 2, 3, 4, 5] as const;
  const previas: AccionOnline[] = [
    { tipo: "carta", asiento: 0, carta: "copas-01" }, { tipo: "carta", asiento: 1, carta: "bastos-01" },
    { tipo: "carta", asiento: 2, carta: "espadas-01" }, { tipo: "carta", asiento: 3, carta: "copas-10" },
    { tipo: "real-envido", asiento: 4 },
  ];
  const canto = { tipo: "flor", asiento: 5 } as const;
  const empezar = (reparto: RepartoOnline) => previas.reduce(jugar, iniciarOnline(reparto));
  const reparto = { ...repartir(6, [5]), respondenSinFlor: computadoras, respuestaSinFlor: "antes-de-actuar" } as const;
  const resuelta = jugar(empezar(reparto), canto);
  assert.equal(resuelta.consultaFlor.length, 0);
  for (const asiento of [0, 2, 4] as const) assert.equal(aplicarOnline(resuelta, { tipo: "paso-flor", asiento }).ok, false);
  assert.deepEqual(resuelta.cobros.map(c => [c.equipo, c.motivo, c.tantos]), [[1, "flor", 3]]);
  assert.deepEqual(aDecidir(resuelta), [4]);

  const deSalida = jugar(iniciarOnline({ ...repartir(6, [0]), respondenSinFlor: computadoras, respuestaSinFlor: "antes-de-actuar" }), { tipo: "flor", asiento: 0 });
  assert.deepEqual(deSalida.consultaFlor, [1, 3, 5]);

  // Los repartos guardados antes del cambio conservan la respuesta de quienes ya actuaron.
  const historica = jugar(empezar({ ...repartir(6, [5]), respondenSinFlor: computadoras }), canto);
  assert.deepEqual(historica.consultaFlor, [2, 4]);
});

test("el reparto guarda y valida los asientos que responden sin flor", () => {
  const reparto = repartirOnline(2, 1, [1]);
  assert.deepEqual(reparto.respondenSinFlor, [1]);
  assert.ok(esRepartoOnline(JSON.parse(JSON.stringify(reparto))));
  assert.throws(() => repartirOnline(2, 1, [2]), RangeError);
  assert.equal(esRepartoOnline({ ...reparto, respondenSinFlor: [1, 1] }), false);
  assert.equal(reparto.respuestaSinFlor, "antes-de-actuar");
  assert.equal(esRepartoOnline({ ...reparto, respuestaSinFlor: "siempre" }), false);
  const { respondenSinFlor: _, ...sinComputadoras } = reparto;
  assert.equal(esRepartoOnline(sinComputadoras), false);
  assert.equal("respuestaSinFlor" in repartirOnline(2, 1), false);
});

test("todos los repartos de flores en duelo, parejas y redondilla ante flor o cualquier envite directo", () => {
  for (const cantidad of [2, 4, 6] as const) {
    assert.equal(repartirOnline(cantidad).reglaFlor, "inmediata-v2");
    const asientos = ([0, 1, 2, 3, 4, 5] as const).slice(0, cantidad);
    for (let mascara = 0; mascara < 2 ** cantidad; mascara++) {
      const flores = asientos.filter(a => mascara & (1 << a));
      const inicio = iniciarOnline(repartir(cantidad, flores));
      for (const tipo of ["envido", "real-envido", "falta-envido"] as const) {
        let estado: EstadoOnline;
        if (flores.includes(0)) {
          assert.equal(aplicarOnline(inicio, { tipo, asiento: 0 }).ok, false);
          estado = jugar(inicio, { tipo: "flor", asiento: 0 });
        } else {
          estado = jugar(inicio, { tipo, asiento: 0 });
        }
        for (const asiento of flores.filter(a => a !== 0)) {
          assert.deepEqual(aDecidir(estado), [asiento]);
          assert.deepEqual(vistaOnline(estado, asiento).legales,
            ["flor", "con-flor-envido", "contraflor-al-resto"]);
          estado = jugar(estado, { tipo: "flor", asiento });
        }
        assert.deepEqual(estado.flores, flores);
        assert.deepEqual(estado.consultaFlor, []);
        if (!flores.length) {
          assert.deepEqual(aDecidir(estado), asientos.filter(a => a % 2 === 1));
          for (const respuesta of ["quiero", "no-quiero"] as const) {
            const resuelto = jugar(estado, { tipo: respuesta, asiento: 1 });
            assert.deepEqual(resuelto.cobros.map(c => c.motivo), ["envido"]);
            assert.equal(resuelto.acciones.length, 2);
          }
        } else if (flores.every(a => a % 2 === flores[0] % 2)) {
          assert.deepEqual(estado.cobros.map(c => [c.equipo, c.motivo, c.tantos]), [[flores[0] % 2, "flor", 3 * flores.length]]);
          assert.deepEqual(aDecidir(estado), [0]);
        } else {
          const rivales = flores.filter(a => a % 2 !== flores[0] % 2);
          assert.deepEqual(aDecidir(estado), rivales);
          assert.deepEqual(estado.cobros, []);
          for (const subida of ["con-flor-envido", "contraflor-al-resto"] as const) {
            const oferta = jugar(estado, { tipo: subida, asiento: rivales[0] });
            for (const respuesta of ["quiero", "no-quiero"] as const) {
              const resuelto = jugar(oferta, { tipo: respuesta, asiento: flores[0] });
              assert.deepEqual(resuelto.cobros.map(c => c.motivo), ["flor"]);
            }
          }
        }
      }
    }
  }
});

test("la flor antepuesta al truco, su rechazo o el retiro se liquida primero", () => {
  const inicio = iniciarOnline(repartir(4, [2]));
  const truco = jugar(inicio, { tipo: "truco", asiento: 0 });
  const envite = jugar(truco, { tipo: "envido", asiento: 1 });
  const resuelto = jugar(envite, flor);
  assert.deepEqual(resuelto.trucoPendiente, { tipo: "truco", asiento: 0 });
  assert.deepEqual(resuelto.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
  assert.deepEqual(jugar(resuelto, { tipo: "no-quiero", asiento: 3 }).cobros.map(c => c.motivo), ["flor", "truco"]);
  const rechazo = jugar(truco, { tipo: "no-quiero", asiento: 1 });
  assert.deepEqual(aDecidir(rechazo), [2]);
  assert.deepEqual(jugar(rechazo, flor).cobros.map(c => c.motivo), ["flor", "truco"]);
  const retiro = jugar(iniciarOnline(repartir(6, [2]), [49, 0]), { tipo: "mazo", asiento: 0 });
  const fin = jugar(retiro, flor);
  assert.equal(fin.resultado?.motivo, "flor");
  assert.deepEqual(fin.cobros.map(c => c.tantos), [1]);
});

test("en pico a pico solo pueden interrumpir las flores del duelo activo", () => {
  for (const flores of [[1, 2, 4, 5], [1, 2, 3, 4, 5]] as Asiento[][]) {
    const estado = jugar(iniciarOnline(repartir(6, flores), [1, 1], 50, 2), envido);
    assert.deepEqual(estado.lance?.activos, [0, 3]);
    assert.deepEqual(aDecidir(estado), [3]);
    assert.equal(vistaTercetos(estado, 1).estado, "esperando");
    const tieneFlor = flores.includes(3);
    assert.deepEqual(vistaOnline(estado, 3).legales, tieneFlor ? ["flor", "con-flor-envido", "contraflor-al-resto"] : ["quiero", "no-quiero", "envido", "real-envido", "falta-envido"]);
    const resuelto = jugar(estado, { tipo: tieneFlor ? "flor" : "quiero", asiento: 3 });
    assert.deepEqual(resuelto.cobros.map(c => c.motivo), [tieneFlor ? "flor" : "envido"]);
  }
});

test("el segundo de tres cantores puede subir en su declaración aunque todavía falte una flor", () => {
  const inicio = iniciarOnline(repartir(4, [1, 2, 3]));
  const primera = [envido, { asiento: 1, tipo: "flor" } as const].reduce(jugar, inicio);
  for (const tipo of ["con-flor-envido", "contraflor-al-resto"] as const) {
    const segunda = jugar(primera, { asiento: 2, tipo });
    assert.deepEqual(segunda.acciones.map(a => a.tipo), ["envido", "flor", tipo]);
    assert.deepEqual(segunda.flores, [1, 2]);
    assert.deepEqual(aDecidir(segunda), [3]);
    assert.deepEqual(segunda.cobros, []);
    assert.equal(aplicarOnline(segunda, { asiento: 1, tipo: "quiero" }).ok, false);
    assert.deepEqual(vistaOnline(segunda, 3).legales, tipo === "con-flor-envido" ? ["flor", "contraflor-al-resto", "con-flor-quiero"] : ["flor", "con-flor-quiero"]);
    const tercera = jugar(segunda, { asiento: 3, tipo: "flor" });
    assert.deepEqual(tercera.flores, [1, 2, 3]);
    assert.deepEqual(aDecidir(tercera), [1]);
    assert.equal(tercera.lateral?.tipo, tipo);
    const rechazo = jugar(tercera, { asiento: 1, tipo: "no-quiero" });
    assert.deepEqual(rechazo.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
    const querido = jugar(tercera, { asiento: 1, tipo: "quiero" });
    assert.deepEqual(querido.comparacionFlor?.participantes.map(p => p.asiento), [1, 2, 3]);
    assert.deepEqual(querido.cobros.map(c => [c.equipo, c.tantos]), [[1, tipo === "con-flor-envido" ? 8 : 49]]);
    assert.deepEqual(querido.acciones.reduce(jugar, inicio), querido);
  }
});

test("la tercera flor puede subir al resto y la cuarta conserva el turno de declaración", () => {
  const inicio = iniciarOnline(repartir(4, [0, 1, 2, 3]), [35, 37]);
  const acciones: AccionOnline[] = [
    { asiento: 0, tipo: "flor" }, { asiento: 1, tipo: "con-flor-envido" },
    { asiento: 2, tipo: "contraflor-al-resto" }, { asiento: 3, tipo: "flor" },
  ];
  const oferta = acciones.reduce(jugar, inicio);
  assert.deepEqual(oferta.flores, [0, 1, 2, 3]);
  assert.deepEqual(oferta.acciones, acciones);
  assert.deepEqual(aDecidir(oferta), [1]);
  const rechazo = jugar(oferta, { asiento: 1, tipo: "no-quiero" });
  assert.deepEqual(rechazo.cobros.map(c => [c.equipo, c.tantos]), [[0, 8]]);
});

test("un compañero puede subir la apuesta propia al resto", () => {
  const inicio = iniciarOnline(repartir(6, [0, 1, 3, 4]));
  const oferta = jugar(jugar(inicio, { asiento: 0, tipo: "flor" }), { asiento: 1, tipo: "con-flor-envido" });
  assert.deepEqual(vistaOnline(oferta, 3).legales, ["flor", "contraflor-al-resto"]);
  const resto = jugar(oferta, { asiento: 3, tipo: "contraflor-al-resto" });
  assert.deepEqual(vistaOnline(resto, 4).legales, ["flor", "con-flor-quiero"]);
  const otraFlor = jugar(oferta, { asiento: 3, tipo: "flor" });
  assert.deepEqual(vistaOnline(otraFlor, 4).legales, ["flor", "contraflor-al-resto", "con-flor-quiero"]);
});

test("el segundo compañero puede abrir la apuesta sin saber si un rival tiene flor", () => {
  for (const flores of [[0, 2], [0, 2, 3], [0, 2, 4]] as Asiento[][]) {
    const inicio = iniciarOnline(repartir(6, flores));
    const primera = jugar(inicio, { asiento: 0, tipo: "flor" });
    assert.deepEqual(vistaOnline(primera, 2).legales, ["flor", "con-flor-envido", "contraflor-al-resto"]);
    for (const tipo of ["con-flor-envido", "contraflor-al-resto"] as const) {
      let estado = jugar(primera, { asiento: 2, tipo });
      if (flores.length === 3) {
        const tercero = flores[2];
        assert.deepEqual(aDecidir(estado), [tercero]);
        estado = jugar(estado, { asiento: tercero, tipo: "flor" });
      }
      assert.deepEqual(estado.cobros.map(c => [c.equipo, c.motivo, c.tantos]), [[0, "flor", flores.includes(4) ? 9 : 6]]);
    }
  }
});

test("la primera flor puede subir de salida o anular por completo cualquier envido ordinario", () => {
  for (const apuesta of ["con-flor-envido", "contraflor-al-resto"] as const) {
    const inicio = iniciarOnline(repartir(4, [0, 1]));
    const directa = jugar(inicio, { asiento: 0, tipo: apuesta });
    assert.deepEqual(directa.flores, [0]);
    assert.deepEqual(aDecidir(directa), [1]);
    const aceptada = jugar(directa, { asiento: 1, tipo: "con-flor-quiero" });
    assert.deepEqual(aceptada.acciones.map(a => a.tipo), [apuesta, "con-flor-quiero"]);
    assert.deepEqual(aceptada.cobros.map(c => [c.motivo, c.equipo, c.tantos]), [["flor", 0, apuesta === "con-flor-envido" ? 5 : 46]]);
    for (const tipo of ["envido", "real-envido", "falta-envido"] as const) {
      const envite = jugar(iniciarOnline(repartir(4, [2, 3])), { asiento: 0, tipo });
      const florDirecta = jugar(envite, { asiento: 2, tipo: apuesta });
      assert.deepEqual(florDirecta.flores, [2]);
      assert.equal(florDirecta.lateral?.anterior, 0);
      const rechazo = jugar(florDirecta, { asiento: 3, tipo: "flor" });
      assert.deepEqual(rechazo.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
      assert.deepEqual(aDecidir(rechazo), [0]);
    }
  }
});

test("el rechazo individual deja a otro compañero querer o subir; una nueva subida necesita respuesta", () => {
  const inicio = iniciarOnline(repartir(6, [0, 1, 2, 3, 4, 5]));
  let estado = jugar(inicio, { asiento: 0, tipo: "con-flor-envido" });
  estado = jugar(estado, { asiento: 1, tipo: "flor" });
  estado = jugar(estado, { asiento: 2, tipo: "flor" });
  for (const tipo of ["flor", "con-flor-quiero"] as const) {
    const tercerCanto = jugar(estado, { asiento: 3, tipo });
    const quinta = jugar(tercerCanto, { asiento: 4, tipo: "flor" });
    assert.deepEqual(quinta.cobros, []);
    const sexta = jugar(quinta, { asiento: 5, tipo: "flor" });
    assert.equal(sexta.cobros[0].tantos, tipo === "flor" ? 9 : 11);
    assert.equal(sexta.cobros[0].asiento, tipo === "flor" ? undefined : 0);
  }
  const querido = jugar(estado, { asiento: 3, tipo: "con-flor-quiero" });
  const resto = jugar(querido, { asiento: 4, tipo: "contraflor-al-resto" });
  assert.deepEqual(vistaOnline(resto, 5).legales, ["flor", "con-flor-quiero"]);
  const declina = jugar(resto, { asiento: 5, tipo: "flor" });
  assert.deepEqual(aDecidir(declina), [1, 3]);
  const final = jugar(declina, { asiento: 1, tipo: "no-quiero" });
  assert.deepEqual(final.cobros.map(c => [c.equipo, c.tantos]), [[0, 11]]);
  assert.deepEqual(final.acciones.reduce(jugar, inicio), final);
});

test("dos compañeros que suben sin oposición solo cobran sus flores", () => {
  let estado = jugar(iniciarOnline(repartir(4, [0, 2])), { asiento: 0, tipo: "con-flor-envido" });
  estado = jugar(estado, { asiento: 2, tipo: "contraflor-al-resto" });
  assert.deepEqual(estado.cobros, [{ equipo: 0, tantos: 6, motivo: "flor" }]);
});

test("el reparto de la primera versión de flor inmediata conserva su respuesta separada", () => {
  const inicio = iniciarOnline({ ...repartir(4, [0, 1, 2]), reglaFlor: "inmediata" });
  assert.deepEqual(vistaOnline(inicio, 0).legales, ["flor"]);
  const uno = jugar(inicio, { asiento: 0, tipo: "flor" });
  const dos = jugar(uno, { asiento: 1, tipo: "con-flor-envido" });
  const tres = jugar(dos, { asiento: 2, tipo: "flor" });
  assert.deepEqual(aDecidir(tres), [0, 2]);
  assert.deepEqual(jugar(tres, { asiento: 2, tipo: "quiero" }).cobros.map(c => c.tantos), [8]);
});

test("sin rival que todavía pueda tener flor, solo se canta «Flor»", () => {
  // #455: la computadora mano jugó el 7 de oros. Ya no puede tener flor, así que no hay a quién apostarle.
  const reparto = { ...repartir(2, [1]), respondenSinFlor: [0] as const, respuestaSinFlor: "antes-de-actuar", subidaFlor: "con-rival-posible" } as const;
  const salida = { tipo: "carta", asiento: 0, carta: "copas-01" } as const;
  const jugada = jugar(iniciarOnline(reparto), salida);
  assert.deepEqual(vistaOnline(jugada, 1).legales, ["flor"]);
  for (const tipo of ["con-flor-envido", "contraflor-al-resto"] as const) {
    assert.equal(aplicarOnline(jugada, { tipo, asiento: 1 }).ok, false);
  }
  const cobrada = jugar(jugada, { tipo: "flor", asiento: 1 });
  assert.deepEqual(cobrada.cobros, [{ equipo: 1, tantos: 3, motivo: "flor" }]);

  // Frente a un envido rival pasa lo mismo: quien envidó ya actuó.
  assert.deepEqual(vistaOnline(jugar(iniciarOnline(reparto), envido), 1).legales, ["flor"]);
  // De salida, el rival todavía puede tener flor.
  assert.deepEqual(vistaOnline(iniciarOnline({ ...reparto, mano: 1, dador: 0 }), 1).legales.slice(0, 3),
    ["flor", "con-flor-envido", "contraflor-al-resto"]);

  // En parejas alcanza con que un rival no haya actuado.
  const parejas = { ...repartir(4, [2]), subidaFlor: "con-rival-posible" } as const;
  const conRival = [{ tipo: "carta", asiento: 0, carta: "copas-01" }, { tipo: "carta", asiento: 1, carta: "bastos-01" }] as const;
  const falta3 = conRival.reduce(jugar, iniciarOnline(parejas));
  assert.deepEqual(vistaOnline(falta3, 2).legales.slice(0, 3), ["flor", "con-flor-envido", "contraflor-al-resto"]);

  // Un rival que ya cantó flor sigue admitiendo la subida.
  const contra = { ...repartir(2, [0, 1]), subidaFlor: "con-rival-posible" } as const;
  assert.deepEqual(vistaOnline(jugar(iniciarOnline(contra), { tipo: "flor", asiento: 0 }), 1).legales,
    ["flor", "con-flor-envido", "contraflor-al-resto"]);

  // Los repartos anteriores conservan las subidas para que sus historiales se reproduzcan igual.
  const { subidaFlor: _, ...historico } = reparto;
  assert.deepEqual(vistaOnline(jugar(iniciarOnline(historico), salida), 1).legales, ["flor", "con-flor-envido", "contraflor-al-resto"]);
});

test("los repartos nuevos limitan las subidas de flor a cuando un rival todavía puede tener flor", () => {
  for (const reparto of [repartirOnline(2, 1, [1]), repartirOnline(4, 1)]) {
    assert.equal(reparto.subidaFlor, "con-rival-posible");
    assert.ok(esRepartoOnline(JSON.parse(JSON.stringify(reparto))));
    assert.equal(esRepartoOnline({ ...reparto, subidaFlor: "siempre" }), false);
    assert.equal(esRepartoOnline({ ...reparto, reglaFlor: "inmediata" }), false);
  }
});
