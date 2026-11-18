import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

const migrations = new URL("./migrations/", import.meta.url);

export async function migrate(pool: Pool) {
  const files = (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Otra instancia que arranque a la vez espera hasta que el esquema esté listo.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('truco-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT name FROM schema_migrations");
    const names = new Set(applied.rows.map(row => row.name));
    for (const file of files) {
      if (names.has(file)) continue;
      await client.query(await readFile(new URL(file, migrations), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
