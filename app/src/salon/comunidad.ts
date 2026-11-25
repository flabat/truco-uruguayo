// El aviso «¿Buscás con quién jugar?» del salón de /jugar/ (`Comunidad.tsx`), con la misma clave.
import type { Guardado } from "../ingreso/almacen.ts";

/** La misma invitación que `src/lib/comunidad.ts` (la imagen de la app no copia `src/lib/`); una prueba las compara. */
export const discordComunidad = "https://discord.gg/HpaWCPQDr";

const clave = (jugador: string) => "truco.comunidad.oculta." + jugador;

/** Se muestra hasta que el jugador elige «Ahora no». Si el dispositivo no guarda, vuelve a aparecer. */
export function crearAvisoDeComunidad(guardado: Guardado) {
  return {
    async visible(jugador: string): Promise<boolean> {
      try {
        return (await guardado.leer(clave(jugador))) !== "1";
      } catch {
        return true;
      }
    },
    async ocultar(jugador: string): Promise<void> {
      await guardado.guardar(clave(jugador), "1").catch(() => {});
    },
  };
}
