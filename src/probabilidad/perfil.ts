import type { PosicionPublicaV1 } from "./informacion.ts";
import { clavePosicion, leerPosicion } from "./informacion.ts";
import { resumir, type Conteo, type Fila, type Metodo, type Par } from "./estadistica.ts";

export type Perfil = "apertura-20000-v1" | "segunda-exacta-v1" | "practica-v1";
export const semillaAnalisis = 29;
export const versionMotorPractica = "mano-v1";
export const versionModeloPractica = "bot-v1";
export interface ResultadoCompleto {
  tipo: "completo";
  version: 1;
  clave: string;
  perfil: Perfil;
  metodo: Metodo;
  semilla: number | null;
  mundos: number;
  propuestas: number | null;
  filas: Fila[];
  pares: Par[];
}
export type ResultadoAnalisis = ResultadoCompleto |
  { tipo: "entrada-invalida" | "fuera-de-turno" | "mano-terminada" | "incompatible" } |
  { tipo: "presupuesto-agotado"; mundos: number; propuestas: number };

// Las escenas se reconocen exclusivamente por la información disponible en el turno.
export const aperturaEditorial: PosicionPublicaV1 = {
  version: 1, asiento: 0, dador: 3, muestra: "copas-06",
  cartas: ["oros-05", "copas-02", "bastos-03"], jugadas: [],
};
export const segundaEditorial: PosicionPublicaV1 = {
  ...aperturaEditorial, cartas: ["oros-05", "copas-02"],
  jugadas: [
    { asiento: 0, carta: "bastos-03" }, { asiento: 1, carta: "copas-11" },
    { asiento: 2, carta: "espadas-04" }, { asiento: 3, carta: "oros-04" },
    { asiento: 1, carta: "oros-06" }, { asiento: 2, carta: "copas-03" },
    { asiento: 3, carta: "copas-05" },
  ],
};
const claveApertura = clavePosicion(aperturaEditorial);
const claveSegunda = clavePosicion(segundaEditorial);

function perfilDeClave(clave: string): Perfil {
  if (clave === claveApertura) return "apertura-20000-v1";
  if (clave === claveSegunda) return "segunda-exacta-v1";
  return "practica-v1";
}
export function perfilAnalisis(posicion: PosicionPublicaV1): Perfil {
  return perfilDeClave(clavePosicion(posicion));
}
export function claveAnalisis(posicion: PosicionPublicaV1): string {
  const clave = clavePosicion(posicion);
  return ["probabilidad-v1", versionMotorPractica, versionModeloPractica, perfilDeClave(clave), clave].join("/");
}

export function resultadoCompleto(posicion: PosicionPublicaV1, conteo: Conteo,
  metodo: Metodo, propuestas: number | null): ResultadoCompleto {
  return {
    tipo: "completo", version: 1, clave: claveAnalisis(posicion), perfil: perfilAnalisis(posicion),
    metodo, semilla: metodo === "estimado" ? semillaAnalisis : null, mundos: conteo.mundos,
    propuestas, ...resumir(conteo, metodo),
  };
}

/** Referencias fijadas en ADR 3 y verificadas contra el cálculo vivo y dos oráculos. */
export function referenciaEditorial(entrada: unknown): ResultadoCompleto | null {
  const posicion = leerPosicion(entrada);
  if (!posicion) return null;
  switch (perfilAnalisis(posicion)) {
    case "apertura-20000-v1":
      return resultadoCompleto(posicion, {
        cartas: aperturaEditorial.cartas, mundos: 20000, victorias: [12530, 12023, 13779],
        pares: [
          { i: 0, j: 1, soloA: 1926, soloB: 1419 }, { i: 0, j: 2, soloA: 1152, soloB: 2401 },
          { i: 1, j: 2, soloA: 344, soloB: 2100 },
        ],
      }, "estimado", 20000);
    case "segunda-exacta-v1":
      return resultadoCompleto(posicion, {
        cartas: segundaEditorial.cartas, mundos: 1175, victorias: [0, 692],
        pares: [{ i: 0, j: 1, soloA: 0, soloB: 692 }],
      }, "exacto", null);
    default:
      return null;
  }
}
