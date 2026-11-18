import { elegirApertura, type Ejemplo, type Tema } from "./index.ts";

type Almacen = Pick<Storage, "getItem" | "setItem">;

// Una clave por tema evita sobrescribir lo visto en otro tema desde otra pestaña.
// Los IDs se guardan en orden de elección. El último cierra el ciclo.
function leerCiclo(texto: string | null, tema: Tema): string[] {
  if (!texto) return [];
  try {
    const ids: unknown = JSON.parse(texto);
    if (Array.isArray(ids)) {
      const vigentes = new Set(tema.ejemplos.map(({ id }) => id));
      return [...new Set(ids.filter((id): id is string => vigentes.has(id)))];
    }
  } catch {
    // Un guardado ilegible permite empezar un ciclo nuevo.
  }
  return [];
}

export function crearSelectorEjemplos(obtenerAlmacen: () => Almacen | undefined = () => localStorage, azar = Math.random) {
  let almacen: Almacen | undefined;
  try { almacen = obtenerAlmacen(); } catch { /* El navegador puede denegar la propiedad. */ }
  const memoria = new Map<string, string[]>();
  const visibles = new Map<string, string>();

  return function seleccionar(tema: Tema, restaurarId?: string): Ejemplo {
    const restaurado = tema.ejemplos.find(({ id }) => id === restaurarId);
    if (restaurado) {
      visibles.set(tema.id, restaurado.id);
      return restaurado;
    }

    const clave = "truco-oriental.ejemplos.v1." + tema.id;
    let vistos = memoria.get(tema.id) ?? [];
    try {
      if (almacen) vistos = leerCiclo(almacen.getItem(clave), tema);
    } catch {
      almacen = undefined;
    }
    const visible = visibles.get(tema.id);
    // Incluso sin almacenamiento, al restaurar y pedir otra mano se cambia de ejemplo.
    if (!vistos.length && visible) vistos = [visible];

    let elegido: Ejemplo;
    if (!vistos.length) {
      elegido = elegirApertura(tema, azar);
    } else {
      let opciones = tema.ejemplos.filter(({ id }) => !vistos.includes(id) && id !== visible);
      if (!opciones.length) {
        const ultimo = vistos.at(-1);
        opciones = tema.ejemplos.filter(({ id }) => id !== visible && id !== ultimo);
        // Un catálogo de una o dos manos también se puede recorrer.
        if (!opciones.length) opciones = tema.ejemplos.filter(({ id }) => id !== (visible ?? ultimo));
        if (!opciones.length) opciones = [...tema.ejemplos];
        vistos = [];
      }
      elegido = opciones[Math.floor(azar() * opciones.length)];
    }

    const ciclo = [...vistos, elegido.id];
    memoria.set(tema.id, ciclo);
    visibles.set(tema.id, elegido.id);
    try { almacen?.setItem(clave, JSON.stringify(ciclo)); } catch { almacen = undefined; }
    return elegido;
  };
}
