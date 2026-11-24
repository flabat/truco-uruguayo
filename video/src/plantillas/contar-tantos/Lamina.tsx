// Lámina de «contar tantos»: todo el movimiento sale del momento en que la voz dice cada palabra.
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-serif-text/latin-400.css";
import "@site/styles/site.css";
import "../../piezas/piezas.css";
import { useMemo } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { pieza, type CardId } from "@site/motor/cartas";
import type { Mano } from "../../lib/episodio.ts";
import { cartasQueCuentan, momentosDeCartas } from "../../lib/escena.ts";
import { armarLinea, type LineaGuion } from "../../lib/linea.ts";
import { palabraDeRango } from "../../lib/numeros.ts";
import type { Voz } from "../../lib/voz.ts";
import { BandaPano } from "../../piezas/BandaPano";
import { Cabecera } from "../../piezas/Cabecera";
import { Cierre } from "../../piezas/Cierre";
import { ManoGrande, type EstadoCarta } from "../../piezas/ManoGrande";
import { Narracion } from "../../piezas/Narracion";
import { PieGrabado } from "../../piezas/PieGrabado";
import { TablaValores } from "../../piezas/TablaValores";
import { Titulo } from "../../piezas/Titulo";

export type PropsLamina = {
  modalidad: "envido" | "flor";
  muestra: CardId;
  gancho: string;
  manos: Mano[];
  lineas: LineaGuion[];
  voz: Voz;
};

const rotulos: Record<string, string> = {
  "dos-del-mismo-palo": "Envido · sin pieza",
  "una-pieza": "Envido · una pieza",
  "tres-palos-distintos": "Envido · tres palos",
  "tres-del-mismo-palo": "Flor · un solo palo",
  "una-pieza-y-dos-del-mismo-palo": "Flor · una pieza",
  "dos-piezas": "Flor · dos piezas",
  "tres-piezas": "Flor · tres piezas",
};
const notas: Record<string, string> = {
  "dos-del-mismo-palo": "20 de base por el mismo palo.",
  "una-pieza": "La pieza ya incluye los 20.",
  "tres-palos-distintos": "Tres palos: vale la carta más alta.",
  "tres-del-mismo-palo": "20 de base para las tres cartas.",
  "una-pieza-y-dos-del-mismo-palo": "Cada pieza suma lo que pasa de 20.",
  "dos-piezas": "Cada pieza suma lo que pasa de 20.",
  "tres-piezas": "Cada pieza suma lo que pasa de 20.",
};
const rango = (c: CardId) => palabraDeRango(Number(c.slice(-2)) as never);

/** «20 + 4 + 7 = » y «31»: los términos salen del primer desglose del motor. */
function ecuacion({ tantos }: Mano): [string, string] {
  const { base, aportes } = tantos.desgloses[0];
  const terminos = [...(base ? [base] : []), ...aportes.map((a) => a.tantos).filter((n) => n > 0)];
  return terminos.length > 1 ? [terminos.join(" + ") + " = ", String(tantos.total)] : [`${tantos.total} de ${tantos.modalidad}`, ""];
}

export const Lamina = ({ modalidad, muestra, gancho, manos, lineas, voz }: PropsLamina) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const L = useMemo(() => armarLinea(lineas, voz.palabras), [lineas, voz]);
  const hay = (id: string) => lineas.some((l) => l.id === id);
  const desde = (id: string) => (hay(id) ? L.inicio(id) : Infinity);
  const actual = L.tramos.findLast((tr) => tr.inicio <= t)?.id ?? lineas[0].id;

  const [primera, segunda, tercera] = manos;
  const { de, a } = segunda.cambio!;
  // La carta cambia cuando la voz dice su rango después de «por».
  const enCambio = rango(de) === rango(a) ? 1 : 0;
  const giro = hay("cambio") ? (L.cuando("cambio", rango(a), enCambio) ?? L.inicio("cambio") + 1) : Infinity;
  const nMano = t >= desde("tercera") ? 2 : t >= giro ? 1 : 0;
  const mano = manos[nMano];

  // Cuándo se muestra el resultado de cada mano.
  const repartoTercera = hay("tercera") ? momentosDeCartas(L, "tercera", tercera.cartas) : [];
  const resultado = [
    [desde("respuesta1"), desde("cambio")],
    [desde("respuesta2"), desde("tercera")],
    modalidad === "envido"
      ? [Math.max(...repartoTercera, -Infinity) + 0.7, desde("valores") < Infinity ? desde("valores") : desde("cierre")]
      : [desde("respuesta3"), desde("valores") < Infinity ? desde("valores") : desde("cierre")],
  ];
  const [inicioR, finR] = resultado[nMano];
  const revelada = t >= inicioR && t < finR;

  // Entradas de las cartas: la primera mano en «cartas», la tercera en «tercera».
  const entradas = nMano === 0 && hay("cartas") ? momentosDeCartas(L, "cartas", primera.cartas)
    : nMano === 2 ? repartoTercera : mano.cartas.map(() => -10);
  const cuentan = cartasQueCuentan(mano.tantos);
  const cartas: EstadoCarta[] = mano.cartas.map((carta, i) => {
    const v = (t - giro) / 0.45;
    return {
      carta,
      entrada: spring({ frame: frame - Math.round(entradas[i] * fps), fps, config: { damping: 14 } }),
      cuenta: revelada ? cuentan.has(carta) : null,
      ...(nMano === 1 && carta === a && v >= 0 && v < 1 ? { giro: { escala: Math.cos(Math.PI * v), antes: de } } : {}),
    };
  });

  const pausa = L.pausas.find((p) => t >= p.desde && t < p.hasta);
  const muestraDicha = hay("pregunta") ? L.cuando("pregunta", "muestra") : null;
  const pulso = muestraDicha === null ? 0 : Math.max(0, 1 - Math.abs(t - muestraDicha - 0.2) / 0.35);

  const enValores = actual === "valores";
  const enCierre = actual === "cierre";
  const [izquierda, total] = ecuacion(mano);
  const titulo = enCierre ? "Probá otra mano."
    : enValores ? "Valores de las piezas"
    : revelada ? null
    : t >= desde("tercera") ? (modalidad === "flor" ? "¿Cuánto da esta flor?" : "Otra mano.")
    : t >= desde("cambio") ? (t >= giro ? (pieza(a, muestra) !== null ? "Ahora, con pieza." : "Cambió una carta.") : "Cambiá una carta.")
    : gancho;

  return (
    <AbsoluteFill className="lamina">
      <Cabecera />
      {titulo === null
        ? <Titulo largo={(izquierda + total).length}>{izquierda}<span style={{ color: "var(--accent)" }}>{total}</span></Titulo>
        : <Titulo largo={titulo.length}>{titulo}</Titulo>}
      <BandaPano muestra={muestra} pulso={pulso}
        nota={enCierre ? "" : enValores ? (modalidad === "envido" ? "Valor de envido de cada pieza." : "Lo que suma cada pieza a la flor.") : notas[mano.tantos.forma]}
        rotulo={enValores ? "Piezas del palo de la muestra" : enCierre ? "eltru.co" : rotulos[mano.tantos.forma]}
        derecha={pausa ? `Tu turno ${Math.ceil(pausa.hasta - t)}` : enValores || enCierre ? "" : "Tu mano"}>
        {enValores ? <TablaValores muestra={muestra} modalidad={modalidad} /> : enCierre ? <Cierre /> : <ManoGrande cartas={cartas} />}
      </BandaPano>
      <Narracion L={L} voz={voz} />
      <PieGrabado />
    </AbsoluteFill>
  );
};
