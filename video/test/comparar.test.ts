import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { explicarSituacion } from "../../src/aprendizaje/generadores/evaluacion.ts";
import { familiasPorHabilidad } from "../../src/aprendizaje/generadores/familias.ts";
import { cartasPorId } from "../../src/lib/cartas.ts";
import { mazo, rangoDe, type CardId } from "../../src/motor/cartas.ts";
import { leerEpisodio, resolverVueltas, vueltaDe, type EpisodioComparar } from "../src/lib/episodio.ts";
import { guionCompararCartas, idsCompararCartas, veredicto } from "../src/plantillas/comparar-cartas/guion.ts";

const ep: EpisodioComparar = {
  plantilla: "comparar-cartas", serie: "comparar-cartas", id: "01", muestra: "bastos-06",
  gancho: "¿Cuál gana la vuelta?",
  vueltas: [["bastos-02", "espadas-01"], ["espadas-07", "copas-07"], ["oros-03", "copas-03"]],
};
/** La explicación del aprendizaje nombra primero a la ganadora: «En esta vuelta, el 2 de bastos tiene más fuerza…». */
const ganadoraSegunExplicacion = (cartas: [CardId, CardId], muestra: CardId) => {
  const explicacion = explicarSituacion("comparar-cartas", cartas, muestra);
  if (/misma fuerza/.test(explicacion)) return null;
  return cartas.find((c) => explicacion.startsWith(
    `En esta vuelta, ${rangoDe(c) === 10 ? "la" : "el"} ${cartasPorId.get(c)!.nombre.toLowerCase()} tiene más fuerza`)) ?? "desconocida";
};
const guion = (e: EpisodioComparar) => guionCompararCartas(e, resolverVueltas(e));
const texto = (e: EpisodioComparar, id: string) => guion(e).find((l) => l.id === id)?.texto;

test("el guion sigue la progresión pieza, mata y parda", () => {
  assert.equal(texto(ep, "pregunta"), "¿Cuál gana la vuelta? La muestra es el seis de bastos.");
  assert.equal(texto(ep, "vuelta1"), "Dos de bastos contra as de espadas. ¿Cuál gana?");
  assert.equal(texto(ep, "respuesta1"),
    "Gana el dos de bastos. El dos de bastos es pieza, porque es del palo de la muestra. Las piezas les ganan hasta a las matas.");
  assert.equal(texto(ep, "respuesta2"),
    "Gana el siete de espadas. El siete de espadas es mata. Las matas les ganan a todas las cartas comunes.");
  assert.equal(texto(ep, "respuesta3"), "Parda. Con esta muestra, el tres de oros y el tres de copas tienen la misma fuerza.");
  assert.match(texto(ep, "escala")!, /^Primero las piezas, después las matas, y después tres, dos, as, rey, caballo, sota, siete, seis, cinco y cuatro\./);
});

test("líneas y pausas siguen la cantidad de vueltas", () => {
  assert.deepEqual(guion(ep).map((l) => l.id), idsCompararCartas(3));
  assert.deepEqual(guion(ep).filter((l) => l.pausa).map((l) => l.id), ["vuelta1", "vuelta2", "vuelta3"]);
  const dos = { ...ep, vueltas: ep.vueltas.slice(0, 2) };
  assert.deepEqual(guion(dos).map((l) => l.id), ["pregunta", "vuelta1", "respuesta1", "vuelta2", "respuesta2", "escala", "cierre"]);
});

test("el mismo número: gana la pieza y la otra es común", () => {
  const v = vueltaDe(["oros-04", "bastos-04"], "bastos-06");
  assert.equal(v.ganadora, "bastos-04");
  const e = { ...ep, vueltas: [["oros-04", "bastos-04"], ep.vueltas[2]] } as EpisodioComparar;
  assert.equal(texto(e, "respuesta1"),
    "Gana el cuatro de bastos. El cuatro de bastos es pieza, porque es del palo de la muestra. El cuatro de oros es una carta común.");
});

test("el rey que sustituye a la pieza de muestra", () => {
  const e = { ...ep, muestra: "copas-04", vueltas: [["copas-12", "espadas-01"], ["copas-12", "copas-05"]] } as EpisodioComparar;
  assert.equal(texto(e, "respuesta1"),
    "Gana el rey de copas. Es pieza. El rey de copas ocupa el lugar del cuatro, que salió de muestra. Las piezas les ganan hasta a las matas.");
  assert.match(texto(e, "respuesta2")!, /^Gana el rey de copas\. Las dos son piezas\. El rey de copas ocupa el lugar del cuatro\./);
});

test("el número más alto puede perder", () => {
  const e = { ...ep, vueltas: [["oros-12", "copas-03"], ["espadas-10", "oros-11"]] } as EpisodioComparar;
  assert.equal(texto(e, "respuesta1"),
    "Gana el tres de copas. Ninguna es pieza ni mata. En la escala, el tres va antes que el rey. El número más alto no siempre gana.");
  assert.equal(texto(e, "respuesta2"),
    "Gana el caballo de oros. Ninguna es pieza ni mata. En la escala, el caballo va antes que la sota.");
});

