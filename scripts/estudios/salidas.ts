import { parseArgs } from "node:util";
import { crearAzar } from "@eltruco/motor/reparto.ts";
import { ganaConCarta } from "../../src/probabilidad/calcular.ts";
import { anotarMundo, crearConteo, intervaloPareado } from "../../src/probabilidad/estadistica.ts";
import { prepararMundos } from "../../src/probabilidad/mundos.ts";
import { aperturaEditorial } from "../../src/probabilidad/perfil.ts";

const cartas = ["copas-02", "bastos-03", "oros-05"] as const;

function estudiar(semillaInicial: number, repartos: number, conDetalle: boolean) {
  const fuente = prepararMundos(aperturaEditorial);
  if (fuente.tipo !== "disponible") throw new Error("La apertura del estudio debe admitir repartos.");
  const conteo = crearConteo(cartas);
  const detalle = [];
  for (let i = 0; i < repartos; i++) {
    const semilla = (semillaInicial + i) >>> 0;
    const mundo = fuente.proponer(crearAzar(semilla));
    if (!mundo) throw new Error("Se esperaba un reparto directo de apertura.");
    const victorias = cartas.map(salida => ganaConCarta(mundo, salida));
    anotarMundo(conteo, victorias);
    if (conDetalle) {
      const manos = [cartas, ...mundo.reparto.manos.slice(1)];
      detalle.push({ semilla, manos, ganaPareja02: victorias });
    }
  }
  const comparaciones = conteo.pares.map(({ i, j, soloA, soloB }) => {
    const diferencia = (soloA - soloB) / repartos;
    const mediaCuadrados = (soloA + soloB) / repartos;
    const errorEstandar = repartos > 1
      ? Math.sqrt((mediaCuadrados - diferencia ** 2) / (repartos - 1))
      : null;
    return { a: cartas[i], b: cartas[j], soloA, soloB, diferencia, errorEstandar,
      intervalo95: intervaloPareado(diferencia, repartos, 1) };
  });
  const salidas = cartas.map((carta, i) => ({
    carta, victorias: conteo.victorias[i], frecuencia: conteo.victorias[i] / repartos,
  }));
  return { semillaInicial, repartos, mano: aperturaEditorial.asiento, muestra: aperturaEditorial.muestra,
    salidas, comparaciones, ...(conDetalle && { detalle }) };
}

function entero(valor: string, nombre: string, minimo: number, maximo: number): number {
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < minimo || numero > maximo) {
    throw new Error(`--${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
  }
  return numero;
}

try {
  const { values } = parseArgs({ options: {
    semilla: { type: "string", default: "29" },
    repartos: { type: "string", default: "20000" },
    detalle: { type: "boolean", default: false },
  } });
  const semilla = entero(values.semilla, "semilla", 0, 2 ** 32 - 1);
  const repartos = entero(values.repartos, "repartos", 1, 2 ** 32);
  console.log(JSON.stringify(estudiar(semilla, repartos, values.detalle), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
