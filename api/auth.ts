import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import * as oidc from "openid-client";
import { cookieDe, esDesafio, esRetornoLocal, hash, nombreSesion, origenValido, sesionDe, verificadorCorresponde } from "./sesion.ts";
import { leerJson, responderJson } from "./http.ts";
import { crearIngresoDePrueba, rutaIngresoDePrueba } from "./auth-dev.ts";
import { abrirSesionWeb, diasSiete, emitirCanje, registrarJugador, secreto } from "./ingreso.ts";

export { origenValido, sesionDe };

const clientId = "truco-web";
const flujo = "truco_ingreso";
const sesion = nombreSesion;
const minutosDiez = 600;
const retornoApp = "eltruco://ingreso";
const texto = (res: ServerResponse, estado: number, mensaje: string) =>
  res.writeHead(estado, { "Content-Type": "text/plain; charset=utf-8" }).end(mensaje);

export async function identidadDeSesion(pool: Pool, req: IncomingMessage) {
  const handle = sesionDe(req)?.handle;
  if (!handle) return null;
  const clave = hash(handle);
  const { rows: [player] } = await pool.query<{ id: string; nombre: string; emisor: string; sujeto: string; renovar: boolean }>(`
    SELECT j.id, j.nombre, j.emisor, j.sujeto, s.tipo = 'app' AND s.vence < now() + interval '15 days' AS renovar
      FROM juego.sesiones s JOIN juego.jugadores j ON j.id = s.jugador
     WHERE s.clave = $1 AND s.vence > now()
  `, [clave]);
  if (!player) return null;
  // La sesión de la app se extiende con el uso, sin escribir en cada pedido.
  if (player.renovar) {
    await pool.query("UPDATE juego.sesiones SET vence = now() + interval '30 days' WHERE clave = $1 AND tipo = 'app'", [clave]);
  }
  return { id: player.id, nombre: player.nombre, emisor: player.emisor, sujeto: player.sujeto };
}

export async function jugadorDeSesion(pool: Pool, req: IncomingMessage) {
  const jugador = await identidadDeSesion(pool, req);
  return jugador && { id: jugador.id, nombre: jugador.nombre };
}

