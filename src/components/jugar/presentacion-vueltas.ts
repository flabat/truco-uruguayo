import { useEffect, useRef, useState } from "react";
import type { Partida } from "./cliente";
import { pausaDeVoz, vocesEnAccion, type Voz } from "./Voz";

const entreCartas = 450;
const vueltaCompleta = 2000;

interface Paso {
  partida: Partida | undefined;
  antesDelResultado?: Partida;
  voz?: Voz;
  espera: number;
}

function pasosNuevos(
  anterior: Partida | undefined,
  actual: Partida | undefined,
  presencioReparto: boolean,
  pendientes: Paso[] = [],
): Paso[] {
  const enVivo = { partida: actual, espera: 0 };
  const vista = actual?.vista;
  if (!actual || !vista) return [enVivo];

  const previa = anterior?.manoNumero === actual.manoNumero ? anterior.vista : null;
  const primeraMano = presencioReparto && !anterior?.vista && actual.manoNumero === 1;
  const repartoSiguiente = anterior?.vista?.resultado && actual.manoNumero === anterior.manoNumero + 1;
  // Si se retomó una mano en curso o se perdió su reparto, ir directamente al estado recibido.
  if (!previa && !primeraMano && !repartoSiguiente) return [enVivo];
  const desde = previa?.acciones.length ?? 0;
  let jugadas = [...(previa?.vueltaActual?.jugadas ?? [])];
  let cerradas = previa?.vueltas.length ?? 0;
  // Son las cartas propias al comenzar esta actualización, incluidas las que se verán jugar.
  let cartas = previa?.cartas ?? [...vista.cartas, ...vista.acciones.flatMap(a =>
    a.tipo === "carta" && a.asiento === vista.asiento ? [a.carta] : [])];
  const pasos = previa ? pendientes.filter(p => p.espera > 0) : [];
  const indiceCobro = vista.indiceCobroLateral ?? vista.cobros.find(c => c.comparacionFlor)?.comparacionFlor?.indiceAccion;
  for (let i = desde; i < vista.acciones.length; i++) {
    const accion = vista.acciones[i];
    const esCarta = accion.tipo === "carta";
    if (esCarta) {
      jugadas = [...jugadas, { asiento: accion.asiento, carta: accion.carta }];
      if (accion.asiento === vista.asiento) cartas = cartas.filter(c => c !== accion.carta);
    }
    const completa = esCarta && jugadas.length === vista.equipoPorAsiento.length;
    if (completa) cerradas++;
    const ultimaAccion = i + 1 === vista.acciones.length;
    const acciones = vista.acciones.slice(0, i + 1);
    const valorTruco = 1 + acciones.filter(a => ["truco", "retruco", "vale-cuatro"].includes(a.tipo)).length;
    // Primero habla cada jugador. El cobro queda público después de terminar las declaraciones.
    const cobros = indiceCobro != null && indiceCobro < i
      ? vista.cobros.filter(c => c.motivo !== "truco") : (previa?.cobros ?? []);
    const puntos: Partida["puntos"] = anterior ? [...anterior.puntos] : [0, 0];
    for (const cobro of cobros.slice(previa?.cobros.length ?? 0)) {
      puntos[cobro.equipo] = Math.min(actual.meta, puntos[cobro.equipo] + cobro.tantos);
    }
    const parcial = {
      ...actual,
      // Las señas y palabras deben corresponder al prefijo que está en pantalla.
      pie: previa && anterior?.pie?.vuelta === cerradas + 1 && !completa ? anterior.pie : undefined,
      indicaciones: actual.indicaciones?.filter(d => d.indiceAccion <= i),
      puntos,
      ganadorPartida: null,
      turnos: actual.turnos?.slice(0, i + 1),
      vista: {
        ...vista, cartas, acciones,
        vueltaActual: completa ? null : { salida: jugadas[0]?.asiento ?? vista.mano, jugadas },
        vueltas: vista.vueltas.slice(0, cerradas),
        turno: null, legales: [], resultado: null, equipoGanador: null,
        pendiente: null, trucoPendiente: null, porDeclararFlor: null,
        cobros, valorTruco, indiceCobroLateral: cobros.length ? indiceCobro : undefined,
        pruebasDeTantos: undefined,
      },
    };
    if (!esCarta) {
      const voces = vocesEnAccion(vista, i);
      for (const [j, voz] of voces.entries()) {
        // Quien pulsa el botón ya vio su propia respuesta. Los tantos los declara el árbitro.
        if (j === 0 && voz.asiento === vista.asiento) continue;
        const alDia = ultimaAccion && !vista.resultado && voces.length === 1;
        pasos.push({ partida: alDia ? actual : parcial, voz, espera: pausaDeVoz });
      }
      continue;
    }
    const yaEnVivo = ultimaAccion && (!completa || vista.resultado?.motivo === "vueltas");
    const partida = yaEnVivo ? actual : parcial;
    // Hasta que aparezca la última carta, la vuelta sigue en el tapete sin veredicto ni cobro final.
    const antesDelResultado = completa ? {
      ...parcial,
      vista: {
        ...parcial.vista,
        vueltaActual: { salida: jugadas[0].asiento, jugadas },
        vueltas: vista.vueltas.slice(0, cerradas - 1),
      },
    } : undefined;
    pasos.push({ partida, antesDelResultado, espera: completa ? vueltaCompleta : entreCartas });
    if (completa) jugadas = [];
  }
  return [...pasos, enVivo];
}

