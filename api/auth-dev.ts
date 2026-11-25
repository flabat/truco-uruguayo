// Ingreso de prueba (AUTH_DEV=1): entra como uno de los jugadores del realm local sin pasar por el proveedor
// de identidad. Es una herramienta de desarrollo: sin la variable, la ruta no existe y responde 404.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { leerJson, responderJson } from "./http.ts";
import { abrirSesionWeb, emitirCanje, registrarJugador } from "./ingreso.ts";
import { esDesafio, origenValido } from "./sesion.ts";

export const rutaIngresoDePrueba = "/api/auth/dev";

/** Los usuarios del realm `mesa-local` (infra/mesa-local-realm.json), con el mismo sujeto y nombre que en Keycloak. */
export const jugadoresDePrueba = [
  { usuario: "ana", nombre: "Ana", sujeto: "2e98a700-1205-4e9b-8161-000000000001" },
  { usuario: "bruno", nombre: "Bruno", sujeto: "2e98a700-1205-4e9b-8161-000000000002" },
  { usuario: "clara", nombre: "Clara", sujeto: "2e98a700-1205-4e9b-8161-000000000003" },
  { usuario: "diego", nombre: "Diego", sujeto: "2e98a700-1205-4e9b-8161-000000000004" },
  { usuario: "eva", nombre: "Eva", sujeto: "2e98a700-1205-4e9b-8161-000000000005" },
  { usuario: "luis", nombre: "Luis", sujeto: "2e98a700-1205-4e9b-8161-000000000006" },
] as const;

export const ingresoDePruebaHabilitado = (env: Record<string, string | undefined>) => env.AUTH_DEV === "1";

interface Opciones {
  /** El emisor del proveedor local: así el jugador es el mismo que si ingresara por Keycloak. */
  emisor: string;
  web: URL;
  /** Arma la cookie de sesión igual que el retorno del proveedor. */
  cookie: (handle: string) => string;
}

/**
 * GET anuncia los jugadores disponibles. POST `{usuario}` abre una sesión web con cookie;
 * POST `{usuario, app: desafío}` entrega un código que la app canjea en /api/auth/canje con su verificador.
 */
export function crearIngresoDePrueba(pool: Pick<Pool, "query">, { emisor, web, cookie }: Opciones) {
  return async function ingresoDePrueba(req: IncomingMessage, res: ServerResponse, claveAnterior: string) {
    if (req.method === "GET") {
      return responderJson(res, 200, { usuarios: jugadoresDePrueba.map(({ usuario, nombre }) => ({ usuario, nombre })) });
    }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "GET, POST" }).end(); return; }
    const datos = await leerJson(req).catch(() => null);
    const elegido = jugadoresDePrueba.find(j => j.usuario === datos?.usuario);
    if (!elegido) return responderJson(res, 400, { error: "Jugador de prueba desconocido." });
    const desafio = datos?.app;
    if (desafio !== undefined && (typeof desafio !== "string" || !esDesafio(desafio))) {
      return responderJson(res, 400, { error: "Desafío de la app inválido." });
    }
    // Sin desafío se deja una cookie: como en cualquier acción con cookie, solo desde el origen del juego.
    if (desafio === undefined && !origenValido(req, web)) { res.writeHead(403).end(); return; }
    const jugador = await registrarJugador(pool, emisor, elegido.sujeto, elegido.nombre);
    if (!jugador) return responderJson(res, 403, { error: "Tu cuenta se está eliminando." });
    if (desafio !== undefined) {
      return responderJson(res, 200, { codigo: await emitirCanje(pool, jugador.id, desafio, jugador.cancelada) });
    }
    const handle = await abrirSesionWeb(pool, claveAnterior, jugador.id);
    res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": cookie(handle) })
      .end(JSON.stringify({ jugador: { id: jugador.id, nombre: elegido.nombre }, bajaCancelada: jugador.cancelada }));
  };
}
