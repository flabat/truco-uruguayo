import assert from "node:assert/strict";
import test from "node:test";
import { configDiscord, crearDiscord, FalloDiscord } from "../../api/discord.ts";

const servidor = "10000000000000001";
const categoria = "10000000000000002";
const id = "10000000000000003";
const config = { servidor, categoria, token: "simulado" };
const canal = { id, type: 2, guild_id: servidor, parent_id: categoria };

test("la voz se ofrece solo con configuración completa", () => {
  const env = { DISCORD_GUILD_ID: servidor, DISCORD_CATEGORY_ID: categoria, DISCORD_BOT_TOKEN: "simulado" };
  assert.deepEqual(configDiscord(env), config);
  assert.equal(configDiscord({}), undefined);
  assert.equal(configDiscord({ ...env, DISCORD_CATEGORY_ID: "" }), undefined);
  assert.equal(configDiscord({ ...env, DISCORD_BOT_TOKEN_FILE: "/ruta-inexistente/discord" }), undefined);
});

test("un canal inaccesible o movido conserva su asociación hasta que se confirme la baja", async () => {
  for (const [status, body] of [
    [403, { code: 50001 }], [404, {}], [500, {}], [200, { ...canal, type: 0 }],
    [200, { ...canal, parent_id: servidor }], [200, { ...canal, guild_id: categoria }], [200, { ...canal, id: categoria }],
  ] as const) {
    const cliente = crearDiscord(config, async () => Response.json(body, { status }));
    await assert.rejects(cliente.comprobar(id), FalloDiscord);
  }
  const ausente = crearDiscord(config, async () => Response.json({ code: 10003 }, { status: 404 }));
  assert.equal(await ausente.comprobar(id), null);
});

test("un fallo ambiguo en el alta queda pendiente y un límite pausa llamadas posteriores", async () => {
  const caido = crearDiscord(config, async () => { throw new Error("detalle privado de transporte"); });
  await assert.rejects(caido.crear("1v1", "marca"), (e: FalloDiscord) =>
    e instanceof FalloDiscord && !e.definitivo && !e.message.includes("privado"));
  let llamadas = 0;
  const limitado = crearDiscord(config, async () => {
    llamadas++;
    return Response.json({ retry_after: 1.1 }, { status: 429, headers: { "Retry-After": "3" } });
  });
  await assert.rejects(limitado.crear("1v1","marca"), (e: FalloDiscord) => e.definitivo && e.espera === 3);
  await assert.rejects(limitado.comprobar(id), FalloDiscord);
  assert.equal(llamadas, 1);
});
