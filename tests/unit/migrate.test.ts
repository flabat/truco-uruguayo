import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { migrate } from "../../api/migrate.ts";

test("un plazo transitorio de conexión permite arrancar y un error SQL corta la migración", async () => {
  const sintaxis = Object.assign(new Error("sentencia inválida"), { code: "42601" });
  const consultas: string[] = [];
  let intentos = 0;
  let liberado = false;
  const pool = {
    async connect() {
      if (++intentos === 1) throw new Error("Connection terminated due to connection timeout");
      return {
        async query(sql: string) {
          consultas.push(sql);
          if (sql === "BEGIN") throw sintaxis;
        },
        release() { liberado = true; },
      };
    },
  } as unknown as Pool;
  await assert.rejects(migrate(pool), error => error === sintaxis);
  assert.equal(intentos, 2);
  assert.deepEqual(consultas, ["BEGIN", "ROLLBACK"]);
  assert.ok(liberado);
});

test("las credenciales incorrectas fallan en el primer intento de conexión", async () => {
  const credencial = Object.assign(new Error("contraseña incorrecta"), { code: "28P01" });
  let intentos = 0;
  const pool = {
    async connect() { intentos++; throw credencial; },
  } as unknown as Pool;
  await assert.rejects(migrate(pool), error => error === credencial);
  assert.equal(intentos, 1);
});

test("el arranque termina si PostgreSQL sigue sin aceptar conexiones", async () => {
  const arranque = Object.assign(new Error("base iniciando"), { code: "57P03" });
  let intentos = 0;
  const pool = {
    async connect() { intentos++; throw arranque; },
  } as unknown as Pool;
  await assert.rejects(migrate(pool), error => error === arranque);
  assert.equal(intentos, 5);
});
