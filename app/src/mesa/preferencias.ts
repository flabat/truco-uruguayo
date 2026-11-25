export interface Preferencias {
  hapticos: boolean;
  liviano: boolean;
}

export const porDefecto: Preferencias = { hapticos: true, liviano: false };

export const clavePreferencias = "truco.preferencias-mesa";

/** Lo guardado por `usePreferencias`. El sonido no va acá: lo guarda la 4e en `truco.sonido`. Un texto roto o un campo que falta vuelve al valor por defecto. */
export function leerPreferencias(texto: string | null): Preferencias {
  let guardadas: unknown = null;
  try {
    guardadas = texto ? JSON.parse(texto) : null;
  } catch {
    return porDefecto;
  }
  if (!guardadas || typeof guardadas !== "object" || Array.isArray(guardadas)) return porDefecto;
  const datos = guardadas as Record<string, unknown>;
  const leer = (clave: keyof Preferencias) => typeof datos[clave] === "boolean" ? datos[clave] : porDefecto[clave];
  return { hapticos: leer("hapticos"), liviano: leer("liviano") };
}

/** El modo liviano rige si se forzó desde la hoja Más o si el sistema pide reducir movimiento. */
export const livianoActivo = (p: Preferencias, reducirMovimiento: boolean) => p.liviano || reducirMovimiento;
