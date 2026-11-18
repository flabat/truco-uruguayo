import type { Leccion, Situacion } from "./tipos.ts";

const claveLocal = "truco-oriental.aprendizaje";
const ventana = 8;

interface CasoVisto {
  readonly clave: string;
  readonly familia: string;
  readonly acreditado: boolean;
}

export interface ProgresoHabilidad {
  readonly habilidad: string;
  readonly casos: readonly CasoVisto[];
  readonly recientes: readonly string[];
  readonly ultimosResultados: readonly boolean[];
}

export interface Progreso {
  readonly version: 1;
  readonly habilidades: readonly ProgresoHabilidad[];
}

export interface FuenteProgreso {
  readonly actual: Progreso;
  /** Devuelve true solamente la primera vez que esta habilidad presenta la clave. */
  abrirSituacion(situacion: Pick<Situacion, "habilidad" | "familia" | "clave">): boolean;
  registrarRespuesta(situacion: Pick<Situacion, "habilidad" | "clave">, correcta: boolean, acreditar: boolean): void;
}

export interface PoliticaAprendido {
  readonly aciertos: number;
  readonly familias: number;
}

export const politicaInicial: PoliticaAprendido = { aciertos: 3, familias: 2 };

type Almacen = Pick<Storage, "getItem" | "setItem">;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esCaso(valor: unknown): valor is CasoVisto {
  return esObjeto(valor) && typeof valor.clave === "string" &&
    typeof valor.familia === "string" && typeof valor.acreditado === "boolean";
}

function esProgresoHabilidad(valor: unknown): valor is ProgresoHabilidad {
  if (!esObjeto(valor) || typeof valor.habilidad !== "string" ||
      !Array.isArray(valor.casos) || !valor.casos.every(esCaso)) return false;
  const claves = new Set(valor.casos.map((caso) => caso.clave));
  return claves.size === valor.casos.length && Array.isArray(valor.recientes) &&
    valor.recientes.length <= ventana && valor.recientes.every((clave) => claves.has(clave)) &&
    Array.isArray(valor.ultimosResultados) && valor.ultimosResultados.length <= ventana &&
    valor.ultimosResultados.every((correcta) => typeof correcta === "boolean");
}

function leer(datos: string | null): Progreso {
  if (datos !== null) {
    try {
      const valor: unknown = JSON.parse(datos);
      if (esObjeto(valor) && valor.version === 1 && Array.isArray(valor.habilidades) &&
          valor.habilidades.every(esProgresoHabilidad) &&
          new Set(valor.habilidades.map((h) => h.habilidad)).size === valor.habilidades.length) {
        return { version: 1, habilidades: valor.habilidades };
      }
    } catch {
      // Un JSON interrumpido también permite empezar de nuevo.
    }
  }
  return { version: 1, habilidades: [] };
}

export function progresoDe(progreso: Progreso, habilidad: string): ProgresoHabilidad {
  return progreso.habilidades.find((h) => h.habilidad === habilidad) ??
    { habilidad, casos: [], recientes: [], ultimosResultados: [] };
}

export function crearFuenteProgreso(
  obtenerAlmacen: () => Almacen | undefined = () => globalThis.localStorage,
): FuenteProgreso {
  let almacen: Almacen | undefined;
  let ultimoTexto: string | null = null;
  let progreso = leer(null);
  try {
    almacen = obtenerAlmacen();
  } catch {
    // El navegador puede denegar incluso el acceso a la propiedad localStorage.
  }

  function actual(): Progreso {
    try {
      if (almacen) {
        const texto = almacen.getItem(claveLocal);
        if (texto !== ultimoTexto) {
          progreso = leer(texto);
          ultimoTexto = texto;
        }
      }
    } catch {
      almacen = undefined;
    }
    return progreso;
  }

  function guardar(habilidad: ProgresoHabilidad) {
    const otras = progreso.habilidades.filter((h) => h.habilidad !== habilidad.habilidad);
    progreso = { version: 1, habilidades: [...otras, habilidad] };
    if (almacen) {
      try {
        const texto = JSON.stringify(progreso);
        almacen.setItem(claveLocal, texto);
        ultimoTexto = texto;
      } catch {
        // Si se agota la cuota, las siguientes respuestas siguen en memoria.
        almacen = undefined;
      }
    }
  }

  return {
    get actual() { return actual(); },
    abrirSituacion({ habilidad, familia, clave }) {
      const h = progresoDe(actual(), habilidad);
      const nueva = !h.casos.some((caso) => caso.clave === clave);
      const casos = nueva ? [...h.casos, { clave, familia, acreditado: false }] : h.casos;
      const recientes = [clave, ...h.recientes.filter((c) => c !== clave)].slice(0, ventana);
      guardar({ ...h, casos, recientes });
      return nueva;
    },
    registrarRespuesta({ habilidad, clave }, correcta, acreditar) {
      const h = progresoDe(actual(), habilidad);
      const casos = correcta && acreditar
        ? h.casos.map((caso) => caso.clave === clave ? { ...caso, acreditado: true } : caso)
        : h.casos;
      guardar({ ...h, casos, ultimosResultados: [...h.ultimosResultados, correcta].slice(-ventana) });
    },
  };
}

export function erroresRecientes(habilidad: ProgresoHabilidad): number {
  return habilidad.ultimosResultados.filter((correcta) => !correcta).length;
}

export function estaAprendida(
  progreso: Progreso, habilidad: string, familias: readonly string[],
  politica: PoliticaAprendido = politicaInicial,
): boolean {
  if (![politica.aciertos, politica.familias].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new RangeError("Los umbrales de aprendizaje deben ser enteros positivos.");
  }
  const disponibles = new Set(familias);
  const aciertos = progresoDe(progreso, habilidad).casos.filter(
    (caso) => caso.acreditado && disponibles.has(caso.familia),
  );
  const cubiertas = new Set(aciertos.map((caso) => caso.familia));
  return aciertos.length >= politica.aciertos && cubiertas.size >= Math.min(politica.familias, disponibles.size);
}

export function elegirHabilidad(
  lecciones: readonly Leccion[], progreso: Progreso,
  { tema, azar = Math.random }: { tema?: string; azar?: () => number } = {},
): string {
  const disponibles = [...new Set(lecciones.map((l) => l.habilidad))];
  if (!disponibles.length) throw new Error("El catálogo de lecciones está vacío.");
  if (tema !== undefined) {
    if (!disponibles.includes(tema)) throw new Error("La habilidad elegida no está en el catálogo.");
    return tema;
  }

  const vistas = disponibles.filter((id) => progresoDe(progreso, id).casos.length > 0);
  const inicio = ["comparar-cartas", "reconocer-flor"].filter((id) => disponibles.includes(id));
  if (!vistas.length) return inicio[0] ?? disponibles[0];
  if (vistas.length === 1 && vistas[0] === inicio[0] && inicio[1]) return inicio[1];

  const pesos = vistas.map((id) => 1 + erroresRecientes(progresoDe(progreso, id)));
  const muestra = azar();
  if (!(muestra >= 0 && muestra < 1)) throw new RangeError("El azar debe ser mayor o igual a 0 y menor que 1.");
  let punto = muestra * pesos.reduce((total, peso) => total + peso, 0);
  for (const [i, peso] of pesos.entries()) {
    if (punto < peso) return vistas[i];
    punto -= peso;
  }
  return vistas[vistas.length - 1];
}
