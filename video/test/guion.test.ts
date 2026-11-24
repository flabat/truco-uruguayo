import assert from "node:assert/strict";
import test from "node:test";
import { familiasPorHabilidad } from "../../src/aprendizaje/generadores/familias.ts";
import { generarMano, resolverManos, type Episodio } from "../src/lib/episodio.ts";
import { guionContarTantos, idsContarTantos } from "../src/plantillas/contar-tantos/guion.ts";

const envido: Episodio = {
  plantilla: "contar-tantos", serie: "contar-envido", id: "03", modalidad: "envido", muestra: "espadas-03",
  gancho: "¿Cuánto tenés de envido?",
  manos: [["oros-05", "oros-07", "copas-02"], { cambio: { de: "oros-05", a: "espadas-05" } }, ["copas-01", "oros-06", "bastos-11"]],
};
const flor: Episodio = {
  ...envido, serie: "contar-flor", modalidad: "flor", gancho: "Contá esta flor.",
  manos: [["oros-07", "oros-04", "oros-12"], { cambio: { de: "oros-12", a: "espadas-11" } }, ["espadas-02", "espadas-05", "bastos-06"]],
};
const texto = (ep: Episodio, id: string) => guionContarTantos(ep, resolverManos(ep)).find((l) => l.id === id)?.texto;

test("el guion de envido 03 da los totales del motor", () => {
  assert.equal(texto(envido, "pregunta"), "¿Cuánto tenés de envido? La muestra es el tres de espadas.");
  assert.equal(texto(envido, "cartas"), "Cinco y siete de oros, y dos de copas. ¿Cuánto cantás?");
  assert.match(texto(envido, "respuesta1")!, /^Treinta y dos\. /);
  assert.equal(texto(envido, "cambio"), "Cambiá el cinco de oros por el cinco de espadas. Ahora es pieza. ¿Cuánto te da?");
  assert.match(texto(envido, "respuesta2")!, /^Treinta y cinco\. /);
  assert.match(texto(envido, "tercera")!, /^As de copas, seis de oros y caballo de bastos\. Tres palos distintos\. Te quedás con el seis\./);
});

test("el guion de flor 03 cuenta las tres cartas", () => {
  assert.match(texto(flor, "respuesta1")!, /^Treinta y uno\. /);
  assert.match(texto(flor, "respuesta2")!, /^Treinta y ocho\. /);
  assert.equal(texto(flor, "tercera"), "Dos y cinco de espadas, y seis de bastos. ¿Cuánto da esta flor?");
  assert.match(texto(flor, "respuesta3")!, /^Cuarenta y cuatro\. /);
});

test("las líneas siguen el orden de la plantilla", () => {
  assert.deepEqual(guionContarTantos(envido, resolverManos(envido)).map((l) => l.id), [...idsContarTantos("envido")]);
  assert.deepEqual(guionContarTantos(flor, resolverManos(flor)).map((l) => l.id), [...idsContarTantos("flor")]);
});

test("las pausas caen en cartas y cambio", () => {
  const pausas = (ep: Episodio) => guionContarTantos(ep, resolverManos(ep)).filter((l) => l.pausa).map((l) => l.id);
  assert.deepEqual(pausas(envido), ["cartas", "cambio"]);
  assert.deepEqual(pausas(flor), ["cartas", "cambio", "tercera"]);
});

test("cada forma tiene explicación", () => {
  for (const ep of [envido, flor]) {
    const familias = familiasPorHabilidad[ep.modalidad === "envido" ? "contar-envido" : "contar-flor"];
    for (const familia of familias) {
      for (let semilla = 1; semilla <= 5; semilla++) {
        const [a, b] = resolverManos(ep);
        const tercera = generarMano(familia, ep.muestra, semilla, ep.modalidad);
        for (const linea of guionContarTantos(ep, [a, b, tercera])) {
          assert.ok(linea.texto.length > 0 && !/undefined|NaN/.test(linea.texto), `${familia}/${semilla}/${linea.id}: ${linea.texto}`);
        }
      }
    }
  }
});

test("un override con total equivocado falla", () => {
  const ep = { ...envido, lineas: { respuesta1: "Treinta. Veinte más diez." } };
  assert.throws(() => guionContarTantos(ep, resolverManos(ep)), /motor da 32/);
});

test("un override correcto reemplaza el texto", () => {
  const ep = { ...envido, lineas: { respuesta1: "Treinta y dos. Son veinte por los oros, más cinco, más siete." } };
  assert.equal(texto(ep, "respuesta1"), "Treinta y dos. Son veinte por los oros, más cinco, más siete.");
});

test("null quita la línea y un id desconocido falla", () => {
  assert.equal(texto({ ...envido, lineas: { valores: null } }, "valores"), undefined);
  assert.throws(() => texto({ ...envido, lineas: { despedida: "Chau." } }, "cierre"), /Línea desconocida: despedida/);
});

test("la flor con piezas nombra bien la sota y las cartas comunes", () => {
  const conTercera = (cartas: string[]) => ({ ...flor, manos: [flor.manos[0], flor.manos[1], cartas] }) as Episodio;
  assert.equal(texto(conTercera(["espadas-05", "espadas-02", "bastos-02"]), "respuesta3"),
    "Cuarenta. Contá veinte una sola vez. Sumale ocho del cinco, diez del dos y el dos de bastos.");
  assert.equal(texto(conTercera(["bastos-10", "espadas-10", "bastos-06"]), "respuesta3"),
    "Treinta y tres. Contá veinte una sola vez. Sumale siete de la sota y el seis de bastos. La sota de bastos vale cero.");
});

test("la tercera mano de envido dice el total", () => {
  const ep = { ...envido, manos: [envido.manos[0], envido.manos[1], ["copas-05", "copas-11", "oros-03"]] } as Episodio;
  assert.equal(texto(ep, "tercera"),
    "Cinco y caballo de copas, y tres de oros. Veinte por el palo, más cinco. El caballo de copas vale cero. El tres de oros queda afuera. En total, veinticinco.");
});
