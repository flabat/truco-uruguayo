// Sonido de la mesa: voces por asiento y efectos, con expo-audio.
// La mesa (4d) llama a estas funciones; ver README.md en esta carpeta.
import { Asset } from "expo-asset";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { Guardado } from "../ingreso/almacen.ts";
import type { Efecto } from "./efectos.ts";
import type { FraseVoz } from "./frases.ts";
import { crearReproductor, type MotorAudio, type PistaAudio } from "./reproductor.ts";
import { efectos, voces } from "./recursos.ts";

export type { Efecto } from "./efectos.ts";
export type { CantoVoz, FraseVoz, MotivoTantos } from "./frases.ts";

const esWeb = Platform.OS === "web";
/** Si un clip no avisa que terminó, la cola del asiento sigue igual. */
const esperaMaxima = 5000;

function crearPista(): PistaAudio {
  let reproductor: AudioPlayer | null = null;
  let actual: number | null = null;
  let terminar: (() => void) | null = null;
  const cerrar = () => {
    const f = terminar;
    terminar = null;
    f?.();
  };
  return {
    reproducir(fuente, volumen) {
      cerrar();
      if (!reproductor) {
        reproductor = createAudioPlayer(fuente);
        reproductor.addListener("playbackStatusUpdate", estado => { if (estado.didJustFinish) cerrar(); });
      } else if (actual !== fuente) {
        reproductor.replace(fuente);
      }
      actual = fuente;
      const p = reproductor;
      p.volume = volumen;
      return new Promise<void>(listo => {
        const plazo = setTimeout(cerrar, esperaMaxima);
        terminar = () => { clearTimeout(plazo); listo(); };
        void p.seekTo(0).then(() => p.play(), () => p.play());
      });
    },
    detener() {
      reproductor?.pause();
      cerrar();
    },
  };
}

const pistas = new Map<string, PistaAudio>();
let modoListo: Promise<void> | null = null;

const motor: MotorAudio = {
  pista(nombre) {
    // Respeta el interruptor de silencio del iPhone y no corta la música de otra app.
    modoListo ??= setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch(() => {});
    let pista = pistas.get(nombre);
    if (!pista) pistas.set(nombre, (pista = crearPista()));
    return pista;
  },
  async precargar(fuentes) {
    await Asset.loadAsync([...fuentes]).catch(() => {});
  },
};

const guardado: Guardado = esWeb
  ? {
      async leer(clave) { try { return globalThis.localStorage?.getItem(clave) ?? null; } catch { return null; } },
      async guardar(clave, valor) { try { globalThis.localStorage?.setItem(clave, valor); } catch { /* sin almacenamiento */ } },
      async borrar(clave) { try { globalThis.localStorage?.removeItem(clave); } catch { /* sin almacenamiento */ } },
    }
  : {
      leer: clave => SecureStore.getItemAsync(clave),
      guardar: (clave, valor) => SecureStore.setItemAsync(clave, valor),
      borrar: clave => SecureStore.deleteItemAsync(clave),
    };

function escucharPrimerGesto(alGesto: () => void) {
  const documento = globalThis.document;
  if (!documento) return alGesto();
  const una = () => {
    documento.removeEventListener("pointerdown", una, true);
    documento.removeEventListener("keydown", una, true);
    alGesto();
  };
  documento.addEventListener("pointerdown", una, true);
  documento.addEventListener("keydown", una, true);
}

const reproductor = crearReproductor(motor, { recursos: { voces, efectos }, guardado, esWeb, escucharPrimerGesto });
void reproductor.cargarPreferencia();

/**
 * Dice la frase con la voz del asiento (0 a 5). Las frases del mismo asiento se encolan;
 * las de asientos distintos pueden sonar a la vez. Una frase sin clip no suena.
 */
export function reproducirVoz(asiento: number, frase: FraseVoz): void {
  reproductor.reproducirVoz(asiento, frase);
}

/** Toca un efecto. `volumen` va de 0 a 1 (la carta de otro jugador: 0.5). */
export function reproducirEfecto(nombre: Efecto, opciones?: { volumen?: number }): void {
  reproductor.reproducirEfecto(nombre, opciones);
}

/** Llamala al entrar a la mesa con los asientos ocupados. */
export function precargarSonidos(asientos: readonly number[]): Promise<void> {
  return reproductor.precargar(asientos);
}

export const sonidoActivado = (): boolean => reproductor.activado();
export const cambiarSonido = (activo: boolean): Promise<void> => reproductor.cambiar(activo);

/** Para el interruptor de la hoja Más. */
export function useSonidoActivado(): [boolean, (activo: boolean) => void] {
  const activo = useSyncExternalStore(reproductor.suscribir, reproductor.activado, reproductor.activado);
  return [activo, valor => void reproductor.cambiar(valor)];
}
