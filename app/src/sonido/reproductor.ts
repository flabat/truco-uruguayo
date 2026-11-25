// Lógica del sonido de la mesa sin depender de Expo, para probarla en Node.
// `index.ts` la une con expo-audio.
import type { Guardado } from "../ingreso/almacen.ts";
import type { Efecto } from "./efectos.ts";
import { clavesDeFrase, type FraseVoz } from "./frases.ts";

/** Un canal que suena de a un clip por vez. */
export interface PistaAudio {
  /** Arranca el clip desde el principio. Se resuelve cuando termina o se detiene. */
  reproducir(fuente: number, volumen: number): Promise<void>;
  detener(): void;
}

export interface MotorAudio {
  /** Devuelve siempre la misma pista para el mismo nombre. */
  pista(nombre: string): PistaAudio;
  /** Deja los archivos listos para sonar sin demora. */
  precargar(fuentes: readonly number[]): Promise<void>;
}

export interface Recursos {
  voces: Readonly<Record<number, Readonly<Record<string, number>>>>;
  efectos: Readonly<Record<Efecto, number>>;
}

export interface OpcionesReproductor {
  recursos: Recursos;
  /** Dónde se recuerda si el sonido está encendido. */
  guardado: Guardado;
  /** En la web nada suena hasta el primer toque o tecla, como exigen los navegadores. */
  esWeb: boolean;
  escucharPrimerGesto?: (alGesto: () => void) => void;
}

export interface Reproductor {
  reproducirVoz(asiento: number, frase: FraseVoz): void;
  reproducirEfecto(nombre: Efecto, opciones?: { volumen?: number }): void;
  precargar(asientos: readonly number[]): Promise<void>;
  activado(): boolean;
  cambiar(activo: boolean): Promise<void>;
  /** Lee la preferencia guardada. Hasta entonces, el sonido está encendido. */
  cargarPreferencia(): Promise<void>;
  suscribir(alCambiar: () => void): () => void;
}

export const claveSonido = "truco.sonido";

export function crearReproductor(motor: MotorAudio, o: OpcionesReproductor): Reproductor {
  let activo = true;
  let desbloqueado = !o.esWeb;
  /** Cambia al apagar: las colas viejas dejan de avanzar. */
  let generacion = 0;
  const colas = new Map<number, number[][]>();
  const sonando = new Set<number>();
  const usadas = new Set<string>();
  const oyentes = new Set<() => void>();

  if (o.esWeb) o.escucharPrimerGesto?.(() => { desbloqueado = true; });

  const pista = (nombre: string) => {
    usadas.add(nombre);
    return motor.pista(nombre);
  };
  const puedeSonar = () => activo && desbloqueado;

  async function avanzar(asiento: number) {
    if (sonando.has(asiento)) return;
    const cola = colas.get(asiento);
    const siguiente = cola?.shift();
    if (!siguiente) return;
    sonando.add(asiento);
    const mia = generacion;
    try {
      for (const fuente of siguiente) {
        if (mia !== generacion) return;
        await pista("voz-" + asiento).reproducir(fuente, 1);
      }
    } finally {
      sonando.delete(asiento);
      if (mia === generacion) void avanzar(asiento);
    }
  }

  function callar() {
    generacion++;
    colas.clear();
    for (const nombre of usadas) motor.pista(nombre).detener();
  }

  return {
    reproducirVoz(asiento, frase) {
      if (!puedeSonar()) return;
      const delAsiento = o.recursos.voces[asiento];
      const fuentes = clavesDeFrase(frase).map(c => delAsiento?.[c]);
      if (!fuentes.length || fuentes.some(f => f === undefined)) return;
      const cola = colas.get(asiento) ?? [];
      cola.push(fuentes as number[]);
      colas.set(asiento, cola);
      void avanzar(asiento);
    },
    reproducirEfecto(nombre, opciones) {
      const fuente = o.recursos.efectos[nombre];
      if (!puedeSonar() || fuente === undefined) return;
      void pista("efecto-" + nombre).reproducir(fuente, Math.max(0, Math.min(1, opciones?.volumen ?? 1)));
    },
    async precargar(asientos) {
      const fuentes = [
        ...Object.values(o.recursos.efectos),
        ...asientos.flatMap(a => Object.values(o.recursos.voces[a] ?? {})),
      ];
      for (const a of asientos) pista("voz-" + a);
      for (const e of Object.keys(o.recursos.efectos)) pista("efecto-" + e);
      await motor.precargar(fuentes);
    },
    activado: () => activo,
    async cambiar(valor) {
      if (valor === activo) return;
      activo = valor;
      if (!valor) callar();
      oyentes.forEach(f => f());
      await o.guardado.guardar(claveSonido, valor ? "1" : "0");
    },
    async cargarPreferencia() {
      const guardado = await o.guardado.leer(claveSonido).catch(() => null);
      const valor = guardado !== "0";
      if (valor === activo) return;
      activo = valor;
      if (!valor) callar();
      oyentes.forEach(f => f());
    },
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => { oyentes.delete(alCambiar); };
    },
  };
}
