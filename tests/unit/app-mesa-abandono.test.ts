import assert from "node:assert/strict";
import test from "node:test";
import {
  accionDeEspera, anclarEsperas, esperasVisibles, ocultarEspera, partesDeEspera, segundosRestantes, textoCierreAbandono, textoConfirmarAbandono, textoEspera, vencimientoDe,
} from "../../app/src/mesa/abandono.ts";
import { mesaDeJugador, mesaDeTercetos } from "../../app/src/mesa/modelo.ts";
import { mesaDe, mesaTercetosDe, partidaDe, partidaTercetosDe, vistaDe } from "./fixtures/app-mesa.ts";

test("la confirmación dice la consecuencia y, fuera del duelo, quién juega el lugar", () => {
  assert.equal(textoConfirmarAbandono("1v1"), "Vas a perder esta partida y quedará como Abandonada en tu historial.");
  for (const modo of ["2v2", "3v3"] as const) {
    assert.equal(textoConfirmarAbandono(modo),
      "Vas a perder esta partida y quedará como Abandonada en tu historial. Una computadora va a jugar tu lugar.");
  }
});

test("segundosRestantes redondea hacia arriba y no baja de cero", () => {
  const vence = 5_060_000;
  assert.equal(segundosRestantes(vence, 5_000_000), 60);
  assert.equal(segundosRestantes(vence, 5_000_900), 60);
  assert.equal(segundosRestantes(vence, 5_059_000), 1);
  assert.equal(segundosRestantes(vence, 5_060_000), 0);
  assert.equal(segundosRestantes(vence, 5_090_000), 0);
});

const ana = { asiento: 0, nombre: "Ana", desde: "2026-11-26T12:00:00.000Z", disponible: "2026-11-26T12:01:00.000Z" };

test("al recargar a mitad de la espera, la cuenta sigue desde lo que falta según el servidor", () => {
  const recargada = { ...ana, restanteMs: 20_000 };
  const anclas = anclarEsperas({}, [recargada], 1_000);
  assert.equal(segundosRestantes(vencimientoDe(anclas, recargada, 1_000), 1_000), 20);
  assert.equal(segundosRestantes(vencimientoDe(anclas, recargada, 21_000), 21_000), 0);
});

test("la cuenta no depende del reloj del dispositivo, adelantado o atrasado respecto del servidor", () => {
  const espera = { ...ana, restanteMs: 40_000 };
  const servidor = Date.parse(espera.desde);
  for (const desfase of [-3_600_000, -45_000, 0, 45_000, 3_600_000]) {
    const llegada = servidor + desfase;
    const anclas = anclarEsperas({}, [espera], llegada);
    assert.equal(segundosRestantes(vencimientoDe(anclas, espera, llegada), llegada + 20_000), 20, `desfase ${desfase} ms`);
  }
});

test("sin restanteMs, la cuenta corre el plazo entero desde que llegó la espera", () => {
  const anclas = anclarEsperas({}, [ana], 1_000);
  assert.equal(vencimientoDe(anclas, ana, 9_999), 61_000);
  assert.equal(vencimientoDe({}, ana, 9_999), 69_999);
});

test("anclarEsperas conserva el vencimiento, solo lo adelanta y olvida las esperas que se fueron", () => {
  const beto = { ...ana, asiento: 3, nombre: "Beto", restanteMs: 60_000 };
  const primera = anclarEsperas({}, [{ ...ana, restanteMs: 60_000 }], 1_000);
  assert.equal(vencimientoDe(primera, ana, 9_999), 61_000);
  const tarde = anclarEsperas(primera, [{ ...ana, restanteMs: 58_000 }, beto], 4_000);
  assert.equal(vencimientoDe(tarde, ana, 9_999), 61_000, "una respuesta lenta no atrasa el vencimiento");
  assert.equal(vencimientoDe(tarde, beto, 9_999), 64_000);
  const adelantada = anclarEsperas(tarde, [{ ...ana, restanteMs: 40_000 }], 5_000);
  assert.equal(vencimientoDe(adelantada, ana, 9_999), 45_000, "una lectura más precisa adelanta el vencimiento");
  const otroPlazo = { ...ana, desde: "2026-11-26T12:05:00.000Z", disponible: "2026-11-26T12:06:00.000Z", restanteMs: 60_000 };
  const nueva = anclarEsperas(adelantada, [otroPlazo], 7_000);
  assert.deepEqual(Object.values(nueva), [67_000], "un plazo nuevo se ancla de nuevo y los viejos se olvidan");
  assert.deepEqual(anclarEsperas(nueva, undefined, 8_000), {});
});

