import { useEffect, useRef, useState } from "react";
import type { Partida } from "./cliente";

const entreCartas = 450;
const vueltaCompleta = 2000;

interface Paso {
  partida: Partida | undefined;
  espera: number;
}

function pasosNuevos(anterior: Partida | undefined, actual: Partida | undefined): Paso[] {
  const enVivo = { partida: actual, espera: 0 };
  const vista = actual?.vista;
  if (!anterior || !actual || !vista) return [enVivo];

  const mismaMano = anterior.manoNumero === actual.manoNumero;
  const previa = mismaMano ? anterior.vista : null;
  const desde = previa?.acciones.length ?? 0;
  let jugadas = [...(previa?.vueltaActual?.jugadas ?? [])];
  let cerradas = previa?.vueltas.length ?? 0;
  // Son las cartas propias al comenzar esta actualización, incluidas las que se verán jugar.
  let cartas = previa?.cartas ?? [...vista.cartas, ...vista.acciones.flatMap(a =>
    a.tipo === "carta" && a.asiento === vista.asiento ? [a.carta] : [])];
  const pasos: Paso[] = [];
  for (let i = desde; i < vista.acciones.length; i++) {
    const accion = vista.acciones[i];
    if (accion.tipo !== "carta") continue;
    jugadas = [...jugadas, { asiento: accion.asiento, carta: accion.carta }];
    if (accion.asiento === vista.asiento) cartas = cartas.filter(c => c !== accion.carta);

    const completa = jugadas.length === vista.equipoPorAsiento.length;
    if (completa) cerradas++;
    const ultimaAccion = i + 1 === vista.acciones.length;
    const yaEnVivo = ultimaAccion && (!completa || vista.resultado?.motivo === "vueltas");
    const partida = yaEnVivo ? actual : {
      ...actual,
      puntos: anterior.puntos,
      ganadorPartida: null,
      turnos: actual.turnos?.slice(0, i + 1),
      vista: {
        ...vista, cartas,
        acciones: vista.acciones.slice(0, i + 1),
        vueltaActual: completa ? null : { salida: jugadas[0].asiento, jugadas },
        vueltas: vista.vueltas.slice(0, cerradas),
        turno: null, legales: [], resultado: null, equipoGanador: null,
        pendiente: null, trucoPendiente: null, porDeclararFlor: null,
        cobros: previa?.cobros ?? [], valorTruco: previa?.valorTruco ?? 1,
      },
    };
    pasos.push({ partida, espera: completa ? vueltaCompleta : entreCartas });
    if (completa) jugadas = [];
  }
  return [...pasos, enVivo];
}

// Un aviso puede contener varias jugadas o llegar mientras el tapete muestra una vuelta anterior.
export function usePresentacionVueltas(actual: Partida | undefined) {
  const tablero = useRef<HTMLDivElement>(null);
  const [secuencia, mostrar] = useState(() => ({
    recibida: actual, pasos: [{ partida: actual, espera: 0 }] as Paso[],
  }));
  if (actual?.version !== secuencia.recibida?.version || actual?.manoNumero !== secuencia.recibida?.manoNumero) {
    const pendientes = secuencia.pasos.filter(p => p.espera > 0);
    mostrar({ recibida: actual, pasos: [...pendientes, ...pasosNuevos(secuencia.recibida, actual)] });
  }
  const paso = secuencia.pasos[0];
  useEffect(() => {
    if (!paso.espera) return;
    // El tiempo de descarga de un naipe no debe descontarse de su tiempo en el tapete.
    const naipes = Array.from(tablero.current?.querySelectorAll<HTMLImageElement>(".j-jugada img") ?? []);
    let timer: number | undefined;
    function alMostrarCartas() {
      if (timer !== undefined || naipes.some(img => !img.complete)) return;
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
  return { tablero, partida: mostrandoCartas ? paso.partida : actual, mostrandoCartas };
}
