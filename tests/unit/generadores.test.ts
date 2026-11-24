import assert from "node:assert/strict";
import test from "node:test";
import {
  claveSituacion, evaluarRespuesta, familiasPorHabilidad, generarSituacion, proveedorSituaciones,
} from "../../src/aprendizaje/generadores/index.ts";
import { crearFuenteProgreso } from "../../src/aprendizaje/progreso.ts";
import { generarSesion, iniciarSesion } from "../../src/aprendizaje/sesion.ts";
import type { Leccion, Paso, SituacionVisible } from "../../src/aprendizaje/tipos.ts";
import { cartaId, esCardId, paloDe, pieza, rangoDe, type CardId } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { evaluarTantos } from "@eltruco/motor/tantos.ts";

const consigna = { id: "paso", consigna: "Elegí tu respuesta.", pista: "Mirá la muestra." };
const seleccion: Paso = { ...consigna, tipo: "elegir-cartas", minimo: 0, maximo: 3 };
const decision: Paso = { ...consigna, tipo: "decidir-flor" };
const cuenta: Paso = { ...consigna, tipo: "responder-total" };

function elegir(s: SituacionVisible, cartas: readonly CardId[]) {
  return evaluarRespuesta(s, seleccion, { tipo: "elegir-cartas", cartas });
}

function comparacionFija(cartas: readonly [CardId, CardId], muestra: CardId): SituacionVisible {
  const clave = claveSituacion(muestra, cartas);
  return { habilidad: "comparar-cartas", familia: "mesa", id: clave, clave, cartas, muestra, explicacion: "" };
}

test("cada familia genera casos legales y reproducibles, con respuesta confirmada por las reglas", () => {
  assert.ok(familiasPorHabilidad["comparar-cartas"].includes("mismo-numero-distinta-fuerza"));
  for (const [habilidad, familias] of Object.entries(familiasPorHabilidad)) {
    for (const familia of familias) {
      const claves = new Set<string>();
      for (let semilla = 0; semilla < 32; semilla++) {
        const solicitud = { habilidad, familia, semilla, recientes: [] };
        const s = generarSituacion(solicitud);
        const { cartas, muestra } = s;
        const visibles = [...cartas, muestra];
        assert.deepEqual(generarSituacion(solicitud), s);
        assert.deepEqual([s.habilidad, s.familia, s.semilla], [habilidad, familia, semilla]);
        assert.equal(s.clave, claveSituacion(muestra, cartas.toReversed()));
        assert.ok(s.explicacion.length > 0);
        assert.ok(visibles.every(esCardId));
        assert.equal(new Set(visibles).size, visibles.length);
        assert.equal(cartas.length, habilidad === "comparar-cartas" ? 2 : 3);
        claves.add(s.clave);

        if (habilidad === "comparar-cartas") {
          const [a, b] = cartas;
          const fuerza = compararCartas(a, b, muestra);
          const gana = fuerza > 0 ? a : b;
          if (familia === "empate") assert.equal(fuerza, 0);
          else if (familia === "mismo-numero-distinta-fuerza") {
            assert.equal(rangoDe(a), rangoDe(b));
            assert.notEqual(paloDe(a), paloDe(b));
            assert.notEqual(fuerza, 0);
            assert.equal(elegir(s, cartas).correcta, false);
          } else {
            assert.notEqual(fuerza, 0);
            const pierde = gana === a ? b : a;
            assert.equal(Math.sign(rangoDe(gana) - rangoDe(pierde)), familia === "gana-el-mayor" ? 1 : -1);
          }
          assert.ok(elegir(s, fuerza === 0 ? [a, b] : [gana]).correcta);
        } else if (habilidad === "reconocer-piezas") {
          const piezas = cartas.filter((carta) => pieza(carta, muestra) !== null);
          assert.equal(piezas.length > 0, familia === "con-pieza" || familia === "rey-sustituto");
          if (familia.startsWith("rey-")) {
            const rey = cartaId(paloDe(muestra), 12);
            assert.ok(cartas.includes(rey));
            assert.equal(piezas.includes(rey), familia === "rey-sustituto");
          }
          assert.ok(elegir(s, piezas.toReversed()).correcta);
        } else {
          const tantos = evaluarTantos(cartas, muestra);
          const flor = tantos.modalidad === "flor";
          if (habilidad === "reconocer-flor") {
            assert.equal(flor, familia === "flor-con-pieza" || familia === "tres-del-mismo-palo");
            assert.equal(tantos.forma === "una-pieza", familia === "flor-aparente");
            assert.equal(tantos.forma === "tres-del-mismo-palo", familia === "tres-del-mismo-palo");
            assert.ok(evaluarRespuesta(s, decision, { tipo: "decidir-flor", hayFlor: flor }).correcta);
          } else {
            assert.equal(habilidad, `contar-${tantos.modalidad}`);
            if (familia === "selecciones-equivalentes") assert.ok(tantos.desgloses.length > 1);
            else assert.equal(tantos.forma, familia);
            for (const { aportes } of tantos.desgloses) {
              assert.ok(elegir(s, aportes.map(({ carta }) => carta).reverse()).correcta);
            }
            assert.ok(evaluarRespuesta(s, cuenta, { tipo: "responder-total", total: tantos.total }).correcta);
          }
        }
      }
      assert.ok(claves.size >= 16, `Poca variedad en ${habilidad}/${familia}`);
    }
  }
});