test("toda vuelta de cada familia tiene veredicto del motor y texto completo", () => {
  for (const familia of familiasPorHabilidad["comparar-cartas"]) {
    for (const muestra of ["bastos-06", "copas-04", "espadas-01", "oros-10"] as CardId[]) {
      for (let semilla = 1; semilla <= 8; semilla++) {
        const e = { ...ep, muestra, vueltas: [{ familia, semilla }, { familia, semilla: semilla + 100 }] };
        const vueltas = resolverVueltas(e);
        for (const v of vueltas) {
          assert.equal(v.ganadora, ganadoraSegunExplicacion(v.cartas, muestra));
          if (familia === "empate") assert.equal(v.ganadora, null);
        }
        for (const linea of guionCompararCartas(e, vueltas)) {
          assert.ok(!/undefined|NaN|\d/.test(linea.texto), `${familia}/${muestra}/${semilla}/${linea.id}: ${linea.texto}`);
        }
      }
    }
  }
});

test("veredicto y ganadora coinciden con explicarSituacion en todos los pares", () => {
  const muestra: CardId = "oros-05";
  const cartas = mazo.filter((c) => c !== muestra);
  for (let i = 0; i < cartas.length; i++) {
    for (let j = i + 1; j < cartas.length; j++) {
      const v = vueltaDe([cartas[i], cartas[j]], muestra);
      assert.equal(v.ganadora, ganadoraSegunExplicacion(v.cartas, muestra), v.cartas.join(" "));
      assert.equal(veredicto(v), v.ganadora === null ? "Parda." : `Gana ${rangoDe(v.ganadora) === 10 ? "la" : "el"} ${veredicto(v).split(" ").slice(2).join(" ")}`);
    }
  }
});

test("una respuesta reescrita con otra ganadora falla", () => {
  assert.throws(() => guion({ ...ep, lineas: { respuesta1: "Gana el as de espadas. Es mata." } }), /el motor da «Gana el dos de bastos»/);
  assert.throws(() => guion({ ...ep, lineas: { respuesta3: "Gana el tres de oros." } }), /el motor da «Parda»/);
  assert.equal(texto({ ...ep, lineas: { respuesta1: "Gana el dos de bastos. La pieza manda." } }, "respuesta1"),
    "Gana el dos de bastos. La pieza manda.");
});

test("una línea reescrita no puede nombrar cartas fuera de la vuelta", () => {
  assert.throws(() => guion({ ...ep, lineas: { vuelta1: "Dos de bastos contra as de oros. ¿Cuál gana?" } }), /as de oros/);
  assert.throws(() => guion({ ...ep, lineas: { saludo: "Hola." } }), /Línea desconocida: saludo/);
  assert.ok(!guion({ ...ep, lineas: { escala: null } }).some((l) => l.id === "escala"));
});

test("las vueltas no aceptan la muestra ni dos cartas iguales", () => {
  assert.throws(() => resolverVueltas({ ...ep, vueltas: [["bastos-06", "oros-03"], ep.vueltas[1]] }), /muestra/);
  assert.throws(() => resolverVueltas({ ...ep, vueltas: [["oros-03", "oros-03"], ep.vueltas[1]] }), /distintas/);
  assert.throws(() => resolverVueltas({ ...ep, vueltas: [{ familia: "una-pieza", semilla: 1 }, ep.vueltas[1]] }), /no sirve para comparar/);
});

test("lee un episodio de comparar-cartas", () => {
  const ruta = path.join(mkdtempSync(path.join(tmpdir(), "episodio-")), "ep.yaml");
  writeFileSync(ruta, `plantilla: comparar-cartas
serie: comparar-cartas
id: "01"
muestra: bastos-06
gancho: "¿Cuál gana la vuelta?"
vueltas:
  - [bastos-02, espadas-01]
  - [espadas-07, copas-07]
  - { familia: empate, semilla: 3 }
`);
  const leido = leerEpisodio(ruta);
  assert.equal(leido.plantilla, "comparar-cartas");
  writeFileSync(ruta, `plantilla: comparar-cartas
serie: s
id: "1"
muestra: bastos-06
gancho: g
vueltas:
  - [bastos-02, espadas-01, oros-03]
  - [espadas-07, copas-07]
`);
  assert.throws(() => leerEpisodio(ruta), /vueltas\.0/);
});

test("los episodios de la serie se leen y dan un guion", () => {
  const carpeta = path.join(import.meta.dirname, "..", "episodios", "comparar-cartas");
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".yaml"));
  assert.ok(archivos.length >= 1);
  for (const archivo of archivos) {
    const leido = leerEpisodio(path.join(carpeta, archivo));
    assert.equal(leido.plantilla, "comparar-cartas", archivo);
    if (leido.plantilla === "comparar-cartas") assert.ok(guion(leido).length > 0);
  }
});
