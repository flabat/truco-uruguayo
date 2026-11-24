import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import * as oidc from "openid-client";
import { cookieDe, hash, nombreSesion, origenValido, sesionDe } from "./sesion.ts";

export { origenValido, sesionDe };

const clientId = "truco-web";
const flujo = "truco_ingreso";
const sesion = nombreSesion;
const minutosDiez = 600;
const diasSiete = 604800;
const secreto = () => randomBytes(32).toString("base64url");

export async function jugadorDeSesion(pool: Pool, req: IncomingMessage): Promise<{ id: string; nombre: string } | null> {
  const handle = sesionDe(req)?.handle;
  if (!handle) return null;
  const clave = hash(handle);
  const { rows: [player] } = await pool.query(`
    SELECT j.id, j.nombre, s.tipo = 'app' AND s.vence < now() + interval '15 days' AS renovar
      FROM juego.sesiones s JOIN juego.jugadores j ON j.id = s.jugador
     WHERE s.clave = $1 AND s.vence > now()
  `, [clave]);
  if (!player) return null;
  // La sesión de la app se extiende con el uso, sin escribir en cada pedido.
  if (player.renovar) {
    await pool.query("UPDATE juego.sesiones SET vence = now() + interval '30 days' WHERE clave = $1 AND tipo = 'app'", [clave]);
  }
  return { id: player.id, nombre: player.nombre };
}

function regresoPermitido(valor: string | null) {
  // Únicamente rutas del juego, sin interpretar destinos arbitrarios enviados por el navegador.
  if (valor === "/perfil/" || valor === "/jugar/?crear=1") return valor;
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
}

export function crearAuth(pool: Pool, { web, callback, issuer, backend, local, salonHabilitado = false, cerrarConexiones = () => {} }: OpcionesOIDC) {
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

  return async function auth(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, callback);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const actual = sesionDe(req);
    const sessionKey = hash(actual?.handle ?? "");

    if (req.method === "GET" && url.pathname === "/api/auth/login") {
      const regreso = regresoPermitido(url.searchParams.get("volver"));
      // El intento y la sesión deben quedar en el dominio anunciado al navegador.
      if (req.headers.host !== web.host) {
        const login = new URL("/api/auth/login", web);
        login.searchParams.set("volver", regreso);
        res.writeHead(303, { Location: login.href }).end();
        return;
      }
      const handle = secreto();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      await pool.query("DELETE FROM juego.ingresos WHERE vence <= now()");
      await pool.query("DELETE FROM juego.sesiones WHERE vence <= now()");
      await pool.query("INSERT INTO juego.ingresos (clave, estado, nonce, verificador, regreso) VALUES ($1,$2,$3,$4,$5)",
        [hash(handle), state, nonce, verifier, regreso]);
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
        "DELETE FROM juego.ingresos WHERE clave = $1 AND estado = $2 AND vence > now() RETURNING estado, nonce, verificador, regreso",
        [hash(cookieDe(req, nombreFlujo)), state]);
      res.setHeader("Set-Cookie", cookie(nombreFlujo, "", 0));
      if (!attempt) { res.writeHead(401).end("El ingreso venció. Volvé a ingresar desde el juego."); return; }
      let claims;
      try {
        const tokens = await oidc.authorizationCodeGrant(config, url, {
          expectedState: attempt.estado, expectedNonce: attempt.nonce,
          pkceCodeVerifier: attempt.verificador, idTokenExpected: true,
        });
        claims = tokens.claims()!;
      } catch {
        res.writeHead(401).end("No se pudo verificar el ingreso. Volvé a ingresar desde el juego.");
        return;
      }
      // Algunos proveedores usan el correo como nombre de usuario. El nombre se muestra a toda la mesa.
      const name = [claims.given_name, claims.preferred_username]
        .find(value => typeof value === "string" && value.trim() && !value.includes("@")) || "Jugador";
      const handle = secreto();
      // Un solo commit vincula la identidad y crea la sesión, incluso en el primer ingreso concurrente.
      await pool.query(`
        WITH jugador AS (
          INSERT INTO juego.jugadores (emisor, sujeto, nombre) VALUES ($1,$2,$3)
          ON CONFLICT (emisor, sujeto) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id
        ), anterior AS (DELETE FROM juego.sesiones WHERE clave = $4)
        INSERT INTO juego.sesiones (clave, jugador) SELECT $5, id FROM jugador
      `, [claims.iss, claims.sub, name, sessionKey, hash(handle)]);
      res.writeHead(303, { Location: new URL(regresoPermitido(attempt.regreso), web).href, "Set-Cookie": [
        cookie(nombreFlujo, "", 0), cookie(sesion, handle, diasSiete),
      ] }).end();
      return;
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
