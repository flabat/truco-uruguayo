import type { Pool, PoolClient } from "pg";
import { ErrorPeticion } from "./http.ts";

const clave = "tercetos";
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

export async function permiteTercetos(db: Pool | PoolClient, jugador: string) {
  // En una admisión, el bloqueo se conserva hasta confirmar el asiento.
  const { rows: [fila] } = await db.query(`SELECT audiencia='todos' OR
    (audiencia='seleccionados' AND $2::uuid=ANY(jugadores)) AS permite
    FROM juego.funciones WHERE clave=$1 FOR SHARE`, [clave, jugador]);
  return fila?.permite === true;
}

export async function exigirTercetos(db: Pool | PoolClient, jugador: string) {
  if (!await permiteTercetos(db, jugador)) {
    throw new ErrorPeticion(403, "Tercetos no está disponible para tu cuenta en este momento.");
  }
}

export async function leerTercetos(db: Pool | PoolClient) {
  const { rows: [datos] } = await db.query(`SELECT f.version, f.audiencia,
    ARRAY(SELECT jsonb_build_object('id', j.id, 'nombre', j.nombre)
      FROM juego.jugadores j WHERE j.id=ANY(f.jugadores) ORDER BY j.nombre, j.id) AS jugadores,
    ARRAY(SELECT jsonb_build_object('version', c.version, 'fecha', c.fecha, 'operador', j.nombre,
      'anterior', c.anterior, 'audiencia', c.audiencia, 'agregados',
      ARRAY(SELECT unnest(c.jugadores) EXCEPT SELECT unnest(c.jugadores_antes)), 'retirados',
      ARRAY(SELECT unnest(c.jugadores_antes) EXCEPT SELECT unnest(c.jugadores)))
      FROM juego.cambios_funciones c JOIN juego.jugadores j ON j.id=c.operador
      WHERE c.clave=f.clave ORDER BY c.version DESC LIMIT 20) AS historial
    FROM juego.funciones f WHERE f.clave=$1`, [clave]);
  if (!datos) throw new ErrorPeticion(503, "Falta la configuración de Tercetos.");
  return datos;
}

export async function guardarTercetos(pool: Pool, operador: string, datos: Record<string, unknown>) {
  const { audiencia, jugadores, version } = datos;
  if (audiencia !== "desactivado" && audiencia !== "seleccionados" && audiencia !== "todos") {
    throw new ErrorPeticion(400, "Elegí una audiencia válida.");
  }
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 ||
      !Array.isArray(jugadores) || !jugadores.every(id => typeof id === "string" && uuid.test(id))) {
    throw new ErrorPeticion(400, "La revisión o la lista de jugadores es inválida.");
  }
  const ids = [...new Set<string>(jugadores.map(id => id.toLowerCase()))].sort();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [previa] } = await db.query("SELECT * FROM juego.funciones WHERE clave=$1 FOR UPDATE", [clave]);
    if (!previa) throw new ErrorPeticion(503, "Falta la configuración de Tercetos.");
    if (version !== previa.version) throw new ErrorPeticion(409, "Otra edición cambió la configuración. Volvé a cargarla.");
    const cuentas = await db.query("SELECT id FROM juego.jugadores WHERE id=ANY($1::uuid[])", [ids]);
    if (cuentas.rowCount !== ids.length) throw new ErrorPeticion(400, "La selección contiene un jugador desconocido.");
    if (audiencia !== previa.audiencia || ids.join() !== previa.jugadores.join()) {
      await db.query(`UPDATE juego.funciones SET audiencia=$2, jugadores=$3, version=version+1 WHERE clave=$1`,
        [clave, audiencia, ids]);
      await db.query(`INSERT INTO juego.cambios_funciones
        (clave,version,operador,anterior,audiencia,jugadores_antes,jugadores) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [clave, version + 1, operador, previa.audiencia, audiencia, previa.jugadores, ids]);
    }
    const actual = await leerTercetos(db);
    await db.query("COMMIT");
    return actual;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}
