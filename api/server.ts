import { createServer } from "node:http";
import pg from "pg";
import { migrate } from "./migrate.ts";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 1500,
});
pool.on("error", error => console.error("Conexión a PostgreSQL interrumpida:", error.message));
await migrate(pool);

const server = createServer(async (request, response) => {
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
