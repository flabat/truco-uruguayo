import type { PoolClient } from "pg";
import { textoFrasePie, type IndicacionPie } from "../src/motor/senas-pie.ts";
import { canto } from "../src/lib/cantos.ts";
import { cartasPorId } from "../src/lib/cartas.ts";
import { esCardId, type CardId } from "../src/motor/cartas.ts";
import type { AccionOnline, Cobro } from "../src/motor/cantos-online.ts";
import { resumirTantos } from "../src/motor/resumen-tantos.ts";
import { esAccionPublica } from "./tablero-espectador.ts";

export interface CursorReporte {
  mano: number;
  posicion: number;
  vuelta: number;
  puntos: string;
  fase: "presentacion" | "jugada" | "resultado";
  cliente: string;
  duelo?: number;
  voz?: number;
  indicaciones?: number;
}

interface ManoReporte {
  modo: "1v1" | "2v2" | "3v3";
  meta: number;
  politica: string;
  perfil: string | null;
  version_reglas: number;
  version_reparto: string;
  regla_flor: string | null;
  responden_sin_flor: number[] | null;
  tipo_reparto: string | null;
  muestra: CardId;
  mano: number;
  dador: number;
  computadoras: boolean[];
  cobros: Cobro[];
  puntos_anteriores: [number, number] | null;
  puntos_inicio: [number, number];
  puntos: [number, number] | null;
  build: string | null;
  secuencia: string | null;
  indicaciones: IndicacionPie[];
  acciones: (AccionOnline & { duelo: number | null })[];
}

interface ManoAnterior {
  numero: number;
  puntos_inicio: [number, number];
}

function jugadasDeMano(mano: ManoReporte): string[] {
  const cantidad = { "1v1": 2, "2v2": 4, "3v3": 6 }[mano.modo];
  let dueloAnterior: number | null = null;
  let cartasJugadas = 0;
  const entradas: string[] = [];
  function agregarPalabras(indice: number) {
    for (const i of mano.indicaciones.filter(i => i.indiceAccion === indice)) {
      entradas.push(`V${i.vuelta} · A${i.emisor} le dijo a A${i.destinatario} «${textoFrasePie[i.frase]}»`);
    }
  }
  mano.acciones.forEach((accion, indice) => {
    agregarPalabras(indice);
    if (!esAccionPublica(accion, mano.responden_sin_flor)) return;
    if (accion.duelo !== dueloAnterior) {
      dueloAnterior = accion.duelo;
      cartasJugadas = 0;
    }
    const vuelta = 1 + Math.floor(cartasJugadas / (accion.duelo ? 2 : cantidad));
    const lance = accion.duelo ? `D${accion.duelo} · ` : "";
    let jugada = "acción desconocida";
    if (accion.tipo === "carta" && esCardId(accion.carta)) {
      jugada = cartasPorId.get(accion.carta)!.nombre;
      cartasJugadas++;
    } else if (Object.hasOwn(canto, accion.tipo)) {
      jugada = canto[accion.tipo as keyof typeof canto];
    }
    entradas.push(`${indice + 1}. ${lance}V${vuelta} · A${accion.asiento} · ${jugada}`);
  });
  agregarPalabras(mano.acciones.length);
  return entradas;
}

const limiteUrl = 3500;

function enlaceBorrador(titulo: string, cabecera: string, manos: string[], omitidas: number, jugadas: string[]) {
  const url = new URL("https://github.com/flabat/truco-uruguayo/issues/new");
  url.searchParams.set("title", titulo);
  let primeraMano = 0;
  let primeraJugada = 0;
  do {
    url.searchParams.set("body", [
      cabecera,
      "### Chico",
      ...(omitidas + primeraMano ? [`… ${omitidas + primeraMano} manos anteriores en el registro.`] : []),
      ...(!manos.length && !omitidas ? ["Primera mano."] : manos.slice(primeraMano)),
      "",
      "### Jugadas de esta mano hasta el reporte",
      ...(primeraJugada ? [`… ${primeraJugada} jugadas anteriores en el registro.`] : []),
      ...(jugadas.length ? jugadas.slice(primeraJugada) : ["Sin cartas jugadas ni cantos públicos."]),
    ].join("\n"));
    if (url.href.length <= limiteUrl) break;
    if (primeraMano < manos.length) primeraMano++;
    else primeraJugada++;
  } while (primeraJugada <= jugadas.length);
  return url.href;
}

/** La ruta autentica la cuenta y resuelve su asiento. La posición es global en la mano,
 * incluso en pico a pico. La consulta nunca incorpora decisiones posteriores a la visible. */
