import assert from "node:assert/strict";
import test from "node:test";
import { esRepartoOnline, esRepartoV1, repartir, type Asiento } from "../../src/motor/reparto.ts";
import { iniciarMano, jugarCarta } from "../../src/motor/mano.ts";
import { aDecidir, aplicarOnline, iniciarOnline, marcadorOnline, repartirOnline, vistaOnline, vistaTercetos,
  type AccionOnline, type EstadoOnline, type RepartoOnline } from "../../src/motor/mesa-online.ts";

const empate: RepartoOnline = {
  versionReparto: "online-2", dador: 5, mano: 0, muestra: "copas-01",
  manos: [
    ["oros-04","espadas-03","copas-10"], ["oros-11","oros-12","bastos-02"],
    ["bastos-10","oros-02","copas-11"], ["oros-06","espadas-06","bastos-11"],
    ["bastos-07","espadas-04","espadas-11"], ["copas-05","oros-10","bastos-03"],
  ],
};
const florDelPie: RepartoOnline = {
  ...empate, muestra: "bastos-05", manos: [
    ["espadas-03","espadas-10","oros-06"], ["espadas-01","copas-11","bastos-10"],
    ["espadas-07","bastos-04","oros-11"], ["espadas-12","bastos-06","bastos-01"],
    ["oros-03","oros-02","bastos-07"], ["oros-01","oros-07","oros-10"],
  ],
};

function enviar(estado: EstadoOnline, accion: AccionOnline) {
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok, JSON.stringify(accion));
  return paso.estado;
}
function declaraciones(estado: EstadoOnline) {
  while (estado.consultaFlor.length) {
    const asiento = estado.consultaFlor[0];
    const [tipo] = vistaOnline(estado, asiento).legales;
    assert.ok(tipo === "paso-flor" || tipo === "flor");
    estado = enviar(estado, { tipo, asiento });
  }
  return estado;
}

test("cada dador recibe seis ternas, una muestra y el perfil de seis", () => {
  for (let dador = 0; dador < 6; dador++) {
    const reparto = repartirOnline(6, dador);
    assert.ok(esRepartoOnline(reparto));
    assert.equal(reparto.mano, (dador + 1) % 6);
    assert.equal(new Set([...reparto.manos.flat(), reparto.muestra]).size, 19);
    assert.equal(iniciarOnline(reparto).meta, 50);
    assert.deepEqual(vistaOnline(iniciarOnline(reparto), 5).equipoPorAsiento, [0, 1, 0, 1, 0, 1]);
    for (const versionReparto of [1, "online-1"]) {
      const ajeno = { ...reparto, versionReparto, semilla: 2 };
      assert.ok(!esRepartoOnline(ajeno) && !esRepartoV1(ajeno));
    }
  }
  assert.throws(() => iniciarOnline(empate, [0, 0], 25), RangeError);
  assert.throws(() => repartir(9, 4), RangeError);
  assert.ok(!esRepartoOnline({ ...empate, manos: [...empate.manos.slice(0, 5), empate.manos[0]] }));
});

test("la primera máxima entre compañeros sale en la siguiente vuelta, tres pardas dan al mano", () => {
  const reparto: RepartoOnline = { ...empate, muestra: "oros-06", manos: [
    ["oros-03","bastos-12","bastos-11"], ["espadas-03","copas-12","copas-11"],
    ["bastos-04","espadas-06","bastos-06"], ["copas-04","copas-06","espadas-05"],
    ["bastos-05","bastos-07","espadas-04"], ["copas-05","copas-07","bastos-10"],
  ] };
  for (const iguales of [false, true]) {
    // En el segundo caso pasan las tres cartas del asiento 1 al compañero 4.
    const manos = [...reparto.manos];
    if (iguales) [manos[1], manos[4]] = [manos[4], manos[1]];
    let estado = iniciarMano({ ...reparto, manos });
    while (estado.turno !== null) {
      const asiento = estado.turno;
      const paso = jugarCarta(estado, { asiento, carta: estado.restantes[asiento][0] });
      assert.ok(paso.ok);
      estado = paso.estado;
    }
    assert.equal(estado.equipoGanador, 0);
    assert.equal(estado.vueltas.length, iguales ? 2 : 3);
    for (const vuelta of estado.vueltas) {
      assert.equal(vuelta.jugadas.length, 6);
      assert.deepEqual(vuelta.resultado, iguales ? { tipo: "ganada", equipo: 0, asiento: 0 } : { tipo: "parda" });
    }
  }
});

test("falta elevada entre rivales empatados usa la cuenta del ganador al abrir el lance", () => {
  for (const mano of [0, 5] as const) {
    const equipo = mano === 0 ? 0 : 1;
    let estado = iniciarOnline({ ...empate, mano, dador: ((mano + 5) % 6) as Asiento }, [32, 24], 50);
    estado = enviar(estado, { tipo: "envido", asiento: mano });
    estado = enviar(estado, { tipo: "falta-envido", asiento: aDecidir(estado)[0] });
    estado = declaraciones(enviar(estado, { tipo: "quiero", asiento: mano }));
    assert.deepEqual(estado.cobros, [{ equipo, asiento: mano, valor: equipo ? 1 : 18,
      tantos: equipo ? 1 : 18, motivo: "envido", tantoGanador: 31 }]);
    const prueba = vistaTercetos(estado, 2).pruebasDeTantos;
    if (equipo === 0) {
      assert.deepEqual(prueba, [{ asiento: 0, motivo: "envido", total: 31, cartas: ["copas-10", "oros-04"] }]);
    } else {
      assert.equal(prueba, undefined);
    }
  }
});

test("el retiro concede el truco vigente después de la flor del sexto asiento, salvo victoria por flor", () => {
  for (const puntos of [0, 49]) {
    let estado = iniciarOnline(florDelPie, [0, puntos]);
    estado = enviar(estado, { tipo: "truco", asiento: 0 });
    assert.ok(!vistaOnline(estado, 1).legales.includes("mazo"));
    estado = enviar(estado, { tipo: "quiero", asiento: 1 });
    estado = declaraciones(enviar(estado, { tipo: "mazo", asiento: 0 }));
    assert.equal(estado.resultado?.motivo, puntos ? "flor" : "mazo");
    assert.deepEqual(estado.cobros.map(c => [c.motivo, c.tantos, c.valor]), puntos ?
      [["flor", 1, 3]] : [["flor", 3, 3], ["truco", 2, 2]]);
    assert.deepEqual(marcadorOnline(estado), [0, puntos ? 50 : 5]);
    assert.deepEqual(aDecidir(estado), []);
  }
});
