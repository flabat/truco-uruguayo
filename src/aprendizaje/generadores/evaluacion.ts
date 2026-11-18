import { cartasPorId } from "../../lib/cartas.ts";
import { pieza, rangoDe, type CardId } from "../../motor/cartas.ts";
import { compararCartas } from "../../motor/jerarquia.ts";
import { evaluarTantos, type ResultadoTantos } from "../../motor/tantos.ts";
import type { Evaluacion, Paso, Respuesta, SituacionVisible } from "../tipos.ts";

const lista = new Intl.ListFormat("es-UY");

function nombre(carta: CardId): string {
  return cartasPorId.get(carta)!.nombre.toLowerCase();
}

function conArticulo(carta: CardId): string {
  return `${rangoDe(carta) === 10 ? "la" : "el"} ${nombre(carta)}`;
}

function masFuertes(cartas: readonly CardId[], muestra: CardId): readonly CardId[] {
  const [a, b] = cartas;
  if (cartas.length !== 2) throw new RangeError("Se necesitan dos cartas para comparar su fuerza.");
  const orden = compararCartas(a, b, muestra);
  if (orden === 0) return cartas;
  return [orden > 0 ? a : b];
}

function explicarPiezas(cartas: readonly CardId[], muestra: CardId): string {
  const piezas = cartas.filter((carta) => pieza(carta, muestra) !== null);
  if (!piezas.length) {
    return `Ninguna de estas cartas es pieza con la muestra de ${nombre(muestra)}.`;
  }
  const explicacion = piezas.map((carta) => rangoDe(carta) === 12
    ? `${conArticulo(carta)} sustituye la pieza que salió de muestra (${nombre(muestra)})`
    : `${conArticulo(carta)} es pieza del palo de la muestra`).join(" y ");
  return `En esta mano, ${explicacion}.`;
}

const motivo: Record<ResultadoTantos["forma"], string> = {
  "tres-del-mismo-palo": "Hay flor porque las tres cartas son del mismo palo.",
  "una-pieza-y-dos-del-mismo-palo": "Hay flor porque la pieza acompaña a dos cartas de un mismo palo.",
  "dos-piezas": "Hay flor porque dos piezas completan el palo de la tercera carta.",
  "tres-piezas": "Las tres piezas forman flor.",
  "una-pieza": "Hay envido porque las dos cartas que acompañan a la pieza son de palos distintos.",
  "dos-del-mismo-palo": "Hay envido porque solo dos cartas comparten palo y ninguna es pieza.",
  "tres-palos-distintos": "Hay envido porque las tres cartas son de palos distintos y ninguna es pieza.",
};

function cuenta(tantos: ResultadoTantos): string {
  return tantos.desgloses.map(({ base, aportes }) => {
    const sumandos = aportes.map(({ tantos }) => tantos);
    if (base) sumandos.unshift(base);
    const valores = aportes.map(({ carta, tantos }) => `${nombre(carta)} (${tantos})`).join(", ");
    if (sumandos.length === 1) return `Solo cuenta ${conArticulo(aportes[0].carta)}, que vale ${tantos.total}.`;
    return `Con ${valores} se obtiene ${sumandos.join(" + ")} = ${tantos.total}.`;
  }).join(" ");
}

export function explicarSituacion(habilidad: string, cartas: readonly CardId[], muestra: CardId): string {
  if (habilidad === "reconocer-piezas") return explicarPiezas(cartas, muestra);
  if (habilidad === "comparar-cartas") {
    const fuertes = masFuertes(cartas, muestra);
    if (fuertes.length === 2) return `Con esta muestra, ${conArticulo(cartas[0])} y ${conArticulo(cartas[1])} tienen la misma fuerza.`;
    const ganadora = fuertes[0];
    const otra = cartas.find((carta) => carta !== ganadora)!;
    const resultado = `En esta vuelta, ${conArticulo(ganadora)} tiene más fuerza que ${conArticulo(otra)}.`;
    return pieza(ganadora, muestra) === null ? resultado : `${resultado} ${explicarPiezas([ganadora], muestra)}`;
  }
  const tantos = evaluarTantos(cartas, muestra);
  return habilidad === "reconocer-flor" ? motivo[tantos.forma] : `${motivo[tantos.forma]} ${cuenta(tantos)}`;
}

function mismaSeleccion(respuesta: readonly CardId[], esperada: readonly CardId[]): boolean {
  return respuesta.length === esperada.length && esperada.every((carta) => respuesta.includes(carta));
}

function error(explicacion: string, pista: string): Evaluacion {
  return { correcta: false, explicacion, pista };
}

