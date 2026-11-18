import { cartaId, mazo, paloDe, pieza, rangoDe, type CardId } from "../../motor/cartas.ts";
import { compararCartas } from "../../motor/jerarquia.ts";
import { evaluarTantos } from "../../motor/tantos.ts";

export const familiasPorHabilidad = {
  "comparar-cartas": ["gana-el-mayor", "gana-el-menor", "empate", "mismo-numero-distinta-fuerza"],
  "reconocer-piezas": ["con-pieza", "sin-pieza", "rey-sustituto", "rey-comun"],
  "reconocer-flor": ["tres-del-mismo-palo", "sin-flor", "flor-con-pieza", "flor-aparente"],
  "contar-envido": ["dos-del-mismo-palo", "tres-palos-distintos", "una-pieza", "selecciones-equivalentes"],
  "contar-flor": ["tres-del-mismo-palo", "una-pieza-y-dos-del-mismo-palo", "dos-piezas", "tres-piezas"],
} as const;

export type Habilidad = keyof typeof familiasPorHabilidad;
export type Familia = (typeof familiasPorHabilidad)[Habilidad][number];

export function esFamiliaDe(habilidad: string, familia: string): familia is Familia {
  return Object.hasOwn(familiasPorHabilidad, habilidad) &&
    familiasPorHabilidad[habilidad as Habilidad].some((opcion) => opcion === familia);
}

const muestrasConReySustituto = mazo.filter((muestra) => pieza(cartaId(paloDe(muestra), 12), muestra) !== null);
const muestrasConReyComun = mazo.filter((muestra) => rangoDe(muestra) !== 12 && !muestrasConReySustituto.includes(muestra));

export function muestrasDe(familia: Familia): readonly CardId[] {
  if (familia === "rey-sustituto") return muestrasConReySustituto;
  if (familia === "rey-comun") return muestrasConReyComun;
  return mazo;
}

export function pertenece(familia: Familia, cartas: readonly CardId[], muestra: CardId): boolean {
  switch (familia) {
    case "gana-el-mayor":
    case "gana-el-menor":
    case "mismo-numero-distinta-fuerza":
    case "empate": {
      const [a, b] = cartas;
      const fuerza = compararCartas(a, b, muestra);
      if (familia === "empate") return fuerza === 0;
      if (familia === "mismo-numero-distinta-fuerza") return rangoDe(a) === rangoDe(b) && fuerza !== 0;
      const coincideConElNumero = fuerza * (rangoDe(a) - rangoDe(b));
      return familia === "gana-el-mayor" ? coincideConElNumero > 0 : coincideConElNumero < 0;
    }
    case "con-pieza": return cartas.some((carta) => pieza(carta, muestra) !== null);
    case "sin-pieza": return cartas.every((carta) => pieza(carta, muestra) === null);
    case "rey-sustituto": return cartas.some((carta) => rangoDe(carta) === 12 && pieza(carta, muestra) !== null);
    case "rey-comun": return cartas.includes(cartaId(paloDe(muestra), 12)) &&
      cartas.every((carta) => pieza(carta, muestra) === null);
  }

  const tantos = evaluarTantos(cartas, muestra);
  switch (familia) {
    case "sin-flor": return tantos.modalidad === "envido" && tantos.forma !== "una-pieza";
    case "flor-con-pieza": return tantos.modalidad === "flor" && tantos.forma !== "tres-del-mismo-palo";
    // La pieza puede completar un palo, pero las otras dos son de palos distintos.
    case "flor-aparente": return tantos.forma === "una-pieza";
    case "selecciones-equivalentes": return tantos.modalidad === "envido" && tantos.desgloses.length > 1;
    default: return tantos.forma === familia;
  }
}
