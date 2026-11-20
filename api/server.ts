import { createServer } from "node:http";
import pg from "pg";
import { procesarEnsayos } from "./ensayos.ts";
import { migrate } from "./migrate.ts";
import { crearAuth, jugadorDeSesion } from "./auth.ts";
import { crearPartidas, esRutaPartida } from "./partidas.ts";
import { crearRutasMesas, esRutaMesas, leerMesa } from "./mesas.ts";
import { crearVivo } from "./vivo.ts";
import { crearSalon } from "./salon.ts";
import { atenderPerfil } from "./perfil.ts";

import { configDiscord, crearDiscord } from "./discord.ts";
import { crearVoz } from "./voz-discord.ts";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
pool.on("error", error => console.error("Conexión a PostgreSQL interrumpida:", error.message));
await migrate(pool);
const web = new URL(process.env.WEB_ORIGIN!);
const auth = crearAuth(pool, {
  web,
  callback: new URL(process.env.OIDC_CALLBACK ?? "/api/auth/callback", web),
  issuer: new URL(process.env.OIDC_ISSUER!),
  backend: new URL(process.env.OIDC_BACKEND!),
  local: process.env.LOCAL_OIDC === "1",
});

const server = createServer(async (request, response) => {
  if (request.url?.startsWith("/api/")) {
    try {
      const ruta = request.url.split("?")[0];
      if (esRutaPartida(ruta)) await partidas.atender(request, response);
      else if (esRutaMesas(ruta)) await mesas(request, response);
      else if (ruta === "/api/salon/mesas" || ruta.startsWith("/api/salon/mesas/")) await salon(request, response);
      else if (ruta === "/api/perfil") await atenderPerfil(pool, request, response);
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
const salon = crearSalon(pool);
const partidas = crearPartidas(pool, web, alCambiar);
const configVoz = configDiscord();
const poolVoz = configVoz && new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3,
  connectionTimeoutMillis: 5000, statement_timeout: 15000 });
poolVoz?.on("error", () => console.warn("Conexión de voz a PostgreSQL interrumpida."));
const voz = poolVoz && configVoz ? crearVoz(poolVoz, crearDiscord(configVoz), web) : undefined;
const detenerLimpieza = voz?.iniciarLimpieza();
const mesas = crearRutasMesas(pool, web, alCambiar, process.env.TERCETOS_HABILITADOS === "1", voz);
const vivo = crearVivo(server, web, {
  autenticar: async req => (await jugadorDeSesion(pool, req))?.id ?? null,
  leerMesa: (mesa, jugador) => leerMesa(pool, mesa, jugador, web),
  ejecutar: partidas.ejecutar,
});

const detenerEnsayos = procesarEnsayos(pool, alCambiar);
server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
process.on("SIGTERM", () => {
  detenerLimpieza?.();
  detenerEnsayos();
  vivo.cerrar();
  server.close(() => Promise.all([pool.end(), poolVoz?.end()]));
});
