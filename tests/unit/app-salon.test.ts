import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { participantesMesa } from "@eltruco/cliente/salon.ts";
import type { Guardado } from "../../app/src/ingreso/almacen.ts";
import { cuerpoDeMesaNueva, modalidadesOfrecidas, textoDeMeta } from "../../app/src/salon/mesa-nueva.ts";
import { destinoDeEnlace, destinoPendiente, enlaceParaCompartir, rutaDe, tokenDeInvitacion } from "../../app/src/salon/enlaces.ts";
import { faltanParaRepartir, papelDelAsiento } from "../../app/src/salon/asientos.ts";
import { crearMemoriaDeMesa } from "../../app/src/salon/memoria.ts";
import { crearConsulta, type Lectura, type VistaConsulta } from "../../app/src/salon/consulta.ts";
import { compartirInvitacion } from "../../app/src/salon/compartir.ts";

const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("el salón compartido describe a los participantes", () => {
  assert.equal(participantesMesa({ origen: "exhibicion", humanos: 0, computadoras: 4 }), "Exhibición · Solo computadoras");
  assert.equal(participantesMesa({ origen: "humana", humanos: 1, computadoras: 3 }), "1 persona y 3 computadoras");
  assert.equal(participantesMesa({ origen: "humana", humanos: 2, computadoras: 1 }), "2 personas y 1 computadora");
});

test("2 contra 2 siempre lleva señas automáticas al pie", () => {
  const cuerpo = cuerpoDeMesaNueva({ modo: "2v2", meta: 40, publica: true, salonHabilitado: true, senasPie: [] });
  assert.deepEqual(cuerpo, { modo: "2v2", publica: true, formato: "pairs-private-senas", versionSenas: versionSenasPie });
});

test("1 contra 1 no lleva formato ni señas y respeta la visibilidad", () => {
  assert.deepEqual(
    cuerpoDeMesaNueva({ modo: "1v1", meta: 40, publica: true, salonHabilitado: false, senasPie: ["2v2"] }),
    { modo: "1v1", publica: false },
  );
  assert.deepEqual(
    cuerpoDeMesaNueva({ modo: "1v1", meta: 30, publica: false, salonHabilitado: true, senasPie: [] }),
    { modo: "1v1", publica: false, meta: 30 },
  );
});

test("3 contra 3 nunca es pública y lleva señas al pie solo si el servidor las ofrece", () => {
  assert.deepEqual(
    cuerpoDeMesaNueva({ modo: "3v3", meta: 50, publica: true, salonHabilitado: true, senasPie: ["2v2", "3v3"] }),
    { modo: "3v3", publica: false, formato: "triples", versionSenas: versionSenasPie },
  );
  assert.deepEqual(
    cuerpoDeMesaNueva({ modo: "3v3", meta: 50, publica: false, salonHabilitado: true, senasPie: ["2v2"] }),
    { modo: "3v3", publica: false, formato: "triples" },
  );
});

test("3 contra 3 se ofrece solo con admisión", () => {
  assert.deepEqual(modalidadesOfrecidas(["1v1", "2v2"]), ["1v1", "2v2"]);
  assert.deepEqual(modalidadesOfrecidas(["3v3", "2v2", "1v1"]), ["1v1", "2v2", "3v3"]);
});

test("la meta del chico es un par desde 2", () => {
  assert.deepEqual(textoDeMeta("31"), { meta: 31, valida: false, ayuda: "Elegí un número par desde 2." });
  assert.equal(textoDeMeta("").valida, false);
  const valida = textoDeMeta("30");
  assert.equal(valida.valida, true);
  assert.match(valida.ayuda, /15/);
});

test("un enlace para mirar nunca ocupa un asiento", () => {
  assert.deepEqual(destinoDeEnlace({ mirar: uuid, invitacion: "abc", mesa: uuid }), { tipo: "mirar", id: uuid });
  assert.equal(destinoDeEnlace({ mirar: "no-es-un-id", invitacion: "abc" }), null);
});