function evaluarFuerza(cartas: readonly CardId[], muestra: CardId, elegidas: readonly CardId[]): Evaluacion {
  const fuertes = masFuertes(cartas, muestra);
  if (mismaSeleccion(elegidas, fuertes)) {
    return { correcta: true, explicacion: explicarSituacion("comparar-cartas", cartas, muestra) };
  }
  if (fuertes.length === 2) return error("Revisá si una supera a la otra.", "Si ocupan el mismo puesto, elegí «Empatan».");
  const pista = cartas.some((carta) => pieza(carta, muestra) !== null)
    ? "Mirá cuál es pieza y qué lugar ocupa entre las piezas."
    : "Consultá primero las matas y después el orden de las cartas comunes.";
  const eligioMayor = elegidas.length === 1 && rangoDe(elegidas[0]) > rangoDe(fuertes[0]);
  return error(eligioMayor ? "El número más alto puede perder la vuelta." : "Compará sus puestos en la jerarquía.", pista);
}

function evaluarPiezas(cartas: readonly CardId[], muestra: CardId, elegidas: readonly CardId[]): Evaluacion {
  const piezas = cartas.filter((carta) => pieza(carta, muestra) !== null);
  if (mismaSeleccion(elegidas, piezas)) return { correcta: true, explicacion: explicarPiezas(cartas, muestra) };
  if (cartas.some((carta) => rangoDe(carta) === 12 && piezas.includes(carta) !== elegidas.includes(carta))) {
    return error("Revisá si el rey sustituye a la muestra.", "El rey del mismo palo ocupa su lugar solo si se dio vuelta una pieza.");
  }
  return error("Revisá cuáles son piezas.", "Buscá el 2, el 4, el 5, el caballo y la sota del palo de la muestra.");
}

function pistaSeleccion(tantos: ResultadoTantos): string {
  if (tantos.modalidad === "flor") return "En una flor se cuentan las tres cartas, incluso una figura que aporte cero.";
  if (tantos.forma === "una-pieza") return "Elegí la pieza y la carta que más tantos le agrega.";
  if (tantos.forma === "dos-del-mismo-palo") return "Buscá las dos cartas del mismo palo, aunque una aporte cero.";
  return "Con tres palos distintos, elegí una sola carta de mayor valor para el envido.";
}

function evaluarTotal(tantos: ResultadoTantos, total: number): Evaluacion {
  if (total === tantos.total) return { correcta: true, explicacion: cuenta(tantos) };
  const { base, aportes } = tantos.desgloses[0];
  if ((base && total === tantos.total - 20) || total === tantos.total + 20) {
    const pista = base ? "Contá los 20 de base una sola vez." : "Esta cuenta se hace sin sumar una base de 20.";
    return error("Revisá los 20 de base.", pista);
  }
  const efectiva = aportes.find((aporte) => aporte.pieza !== null);
  if (efectiva) {
    return error("Revisá cuánto aporta la pieza.", `En esta cuenta ${conArticulo(efectiva.carta)} aporta ${efectiva.tantos}.`);
  }
  if (aportes.some(({ tantos }) => tantos === 0)) {
    return error("Revisá el valor de las figuras.", "Cada figura común que entra en la cuenta aporta cero.");
  }
  return error("Volvé a sumar los aportes.", pistaSeleccion(tantos));
}

/** La misma corrección sirve para un ejercicio generado o para las cartas visibles de la mesa. */
export function evaluarRespuesta(
  { habilidad, cartas, muestra }: SituacionVisible, paso: Paso, respuesta: Respuesta,
): Evaluacion {
  if (paso.tipo !== respuesta.tipo) throw new Error("La respuesta no corresponde al paso.");
  if (respuesta.tipo === "elegir-cartas") {
    if (habilidad === "comparar-cartas") return evaluarFuerza(cartas, muestra, respuesta.cartas);
    if (habilidad === "reconocer-piezas") return evaluarPiezas(cartas, muestra, respuesta.cartas);
  }
  if (habilidad === "reconocer-flor" || habilidad === "contar-flor" || habilidad === "contar-envido") {
    const tantos = evaluarTantos(cartas, muestra);
    if (respuesta.tipo === "decidir-flor") {
      if (respuesta.hayFlor === (tantos.modalidad === "flor")) return { correcta: true, explicacion: motivo[tantos.forma] };
      const pista = tantos.forma === "una-pieza" || tantos.forma === "una-pieza-y-dos-del-mismo-palo"
        ? "Apartá la pieza y compará los palos de las otras dos cartas."
        : "Identificá las piezas y mirá cuántos palos quedan entre las cartas comunes.";
      return error("Revisá cómo se combinan los palos y las piezas.", pista);
    }
    if (habilidad === `contar-${tantos.modalidad}`) {
      if (respuesta.tipo === "responder-total") return evaluarTotal(tantos, respuesta.total);
      const elegidas = respuesta.cartas;
      const correcta = tantos.desgloses.some(({ aportes }) => mismaSeleccion(elegidas, aportes.map(({ carta }) => carta)));
      return correcta ? { correcta, explicacion: `Se cuenta con ${lista.format(elegidas.map(conArticulo))}.` }
        : error("Revisá qué cartas entran en la cuenta.", pistaSeleccion(tantos));
    }
  }
  throw new Error("El paso no corresponde a la habilidad y las cartas de esta situación.");
}