test("el 2 de bastos le gana al 2 de oros con muestra de bastos y empatan con muestra de copas", () => {
  const cartas = ["oros-02", "bastos-02"] as const;
  const duelo = comparacionFija(cartas, "bastos-06");
  assert.ok(elegir(duelo, ["bastos-02"]).correcta);
  assert.equal(elegir(duelo, ["oros-02"]).correcta, false);
  const empate = elegir(duelo, cartas);
  assert.equal(empate.correcta, false);
  assert.match(empate.pista!, /bastos/);
  assert.match(empate.pista!, /pieza/);

  const conCopas = comparacionFija(cartas, "copas-06");
  assert.ok(elegir(conCopas, cartas).correcta);
  for (const carta of cartas) assert.equal(elegir(conCopas, [carta]).correcta, false);
});

test("la pista distingue al rey sustituto, una mata frente a una común y el orden entre dos matas", () => {
  for (const [muestra, ganadora, otra, pista] of [
    ["copas-04", "copas-12", "oros-12", /rey.*(ocupa|sustituye)/i],
    ["bastos-06", "oros-07", "copas-07", /matas/],
    ["copas-06", "espadas-01", "bastos-01", /matas/],
  ] as const) {
    const duelo = comparacionFija([otra, ganadora], muestra);
    assert.ok(elegir(duelo, [ganadora]).correcta);
    const error = elegir(duelo, [otra]);
    assert.equal(error.correcta, false);
    assert.match(error.pista!, pista);
    assert.ok(error.pista!.includes(paloDe(ganadora)));
  }
});

test("la alternativa para un caso reciente se reconstruye con su semilla, incluso en el límite uint32", () => {
  for (const [habilidad, familias] of Object.entries(familiasPorHabilidad)) {
    for (const familia of familias) {
      const recientes: string[] = [];
      const ids = new Set<string>();
      for (let i = 0; i < 16; i++) {
        const solicitud = { habilidad, familia, semilla: 0xffffffff, recientes };
        const s = generarSituacion(solicitud);
        assert.ok(!recientes.includes(s.clave));
        assert.ok(!ids.has(s.id));
        assert.deepEqual(generarSituacion({ ...solicitud, semilla: s.semilla, recientes: [] }), s);
        ids.add(s.id);
        recientes.unshift(s.clave);
      }
    }
  }
  assert.notEqual(claveSituacion("oros-02", ["copas-02", "oros-07"]), claveSituacion("copas-02", ["oros-02", "oros-07"]));
});

