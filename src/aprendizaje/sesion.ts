import { esSemilla } from "@eltruco/motor/reparto.ts";
import { erroresRecientes, progresoDe } from "./progreso.ts";
import type { FuenteProgreso } from "./progreso.ts";
import type { Evaluar, Intento, Leccion, Paso, ProveedorSituaciones, Respuesta, Situacion, SituacionVisible } from "./tipos.ts";

/** Posición de una pausa en curso. Las respuestas ya registradas quedan en la fuente de progreso. */
export interface Continuacion {
  readonly indice: number;
  readonly independiente: boolean;
  readonly pista?: string;
  readonly ayudaAlError?: string;
}

export interface Sesion<S extends SituacionVisible = SituacionVisible> {
  readonly leccion: Leccion;
  readonly situacion: S;
  readonly pasoActual: Paso | undefined;
  readonly completada: boolean;
  readonly pista: string | undefined;
  readonly intentos: readonly Intento[];
  readonly continuacion: Continuacion;
  pedirPista(): string;
  responder(respuesta: Respuesta): Intento;
  consultarRegla(): void;
}

function admite(paso: Paso, respuesta: Respuesta, situacion: SituacionVisible): boolean {
  switch (respuesta.tipo) {
    case "elegir-cartas":
      return paso.tipo === respuesta.tipo && respuesta.cartas.length >= paso.minimo &&
        respuesta.cartas.length <= paso.maximo && new Set(respuesta.cartas).size === respuesta.cartas.length &&
        respuesta.cartas.every((carta) => situacion.cartas.includes(carta));
    case "responder-total":
      return paso.tipo === respuesta.tipo && Number.isSafeInteger(respuesta.total) && respuesta.total >= 0;
    case "decidir-flor":
      return paso.tipo === respuesta.tipo && typeof respuesta.hayFlor === "boolean";
  }
}

/** También abre una pausa didáctica con las cartas visibles de una mesa ya repartida. */
export function iniciarSesion<S extends SituacionVisible>(
  leccion: Leccion, situacion: S, evaluar: Evaluar<S>, fuente: FuenteProgreso,
  continuacion?: Continuacion,
): Sesion<S> {
  if (situacion.habilidad !== leccion.habilidad || !leccion.familias.includes(situacion.familia)) {
    throw new Error("La situación no corresponde a la habilidad y las familias de la lección.");
  }
  let independiente = continuacion?.independiente ?? fuente.abrirSituacion(situacion);
  let indice = continuacion?.indice ?? 0;
  let pista = continuacion?.pista;
  let ayudaAlError = continuacion?.ayudaAlError;
  const intentos: Intento[] = [];

  function pasoPendiente(): Paso {
    const paso = leccion.pasos[indice];
    if (!paso) throw new Error("La situación ya está resuelta.");
    return paso;
  }

  return {
    leccion, situacion, intentos,
    get continuacion() { return { indice, independiente, pista, ayudaAlError }; },
    get pasoActual() { return leccion.pasos[indice]; },
    get completada() { return indice === leccion.pasos.length; },
    get pista() { return pista; },
    pedirPista() {
      const paso = pasoPendiente();
      independiente = false;
      pista = ayudaAlError ?? paso.pista;
      return pista;
    },
    responder(respuesta) {
      const paso = pasoPendiente();
      if (!admite(paso, respuesta, situacion)) throw new Error("La respuesta no corresponde al paso.");
      const { correcta, explicacion, pista: ayuda } = evaluar(situacion, paso, respuesta);
      const intento = {
        habilidad: situacion.habilidad, familia: situacion.familia, situacion: situacion.id,
        paso: paso.id, respuesta, correcta, explicacion, conPista: pista !== undefined,
      };
      intentos.push(intento);
      if (!correcta) independiente = false;
      const ultimoPaso = indice === leccion.pasos.length - 1;
      fuente.registrarRespuesta(situacion, correcta, correcta && ultimoPaso && independiente);

      if (correcta) {
        indice++;
        pista = undefined;
        ayudaAlError = undefined;
      } else {
        ayudaAlError = ayuda ?? paso.pista;
        if (pista !== undefined || erroresRecientes(progresoDe(fuente.actual, situacion.habilidad)) >= 2) {
          pista = ayudaAlError;
        }
      }
      return intento;
    },
    consultarRegla() {
      if (indice < leccion.pasos.length) independiente = false;
    },
  };
}

/** Elegir familia antes del reparto permite reproducir la solicitud con la misma semilla. */
export function generarSesion<S extends Situacion>(
  leccion: Leccion, semilla: number, proveedor: ProveedorSituaciones<S>, fuente: FuenteProgreso,
  familia = leccion.familias[semilla % leccion.familias.length],
): Sesion<S> {
  if (!esSemilla(semilla)) {
    throw new RangeError("La semilla debe ser un entero sin signo de 32 bits.");
  }
  if (!leccion.familias.includes(familia)) throw new Error("Familia ajena a la lección.");
  const { habilidad } = leccion;
  const { recientes } = progresoDe(fuente.actual, habilidad);
  const situacion = proveedor.generar({ habilidad, familia, semilla, recientes });
  if (situacion.familia !== familia) throw new Error("El generador devolvió otra familia.");
  return iniciarSesion(leccion, situacion, proveedor.evaluar.bind(proveedor), fuente);
}