test("los enlaces de mesa e invitación se validan", () => {
  assert.deepEqual(destinoDeEnlace({ invitacion: "a_b-1" }), { tipo: "invitacion", token: "a_b-1" });
  assert.deepEqual(destinoDeEnlace({ invitacion: ["tok", "otro"] }), { tipo: "invitacion", token: "tok" });
  assert.equal(destinoDeEnlace({ invitacion: "con espacio" }), null);
  assert.deepEqual(destinoDeEnlace({ mesa: uuid.toUpperCase() }), { tipo: "mesa", id: uuid.toUpperCase() });
  assert.equal(destinoDeEnlace({ mesa: "x" }), null);
  assert.equal(destinoDeEnlace({}), null);
  assert.equal(rutaDe({ tipo: "mirar", id: uuid }), "/mirar/" + uuid);
  assert.equal(rutaDe({ tipo: "mesa", id: uuid }), "/sala/" + uuid);
  assert.equal(rutaDe({ tipo: "invitacion", token: "a_b" }), "/invitacion/a_b");
});

test("la invitación se comparte con la dirección de la app en la web", () => {
  const delServidor = "https://eltru.co/jugar/?invitacion=Tok_en-1";
  assert.equal(tokenDeInvitacion(delServidor), "Tok_en-1");
  assert.equal(tokenDeInvitacion("no es un enlace"), null);
  assert.equal(enlaceParaCompartir(delServidor, "http://localhost:18081"), "http://localhost:18081/app/?invitacion=Tok_en-1");
  assert.equal(enlaceParaCompartir(delServidor, null), delServidor);
});

test("el destino de un enlace sobrevive al ingreso una sola vez", () => {
  let valor: string | null = null;
  const guardado = { leer: () => valor, guardar: (v: string | null) => { valor = v; } };
  const destino = { tipo: "invitacion", token: "tok" } as const;
  assert.deepEqual(destinoPendiente(guardado, destino), destino);
  assert.deepEqual(destinoPendiente(guardado, null), destino);
  assert.equal(destinoPendiente(guardado, null), null);
  valor = "basura";
  assert.equal(destinoPendiente(guardado, null), null);
});

test("la sala dice cuántos faltan y qué papel tiene cada asiento", () => {
  assert.equal(faltanParaRepartir(0), "La mesa está completa.");
  assert.equal(faltanParaRepartir(1), "Falta un jugador para repartir.");
  assert.equal(faltanParaRepartir(3), "Faltan 3 jugadores para repartir.");
  const asiento = (n: number) => ({ asiento: n, equipo: (n % 2) as 0 | 1, tipo: "vacio" as const, nombre: null });
  assert.equal(papelDelAsiento({ modo: "1v1", miAsiento: 0 }, asiento(0)), "Tu asiento");
  assert.equal(papelDelAsiento({ modo: "1v1", miAsiento: 0 }, asiento(1)), "Rival");
  assert.equal(papelDelAsiento({ modo: "2v2", miAsiento: 0 }, asiento(3)), "Equipo 2");
});

function guardadoEnMemoria(): Guardado & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    leer: async clave => datos.get(clave) ?? null,
    guardar: async (clave, valor) => { datos.set(clave, valor); },
    borrar: async clave => { datos.delete(clave); },
  };
}

test("la última mesa se recuerda por jugador y se olvida solo si coincide", async () => {
  const guardado = guardadoEnMemoria();
  const memoria = crearMemoriaDeMesa(guardado);
  assert.equal(await memoria.leer("j1"), null);
  await memoria.recordar("j1", uuid);
  assert.equal(guardado.datos.get("truco.ultima-mesa.j1"), uuid);
  assert.equal(await memoria.leer("j2"), null);
  await memoria.olvidar("j1", "otra");
  assert.equal(await memoria.leer("j1"), uuid);
  await memoria.olvidar("j1", uuid);
  assert.equal(await memoria.leer("j1"), null);
});

test("la memoria de la mesa no rompe si el almacenamiento falla", async () => {
  const roto: Guardado = {
    leer: async () => { throw new Error(); },
    guardar: async () => { throw new Error(); },
    borrar: async () => { throw new Error(); },
  };
  const memoria = crearMemoriaDeMesa(roto);
  assert.equal(await memoria.leer("j1"), null);
  await memoria.recordar("j1", uuid);
  await memoria.olvidar("j1", uuid);
});

