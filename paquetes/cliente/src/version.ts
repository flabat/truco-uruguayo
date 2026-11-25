// Versión del servidor que publica `GET /api/version`. El build de la imagen graba la rama, el commit,
// la fecha y si el árbol tenía cambios sin commit; la web y la app la muestran en un pie discreto.

export interface VersionServidor {
  rama: string | null;
  commit: string | null;
  /** Fecha del build, en ISO 8601. */
  fecha: string | null;
  /** El árbol tenía cambios sin commit al construir la imagen. */
  sucio: boolean;
  /** Etiqueta de lanzamiento que apunta exactamente al commit, si la hay. */
  etiqueta: string | null;
}

const texto = (valor: string | undefined, patron: RegExp) => {
  const limpio = valor?.trim();
  return limpio && patron.test(limpio) ? limpio : null;
};

/** Lee la versión de las variables que el Dockerfile copia de los argumentos del build. */
export function versionDesdeEntorno(entorno: Record<string, string | undefined>): VersionServidor {
  const fecha = texto(entorno.TRUCO_FECHA, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  return {
    rama: texto(entorno.TRUCO_RAMA, /^[\w./-]{1,200}$/),
    commit: texto(entorno.TRUCO_RELEASE, /^[0-9a-f]{40}$/),
    fecha: fecha && !Number.isNaN(Date.parse(fecha)) ? fecha : null,
    sucio: entorno.TRUCO_SUCIO === "1",
    etiqueta: texto(entorno.TRUCO_ETIQUETA, /^[\w./-]{1,200}$/),
  };
}

/** Un lanzamiento es un commit etiquetado y sin cambios locales: ahí el pie no se muestra. */
export const esLanzamiento = (v: VersionServidor) => v.etiqueta !== null && !v.sucio;

/** «rama · abc12345-sucio», o `null` si es un lanzamiento o la imagen no grabó el commit. */
export function textoDeVersion(v: VersionServidor): string | null {
  if (!v.commit || esLanzamiento(v)) return null;
  const commit = v.commit.slice(0, 8) + (v.sucio ? "-sucio" : "");
  return v.rama ? v.rama + " · " + commit : commit;
}

/** Valida la respuesta de `/api/version`; cualquier otra cosa se trata como sin versión. */
export function leerVersionServidor(valor: unknown): VersionServidor | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  const cadena = (x: unknown) => (typeof x === "string" ? x : undefined);
  return versionDesdeEntorno({
    TRUCO_RAMA: cadena(v.rama),
    TRUCO_RELEASE: cadena(v.commit),
    TRUCO_FECHA: cadena(v.fecha),
    TRUCO_SUCIO: v.sucio === true ? "1" : undefined,
    TRUCO_ETIQUETA: cadena(v.etiqueta),
  });
}
