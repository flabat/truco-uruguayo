// Une la lógica del salón y la sala con React Native: avisos de AppState,
// la hoja de compartir del sistema y el destino de un enlace mientras se ingresa en la web.
import type { AvisosDeRed } from "@eltruco/cliente/use-mesa.ts";
import { AppState, Share } from "react-native";
import type { Guardado } from "../ingreso/almacen.ts";
import { esWeb, guardadoSeguro } from "../ingreso/plataforma.ts";
import { crearAvisosDeRed } from "./avisos-red.ts";
import { crearContador } from "./eventos.ts";

const almacenamiento = (cual: "localStorage" | "sessionStorage"): Storage | null => {
  try {
    return globalThis[cual] ?? null;
  } catch {
    return null;
  }
};

/** En la web, la misma clave de localStorage que usa /jugar/; en las apps, expo-secure-store. */
const guardadoLocal: Guardado = {
  leer: async clave => almacenamiento("localStorage")?.getItem(clave) ?? null,
  guardar: async (clave, valor) => almacenamiento("localStorage")?.setItem(clave, valor),
  borrar: async clave => almacenamiento("localStorage")?.removeItem(clave),
};

/** Lo que se guarda en el dispositivo y no es secreto: el aviso de la comunidad. */
export const guardadoDelDispositivo: Guardado = esWeb ? guardadoLocal : guardadoSeguro;

/** Vuelve a leer la mesa al volver la app a primer plano o, en la web, la red. Estable, como pide useMesa. */
export const avisosDeApp: AvisosDeRed = crearAvisosDeRed({
  app: AppState,
  ventana: esWeb && typeof window !== "undefined" ? window : null,
});

/** Los conteos anónimos de `/eventos/`, como en /jugar/. Solo en la web. */
export const contar = crearContador({ web: esWeb, pedir: typeof fetch === "function" ? (ruta, opciones) => fetch(ruta, opciones) : undefined });

let destinoEnMemoria: string | null = null;
const claveDestino = "truco.app.destino";

/** El ingreso web sale de la app: el destino se guarda en sessionStorage. En las apps alcanza la memoria. */
export const guardadoDeDestino = {
  leer(): string | null {
    if (!esWeb) return destinoEnMemoria;
    try {
      return almacenamiento("sessionStorage")?.getItem(claveDestino) ?? null;
    } catch {
      return null;
    }
  },
  guardar(valor: string | null) {
    if (!esWeb) {
      destinoEnMemoria = valor;
      return;
    }
    try {
      const sesion = almacenamiento("sessionStorage");
      if (valor === null) sesion?.removeItem(claveDestino);
      else sesion?.setItem(claveDestino, valor);
    } catch {
      /* Sin almacenamiento, el jugador vuelve a abrir el enlace. */
    }
  },
};

export const origenWeb = esWeb ? globalThis.location.origin : null;

const textoInvitacion = "¡Te invité a jugar al truco! Sumate a mi mesa:";

type Navegador = { share?: (datos: { title: string; text: string; url: string }) => Promise<void>; clipboard?: { writeText(texto: string): Promise<void> } };
const navegador = (globalThis as { navigator?: Navegador }).navigator;

/** La hoja de compartir del sistema. En la web, solo si el navegador la ofrece. */
export const compartirConElSistema: ((enlace: string) => Promise<"compartida" | "cancelada">) | undefined = !esWeb
  ? async enlace => {
    // Solo el mensaje: con `url` además, iOS compartiría el enlace dos veces.
    const { action } = await Share.share({ title: "El Truco", message: `${textoInvitacion} ${enlace}` });
    return action === Share.dismissedAction ? "cancelada" : "compartida";
  }
  : navegador?.share
    ? async enlace => {
      try {
        await navegador.share!({ title: "El Truco", text: textoInvitacion, url: enlace });
        return "compartida";
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return "cancelada";
        throw error;
      }
    }
    : undefined;

export const copiarEnlace: ((enlace: string) => Promise<void>) | undefined = esWeb && navegador?.clipboard
  ? enlace => navegador.clipboard!.writeText(enlace)
  : undefined;
