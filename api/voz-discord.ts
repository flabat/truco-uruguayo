import type { Pool, PoolClient } from "pg";
import { FalloDiscord, type Discord } from "./discord.ts";
import { ErrorPeticion } from "./http.ts";

type Vinculo = { mesa: string; servidor: string; categoria: string; intento: string; canal: string | null; retirando: boolean; regreso_publicado: boolean; intento_regreso: Date | null };
const fin = `(SELECT (evento->>'fecha')::timestamptz + interval '30 minutes'
  FROM juego.eventos_chico WHERE mesa=$1 AND evento->>'tipo'='cierre')`;

export function crearVoz(pool: Pool, discord: Discord, web: URL) {
  const { servidor, categoria } = discord;
  // Bloqueo de sesión para que el intento ya esté confirmado antes del POST no idempotente.
  // Las conexiones de voz pertenecen a un pool separado del arbitraje de las cartas.
  async function conMesa<T>(id: string, trabajo: (db: PoolClient) => Promise<T>, esperar: boolean) {
    if (pool.waitingCount >= 8) throw new FalloDiscord();
    const db = await pool.connect();
    let descartar = false;
    const clave = "voz-discord/" + id;
    try {
      if (esperar) await db.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [clave]);
      else {
        const { rows: [r] } = await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS libre", [clave]);
        if (!r.libre) return;
      }
      const { rows: [limite] } = await db.query(`SELECT ceil(extract(epoch FROM hasta-now())) AS segundos
        FROM juego.voz_pausas WHERE servidor=$1 AND hasta>now()`, [servidor]);
      if (limite) throw new FalloDiscord(429, true, Number(limite.segundos));
      try { return await trabajo(db); }
      catch (e) {
        if (e instanceof FalloDiscord && e.espera) {
          await db.query(`INSERT INTO juego.voz_pausas (servidor,hasta) VALUES ($1,now()+$2 * interval '1 second')
            ON CONFLICT (servidor) DO UPDATE SET hasta=greatest(juego.voz_pausas.hasta,excluded.hasta)`, [servidor,e.espera]);
        }
        throw e;
      }
    } finally {
      try { await db.query("SELECT pg_advisory_unlock_all()"); }
      catch { descartar = true; }
      db.release(descartar);
    }
  }

  async function existente(db: PoolClient, v: Vinculo) {
    if (v.servidor !== servidor || v.categoria !== categoria) throw new FalloDiscord();
    const id = v.canal ?? await discord.recuperar(v.intento);
    const canal = await discord.comprobar(id);
    if (canal && !v.canal) await db.query("UPDATE juego.voz_discord SET canal=$2 WHERE mesa=$1", [v.mesa, canal]);
    return canal;
  }

  async function publicarRegreso(db: PoolClient, vinculo: Vinculo, canal: string) {
    const destino = new URL("/volver/", web);
    destino.searchParams.set("mesa", vinculo.mesa);
    if (vinculo.intento_regreso && Date.now() - vinculo.intento_regreso.getTime() >= 60_000) {
      // Un canal concurrido o un mensaje borrado podrían ocultar el envío anterior.
      // Sin evidencia del bot conservamos el intento, para no duplicarlo.
      if (!await discord.encontrarRegreso(canal, destino.href)) throw new FalloDiscord();
    } else {
      if (!vinculo.intento_regreso) {
        await db.query("UPDATE juego.voz_discord SET intento_regreso=now() WHERE mesa=$1", [vinculo.mesa]);
      }
      try { await discord.publicarRegreso(canal, destino.href); }
      catch (error) {
        if (!vinculo.intento_regreso && error instanceof FalloDiscord && error.definitivo) {
          await db.query("UPDATE juego.voz_discord SET intento_regreso=NULL WHERE mesa=$1", [vinculo.mesa]);
        }
        throw error;
      }
    }
    await db.query("UPDATE juego.voz_discord SET regreso_publicado=true, intento_regreso=NULL WHERE mesa=$1", [vinculo.mesa]);
  }

  async function abrir(id: string, modo: "1v1" | "2v2" | "3v3") {
    return conMesa(id, async db => {
      // Los escritores del juego bloquean la mesa. Soltarla antes de llamar al proveedor.
      await db.query("BEGIN");
      let vinculo: Vinculo;
      let nuevo: boolean;
      try {
        await db.query("SELECT id FROM juego.mesas WHERE id=$1 FOR SHARE", [id]);
        const { rows: [plazo] } = await db.query(`SELECT ${fin} AS sobremesa, ${fin} <= now() AS cerrada`, [id]);
        if (plazo.cerrada) throw new ErrorPeticion(410, "Terminó la sobremesa de voz de esta partida.");
        const alta = await db.query<Vinculo>(`INSERT INTO juego.voz_discord(mesa,servidor,categoria,vence)
          VALUES ($1,$2,$3,coalesce($4::timestamptz,now()+interval '24 hours'))
          ON CONFLICT (mesa) DO NOTHING RETURNING *`, [id,servidor,categoria,plazo.sobremesa]);
        nuevo = alta.rowCount === 1;
        vinculo = alta.rows[0] ?? (await db.query<Vinculo>(`UPDATE juego.voz_discord
          SET vence=CASE WHEN retirando THEN vence ELSE coalesce($2::timestamptz,now()+interval '24 hours') END
          WHERE mesa=$1 RETURNING *`, [id,plazo.sobremesa])).rows[0];
        if (vinculo.servidor !== servidor || vinculo.categoria !== categoria) throw new FalloDiscord();
        await db.query("COMMIT");
      } catch (e) { await db.query("ROLLBACK"); throw e; }

      let canal = nuevo ? null : await existente(db, vinculo);
      if (canal && vinculo.retirando) {
        // Una baja ambigua podría completarse después. Terminarla antes de entregar otra invitación.
        await discord.eliminar(canal);
        canal = null;
      }
      if (!canal) {
        if (!nuevo) {
          // Discord confirmó Unknown Channel para el ID guardado o acreditado por auditoría.
          const { rows: [v] } = await db.query<Vinculo>(`UPDATE juego.voz_discord
            SET canal=null,intento=gen_random_uuid(),regreso_publicado=false,intento_regreso=NULL,retirando=false,reintentar='-infinity',
                vence=coalesce(${fin},now()+interval '24 hours') WHERE mesa=$1 RETURNING *`, [id]);
          vinculo = v;
        }
        try { canal = await discord.crear(modo, vinculo.intento); }
        catch (e) {
          if (e instanceof FalloDiscord && e.definitivo) await db.query("DELETE FROM juego.voz_discord WHERE mesa=$1", [id]);
          throw e;
        }
        await db.query("UPDATE juego.voz_discord SET canal=$2 WHERE mesa=$1", [id,canal]);
      }
      const invitacion = await discord.invitar(canal);
      if (!vinculo.regreso_publicado) {
        try { await publicarRegreso(db, vinculo, canal); }
        catch (error) {
          // La invitación ya es utilizable. La próxima apertura reintenta el mensaje.
          if (!(error instanceof FalloDiscord)) throw error;
          console.warn("Mensaje de regreso pendiente para la mesa", id);
        }
      }
      return invitacion;
    }, true);
  }

  async function limpiarMesa(id: string) {
    await conMesa(id, async db => {
      const { rows: [v] } = await db.query<Vinculo>(`SELECT * FROM juego.voz_discord WHERE mesa=$1
        AND servidor=$2 AND categoria=$3 AND greatest(vence,reintentar)<=now()`, [id,servidor,categoria]);
      if (!v) return;
      try {
        const canal = await existente(db, v);
        // Un turno confirmado durante la consulta a Discord puede haber renovado la sala.
        const baja = await db.query(`UPDATE juego.voz_discord SET retirando=true
          WHERE mesa=$1 AND vence<=now()`, [id]);
        if (!baja.rowCount) return;
        if (canal) await discord.eliminar(canal);
        await db.query("DELETE FROM juego.voz_discord WHERE mesa=$1", [id]);
      } catch (e) {
        await db.query("UPDATE juego.voz_discord SET reintentar=now()+interval '15 minutes' WHERE mesa=$1", [id]);
        throw e;
      }
    }, false);
  }

  async function limpiar() {
    const { rows } = await pool.query(`SELECT mesa FROM juego.voz_discord WHERE servidor=$1 AND categoria=$2
      AND greatest(vence,reintentar)<=now() ORDER BY greatest(vence,reintentar),mesa LIMIT 8`, [servidor,categoria]);
    for (const { mesa } of rows) {
      try { await limpiarMesa(mesa); }
      catch (e) {
        console.warn("Limpieza de voz pendiente para la mesa", mesa);
        if (e instanceof FalloDiscord && e.espera) break;
      }
    }
  }

  function iniciarLimpieza() {
    let trabajando = false;
    const timer = setInterval(async () => {
      if (trabajando) return;
      trabajando = true;
      try { await limpiar(); }
      catch { console.warn("Limpieza de voz temporalmente indisponible."); }
      finally { trabajando = false; }
    }, 60_000).unref();
    return () => clearInterval(timer);
  }
  return { abrir, limpiarMesa, limpiar, iniciarLimpieza };
}