// Un aviso puede contener varias jugadas o llegar mientras el tapete muestra una vuelta anterior.
export function usePresentacionVueltas(actual: Partida | undefined, presencioReparto: boolean, priorizarPie: boolean) {
  const tablero = useRef<HTMLDivElement>(null);
  const [secuencia, mostrar] = useState(() => ({
    recibida: actual, pasos: pasosNuevos(undefined, actual, presencioReparto),
  }));
  const saltarAlTurno = priorizarPie && (actual !== secuencia.recibida || secuencia.pasos[0].espera > 0);
  if (saltarAlTurno || secuencia.recibida && actual?.reconexion !== secuencia.recibida.reconexion) {
    // Una reconexión recupera el tapete de ahora, incluidos los gestos en su pose final.
    mostrar({ recibida: actual, pasos: [{ partida: actual, espera: 0 }] });
  } else if (actual?.version !== secuencia.recibida?.version || actual?.manoNumero !== secuencia.recibida?.manoNumero
      || actual?.indicaciones?.length !== secuencia.recibida?.indicaciones?.length) {
    mostrar({ recibida: actual, pasos: pasosNuevos(secuencia.recibida, actual, presencioReparto, secuencia.pasos) });
  }
  const paso = secuencia.pasos[0];
  const [pasoCargado, confirmarCarga] = useState<Paso>();
  useEffect(() => {
    if (!paso.espera) return;
    // El tiempo de descarga de un naipe no debe descontarse de su tiempo en el tapete.
    const naipes = paso.voz ? [] : Array.from(tablero.current?.querySelectorAll<HTMLImageElement>(".j-jugada img") ?? []);
    let timer: number | undefined;
    function alMostrarCartas() {
      if (timer !== undefined || naipes.some(img => !img.complete)) return;
      if (paso.antesDelResultado) confirmarCarga(paso);
      timer = window.setTimeout(() => {
        mostrar(s => s.pasos[0] === paso ? { ...s, pasos: s.pasos.slice(1) } : s);
      }, paso.espera);
    }
    for (const img of naipes) {
      img.addEventListener("load", alMostrarCartas);
      img.addEventListener("error", alMostrarCartas);
    }
    alMostrarCartas();
    return () => {
      window.clearTimeout(timer);
      for (const img of naipes) {
        img.removeEventListener("load", alMostrarCartas);
        img.removeEventListener("error", alMostrarCartas);
      }
    };
  }, [paso]);

  const mostrandoCartas = paso.espera > 0 &&
    (paso.partida !== secuencia.recibida || paso.espera === vueltaCompleta);
  const enPantalla = paso.antesDelResultado && paso !== pasoCargado ? paso.antesDelResultado : paso.partida;
  return { tablero, partida: mostrandoCartas ? enPantalla : actual, mostrandoCartas, voz: paso.voz };
}
