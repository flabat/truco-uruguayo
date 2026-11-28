import { createServer } from "node:http";
import pg from "pg";
import { configuracionExhibiciones, procesarExhibiciones } from "./exhibiciones.ts";
import { procesarEnsayos } from "./ensayos.ts";
import { migrate } from "./migrate.ts";
import { crearAuth, jugadorDeSesion } from "./auth.ts";
import { ingresoDePruebaHabilitado } from "./auth-dev.ts";
import { crearGestion } from "./gestion.ts";
import { crearPartidas, esRutaPartida } from "./partidas.ts";
import { crearEsperas } from "./esperas.ts";
import { crearRutasMesas, esRutaMesas, leerMesa } from "./mesas.ts";
import { crearVivo } from "./vivo.ts";
import { crearSalon } from "./salon.ts";
import { crearMisMesas } from "./mis-mesas.ts";
import { atenderPerfil } from "./perfil.ts";
import { atenderReporte, rutaReporte } from "./reportes.ts";
import { crearCuenta, crearInicioBaja, rutaEliminarCuenta } from "./cuenta.ts";
import { crearCapturaApple, crearServiciosBaja, procesarBajas } from "./bajas.ts";
import { crearNotificacionesApple, rutaNotificacionesApple } from "./notificaciones-apple.ts";
import { crearVersion, rutaVersion } from "./version.ts";

import { configDiscord, crearDiscord } from "./discord.ts";
import { crearVoz } from "./voz-discord.ts";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
pool.on("error", error => console.error("Conexión a PostgreSQL interrumpida:", error.message));
await migrate(pool);
const web = new URL(process.env.WEB_ORIGIN!);
const salonHabilitado = process.env.SALON_HABILITADO === "1";
const ingresoDePrueba = ingresoDePruebaHabilitado(process.env);
if (ingresoDePrueba) console.warn("AUTH_DEV=1: cualquiera puede entrar como un jugador de prueba en /api/auth/dev.");
const auth = crearAuth(pool, {
  web, salonHabilitado,
  callback: new URL(process.env.OIDC_CALLBACK ?? "/api/auth/callback", web),
  issuer: new URL(process.env.OIDC_ISSUER!),
  backend: new URL(process.env.OIDC_BACKEND!),
  local: process.env.LOCAL_OIDC === "1",
  cerrarConexiones: jugador => vivo.cerrarJugador(jugador),
  capturarApple: crearCapturaApple(process.env, pool),
  ingresoDePrueba,
});
const serviciosBaja = crearServiciosBaja(process.env, pool);
if (!serviciosBaja) console.warn("Sin KEYCLOAK_API_CLIENT_SECRET: las bajas vencidas no se completan.");

const version = crearVersion();
const server = createServer(async (request, response) => {
  if (request.url?.startsWith("/api/")) {
    try {
      const ruta = request.url.split("?")[0];
      const reporte = rutaReporte.exec(ruta);
      if (ruta === rutaVersion) version(request.method, response);
      else if (ruta.startsWith("/api/gestion/")) await gestion(request, response);
      else if (reporte) await atenderReporte(pool, web, reporte[1], request, response);
      else if (esRutaPartida(ruta)) await partidas.atender(request, response);
      else if (esRutaMesas(ruta)) await mesas(request, response);
      else if (ruta === "/api/mis-mesas") await misMesas(request, response);
      else if (ruta === "/api/salon/mesas" || ruta.startsWith("/api/salon/mesas/")) await salon(request, response);
      else if (ruta === "/api/perfil") await atenderPerfil(pool, request, response);
      else if (ruta === rutaEliminarCuenta) await cuenta(request, response);
      else if (ruta === rutaNotificacionesApple) await notificacionesApple(request, response);
      else await auth(request, response);
    } catch {
      response.writeHead(503).end("El servicio de jugadores no está disponible.");
    }
    return;
  }
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  let available = true;
  try {
    await pool.query("SELECT 1");
  } catch {
    available = false;
  }
  response.writeHead(available ? 200 : 503, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ api: "ok", postgres: available ? "ok" : "unavailable" }));
});

const alCambiar = (mesa: string) => vivo.alCambiar(mesa);
const partidas = crearPartidas(pool, web, alCambiar,
  mesa => vivo.jugadoresConectados().get(mesa.toLowerCase()) ?? new Set(), crearEsperas());
const configVoz = configDiscord();
const poolVoz = configVoz && new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3,
  connectionTimeoutMillis: 5000, statement_timeout: 15000 });
poolVoz?.on("error", () => console.warn("Conexión de voz a PostgreSQL interrumpida."));
const voz = poolVoz && configVoz ? crearVoz(poolVoz, crearDiscord(configVoz), web) : undefined;
const iniciarBaja = crearInicioBaja(pool, jugador => vivo.cerrarJugador(jugador), alCambiar);
const cuenta = crearCuenta(pool, web, iniciarBaja);
const notificacionesApple = crearNotificacionesApple(pool, process.env, {
  emisor: new URL(process.env.OIDC_ISSUER!).href, iniciarBaja, cerrarConexiones: jugador => vivo.cerrarJugador(jugador),
});
const salon = crearSalon(pool, salonHabilitado, web, process.env.VOZ_ESPECTADORA_HABILITADA === "1" ? voz : undefined);
const misMesas = crearMisMesas(pool);
const detenerLimpieza = voz?.iniciarLimpieza();
const mesas = crearRutasMesas(pool, web, alCambiar, voz, salonHabilitado);
const vivo = crearVivo(server, web, {
  autenticar: async req => (await jugadorDeSesion(pool, req))?.id ?? null,
  leerMesa: (mesa, jugador) => leerMesa(pool, mesa, jugador, web),
  ejecutar: partidas.ejecutar,
});

const gestion = crearGestion(pool, new URL(process.env.OIDC_ISSUER!).href, process.env.GESTION_SUJETO, vivo.jugadoresConectados, web.origin);
const detenerExhibiciones = procesarExhibiciones(pool, configuracionExhibiciones(process.env), alCambiar);
const detenerEnsayos = procesarEnsayos(pool, alCambiar);
const detenerBajas = serviciosBaja ? procesarBajas(pool, serviciosBaja) : undefined;
server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
process.on("SIGTERM", () => {
  detenerLimpieza?.();
  detenerEnsayos();
  detenerBajas?.();
  detenerExhibiciones();
  vivo.cerrar();
  server.close(() => Promise.all([pool.end(), poolVoz?.end()]));
});