test("el aviso de espera muestra la cuenta mientras falta", () => {
  assert.equal(textoEspera("Ana", 42), "Esperando a Ana… · 42 s");
  assert.equal(textoEspera("Ana", 0), "Esperando a Ana…");
});

test("lo que se anuncia no cambia con la cuenta: solo la cuenta visible baja cada segundo", () => {
  assert.deepEqual(partesDeEspera("Ana", 42), { anuncio: "Esperando a Ana…", cuenta: " · 42 s" });
  assert.deepEqual(partesDeEspera("Ana", 41).anuncio, partesDeEspera("Ana", 42).anuncio);
  assert.deepEqual(partesDeEspera("Ana", 0), { anuncio: "Esperando a Ana…", cuenta: null });
  for (const n of [0, 1, 42]) {
    const { anuncio, cuenta } = partesDeEspera("Ana", n);
    assert.equal(anuncio + (cuenta ?? ""), textoEspera("Ana", n));
  }
});

test("al vencer, el duelo cobra la partida y el resto reemplaza", () => {
  assert.equal(accionDeEspera("1v1"), "Cobrar la partida");
  assert.equal(accionDeEspera("2v2"), "Reemplazar con una computadora");
  assert.equal(accionDeEspera("3v3"), "Reemplazar con una computadora");
});

test("el cierre por salida nombra a quien salió", () => {
  assert.equal(textoCierreAbandono("Ana", "abandonada"), "Ana abandonó la partida.");
  assert.equal(textoCierreAbandono("Ana", "desconectada"), "Ana se desconectó.");
});

test("«Seguir esperando» oculta el aviso hasta que cambia el plazo o pasan 60 s", () => {
  const ahora = 1_000_000;
  const ana = { asiento: 0, nombre: "Ana", desde: "2026-11-26T12:00:00.000Z", disponible: "2026-11-26T12:01:00.000Z" };
  const beto = { ...ana, asiento: 3, nombre: "Beto" };
  const ocultas = ocultarEspera({}, ana, ahora);
  assert.deepEqual(esperasVisibles([ana, beto], ocultas, ahora + 59_999), [beto]);
  assert.deepEqual(esperasVisibles([ana, beto], ocultas, ahora + 60_000), [ana, beto]);
  const otraEspera = { ...ana, desde: "2026-11-26T12:05:00.000Z", disponible: "2026-11-26T12:06:00.000Z" };
  assert.deepEqual(esperasVisibles([otraEspera], ocultas, ahora + 1), [otraEspera]);
  assert.deepEqual(esperasVisibles(undefined, ocultas, ahora), []);
});

test("al cerrar por abandono a mitad de mano, el fin dice quién salió y ofrece otra mesa", () => {
  const vista = vistaDe(2, 1, { turno: 0, legales: [] });
  const partida = partidaDe(vista, {
    ganadorPartida: 1,
    contexto: { versionVista: 1, fase: "chico-terminado" },
    cierreAbandono: { asiento: 0, nombre: "Ana", motivo: "abandonada", ganador: 1 },
  });
  const m = mesaDeJugador(mesaDe("1v1", 1), partida, { presentando: false });
  assert.deepEqual(m.fin, {
    titulo: "Ganaste la partida",
    motivo: "Ana abandonó la partida.",
    cobros: [],
    pruebas: [],
    tituloCobros: "Tantos de esta mano",
    boton: "Crear otra mesa",
  });
  assert.deepEqual(m.estado, { titulo: "Ganaste la partida", indicacion: "Ana abandonó la partida." });
  assert.equal(m.puedeJugarCarta, false);

  const cobrada = mesaDeJugador(mesaDe("1v1", 1), {
    ...partida, cierreAbandono: { asiento: 0, nombre: "Ana", motivo: "desconectada", ganador: 1 },
  }, { presentando: false });
  assert.equal(cobrada.fin?.motivo, "Ana se desconectó.");
});

test("en tercetos, el fin por abandono usa el título del chico y nombra a quien salió", () => {
  const partida = partidaTercetosDe(vistaDe(6, 1, { turno: 0 }), {
    estado: "esperando",
    ganadorPartida: 1,
    contexto: { versionVista: 1, fase: "chico-terminado" },
    cierreAbandono: { asiento: 0, nombre: "Clara", motivo: "abandonada", ganador: 1 },
  });
  const m = mesaDeTercetos(mesaTercetosDe(1), partida, { presentando: false });
  assert.equal(m.fin?.titulo, "Tu equipo ganó el chico");
  assert.equal(m.fin?.motivo, "Clara abandonó la partida.");
  assert.equal(m.fin?.boton, "Crear otra mesa");
  assert.deepEqual(m.estado, { titulo: "Tu equipo ganó el chico", indicacion: "Clara abandonó la partida." });
});