test("tres piezas por reparto y por construcción al agotarse las ternas disjuntas", () => {
  for (const [semilla, muestra, cartas, total] of [
    [60, "copas-06", ["copas-04", "copas-11", "copas-02"], 46],
    [0, "espadas-03", ["espadas-04", "espadas-11", "espadas-10"], 43],
  ] as const) {
    const s = generarSituacion({ habilidad: "contar-flor", familia: "tres-piezas", semilla, recientes: [] });
    assert.equal(s.muestra, muestra);
    assert.deepEqual(s.cartas, cartas);
    assert.ok(evaluarRespuesta(s, cuenta, { tipo: "responder-total", total }).correcta);
  }
});

test("la rotación de familias ofrece tantos sí como no al reconocer flor o piezas", () => {
  for (const habilidad of ["reconocer-flor", "reconocer-piezas"] as const) {
    const familias = familiasPorHabilidad[habilidad];
    const leccion: Leccion = {
      id: habilidad, titulo: habilidad, capitulo: "reglas", habilidad, familias,
      pasos: [habilidad === "reconocer-flor" ? decision : seleccion],
    };
    const fuente = crearFuenteProgreso(() => undefined);
    let positivos = 0;
    for (let semilla = 0; semilla < familias.length; semilla++) {
      const { situacion } = generarSesion(leccion, semilla, proveedorSituaciones, fuente);
      const { cartas, muestra } = situacion;
      const positivo = habilidad === "reconocer-flor" ? evaluarTantos(cartas, muestra).modalidad === "flor"
        : cartas.some((carta) => pieza(carta, muestra) !== null);
      if (positivo) positivos++;
    }
    assert.equal(positivos, familias.length / 2);
  }
});

test("el runner ofrece empate explícito, conserva la misma mano al pedir pista y después entrega otra", () => {
  const leccion: Leccion = {
    id: "comparacion", titulo: "Comparar cartas", capitulo: "jerarquia", habilidad: "comparar-cartas",
    familias: familiasPorHabilidad["comparar-cartas"],
    pasos: [{ ...consigna, tipo: "elegir-cartas", minimo: 1, maximo: 2 }],
  };
  const fuente = crearFuenteProgreso(() => undefined);
  const sesion = generarSesion(leccion, 2, proveedorSituaciones, fuente);
  const s = sesion.situacion;
  assert.equal(s.familia, "empate");
  assert.equal(sesion.responder({ tipo: "elegir-cartas", cartas: [s.cartas[0]] }).correcta, false);
  assert.match(sesion.pedirPista(), /Empatan/);
  assert.equal(sesion.situacion, s);
  assert.ok(sesion.responder({ tipo: "elegir-cartas", cartas: s.cartas.toReversed() }).correcta);
  assert.ok(sesion.completada);
  assert.notEqual(generarSesion(leccion, 2, proveedorSituaciones, fuente).situacion.clave, s.clave);

  const ganadora = generarSesion(leccion, 0, proveedorSituaciones, fuente);
  assert.equal(ganadora.responder({ tipo: "elegir-cartas", cartas: ganadora.situacion.cartas }).correcta, false);
});

test("la cuenta distingue entre una única carta de mayor valor y dos sietes empatados", () => {
  for (const [familia, semilla, total, explicacion] of [
    ["tres-palos-distintos", 1, 5, "Solo cuenta el 5 de oros, que vale 5."],
    ["selecciones-equivalentes", 3, 7, "Contás una sola carta. Con el 7 de oros o el 7 de copas hacés 7 de envido."],
  ] as const) {
    const s = generarSituacion({ habilidad: "contar-envido", familia, semilla, recientes: [] });
    assert.ok(s.explicacion.endsWith(explicacion));
    assert.deepEqual(evaluarRespuesta(s, cuenta, { tipo: "responder-total", total }), { correcta: true, explicacion });
  }
});

