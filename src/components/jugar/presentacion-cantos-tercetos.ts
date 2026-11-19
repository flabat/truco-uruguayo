import { useEffect, useState } from "react";
import type { LanceTercetos, VistaTercetos } from "../../motor/mesa-online";
import { faltaDelGanador } from "../../motor/reglas-tercetos";
import type { PartidaTercetos } from "./cliente";
import { pausaDeVoz, vocesEnAccion, type Voz } from "./Voz";

type Registro = Pick<VistaTercetos, "acciones" | "vueltas" | "cobros" | "indiceCobroLateral">;
interface Paso {
  partida: PartidaTercetos;
  voz: Voz;
}

function antesDelCobro(actual: PartidaTercetos, lance: LanceTercetos, registro: Registro,
    numero: number, indice: number, previa?: PartidaTercetos): PartidaTercetos {
  const { asiento, mano, dador, muestra, equipoPorAsiento } = actual.vista;
  const historialLances = actual.historialLances.slice(0, numero);
  const final = actual.historialLances[numero]?.puntos ?? actual.puntos;
  const inicio: [number, number] = [...final];
  for (const c of registro.cobros) inicio[c.equipo] -= c.tantos;
  const puntos: [number, number] = [...inicio];
  const indiceCobro = registro.indiceCobroLateral;
  const cobros = indiceCobro != null && indiceCobro < indice ? registro.cobros.filter(c => c.motivo !== "truco") : [];
  for (const c of cobros) puntos[c.equipo] += c.tantos;

  const acciones = registro.acciones.slice(0, indice + 1);
  const jugadas = acciones.filter(a => a.tipo === "carta");
  const cantidad = lance.activos.length;
  const cerradas = Math.floor(jugadas.length / cantidad);
  const enMesa = jugadas.slice(cerradas * cantidad);
  const publica = {
    asiento, mano, dador, muestra, equipoPorAsiento, acciones, cobros,
    indiceCobroLateral: cobros.length ? indiceCobro : undefined,
    vueltas: registro.vueltas.slice(0, cerradas),
    vueltaActual: enMesa.length ? { salida: enMesa[0].asiento, jugadas: enMesa } : null,
    faltaPorEquipo: inicio.map(p => faltaDelGanador(p, actual.meta)) as [number, number],
    turno: null, equipoGanador: null, resultado: null, pendiente: null,
    trucoPendiente: null, porDeclararFlor: null, apuesta: "sin-canto" as const,
    valorTruco: previa?.vista.valorTruco ?? 1, legales: [] as [],
  };
  // Un asiento puede recibir sus cartas al abrir su duelo. Nunca usarlas para un duelo anterior.
  const propia = previa?.vista.estado === "jugando" ? previa.vista
    : actual.lance.duelo === lance.duelo && actual.vista.estado === "jugando" ? actual.vista : null;
  let vista: VistaTercetos = { ...publica, estado: "esperando" };
  if (propia) {
    const terna = [...propia.cartas, ...propia.acciones.flatMap(a => a.tipo === "carta" && a.asiento === asiento ? [a.carta] : [])];
    vista = { ...publica, estado: "jugando", tantosPropios: propia.tantosPropios,
      cartas: terna.filter(carta => !jugadas.some(j => j.carta === carta)) };
  }
  // Una referencia al resumen completo también expondría su resultado y el resto de sus acciones.
  const { tipo, duelo, activos } = lance;
  const visible: LanceTercetos = tipo === "redondilla" ? { tipo, duelo: null, activos } : { tipo, duelo, activos };
  return { ...actual, lance: visible, vista, historialLances, puntos, ganadorPartida: null };
}

function siguientes(anterior: PartidaTercetos | undefined, actual: PartidaTercetos,
    presencioReparto: boolean, pendientes: readonly Paso[] = []): Paso[] {
  const misma = anterior?.manoNumero === actual.manoNumero ? anterior : undefined;
  const desdeElReparto = (!anterior && presencioReparto && actual.manoNumero === 1)
    || (anterior?.vista.resultado && actual.manoNumero === anterior.manoNumero + 1);
  if (!misma && !desdeElReparto) return [];
  const pasos = misma ? [...pendientes] : [];
  // Al terminar un lance, su resumen entra en la misma actualización que abre el siguiente.
  // En el último, la vista y el último resumen contienen las mismas acciones.
  const lances: { lance: LanceTercetos; registro: Registro }[] = actual.historialLances
    .map(resumen => ({ lance: resumen, registro: resumen }));
  if (!actual.vista.resultado) lances.push({ lance: actual.lance, registro: actual.vista });
  for (let n = misma?.historialLances.length ?? 0; n < lances.length; n++) {
    const { lance, registro } = lances[n];
    const previa = misma?.lance.duelo === lance.duelo ? misma : undefined;
    for (let i = previa?.vista.acciones.length ?? 0; i < registro.acciones.length; i++) {
      const voces = vocesEnAccion(registro, i);
      if (!voces.length) continue;
      // La respuesta del propio jugador indica que ya vio el canto que le permitió responder.
      if (voces[0].asiento === actual.vista.asiento && pasos[0]?.partida === anterior) pasos.shift();
      const enVivo = !actual.vista.resultado && n === lances.length - 1
        && i === registro.acciones.length - 1 && voces.length === 1;
      const partida = enVivo ? actual : antesDelCobro(actual, lance, registro, n, i, previa);
      for (const [j, voz] of voces.entries()) {
        if (j === 0 && voz.asiento === actual.vista.asiento) continue;
        pasos.push({ partida, voz });
      }
    }
  }
  return pasos;
}

export function useCantosDeTercetos(actual: PartidaTercetos, presencioReparto: boolean) {
  const [secuencia, mostrar] = useState(() => ({
    recibida: actual, pasos: siguientes(undefined, actual, presencioReparto),
  }));
  if (actual.version !== secuencia.recibida.version || actual.manoNumero !== secuencia.recibida.manoNumero) {
    mostrar({ recibida: actual, pasos: siguientes(secuencia.recibida, actual, presencioReparto, secuencia.pasos) });
  }
  const paso = secuencia.pasos[0];
  useEffect(() => {
    if (!paso) return;
    const timer = window.setTimeout(() => {
      mostrar(s => s.pasos[0] === paso ? { ...s, pasos: s.pasos.slice(1) } : s);
    }, pausaDeVoz);
    return () => window.clearTimeout(timer);
  }, [paso]);
  const presentando = Boolean(paso && paso.partida !== secuencia.recibida);
  return { partida: presentando ? paso.partida : actual, voz: paso?.voz, presentando };
}
