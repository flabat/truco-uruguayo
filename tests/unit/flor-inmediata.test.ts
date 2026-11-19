import assert from "node:assert/strict";
import test from "node:test";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, repartirOnline, vistaOnline, vistaTercetos,
  type AccionOnline, type EstadoOnline, type RepartoOnline,
} from "../../src/motor/mesa-online.ts";
import type { Asiento, TresCartas } from "../../src/motor/reparto.ts";

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
  assert.deepEqual(vistaOnline(estado, 2).legales, ["flor"]);
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
    versionReparto: cantidad === 6 ? "online-2" : "online-1", reglaFlor: "inmediata",
    dador: (cantidad - 1) as Asiento, mano: 0, muestra: "oros-01",
    manos: ternas.slice(0, cantidad).map(([a, b, c], i) => [a, b, flores.includes(i as Asiento) ? c : sinFlor[i]]),
  };
}

test("todos los repartos de flores en duelo, parejas y redondilla ante flor o cualquier envite directo", () => {
  for (const cantidad of [2, 4, 6] as const) {
    assert.equal(repartirOnline(cantidad).reglaFlor, "inmediata");
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
          assert.deepEqual(vistaOnline(estado, asiento).legales, ["flor"]);
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
    assert.deepEqual(vistaOnline(estado, 3).legales, tieneFlor ? ["flor"] : ["quiero", "no-quiero", "envido", "real-envido", "falta-envido"]);
    const resuelto = jugar(estado, { tipo: tieneFlor ? "flor" : "quiero", asiento: 3 });
    assert.deepEqual(resuelto.cobros.map(c => c.motivo), [tieneFlor ? "flor" : "envido"]);
  }
});
