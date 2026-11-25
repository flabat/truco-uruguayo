// Tratamiento de los clips en PCM mono de 16 bits: recorte de silencios y volumen parejo.
// Se hace en JavaScript porque el ffmpeg de Remotion no trae silenceremove, y loudnorm
// no mide bien clips de menos de tres segundos.

const dbfs = (db: number) => 32767 * 10 ** (db / 20);

export interface Ajustes {
  /** Debajo de este nivel se considera silencio. */
  umbralDb: number;
  /** Silencio que se deja antes y después de la voz. */
  margenMs: number;
  /** Nivel RMS de la parte con voz. */
  rmsDb: number;
  /** Pico máximo después de la ganancia. */
  picoDb: number;
  fundidoMs: number;
}

export const ajustesVoz: Ajustes = { umbralDb: -40, margenMs: 40, rmsDb: -18, picoDb: -1, fundidoMs: 8 };

/** Nivel RMS en dBFS. */
export function rmsDb(pcm: Int16Array): number {
  if (!pcm.length) return -Infinity;
  let suma = 0;
  for (const m of pcm) suma += m * m;
  return 20 * Math.log10(Math.sqrt(suma / pcm.length) / 32767);
}

export function picoDb(pcm: Int16Array): number {
  let pico = 0;
  for (const m of pcm) pico = Math.max(pico, Math.abs(m));
  return 20 * Math.log10(pico / 32767);
}

/** Recorta el silencio de los bordes, lleva la voz a un RMS fijo sin pasar el pico y funde los extremos. */
export function recortarYNivelar(pcm: Int16Array, frecuencia: number, a: Ajustes = ajustesVoz): Int16Array {
  // Ventanas de 10 ms: un chasquido aislado no cuenta como voz.
  const ventana = Math.max(1, Math.round(frecuencia / 100));
  const umbral = dbfs(a.umbralDb);
  let primera = -1;
  let ultima = -1;
  for (let i = 0; i < pcm.length; i += ventana) {
    let suma = 0;
    const fin = Math.min(pcm.length, i + ventana);
    for (let j = i; j < fin; j++) suma += pcm[j] * pcm[j];
    if (Math.sqrt(suma / (fin - i)) >= umbral) {
      if (primera < 0) primera = i;
      ultima = fin;
    }
  }
  if (primera < 0) return new Int16Array(0);
  const margen = Math.round((a.margenMs / 1000) * frecuencia);
  const inicio = Math.max(0, primera - margen);
  const final = Math.min(pcm.length, ultima + margen);
  const voz = pcm.subarray(primera, ultima);
  const ganancia = Math.min(10 ** ((a.rmsDb - rmsDb(voz)) / 20), 10 ** ((a.picoDb - picoDb(voz)) / 20));
  const fundido = Math.round((a.fundidoMs / 1000) * frecuencia);
  const salida = new Int16Array(final - inicio);
  for (let i = 0; i < salida.length; i++) {
    const borde = Math.min(1, i / fundido, (salida.length - 1 - i) / fundido);
    salida[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[inicio + i] * ganancia * borde)));
  }
  return salida;
}

/** Une clips con una pausa entre medio, para probar declaraciones armadas por partes. */
export function unir(partes: readonly Int16Array[], frecuencia: number, pausaMs: number): Int16Array {
  const pausa = Math.round((pausaMs / 1000) * frecuencia);
  const total = partes.reduce((n, p) => n + p.length, 0) + pausa * Math.max(0, partes.length - 1);
  const salida = new Int16Array(total);
  let i = 0;
  partes.forEach((p, k) => {
    salida.set(p, i);
    i += p.length + (k < partes.length - 1 ? pausa : 0);
  });
  return salida;
}
