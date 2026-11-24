import assert from "node:assert/strict";
import test from "node:test";
import { mazo } from "@eltruco/motor/cartas.ts";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { elegirAccionTercetos } from "@eltruco/motor/bot-tercetos.ts";
import { aDecidir, aplicarOnline, iniciarOnline, marcadorOnline, vistaTercetos } from "@eltruco/motor/mesa-online.ts";
import { crearAzar, type Asiento, type TresCartas } from "@eltruco/motor/reparto.ts";

const asientos = [0, 1, 2, 3, 4, 5] as const;

function reparto(numero: number, dador: Asiento) {
  const cartas = [...mazo];
  const azar = crearAzar(numero);
  for (let i = 0; i < 19; i++) {
    const j = i + Math.floor(azar() * (cartas.length - i));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }
  return {
    versionReparto: "online-2" as const, dador, mano: ((dador + 1) % 6) as Asiento,
    manos: asientos.map(i => [cartas[i], cartas[i + 6], cartas[i + 12]] as TresCartas), muestra: cartas[18],
  };
}

test("el pie guarda la pieza cuando el segundo compañero ya supera a todos los rivales", () => {
  assert.equal(elegirJugada({
    asiento: 5, dador: 5, mano: 0, muestra: "oros-07", equipoPorAsiento: [0,1,0,1,0,1],
    turno: 5, equipoGanador: null, vueltas: [], cartas: ["oros-02", "copas-04", "copas-06"],
    vueltaActual: { salida: 0, jugadas: [
      {asiento: 0, carta: "copas-03"}, {asiento: 1, carta: "bastos-05"},
      {asiento: 2, carta: "bastos-02"}, {asiento: 3, carta: "espadas-01"}, {asiento: 4, carta: "espadas-03"},
    ] },
  }), "copas-04");
});

test("la decisión de cada asiento ignora cambios de cartas privadas entre los otros cinco", () => {
  for (const dador of asientos) {
    const original = reparto(179, dador);
    const asiento = original.mano;
    const manos = [...original.manos];
    const i = (asiento + 1) % 6, j = (asiento + 3) % 6;
    [manos[i], manos[j]] = [manos[j], manos[i]];
    for (const numero of [1, 2]) {
      const decidir = (r: typeof original) => elegirAccionTercetos(vistaTercetos(iniciarOnline(r, [0, 0], 50, numero), asiento));
      assert.deepEqual(decidir(original), decidir({...original, manos}));
    }
  }
});

test("seis políticas básicas terminan chicos completos a 50 y 26 sin actuar desde la espera", () => {
  for (const meta of [50, 26]) {
    let puntos: [number, number] = [0, 0];
    let numero = 0;
    while (Math.max(...puntos) < meta) {
      ++numero;
      assert.ok(numero <= meta * 2);
      const r = reparto(179 + numero, asientos[(numero - 1) % 6]);
      let estado = iniciarOnline(r, puntos, meta, numero);
      for (let paso = 0; !estado.resultado; paso++) {
        assert.ok(paso < 180, "El reparto debe progresar.");
        const [asiento] = aDecidir(estado);
        for (const lugar of asientos) {
          const vista = vistaTercetos(estado, lugar);
          const accion = elegirAccionTercetos(vista);
          if (accion) {
            assert.equal(accion.asiento, lugar);
            assert.ok(vista.legales.includes(accion.tipo));
            if (accion.tipo === "carta") assert.ok(vista.estado === "jugando" && vista.cartas.includes(accion.carta));
          } else assert.equal(vista.legales.length, 0);
        }
        const accion = elegirAccionTercetos(vistaTercetos(estado, asiento));
        assert.ok(accion);
        const siguiente = aplicarOnline(estado, accion);
        assert.ok(siguiente.ok);
        estado = siguiente.estado;
      }
      puntos = [...marcadorOnline(estado)];
    }
    assert.equal(puntos.filter(p => p === meta).length, 1);
  }
});