test("las dos parejas empatadas con figuras que aportan cero completan selección y total por separado", () => {
  const leccion: Leccion = {
    id: "tantos", titulo: "Contar envido", capitulo: "envido", habilidad: "contar-envido",
    familias: ["selecciones-equivalentes"], pasos: [seleccion, cuenta],
  };
  const cartas = ["copas-11", "bastos-04", "espadas-12"] as const;
  const situacion: SituacionVisible = {
    habilidad: leccion.habilidad, familia: leccion.familias[0], id: "mesa-1", muestra: "bastos-06", cartas,
    clave: claveSituacion("bastos-06", cartas), explicacion: "El 4 de bastos vale 29 con cualquiera de las dos figuras.",
  };
  for (const figura of [cartas[0], cartas[2]]) {
    const sesion = iniciarSesion(leccion, situacion, evaluarRespuesta, crearFuenteProgreso(() => undefined));
    assert.equal(sesion.responder({ tipo: "elegir-cartas", cartas: [cartas[0], cartas[2]] }).correcta, false);
    assert.match(sesion.pedirPista(), /pieza/);
    const intento = sesion.responder({ tipo: "elegir-cartas", cartas: [figura, "bastos-04"] });
    assert.ok(intento.correcta);
    assert.doesNotMatch(intento.explicacion, /29/);
    assert.equal(sesion.responder({ tipo: "responder-total", total: 4 }).correcta, false);
    assert.match(sesion.pedirPista(), /aporta 29/);
    const resultado = sesion.responder({ tipo: "responder-total", total: 29 });
    assert.ok(resultado.correcta);
    assert.equal(resultado.explicacion,
      "Podés combinar el 4 de bastos con el caballo de copas o el rey de espadas. En ambos casos sumás 29 + 0 = 29.");
    assert.ok(sesion.completada);
  }

  const tresFiguras = { ...situacion, muestra: "oros-06" as const, cartas: ["copas-11", "espadas-12", "bastos-10"] as const };
  for (const figura of tresFiguras.cartas) assert.ok(elegir(tresFiguras, [figura]).correcta);
  assert.equal(elegir(tresFiguras, tresFiguras.cartas).correcta, false);
  assert.equal(evaluarRespuesta(tresFiguras, cuenta, { tipo: "responder-total", total: 0 }).explicacion,
    "Contás una sola carta. Con el caballo de copas, el rey de espadas o la sota de bastos hacés 0 de envido.");
});

test("las pistas atienden al número más alto, al rey sustituto, a la flor aparente y a los 20 de base", () => {
  const generar = (habilidad: string, familia: string) => generarSituacion({ habilidad, familia, semilla: 7, recientes: [] });
  const duelo = generar("comparar-cartas", "gana-el-menor");
  const mayor = duelo.cartas.reduce((a, b) => rangoDe(a) > rangoDe(b) ? a : b);
  assert.match(elegir(duelo, [mayor]).explicacion, /número más alto/);
  const rey = generar("reconocer-piezas", "rey-sustituto");
  assert.match(elegir(rey, []).pista!, /rey/);
  const comun = generar("reconocer-piezas", "rey-comun");
  assert.ok(elegir(comun, []).correcta);
  assert.match(elegir(comun, [cartaId(paloDe(comun.muestra), 12)]).pista!, /rey/);
  const aparente = generar("reconocer-flor", "flor-aparente");
  assert.match(evaluarRespuesta(aparente, decision, { tipo: "decidir-flor", hayFlor: true }).pista!, /otras dos/);
  const flor = generar("contar-flor", "dos-piezas");
  const { total } = evaluarTantos(flor.cartas, flor.muestra);
  assert.match(evaluarRespuesta(flor, cuenta, { tipo: "responder-total", total: total - 20 }).pista!, /20 de base/);
});

test("el generador rechaza semillas inválidas y combinaciones ajenas al catálogo", () => {
  const solicitud = { habilidad: "contar-envido", familia: "una-pieza", semilla: 0, recientes: [] };
  for (const semilla of [-1, 1.5, 2 ** 32]) assert.throws(() => generarSituacion({ ...solicitud, semilla }), /semilla/);
  for (const habilidad of ["comparar-cartas", "inexistente", "constructor"]) {
    assert.throws(() => generarSituacion({ ...solicitud, habilidad }), /Familia/);
  }
});