function regresoPermitido(valor: string | null) {
  if (valor === "/gestion/") return valor;
  // Únicamente rutas del juego, sin interpretar destinos arbitrarios enviados por el navegador.
  if (valor === "/perfil/" || valor === "/jugar/?crear=1") return valor;
  // La dirección de prueba de la app, que ahora redirige a /jugar/; queda por los ingresos en curso.
  if (valor === "/app/") return valor;
  if (valor && /^(?:\/volver\/\?mesa=|\/jugar\/\?mirar=)[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(valor)) return valor;
  if (valor && /^\/jugar\/(?:\?(?:invitacion|mesa)=[a-zA-Z0-9_-]{1,80})?$/.test(valor)) return valor;
  return "/#jugador";
}

interface OpcionesOIDC {
  web: URL;
  callback: URL;
  issuer: URL;
  backend: URL;
  local: boolean;
  salonHabilitado?: boolean;
  cerrarConexiones?: (jugador: string) => void;
  /** Guarda el token de Apple del jugador, si ingresó con Apple, para poder revocarlo en una baja. */
  capturarApple?: ((jugador: string, acceso: string) => Promise<void>) | null;
  /** AUTH_DEV=1: habilita el ingreso de prueba en /api/auth/dev. Nunca en un entorno con jugadores reales. */
  ingresoDePrueba?: boolean;
}

export function crearAuth(pool: Pool, { web, callback, issuer, backend, local, salonHabilitado = false, cerrarConexiones = () => {}, capturarApple, ingresoDePrueba = false }: OpcionesOIDC) {
  const protocol = "/protocol/openid-connect";
  const config = new oidc.Configuration({
    issuer: issuer.href,
    authorization_endpoint: issuer.href + protocol + "/auth",
    token_endpoint: backend.href + protocol + "/token",
    jwks_uri: backend.href + protocol + "/certs",
  }, clientId, { id_token_signed_response_alg: "RS256" }, oidc.None());
  if (local) oidc.allowInsecureRequests(config);
  else if ([web, callback, issuer, backend].some(url => url.protocol !== "https:")) {
    throw new Error("La identidad requiere HTTPS fuera del entorno local.");
  }
  oidc.enableNonRepudiationChecks(config);
  const inicio = new URL("/#jugador", web);
  function cookie(name: string, value: string, age: number) {
    return name + "=" + value + "; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=" + age
      + (web.protocol === "https:" ? "; Secure" : "");
  }
  // El emisor de la configuración es el mismo `iss` que firma el proveedor: el jugador de prueba es el de Keycloak.
  const dev = ingresoDePrueba
    ? crearIngresoDePrueba(pool, { emisor: config.serverMetadata().issuer, web, cookie: handle => cookie(sesion, handle, diasSiete) })
    : null;

  return async function auth(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, callback);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const actual = sesionDe(req);
    const sessionKey = hash(actual?.handle ?? "");

    if (req.method === "GET" && url.pathname === "/api/auth/login") {
      const regreso = regresoPermitido(url.searchParams.get("volver"));
      const desafioApp = url.searchParams.get("app");
      if (desafioApp !== null && !esDesafio(desafioApp)) { texto(res, 400, "Desafío de la app inválido."); return; }
      // `npm run app:web` vuelve a su proxy local en lugar de eltruco://; solo junto a un desafío PKCE.
      const retornoLocal = url.searchParams.get("retorno");
      if (retornoLocal !== null && (desafioApp === null || !esRetornoLocal(retornoLocal))) {
        texto(res, 400, "Retorno inválido."); return;
      }
      // El intento y la sesión deben quedar en el dominio anunciado al navegador.
      if (req.headers.host !== web.host) {
        const login = new URL("/api/auth/login", web);
        if (desafioApp !== null) login.searchParams.set("app", desafioApp);
        else login.searchParams.set("volver", regreso);
        if (retornoLocal !== null) login.searchParams.set("retorno", retornoLocal);
        res.writeHead(303, { Location: login.href }).end();
        return;
      }
      const handle = secreto();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      await pool.query("DELETE FROM juego.ingresos WHERE vence <= now()");
      await pool.query("DELETE FROM juego.sesiones WHERE vence <= now()");
      await pool.query("DELETE FROM juego.canjes WHERE vence <= now()");
      await pool.query("INSERT INTO juego.ingresos (clave, estado, nonce, verificador, regreso, desafio_app) VALUES ($1,$2,$3,$4,$5,$6)",
        [hash(handle), state, nonce, verifier, retornoLocal ?? regreso, desafioApp]);
      const location = oidc.buildAuthorizationUrl(config, {
        response_type: "code", redirect_uri: callback.href, scope: "openid profile",
        state, nonce, prompt: "login", code_challenge_method: "S256",
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      });
      res.writeHead(303, { Location: location.href, "Set-Cookie": cookie(flujo + "_" + state, handle, minutosDiez) }).end();
      return;
    }

    if (req.method === "GET" && url.pathname === callback.pathname) {
      const state = url.searchParams.get("state") ?? "";
      // Los ingresos ya abiertos antes de esta migración usaban una cookie compartida.
      const nombreFlujo = cookieDe(req, flujo + "_" + state) ? flujo + "_" + state : flujo;
      const { rows: [attempt] } = await pool.query(
        "DELETE FROM juego.ingresos WHERE clave = $1 AND estado = $2 AND vence > now() RETURNING estado, nonce, verificador, regreso, desafio_app",
        [hash(cookieDe(req, nombreFlujo)), state]);
      res.setHeader("Set-Cookie", cookie(nombreFlujo, "", 0));
      if (!attempt) { texto(res, 401, "El ingreso venció. Volvé a ingresar desde el juego."); return; }
      let claims, acceso: string;
      try {
        const tokens = await oidc.authorizationCodeGrant(config, url, {
          expectedState: attempt.estado, expectedNonce: attempt.nonce,
          pkceCodeVerifier: attempt.verificador, idTokenExpected: true,
        });
        claims = tokens.claims()!;
        acceso = tokens.access_token;
      } catch {
        texto(res, 401, "No se pudo verificar el ingreso. Volvé a ingresar desde el juego.");
        return;
      }
      // Algunos proveedores usan el correo como nombre de usuario. El nombre se muestra a toda la mesa.
      const name = [claims.given_name, claims.preferred_username]
        .find(value => typeof value === "string" && value.trim() && !value.includes("@")) || "Jugador";
      // Volver a ingresar dentro de los 30 días cancela la baja. Vencida, la cuenta ya se está borrando.
      const jugador = await registrarJugador(pool, claims.iss, claims.sub, name);
      if (!jugador) { texto(res, 403, "Tu cuenta se está eliminando."); return; }
      const cancelada = jugador.cancelada;
      // Un fallo al guardar el token de Apple no impide ingresar.
      await capturarApple?.(jugador.id, acceso).catch(() => console.warn("No se pudo guardar el token de Apple del ingreso."));
      if (attempt.desafio_app) {
        const codigo = await emitirCanje(pool, jugador.id, attempt.desafio_app, cancelada);
        const destino = new URL(esRetornoLocal(attempt.regreso) ? attempt.regreso : retornoApp);
        destino.searchParams.set("codigo", codigo);
        res.writeHead(303, { Location: destino.href, "Set-Cookie": cookie(nombreFlujo, "", 0) }).end();
        return;
      }
      const handle = await abrirSesionWeb(pool, sessionKey, jugador.id);
      const destino = cancelada ? "/perfil/?baja=cancelada" : regresoPermitido(attempt.regreso);
      res.writeHead(303, { Location: new URL(destino, web).href, "Set-Cookie": [
        cookie(nombreFlujo, "", 0), cookie(sesion, handle, diasSiete),
      ] }).end();
      return;
    }

    if (dev && url.pathname === rutaIngresoDePrueba) return dev(req, res, sessionKey);

    if (req.method === "POST" && url.pathname === "/api/auth/canje") {
      const vencido = () => responderJson(res, 401, { error: "El ingreso venció. Volvé a ingresar." });
      const datos = await leerJson(req).catch(() => null);
      const codigo = datos?.codigo, verificador = datos?.verificador;
      if (typeof codigo !== "string" || typeof verificador !== "string") return vencido();
      // Leer y borrar en la misma consulta: el código sirve una sola vez, aunque el verificador no corresponda.
      const { rows: [canje] } = await pool.query(
        "DELETE FROM juego.canjes WHERE clave = $1 RETURNING jugador, desafio, baja_cancelada, vence > now() AS vigente",
        [hash(codigo)]);
      if (!canje?.vigente || !verificadorCorresponde(verificador, canje.desafio)) return vencido();
      const handle = secreto();
      const { rows: [jugador] } = await pool.query(`
        WITH sesion AS (
          INSERT INTO juego.sesiones (clave, jugador, tipo, vence) VALUES ($1, $2, 'app', now() + interval '30 days')
        )
        SELECT id, nombre FROM juego.jugadores WHERE id = $2
      `, [hash(handle), canje.jugador]);
      return responderJson(res, 200, { sesion: handle, jugador, bajaCancelada: canje.baja_cancelada });
    }

    if (req.method === "GET" && url.pathname === "/api/jugador") {
      const player = await jugadorDeSesion(pool, req);
      if (!player) {
        res.writeHead(401, { "Content-Type": "application/json" }).end("null");
        return;
      }
      const permiso = await pool.query("SELECT 1 FROM juego.reporteros WHERE jugador = $1", [player.id]);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        ...player, salonHabilitado, puedeReportar: permiso.rowCount === 1,
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      if (!origenValido(req, web)) { res.writeHead(403).end(); return; }
      const { rows: [cerrada] } = await pool.query("DELETE FROM juego.sesiones WHERE clave = $1 RETURNING jugador", [sessionKey]);
      if (cerrada) cerrarConexiones(cerrada.jugador);
      if (actual?.via === "encabezado") { res.writeHead(204).end(); return; }
      res.writeHead(303, { Location: inicio.href, "Set-Cookie": cookie(sesion, "", 0) }).end();
      return;
    }
    res.writeHead(404).end();
  };
}
