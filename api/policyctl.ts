import {readFileSync} from "node:fs";
import pg from "pg";
import type { Asiento } from "../src/motor/reparto.ts";
import { supportedFormats, seatsFor, type Format } from "../training/contracts/index.ts";
import { incumbent } from "../training/seat/index.ts";
import { artifactPin, openActor } from "./actor-registry.ts";

const [command, rawFormat, pin] = process.argv.slice(2);
const format = rawFormat as Format;
if (!supportedFormats.includes(format)) throw new Error("Formato desconocido. Disponibles: " + supportedFormats.join(", "));
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  if (command === "register") {
    const artifact = JSON.parse(readFileSync(0, "utf8"));
    for (let seat = 0; seat < seatsFor(format); seat++) openActor(artifact, format, seat as Asiento);
    const pin = artifactPin(artifact);
    await pool.query("INSERT INTO juego.artefactos VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [pin, format, JSON.stringify(artifact)]);
    console.log(pin);
  } else if (command === "activate") {
    const selected = await pool.query(`INSERT INTO juego.activaciones SELECT formato,pin FROM juego.artefactos
      WHERE formato=$1 AND pin=$2 ON CONFLICT (formato) DO UPDATE SET pin=excluded.pin RETURNING pin`, [format, pin]);
    if (!selected.rowCount) throw new Error("El registro no contiene ese actor para el formato.");
    console.log(pin);
  } else if (command === "rollback") {
    await pool.query("DELETE FROM juego.activaciones WHERE formato=$1", [format]);
    console.log(incumbent.id);
  } else throw new Error("Usá register, activate o rollback.");
} finally { await pool.end(); }
