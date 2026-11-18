import { esCardId, paloDe, pieza, rangoDe, type CardId, type RangoPieza } from "./cartas.ts";

const valorPiezaEnEnvido: Record<RangoPieza, number> = { 2: 30, 4: 29, 5: 28, 11: 27, 10: 27 };
const formasDeFlor = [
  "tres-del-mismo-palo", "una-pieza-y-dos-del-mismo-palo", "dos-piezas", "tres-piezas",
] as const;

type Clase =
  | { modalidad: "flor"; forma: (typeof formasDeFlor)[number] }
  | { modalidad: "envido"; forma: "una-pieza" | "dos-del-mismo-palo" | "tres-palos-distintos" };

export interface Aporte {
  carta: CardId;
  pieza: RangoPieza | null;
  tantos: number;
}

export interface Desglose {
  base: 0 | 20;
  aportes: Aporte[];
}

export type ResultadoTantos = Clase & { total: number; desgloses: Desglose[] };

function contar(clase: Clase, base: 0 | 20, selecciones: Aporte[][]): ResultadoTantos {
  const cuentas = selecciones.map((aportes) => ({
    total: aportes.reduce<number>((suma, aporte) => suma + aporte.tantos, base),
    desglose: { base, aportes },
  }));
  const total = Math.max(...cuentas.map((cuenta) => cuenta.total));
  const desgloses = cuentas.filter((cuenta) => cuenta.total === total).map((cuenta) => cuenta.desglose);
  return { ...clase, total, desgloses };
}

/** Cada desglose contiene exactamente las cartas de una selección óptima, incluidas las que aportan cero. */
export function evaluarTantos(cartas: readonly CardId[], muestra: CardId): ResultadoTantos {
  const visibles = [muestra, ...cartas];
  if (cartas.length !== 3 || !visibles.every(esCardId) || new Set(visibles).size !== 4) {
    throw new RangeError("Se necesitan tres cartas jugables y una muestra, todas distintas.");
  }

  const mano = cartas.map((carta) => {
    const efectiva = pieza(carta, muestra);
    const rango = rangoDe(carta);
    const valorComun = rango <= 7 ? rango : 0;
    return { carta, pieza: efectiva, tantos: efectiva === null ? valorComun : valorPiezaEnEnvido[efectiva] };
  });
  const piezas = mano.filter((aporte) => aporte.pieza !== null);
  const comunes = mano.filter((aporte) => aporte.pieza === null);
  const palosComunes = new Set(comunes.map(({ carta }) => paloDe(carta)));

  // Las piezas completan cualquier palo. Las tres piezas también forman flor por sí solas.
  if (palosComunes.size <= 1) {
    const flor = mano.map((aporte) =>
      aporte.pieza === null ? aporte : { ...aporte, tantos: aporte.tantos - 20 },
    );
    return contar({ modalidad: "flor", forma: formasDeFlor[piezas.length] }, 20, [flor]);
  }
  if (piezas.length === 1) {
    const pares = comunes.map((comun) => [piezas[0], comun]);
    return contar({ modalidad: "envido", forma: "una-pieza" }, 0, pares);
  }
  if (palosComunes.size === 2) {
    const par = comunes.filter(({ carta }) =>
      comunes.some((otra) => otra.carta !== carta && paloDe(otra.carta) === paloDe(carta)),
    );
    return contar({ modalidad: "envido", forma: "dos-del-mismo-palo" }, 20, [par]);
  }
  return contar({ modalidad: "envido", forma: "tres-palos-distintos" }, 0, comunes.map((comun) => [comun]));
}