export async function prepararReporte(db: PoolClient, mesa: string, asiento: number, cursor: CursorReporte, web: URL, reporteId: string) {
  const { rows: [mano] } = await db.query<ManoReporte>(`
    SELECT m.modo, m.meta, m.politica, coalesce(r.cabecera->>'perfil', m.perfil_tercetos, h.version_senas) AS perfil,
      h.indicaciones, h.version_reglas, h.reparto->>'versionReparto' AS version_reparto, h.reparto->>'reglaFlor' AS regla_flor,
      h.reparto->'respondenSinFlor' AS responden_sin_flor,
      h.reparto->>'muestra' AS muestra, h.tipo_reparto, h.puntos_inicio, e.build, e.secuencia,
      (h.reparto->>'mano')::integer AS mano, (h.reparto->>'dador')::integer AS dador,
      (SELECT array_agg(a.computadora ORDER BY a.asiento) FROM juego.asientos a WHERE a.mesa=h.mesa) AS computadoras,
      e.evento->'puntos' AS puntos, previo.evento->'puntos' AS puntos_anteriores,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('equipo', c->'equipo', 'tantos', c->'tantos', 'motivo', c->'motivo',
          'valor', c->'valor') ORDER BY indice), '[]')
        FROM jsonb_array_elements(e.evento->'cobros') WITH ORDINALITY AS premios(c, indice)
        WHERE c->>'motivo' IN ('truco', 'flor', 'envido')) AS cobros,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('asiento', dato->'asiento', 'tipo', dato->'tipo',
          'duelo', dato->'duelo', 'carta', CASE WHEN dato->>'tipo'='carta' THEN dato->'carta' END) ORDER BY i), '[]')
        FROM jsonb_array_elements(h.acciones) WITH ORDINALITY AS a(dato, i) WHERE i <= $3) AS acciones
      FROM juego.manos h JOIN juego.mesas m ON m.id=h.mesa
      LEFT JOIN juego.replays_chico r ON r.mesa=h.mesa
      LEFT JOIN juego.eventos_chico e ON e.mesa=h.mesa AND e.mano=h.numero AND e.posicion=$3
      LEFT JOIN juego.eventos_chico previo ON previo.mesa=e.mesa AND previo.mano=e.mano AND previo.posicion=e.posicion-1
      WHERE h.mesa=$1 AND h.numero=$2 AND $3 BETWEEN 0 AND jsonb_array_length(h.acciones)`,
    [mesa, cursor.mano, cursor.posicion]);
  if (!mano) return null;

  const { rows: anteriores } = await db.query<ManoAnterior>(
    "SELECT numero, puntos_inicio FROM juego.manos WHERE mesa=$1 AND numero<$2 ORDER BY numero DESC LIMIT $3", [mesa, cursor.mano, 24]);
  anteriores.reverse();
  const omitidas = (anteriores[0]?.numero ?? cursor.mano) - 1;
  const historial = anteriores.map((anterior, i) => {
    const cierre = anteriores[i + 1]?.puntos_inicio ?? mano.puntos_inicio;
    return `- Mano ${anterior.numero}: ${anterior.puntos_inicio.join("-")} → ${cierre.join("-")}`;
  });
  const anterioresAlCursor = mano.indicaciones.filter(i => i.indiceAccion < cursor.posicion).length;
  const visibles = cursor.indicaciones ?? anterioresAlCursor;
  if (visibles < anterioresAlCursor || visibles > mano.indicaciones.length
    || (visibles && mano.indicaciones[visibles - 1].indiceAccion > cursor.posicion)) return null;
  mano.indicaciones = mano.indicaciones.slice(0, visibles);
  const secuencia = mano.secuencia === null ? null : Number(mano.secuencia) + visibles - anterioresAlCursor;
  const confirmados = cursor.posicion === 0 ? mano.puntos_inicio : mano.puntos;
  const antesDeJugar = cursor.posicion === 1 ? mano.puntos_inicio : mano.puntos_anteriores;
  const cobros = antesDeJugar ? resumirTantos(mano.cobros, antesDeJugar, mano.meta).cobros.map(c =>
    `E${c.equipo} +${c.tantos} por ${c.motivo}${c.valor != null && c.valor !== c.tantos ? ` (valor ${c.valor})` : ""}`)
    : mano.cobros.map(c => `E${c.equipo} · ${c.motivo} · valor registrado ${c.valor ?? c.tantos}`);
  const enlaceMesa = new URL("/jugar/", web.origin);
  enlaceMesa.searchParams.set("mesa", mesa);
  const lance = cursor.duelo ? `, duelo ${cursor.duelo}` : mano.tipo_reparto ? `, ${mano.tipo_reparto}` : "";
  const voz = cursor.voz === undefined ? "" : `, voz ${cursor.voz}`;
  const titulo = `Mesa · mano ${cursor.mano}, vuelta ${cursor.vuelta}${lance} · jugada ${cursor.posicion}`;
  const cabecera = [
    "### ¿Qué pasó?", "", "", "### ¿Qué esperabas?", "", "",
    "### Posición reportada",
    `- Mesa / chico: ${mesa} · ${enlaceMesa.href}`,
    `- Reporte: ${reporteId} · secuencia: ${secuencia ?? "sin evento de replay"}`,
    `- Mano ${cursor.mano}${lance} · posición ${cursor.posicion} · vuelta visible ${cursor.vuelta} · ${cursor.fase}${voz}`,
    `- Asiento del reporte: A${asiento} (base 0) · modalidad: ${mano.modo} · meta: ${mano.meta}`,
    `- Asientos: ${mano.computadoras.map((bot, i) => `A${i} ${bot ? "computadora" : "persona"}`).join(", ")} · mano: A${mano.mano} · dador: A${mano.dador}`,
    `- Tanteador visible: ${cursor.puntos} · confirmado: ${confirmados?.join("-") ?? "sin registro"} · inicio de mano: ${mano.puntos_inicio.join("-")}`,
    ...(cobros.length ? [`- Cobros de la jugada: ${cobros.join(", ")}`] : []),
    `- Muestra: ${cartasPorId.get(mano.muestra)?.nombre ?? "sin registro"} · reglas: v${mano.version_reglas} · reparto: ${mano.version_reparto} · flor: ${mano.regla_flor ?? "original"}`,
    `- Perfil: ${mano.perfil ?? mano.modo} · política: ${mano.politica}`,
    `- Motor del evento: ${mano.build ?? "sin registro"} · cliente: ${cursor.cliente || "sin versión"}`,
    "[Cómo reproducir la posición](https://github.com/flabat/truco-uruguayo/blob/main/docs/multijugador/replay-chico.md)", "",
  ].join("\n");
  return { secuencia, url: enlaceBorrador(titulo, cabecera, historial, omitidas, jugadasDeMano(mano)) };
}
