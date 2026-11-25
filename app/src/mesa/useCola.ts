import { useEffect, useRef, useState } from "react";
import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import type { PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import type { Nombre } from "@eltruco/cliente/textos.ts";
import type { Voz } from "@eltruco/cliente/voces.ts";
import { avanzar, cantoDeVoz, colaInicial, duracion, enPantalla, eventosEntre, recibir, type Evento } from "./cola.ts";

type Versionada = { version: number; manoNumero: number; indicaciones?: readonly unknown[] } | undefined;

interface Opciones {
  liviano: boolean;
  alEvento: (e: Evento) => void;
  miAsiento: number | null;
  /** Con nombres, la frase del pie se dice como en la web («Clara, vení»). */
  nombre?: Nombre;
}

function esMostrada(p: unknown): p is Partida | PartidaTercetos {
  return typeof p === "object" && p !== null && "vista" in p && p.vista != null;
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
  const ultimo = useRef({ partida, voz, reconexion });
  const opcionesVigentes = useRef(opciones);
  useEffect(() => {
    opcionesVigentes.current = opciones;
  });
  useEffect(() => {
    const previo = ultimo.current;
    ultimo.current = { partida, voz, reconexion };
    // Al reconectar el estado aparece en su lugar, sin sonar el pasado.
    if (previo.reconexion !== reconexion || (previo.partida === partida && previo.voz === voz)) return;
    if (!esMostrada(partida)) return;
    const { alEvento, miAsiento, nombre } = opcionesVigentes.current;
    let eventos = esMostrada(previo.partida) ? eventosEntre(previo.partida, partida, miAsiento, nombre) : [];
    if (voz) {
      // Las voces de una misma acción tienen un paso cada una: suena la que está en pantalla.
      const donde = eventos.findIndex(e => e.tipo !== "reparto" && e.tipo !== "carta");
      eventos = eventos.filter(e => e.tipo !== "canto");
      if (voz !== previo.voz) eventos.splice(donde < 0 ? eventos.length : donde, 0, cantoDeVoz(partida, voz, miAsiento));
    }
    for (const e of eventos) alEvento(e);
  }, [partida, voz, reconexion]);

  return pantalla;
}
