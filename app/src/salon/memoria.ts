// La última mesa del jugador, con la misma clave que usa /jugar/ en el navegador.
import type { Guardado } from "../ingreso/almacen.ts";

const clave = (jugador: string) => "truco.ultima-mesa." + jugador;

/** Si el dispositivo no guarda, la mesa sigue disponible en su enlace: los errores se ignoran. */
export function crearMemoriaDeMesa(guardado: Guardado) {
  return {
    async leer(jugador: string): Promise<string | null> {
      return guardado.leer(clave(jugador)).catch(() => null);
    },
    async recordar(jugador: string, id: string): Promise<void> {
      await guardado.guardar(clave(jugador), id).catch(() => {});
    },
    async olvidar(jugador: string, id: string): Promise<void> {
      try {
        if ((await guardado.leer(clave(jugador))) === id) await guardado.borrar(clave(jugador));
      } catch {
        /* Nada que olvidar si no se pudo leer. */
      }
    },
  };
}

export type MemoriaDeMesa = ReturnType<typeof crearMemoriaDeMesa>;
