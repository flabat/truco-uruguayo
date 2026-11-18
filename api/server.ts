import { createServer } from "node:http";
import pg from "pg";
import { migrate } from "./migrate.ts";
import { crearAuth } from "./auth.ts";
import { crearRutasMesas, esRutaMesas } from "./mesas.ts";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 1500,
});
pool.on("error", error => console.error("Conexión a PostgreSQL interrumpida:", error.message));
await migrate(pool);
const web = new URL(process.env.WEB_ORIGIN!);
const mesas = crearRutasMesas(pool, web);
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
      if (esRutaMesas(ruta)) await mesas(request, response);
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

server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
process.on("SIGTERM", () => server.close(() => pool.end()));
