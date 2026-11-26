// Textos y cuentas del abandono y de la espera a quien se desconectó. El servidor lleva el plazo:
// la app solo lo muestra, y un pedido adelantado vuelve con el motivo del rechazo.

type Modo = "1v1" | "2v2" | "3v3";

export interface Espera {
  asiento: number;
  nombre: string;
  desde: string;
  disponible: string;
}

/** Por asiento: el plazo que se ocultó y hasta cuándo (ms de `Date.now()`). */
export type EsperasOcultas = Readonly<Record<number, { disponible: string; hasta: number }>>;

/** «Seguir esperando» vuelve a ofrecer la acción a los 60 s. */
const pausa = 60_000;

export function textoConfirmarAbandono(modo: Modo): string {
  const consecuencia = "Vas a perder esta partida y quedará como Abandonada en tu historial.";
  return modo === "1v1" ? consecuencia : consecuencia + " Una computadora va a jugar tu lugar.";
}

/** Los segundos que faltan hasta `disponible` (ISO del servidor), hacia arriba y nunca negativos. */
export function segundosRestantes(disponible: string, ahora: number): number {
  return Math.max(0, Math.ceil((Date.parse(disponible) - ahora) / 1000));
}

export function textoEspera(nombre: string, restantes: number): string {
  const { anuncio, cuenta } = partesDeEspera(nombre, restantes);
  return anuncio + (cuenta ?? "");
}

/**
 * El aviso en dos partes: `anuncio` es lo que leen los lectores de pantalla y no cambia con la cuenta;
 * `cuenta` es la que baja cada segundo, solo a la vista, para no anunciarla 60 veces seguidas.
 */
export function partesDeEspera(nombre: string, restantes: number): { anuncio: string; cuenta: string | null } {
  return { anuncio: `Esperando a ${nombre}…`, cuenta: restantes > 0 ? ` · ${restantes} s` : null };
}

export function accionDeEspera(modo: Modo): string {
  return modo === "1v1" ? "Cobrar la partida" : "Reemplazar con una computadora";
}

export function textoCierreAbandono(nombre: string, motivo: "abandonada" | "desconectada"): string {
  return motivo === "abandonada" ? `${nombre} abandonó la partida.` : `${nombre} se desconectó.`;
}

export function ocultarEspera(ocultas: EsperasOcultas, espera: Espera, ahora: number): EsperasOcultas {
  return { ...ocultas, [espera.asiento]: { disponible: espera.disponible, hasta: ahora + pausa } };
}

/** Las esperas que se muestran: una oculta vuelve si el servidor le dio otro plazo o pasó la pausa. */
export function esperasVisibles(esperas: readonly Espera[] | undefined, ocultas: EsperasOcultas, ahora: number): Espera[] {
  return (esperas ?? []).filter(e => {
    const oculta = ocultas[e.asiento];
    return !oculta || oculta.disponible !== e.disponible || ahora >= oculta.hasta;
  });
}