function consultaDePrueba(respuestas: Array<Lectura<number> | Error>) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const vistas: VistaConsulta<number>[] = [];
  const etags: Array<string | null> = [];
  const consulta = crearConsulta<number>({
    intervalo: 1000,
    alCambiar: vista => vistas.push(vista),
    leer: async etag => {
      etags.push(etag);
      const r = respuestas.shift();
      if (!r) return new Promise<never>(() => {});
      if (r instanceof Error) throw r;
      return r;
    },
  });
  return { consulta, vistas, etags };
}
const pausa = () => new Promise(resolver => setImmediate(resolver));

test("la consulta del salón conserva los datos ante 304 y errores", async () => {
  const { consulta, vistas, etags } = consultaDePrueba([
    { estado: 200, datos: 1, etag: "\"a\"" },
    { estado: 304 },
    new Error("red"),
    { estado: 200, datos: 2, etag: null },
  ]);
  try {
    consulta.iniciar();
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: 1, estado: "listo" });
    mock.timers.tick(1000);
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: 1, estado: "listo" });
    mock.timers.tick(1000);
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: 1, estado: "error" });
    mock.timers.tick(1000);
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: 2, estado: "listo" });
    assert.deepEqual(etags, [null, "\"a\"", "\"a\"", "\"a\""]);
    consulta.detener();
  } finally {
    mock.timers.reset();
  }
});

test("sin sesión la consulta se detiene", async () => {
  const { consulta, vistas, etags } = consultaDePrueba([{ estado: 401 }, { estado: 200, datos: 1, etag: null }]);
  try {
    consulta.iniciar();
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: null, estado: "sin-sesion" });
    mock.timers.tick(5000);
    await pausa();
    assert.equal(etags.length, 1);
    consulta.detener();
  } finally {
    mock.timers.reset();
  }
});

test("una mesa que ya no se puede mirar queda no disponible", async () => {
  const { consulta, vistas } = consultaDePrueba([{ estado: 404 }]);
  try {
    consulta.iniciar();
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: null, estado: "no-disponible" });
    consulta.detener();
  } finally {
    mock.timers.reset();
  }
});

test("en segundo plano la consulta se suspende y vuelve a leer al reanudar", async () => {
  const { consulta, etags } = consultaDePrueba([
    { estado: 200, datos: 1, etag: null },
    { estado: 200, datos: 2, etag: null },
    { estado: 200, datos: 3, etag: null },
  ]);
  try {
    consulta.iniciar();
    await pausa();
    consulta.suspender();
    mock.timers.tick(5000);
    await pausa();
    assert.equal(etags.length, 1);
    consulta.reanudar();
    await pausa();
    assert.equal(etags.length, 2);
    consulta.reanudar();
    await pausa();
    assert.equal(etags.length, 2, "no acumula lecturas mientras espera el temporizador");
    consulta.detener();
    mock.timers.tick(5000);
    await pausa();
    assert.equal(etags.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("reintentar retoma una consulta detenida por falta de sesión", async () => {
  const { consulta, vistas } = consultaDePrueba([{ estado: 401 }, { estado: 200, datos: 7, etag: null }]);
  try {
    consulta.iniciar();
    await pausa();
    consulta.reintentar();
    await pausa();
    assert.deepEqual(vistas.at(-1), { datos: 7, estado: "listo" });
    consulta.detener();
  } finally {
    mock.timers.reset();
  }
});

test("compartir la invitación usa la hoja del sistema y copia si no hay", async () => {
  const enlace = "http://localhost/app/?invitacion=t";
  const copiados: string[] = [];
  const copiar = async (e: string) => { copiados.push(e); };
  assert.equal(await compartirInvitacion({ enlace, compartir: async () => "compartida", copiar }), "");
  assert.equal(await compartirInvitacion({ enlace, compartir: async () => "cancelada", copiar }), "");
  assert.deepEqual(copiados, []);
  assert.equal(await compartirInvitacion({ enlace, compartir: async () => { throw new Error(); }, copiar }), "Invitación copiada.");
  assert.equal(await compartirInvitacion({ enlace, copiar }), "Invitación copiada.");
  assert.deepEqual(copiados, [enlace, enlace]);
  assert.equal(
    await compartirInvitacion({ enlace, copiar: async () => { throw new Error(); } }),
    "Copiá el enlace para compartirlo.",
  );
  assert.equal(await compartirInvitacion({ enlace }), "Copiá el enlace para compartirlo.");
});
