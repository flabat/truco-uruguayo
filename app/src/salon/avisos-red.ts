// Cuándo volver a leer la mesa. Sin dependencias de React Native, para probarlo con node:test.
import type { AvisosDeRed } from "@eltruco/cliente/use-mesa.ts";

type Suscripcion = { remove(): void };
export interface EstadoDeLaApp {
  addEventListener(evento: "change", alCambiar: (estado: string) => void): Suscripcion;
}
export interface Ventana {
  addEventListener(evento: string, alAvisar: () => void): void;
  removeEventListener(evento: string, alAvisar: () => void): void;
}

/**
 * La app vuelve a leer la mesa al volver a primer plano. En la web, además, como `/jugar/`: al
 * volver la red (`online`) o la página (`pageshow`), y marca la mesa sin conexión con `offline`.
 */
export function crearAvisosDeRed({ app, ventana }: { app: EstadoDeLaApp; ventana?: Ventana | null }): AvisosDeRed {
  return ({ leer, sinRed }) => {
    const suscripcion = app.addEventListener("change", estado => {
      if (estado === "active") leer();
    });
    ventana?.addEventListener("online", leer);
    ventana?.addEventListener("offline", sinRed);
    ventana?.addEventListener("pageshow", leer);
    return () => {
      suscripcion.remove();
      ventana?.removeEventListener("online", leer);
      ventana?.removeEventListener("offline", sinRed);
      ventana?.removeEventListener("pageshow", leer);
    };
  };
}
