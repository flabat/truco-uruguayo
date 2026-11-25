// Cliente mínimo de la API para el ingreso y el perfil. Es el único archivo de la app que conoce
// las rutas de la API: la parte 4a (#359) lo reemplaza por el cliente compartido de paquetes/cliente.

export interface Jugador {
  id: string;
  nombre: string;
}

export interface Canje {
  sesion: string;
  jugador: Jugador;
  bajaCancelada: boolean;
}

export class ErrorDeApi extends Error {
  estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeApi";
    this.estado = estado;
  }
}

type ConstructorDeSocket = new (url: string, protocolos?: string[], opciones?: { headers: Record<string, string> }) => WebSocket;

interface Opciones {
  /** Origen de la API: el mismo de la página en la web, eltru.co en las apps. */
  base: string;
  /** Sesión de la app; `null` en la web, que usa la cookie del mismo origen. */
  sesion: () => Promise<string | null>;
  pedir?: typeof fetch;
  Socket?: ConstructorDeSocket;
}

export type Cliente = ReturnType<typeof crearCliente>;

export function crearCliente({ base, sesion, pedir = fetch, Socket }: Opciones) {
  const url = (ruta: string) => new URL(ruta, base).href;

  async function solicitar(ruta: string, init: RequestInit = {}) {
    const actual = await sesion();
    const headers = new Headers(init.headers);
    if (actual) headers.set("Authorization", "Bearer " + actual);
    // Con la sesión en el encabezado no hace falta la cookie; sin ella, la web manda la suya.
    return pedir(url(ruta), { ...init, headers, credentials: actual ? "omit" : "same-origin" });
  }

  async function falla(respuesta: Response): Promise<never> {
    const cuerpo = await respuesta.json().catch(() => null) as { error?: unknown } | null;
    const mensaje = typeof cuerpo?.error === "string" ? cuerpo.error : "No se pudo completar el pedido.";
    throw new ErrorDeApi(respuesta.status, mensaje);
  }

  async function enviar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    const respuesta = await solicitar(ruta, {
      method: "POST",
      headers: cuerpo === undefined ? {} : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (!respuesta.ok) return falla(respuesta);
    return respuesta.json() as Promise<T>;
  }

  return {
    url,

    /** El jugador de la sesión, o `null` si no hay sesión vigente. */
    async jugador(): Promise<Jugador | null> {
      const respuesta = await solicitar("/api/jugador");
      if (respuesta.status === 401) return null;
      if (!respuesta.ok) return falla(respuesta);
      const { id, nombre } = await respuesta.json() as Jugador;
      return { id, nombre };
    },

    canjear: (codigo: string, verificador: string) => enviar<Canje>("/api/auth/canje", { codigo, verificador }),

    async cerrarSesion(): Promise<void> {
      // La web responde 303 hacia el inicio; no hace falta seguirlo.
      await solicitar("/api/auth/logout", { method: "POST", redirect: "manual" });
    },

    eliminarCuenta: () => enviar<{ vence: string }>("/api/cuenta/eliminar"),

    /** WebSocket con la sesión en el encabezado del upgrade (React Native); la web manda la cookie. */
    async abrirSocket(ruta: string): Promise<WebSocket> {
      const Constructor = Socket ?? (WebSocket as unknown as ConstructorDeSocket);
      const direccion = url(ruta).replace(/^http/, "ws");
      const actual = await sesion();
      return actual
        ? new Constructor(direccion, [], { headers: { Authorization: "Bearer " + actual } })
        : new Constructor(direccion);
    },
  };
}
