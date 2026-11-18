import type { CardId } from "../motor/cartas.ts";

export interface Situacion {
  readonly id: string;
  /** Firma del problema visible, independiente de la semilla y el orden de las opciones. */
  readonly clave: string;
  readonly habilidad: string;
  readonly familia: string;
  readonly semilla: number;
  readonly muestra: CardId;
  readonly cartas: readonly CardId[];
  readonly explicacion: string;
}

/** La pausa de una mesa puede trabajar solo con sus cartas visibles. */
export type SituacionVisible = Omit<Situacion, "semilla">;

interface Consigna {
  readonly id: string;
  readonly consigna: string;
  readonly pista: string;
}

export type Paso = Consigna & (
  | { readonly tipo: "elegir-cartas"; readonly minimo: number; readonly maximo: number }
  | { readonly tipo: "decidir-flor" }
  | { readonly tipo: "responder-total" }
);

export interface Leccion {
  readonly id: string;
  readonly titulo: string;
  readonly habilidad: string;
  readonly capitulo: string;
  readonly familias: readonly [string, ...string[]];
  readonly pasos: readonly [Paso, ...Paso[]];
}

export type Respuesta =
  | { readonly tipo: "elegir-cartas"; readonly cartas: readonly CardId[] }
  | { readonly tipo: "decidir-flor"; readonly hayFlor: boolean }
  | { readonly tipo: "responder-total"; readonly total: number };

export interface Evaluacion {
  readonly correcta: boolean;
  readonly explicacion: string;
  /** Ayuda específica para esta respuesta. La consigna también tiene una pista general. */
  readonly pista?: string;
}

export type Evaluar<S extends SituacionVisible = Situacion> =
  (situacion: S, paso: Paso, respuesta: Respuesta) => Evaluacion;

export interface SolicitudSituacion {
  readonly habilidad: string;
  readonly familia: string;
  readonly semilla: number;
  /** Claves más recientes primero. Evitar repetir la última si existe otra mano. */
  readonly recientes: readonly string[];
}

export interface ProveedorSituaciones<S extends Situacion = Situacion> {
  generar: (solicitud: SolicitudSituacion) => S;
  evaluar: Evaluar<S>;
}

export interface Intento extends Pick<Evaluacion, "correcta" | "explicacion"> {
  readonly habilidad: string;
  readonly familia: string;
  readonly situacion: string;
  readonly paso: string;
  readonly respuesta: Respuesta;
  readonly conPista: boolean;
}
