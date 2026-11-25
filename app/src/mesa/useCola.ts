import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import type { Nombre } from "@eltruco/cliente/textos.ts";
import type { Voz } from "@eltruco/cliente/voces.ts";
import { avanzar, colaInicial, duracion, enPantalla, eventosEnPantalla, recibir, type Evento, type Versionada } from "./cola.ts";

interface Opciones {
  liviano: boolean;
  alEvento: (e: Evento) => void;
  miAsiento: number | null;
  /** Con nombres, la frase del pie se dice como en la web («Clara, vení»). */
  nombre?: Nombre;
}

/**
 * Presenta en orden las jugadas que llegan juntas. A diferencia de la web, no espera las
 * imágenes: la app precarga los naipes.
 */
export function useColaDePresentacion<T extends Versionada>(actual: T, presencio: boolean, reconexion: number,
    pasosNuevos: PasosNuevos<T>, opciones: Opciones): { partida: T; presentando: boolean; voz?: Voz } {
  const [guardada, guardar] = useState(() => colaInicial(actual, presencio, reconexion, pasosNuevos));
  const cola = recibir(guardada, actual, presencio, reconexion, pasosNuevos);
  if (cola !== guardada) guardar(cola);

  const paso = cola.pasos[0];
  const cargado = paso !== undefined && cola.cargado === paso;
  const { liviano } = opciones;
  useEffect(() => {
    if (!paso) return;
    const seguir = () => guardar(c => c.pasos[0] === paso ? avanzar(c) : c);
    // El naipe ya está precargado: la vuelta completa se pinta una vez y enseguida se ve su veredicto.
    if (paso.antesDelResultado && !cargado) {
      seguir();
      return;
    }
    const timer = setTimeout(seguir, duracion(paso, liviano));
    return () => clearTimeout(timer);
  }, [paso, cargado, liviano]);

  const pantalla = enPantalla(cola);
  const { partida, voz } = pantalla;
  const porPaso = paso !== undefined;
  const ultimo = useRef({ partida, voz, reconexion });
  const opcionesVigentes = useRef(opciones);
  useLayoutEffect(() => {
    opcionesVigentes.current = opciones;
  });
  // Antes de pintar: el lienzo esconde las cartas del reparto y el tanteador vuelve al número
  // anterior para contarlo, sin que se vea un cuadro con el estado nuevo quieto.
  useLayoutEffect(() => {
    const previo = ultimo.current;
    ultimo.current = { partida, voz, reconexion };
    // Al reconectar el estado aparece en su lugar, sin sonar el pasado.
    if (previo.reconexion !== reconexion) return;
    const { alEvento, miAsiento, nombre } = opcionesVigentes.current;
    for (const e of eventosEnPantalla(previo, { partida, voz }, porPaso, miAsiento, nombre)) alEvento(e);
  }, [partida, voz, reconexion]);

  return pantalla;
}
