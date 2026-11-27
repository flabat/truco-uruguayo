import {readFileSync} from "node:fs";
import pg from "pg";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { supportedFormats, seatsFor, type Format } from "../training/contracts/index.ts";
import { incumbent } from "../training/seat/index.ts";
import { artifactPin, openActor } from "./actor-registry.ts";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";
import { politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { abrirPoliticaPie, esFormatoPie, formatosPie } from "./politica-pie.ts";

const [command, rawFormat, pin] = process.argv.slice(2);
const format = rawFormat as Format;
// Las claves al pie (pairs-pie, triples-pie) registran actores aprendidos que las mesas al pie usan en lugar de la política fija.
const alPie = esFormatoPie(rawFormat);
if (!alPie && !supportedFormats.includes(format)) {
  throw new Error("Formato desconocido. Disponibles: " + [...supportedFormats, ...Object.keys(formatosPie)].join(", "));
}
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  if (command === "register") {
    const artifact = JSON.parse(readFileSync(0, "utf8"));
    if (alPie) abrirPoliticaPie(artifact, rawFormat);
    else for (let seat = 0; seat < seatsFor(format); seat++) openActor(artifact, format, seat as Asiento);
    const pin = artifactPin(artifact);
    await pool.query("INSERT INTO juego.artefactos VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [pin, rawFormat, JSON.stringify(artifact)]);
    console.log(pin);
  } else if (command === "activate") {
    const selected = await pool.query(`INSERT INTO juego.activaciones SELECT formato,pin FROM juego.artefactos
      WHERE formato=$1 AND pin=$2 ON CONFLICT (formato) DO UPDATE SET pin=excluded.pin RETURNING pin`, [rawFormat, pin]);
    if (!selected.rowCount) throw new Error("El registro no contiene ese actor para el formato.");
    console.log(pin);
  } else if (command === "rollback") {
    await pool.query("DELETE FROM juego.activaciones WHERE formato=$1", [rawFormat]);
    console.log(rawFormat === "pairs-pie" ? politicaPieParejas : rawFormat === "triples-pie" ? politicaPie : incumbent.id);
  } else throw new Error("Usá register, activate o rollback.");
} finally { await pool.end(); }
