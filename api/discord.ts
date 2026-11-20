import { readFileSync } from "node:fs";
import { ErrorPeticion } from "./http.ts";

export interface ConfigDiscord { servidor: string; categoria: string; token: string }
const esId = (id: unknown): id is string => typeof id === "string" && /^\d{17,20}$/.test(id);

export function configDiscord(env = process.env): ConfigDiscord | undefined {
  const servidor = env.DISCORD_GUILD_ID;
  const categoria = env.DISCORD_CATEGORY_ID;
  if (!esId(servidor) || !esId(categoria)) return;
  let token = env.DISCORD_BOT_TOKEN?.trim();
  if (env.DISCORD_BOT_TOKEN_FILE) {
    try { token = readFileSync(env.DISCORD_BOT_TOKEN_FILE, "utf8").trim(); }
    catch { return; }
  }
  if (token) return { servidor, categoria, token };
}

export class FalloDiscord extends ErrorPeticion {
  readonly codigo: number;
  readonly definitivo: boolean;
  readonly espera: number;
  constructor(codigo = 0, definitivo = false, espera = 0) {
    super(503, espera ? `Discord pide esperar ${espera} s. Podés seguir jugando.` :
      "Discord no pudo abrir la voz de la mesa. Podés seguir jugando y reintentar.");
    this.codigo = codigo;
    this.definitivo = definitivo;
    this.espera = espera;
  }
}

interface Canal { id: string; guild_id: string; parent_id: string; type: number }
interface Entrada { target_id: string; user_id: string; action_type: number; reason?: string }
export function crearDiscord(config: ConfigDiscord, transporte = fetch) {
  const { servidor, categoria } = config;
  let pausaHasta = 0;
  async function llamar(ruta: string, method = "GET", datos?: object, motivo?: string) {
    const pausa = Math.ceil((pausaHasta - Date.now()) / 1000);
    if (pausa > 0) throw new FalloDiscord(429, true, pausa);
    try {
      const r = await transporte("https://discord.com/api/v10" + ruta, {
        method, redirect: "error", signal: AbortSignal.timeout(6000),
        headers: { Authorization: "Bot " + config.token, "Content-Type": "application/json",
          ...(motivo && { "X-Audit-Log-Reason": motivo }) },
        body: datos && JSON.stringify(datos),
      });
      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        const espera = Math.max(1, Math.ceil(Number(r.headers.get("retry-after")) || 0),
          Math.ceil(Number(body.retry_after) || 0));
        pausaHasta = Math.max(pausaHasta, Date.now() + espera * 1000);
        throw new FalloDiscord(429, true, espera);
      }
      if (!r.ok) {
        // Solo Unknown Channel autoriza sustituir el ID de un canal ya identificado.
        const body = await r.json().catch(() => ({}));
        throw new FalloDiscord(r.status === 404 && body.code === 10003 ? 10003 : r.status,
          [400, 401, 403, 404].includes(r.status));
      }
      if (method !== "DELETE") return await r.json();
    } catch (e) {
      if (e instanceof FalloDiscord) throw e;
      throw new FalloDiscord();
    }
  }
  function validar(c: Canal, id?: string) {
    if (!esId(c?.id) || (id && c.id !== id) || c.type !== 2 ||
        c.guild_id !== servidor || c.parent_id !== categoria) throw new FalloDiscord();
    return c.id;
  }
  async function comprobar(id: string) {
    try { return validar(await llamar("/channels/" + id), id); }
    catch (e) {
      if (e instanceof FalloDiscord && e.codigo === 10003) return null;
      throw e;
    }
  }
  return {
    servidor, categoria, comprobar,
    async crear(modo: "1v1" | "2v2" | "3v3", marca: string) {
      const modalidad = { "1v1": "Duelo", "2v2": "Parejas", "3v3": "Tercetos" }[modo];
      return validar(await llamar(`/guilds/${servidor}/channels`, "POST",
        { name: `${modalidad} · ${marca.slice(0, 8)}`, type: 2, parent_id: categoria }, "eltru-voz-" + marca));
    },
    async recuperar(marca: string) {
      const bot = await llamar("/users/@me");
      if (!esId(bot?.id)) throw new FalloDiscord();
      const auditoria = await llamar(`/guilds/${servidor}/audit-logs?action_type=10&user_id=${bot.id}&limit=100`);
      const entradas = (auditoria.audit_log_entries as Entrada[]).filter(e =>
        e.action_type === 10 && e.reason === "eltru-voz-" + marca && e.user_id === bot.id && esId(e.target_id));
      if (entradas.length !== 1) throw new FalloDiscord();
      return entradas[0].target_id;
    },
    async invitar(id: string) {
      const i = await llamar(`/channels/${id}/invites`, "POST", { max_age: 600, max_uses: 0, unique: false });
      if (i?.channel?.id !== id || !/^[A-Za-z0-9_-]{1,100}$/.test(i.code ?? "") ||
          !Number.isFinite(Date.parse(i.expires_at))) throw new FalloDiscord();
      return { enlace: "https://discord.gg/" + i.code, vence: i.expires_at as string };
    },
    async eliminar(id: string) {
      try { await llamar("/channels/" + id, "DELETE"); }
      catch (e) { if (!(e instanceof FalloDiscord && e.codigo === 10003)) throw e; }
    },
  };
}
export type Discord = ReturnType<typeof crearDiscord>;
