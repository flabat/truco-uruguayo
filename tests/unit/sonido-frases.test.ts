import assert from "node:assert/strict";
import test from "node:test";
import { mazo, type CardId } from "@eltruco/motor/cartas.ts";
import { aDecidir, aplicarOnline, iniciarOnline, repartirOnline } from "@eltruco/motor/mesa-online.ts";
import { legalesOnline, type EstadoOnline } from "@eltruco/motor/cantos-online.ts";
import { textoFrasePie, type FrasePie } from "@eltruco/motor/senas-pie.ts";
import { evaluarTantos } from "@eltruco/motor/tantos.ts";
import {
  clavesDeFrase, clipsDeVoz, frasesDeVoz, numeroEnPalabras, tantosPosibles, textoDeFrase, type CantoVoz, type FraseVoz,
} from "../../app/src/sonido/frases.ts";

const clavesGrabadas = (metodo: "entera" | "partes") => new Set(clipsDeVoz(metodo).map(c => c.clave));
const suena = (frase: FraseVoz, metodo: "entera" | "partes") => {
  const claves = clavesDeFrase(frase, metodo);
  return claves.length > 0 && claves.every(c => clavesGrabadas(metodo).has(c));
};

test("los totales posibles son exactamente los que da el motor", () => {
  const vistos = { envido: new Set<number>(), flor: new Set<number>() };
  for (const muestra of mazo) {
    const resto = mazo.filter(c => c !== muestra);
    for (let i = 0; i < resto.length; i++) for (let j = i + 1; j < resto.length; j++) for (let k = j + 1; k < resto.length; k++) {
      const t = evaluarTantos([resto[i], resto[j], resto[k]] as CardId[], muestra);
      vistos[t.modalidad].add(t.total);
    }
  }
  for (const motivo of ["envido", "flor"] as const) {
    assert.deepEqual([...tantosPosibles[motivo]], [...vistos[motivo]].sort((a, b) => a - b), motivo);
  }
});

test("cada canto legal y cada tanto cobrado en manos al azar tiene su clip", () => {
  const cantos = new Set<CantoVoz>();
  const declaraciones = { envido: 0, flor: 0 };
  for (const cantidad of [2, 4, 6] as const) {
    for (let partida = 0; partida < 300; partida++) {
      let estado: EstadoOnline = iniciarOnline(repartirOnline(cantidad));
      for (let paso = 0; !estado.resultado && paso < 200; paso++) {
        const asiento = aDecidir(estado)[0];
        const legales = legalesOnline(estado, asiento);
        legales.filter(t => t !== "carta").forEach(t => cantos.add(t as CantoVoz));
        const tipo = legales[Math.floor(Math.random() * legales.length)];
        const intentos = tipo === "carta"
          ? estado.mano.reparto.manos[asiento].map(carta => aplicarOnline(estado, { tipo, asiento, carta }))
          : [aplicarOnline(estado, { tipo, asiento })];
        const r = intentos.find(p => p.ok);
        assert.ok(r?.ok, `sin jugada posible para ${tipo}`);
        estado = r.estado;
      }
      assert.ok(estado.resultado, "la mano no terminó");
      for (const cobro of estado.cobros) {
        if (cobro.motivo === "truco" || cobro.tantoGanador === undefined) continue;
        declaraciones[cobro.motivo]++;
        for (const metodo of ["entera", "partes"] as const) {
          assert.ok(suena({ tipo: "tantos", motivo: cobro.motivo, total: cobro.tantoGanador }, metodo),
            `${cobro.tantoGanador} de ${cobro.motivo}`);
        }
      }
      for (const { total } of estado.comparacionFlor?.participantes ?? []) {
        assert.ok(suena({ tipo: "tantos", motivo: "flor", total }, "entera"), `${total} de flor`);
      }
    }
  }
  assert.ok(declaraciones.envido > 20 && declaraciones.flor > 5, JSON.stringify(declaraciones));
  assert.ok(cantos.size >= 10, `pocos cantos vistos: ${[...cantos]}`);
  for (const c of cantos) for (const metodo of ["entera", "partes"] as const) {
    assert.ok(suena({ tipo: "canto", canto: c }, metodo), c);
  }
});

test("las frases del pie y todos los cantos del cliente tienen clip", () => {
  for (const frase of Object.keys(textoFrasePie) as FrasePie[]) assert.ok(suena({ tipo: "pie", frase }, "entera"), frase);
  const tipos: CantoVoz[] = ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor",
    "con-flor-quiero", "con-flor-envido", "contraflor-al-resto", "quiero", "no-quiero", "paso-flor", "mazo"];
  for (const canto of tipos) assert.ok(suena({ tipo: "canto", canto }, "entera"), canto);
});

test("los números de los tantos se dicen en palabras", () => {
  assert.equal(numeroEnPalabras(0), "cero");
  assert.equal(numeroEnPalabras(7), "siete");
  assert.equal(numeroEnPalabras(21), "veintiuno");
  assert.equal(numeroEnPalabras(26), "veintiséis");
  assert.equal(numeroEnPalabras(30), "treinta");
  assert.equal(numeroEnPalabras(33), "treinta y tres");
  assert.equal(numeroEnPalabras(47), "cuarenta y siete");
  assert.throws(() => numeroEnPalabras(15), RangeError);
});

test("los textos son los que se dicen en la mesa", () => {
  assert.equal(textoDeFrase({ tipo: "canto", canto: "truco" }), "¡Truco!");
  assert.equal(textoDeFrase({ tipo: "canto", canto: "quiero" }), "Quiero.");
  assert.equal(textoDeFrase({ tipo: "canto", canto: "mazo" }), "Me voy al mazo.");
  assert.equal(textoDeFrase({ tipo: "canto", canto: "paso-flor" }), "Yo no canto.");
  assert.equal(textoDeFrase({ tipo: "pie", frase: "voy-a-vos" }), "¡Voy a vos!");
  assert.equal(textoDeFrase({ tipo: "tantos", motivo: "envido", total: 33 }), "Treinta y tres de envido.");
});

test("los nombres de los clips son estables, únicos y seguros", () => {
  assert.deepEqual(clavesDeFrase({ tipo: "canto", canto: "real-envido" }), ["real-envido"]);
  assert.deepEqual(clavesDeFrase({ tipo: "pie", frase: "veni" }), ["pie-veni"]);
  assert.deepEqual(clavesDeFrase({ tipo: "tantos", motivo: "envido", total: 33 }, "entera"), ["envido-33"]);
  assert.deepEqual(clavesDeFrase({ tipo: "tantos", motivo: "flor", total: 29 }, "partes"), ["numero-29", "de-flor"]);
  assert.deepEqual(clavesDeFrase({ tipo: "tantos", motivo: "envido", total: 15 }), []);
  for (const metodo of ["entera", "partes"] as const) {
    const claves = clipsDeVoz(metodo).map(c => c.clave);
    assert.equal(new Set(claves).size, claves.length);
    for (const clave of claves) assert.match(clave, /^[a-z0-9-]+$/);
  }
  assert.equal(clipsDeVoz("entera").length, 14 + 3 + 26 + 28);
  assert.equal(frasesDeVoz().length, 14 + 3 + 26 + 28);
});
