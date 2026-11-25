import type { LanceTercetos, VistaTercetos } from "@eltruco/motor/mesa-online.ts";
import { faltaDelGanador } from "@eltruco/motor/reglas-tercetos.ts";
import type { PartidaTercetos } from "./cliente";
import { pausaDeVoz, vocesEnAccion } from "@eltruco/cliente/voces.ts";

import { entreCartas, vueltaCompleta, useSecuenciaDeMesa, type Paso } from "./secuencia-de-mesa";

type Registro = Pick<VistaTercetos, "acciones" | "vueltas" | "cobros" | "indiceCobroLateral">;

function hastaLaAccion(actual: PartidaTercetos, lance: LanceTercetos, registro: Registro,
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
    valorTruco: 1 + acciones.filter(a => ["truco", "retruco", "vale-cuatro"].includes(a.tipo)).length, legales: [] as [],
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
  return { ...actual, contexto: { versionVista: 1, fase: "en-juego" }, lance: visible, vista, historialLances, puntos, ganadorPartida: null,
    pie: previa?.pie?.vuelta === cerradas+1 ? previa.pie : undefined,
    indicaciones: actual.indicaciones?.filter(d => d.indiceAccion <= indice),
  };
}

function siguientes(anterior: PartidaTercetos | undefined, actual: PartidaTercetos,
    presencioReparto: boolean, pendientes: Paso<PartidaTercetos>[] = []): Paso<PartidaTercetos>[] {
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
      const ultima = i === registro.acciones.length - 1;
      const esActual = n === lances.length - 1;
      const parcial = hastaLaAccion(actual, lance, registro, n, i, previa);
      if (registro.acciones[i].tipo === "carta") {
        const completa = !parcial.vista.vueltaActual;
        const cerrada = completa ? parcial.vista.vueltas.at(-1) : undefined;
        let partida = esActual && ultima ? actual : parcial;
        // Un duelo puede cerrar por cartas en el mismo aviso que ya abre el siguiente.
        const archivo = actual.historialLances[n];
        if (!esActual && ultima && archivo) {
          partida = { ...parcial, puntos: [...archivo.puntos], historialLances: actual.historialLances.slice(0, n + 1),
            vista: { ...parcial.vista, cobros: archivo.cobros } };
        }
        const antesDelResultado = cerrada && { ...parcial, vista: { ...parcial.vista,
          vueltaActual: { salida: cerrada.salida, jugadas: cerrada.jugadas }, vueltas: parcial.vista.vueltas.slice(0, -1) } };
        pasos.push({ partida, antesDelResultado, espera: completa ? vueltaCompleta : entreCartas });
        continue;
      }
      const voces = vocesEnAccion(registro, i);
      // La respuesta del propio jugador indica que ya vio el canto que le permitió responder.
      if (voces[0].asiento === actual.vista.asiento && pasos[0]?.voz && pasos[0].partida === anterior) pasos.shift();
      const enVivo = !actual.vista.resultado && esActual && ultima && voces.length === 1;
      const partida = enVivo ? actual : parcial;
      for (const [j, voz] of voces.entries()) {
        if (j === 0 && voz.asiento === actual.vista.asiento) continue;
        pasos.push({ partida, voz, espera: pausaDeVoz });
      }
    }
  }
  return pasos;
}

export function usePresentacionTercetos(actual: PartidaTercetos, presencioReparto: boolean, reconexion: number) {
  return useSecuenciaDeMesa(actual, presencioReparto, reconexion, siguientes);
}
