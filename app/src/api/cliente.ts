// Rutas de ingreso y perfil de la app, sobre el cliente compartido (@eltruco/cliente): con sesión manda
// `Authorization: Bearer` en HTTP y en el WebSocket; sin sesión (la web) usa la cookie del mismo origen.
import { crearCliente, ErrorMesa, type Jugador, type OpcionesCliente } from "@eltruco/cliente/cliente.ts";

export type { Jugador };

export interface Canje {
  sesion: string;
  jugador: Jugador;
  bajaCancelada: boolean;
}

/** Las respuestas exitosas sin JSON (204 de la app, la página a la que redirige la web) no son un error. */
function sinCuerpo(error: unknown) {
  if (!(error instanceof SyntaxError)) throw error;
}

export type ClienteApp = ReturnType<typeof crearClienteApp>;

export function crearClienteApp(opciones: OpcionesCliente & { base: string }) {
  const { pedir, vivo } = crearCliente(opciones);
  return {
    pedir,
    vivo,
    url: (ruta: string) => opciones.base.replace(/\/+$/, "") + ruta,

    /** El jugador de la sesión, o `null` si no hay sesión vigente. */
    async jugador(): Promise<Jugador | null> {
      try {
        const { id, nombre } = await pedir<Jugador>("/api/jugador");
        return { id, nombre };
      } catch (error) {
        if (error instanceof ErrorMesa && error.status === 401) return null;
        throw error;
      }
    },

    canjear: (codigo: string, verificador: string) => pedir<Canje>("/api/auth/canje", { codigo, verificador }),

    async cerrarSesion(): Promise<void> {
      await pedir("/api/auth/logout", {}).catch(sinCuerpo);
    },

    eliminarCuenta: () => pedir<{ vence: string }>("/api/cuenta/eliminar", {}),
  };
}
