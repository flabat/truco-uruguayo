// Rutas de ingreso y perfil de la app, sobre el cliente compartido (@eltruco/cliente): con sesión manda
// `Authorization: Bearer` en HTTP y en el WebSocket; sin sesión (la web) usa la cookie del mismo origen.
import { crearCliente, ErrorMesa, type Jugador, type OpcionesCliente } from "@eltruco/cliente/cliente.ts";
import type { Lectura } from "../salon/consulta.ts";

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

/** Un jugador del realm local para el ingreso de prueba (AUTH_DEV). */
export interface JugadorDePrueba {
  usuario: string;
  nombre: string;
}

export type ClienteApp = ReturnType<typeof crearClienteApp>;

export function crearClienteApp(opciones: OpcionesCliente & { base: string }) {
  const { pedir, vivo } = crearCliente(opciones);
  const url = (ruta: string) => opciones.base.replace(/\/+$/, "") + ruta;
  return {
    pedir,
    vivo,
    url,

    /** Lectura periódica del salón y del visor, con `If-None-Match` para no bajar lo que no cambió. */
    async consultar<T>(ruta: string, etag: string | null, signal?: AbortSignal): Promise<Lectura<T>> {
      const sesion = opciones.sesion?.();
      const headers: Record<string, string> = {
        ...(sesion && { Authorization: "Bearer " + sesion }),
        ...(etag && { "If-None-Match": etag }),
      };
      const respuesta = await (opciones.fetch ?? fetch)(url(ruta), { cache: "no-store", signal, headers });
      if (respuesta.status === 304 || respuesta.status === 401 || respuesta.status === 404) return { estado: respuesta.status };
      if (!respuesta.ok) throw new ErrorMesa(respuesta.status, "No se pudo consultar el salón.");
      return { estado: 200, datos: await respuesta.json() as T, etag: respuesta.headers.get("ETag") };
    },

    /** El jugador de la sesión, o `null` si no hay sesión vigente. */
    async jugador(): Promise<Jugador | null> {
      try {
        const { id, nombre, salonHabilitado, puedeReportar } = await pedir<Jugador>("/api/jugador");
        return {
          id, nombre,
          ...(salonHabilitado !== undefined && { salonHabilitado }),
          ...(puedeReportar !== undefined && { puedeReportar }),
        };
      } catch (error) {
        if (error instanceof ErrorMesa && error.status === 401) return null;
        throw error;
      }
    },

    canjear: (codigo: string, verificador: string) => pedir<Canje>("/api/auth/canje", { codigo, verificador }),

    /** Los jugadores del ingreso de prueba si la API anuncia el modo; si no (404, error o sin red), ninguno. */
    async jugadoresDePrueba(): Promise<JugadorDePrueba[]> {
      try {
        const { usuarios } = await pedir<{ usuarios: JugadorDePrueba[] }>("/api/auth/dev");
        return Array.isArray(usuarios) ? usuarios : [];
      } catch {
        return [];
      }
    },

    /** Con desafío, un código para /api/auth/canje (la app); sin desafío, la cookie de sesión (la web). */
    entrarDePrueba: (usuario: string, desafio?: string) =>
      pedir<{ codigo?: string; jugador?: Jugador; bajaCancelada?: boolean }>("/api/auth/dev", desafio ? { usuario, app: desafio } : { usuario }),

    async cerrarSesion(): Promise<void> {
      await pedir("/api/auth/logout", {}).catch(sinCuerpo);
    },

    eliminarCuenta: () => pedir<{ vence: string }>("/api/cuenta/eliminar", {}),
  };
}
