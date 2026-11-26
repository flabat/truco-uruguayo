import assert from "node:assert/strict";
import test from "node:test";
import {
  accionDeEspera, anclarEsperas, esperasVisibles, ocultarEspera, partesDeEspera, recibidaEn, segundosRestantes, textoCierreAbandono, textoConfirmarAbandono, textoEspera,
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

test("segundosRestantes cuenta el plazo desde que llegó la espera, redondea hacia arriba y no baja de cero", () => {
  const espera = { desde: "2026-11-26T12:00:00.000Z", disponible: "2026-11-26T12:01:00.000Z" };
  const recibida = 5_000_000;
  assert.equal(segundosRestantes(espera, recibida, recibida), 60);
  assert.equal(segundosRestantes(espera, recibida, recibida + 900), 60);
  assert.equal(segundosRestantes(espera, recibida, recibida + 59_000), 1);
  assert.equal(segundosRestantes(espera, recibida, recibida + 60_000), 0);
  assert.equal(segundosRestantes(espera, recibida, recibida + 90_000), 0);
});

test("la cuenta no depende del reloj del dispositivo, adelantado o atrasado respecto del servidor", () => {
  const espera = { desde: "2026-11-26T12:00:00.000Z", disponible: "2026-11-26T12:01:00.000Z" };
  const servidor = Date.parse(espera.desde);
  for (const desfase of [-3_600_000, -45_000, 0, 45_000, 3_600_000]) {
    const recibida = servidor + desfase;
    assert.equal(segundosRestantes(espera, recibida, recibida + 20_000), 40, `desfase ${desfase} ms`);
  }
});

test("anclarEsperas conserva cuándo llegó cada espera y olvida las que se fueron", () => {
  const ana = { asiento: 0, nombre: "Ana", desde: "2026-11-26T12:00:00.000Z", disponible: "2026-11-26T12:01:00.000Z" };
  const beto = { ...ana, asiento: 3, nombre: "Beto" };
  const primera = anclarEsperas({}, [ana], 1_000);
  assert.equal(recibidaEn(primera, ana, 9_999), 1_000);
  const segunda = anclarEsperas(primera, [ana, beto], 4_000);
  assert.equal(recibidaEn(segunda, ana, 9_999), 1_000, "una relectura no reinicia la cuenta");
  assert.equal(recibidaEn(segunda, beto, 9_999), 4_000);
  const otroPlazo = { ...ana, desde: "2026-11-26T12:05:00.000Z", disponible: "2026-11-26T12:06:00.000Z" };
  const tercera = anclarEsperas(segunda, [otroPlazo], 7_000);
  assert.deepEqual(Object.values(tercera), [7_000], "un plazo nuevo se ancla de nuevo y los viejos se olvidan");
  assert.deepEqual(anclarEsperas(tercera, undefined, 8_000), {});
  assert.equal(recibidaEn({}, ana, 9_999), 9_999);
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
