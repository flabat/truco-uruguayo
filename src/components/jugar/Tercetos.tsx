import { ResumenDeTantos } from "./ResumenDeTantos";
import { resumirTantos } from "@eltruco/motor/resumen-tantos.ts";
import { canto, respuestaConFlor } from "@eltruco/cliente/cantos.ts";
import { ZonaJugador } from "./ZonaJugador";
import type { LanceTercetos, ResumenLance, VistaTercetos } from "@eltruco/motor/mesa-online.ts";
import { AvisoFlor, HistorialDeMano } from "./HistorialDeMano";
import { descripcionDeJugada, tantos } from "@eltruco/cliente/textos.ts";
import { controlesDeCantos, Continuacion, ManoJugador, PruebaEnMesa, Tanteador } from "./Tablero";
import { palabraDeTercetos } from "@eltruco/cliente/turno.ts";
import { Tapete } from "./Tapete";
import { AccionesDelPie, esperaDelCompanero, SenasEnviadas, type ElegirIndicacion } from "./GloboDelCompanero";
import { ReporteDeJugada } from "./ReporteDeJugada";
import type { Eleccion, Mesa, PartidaTercetos } from "./cliente";
import { GloboDeVoz, PalabraDelPie } from "./Voz";
import { useVozDelPie, vocesEnReposo } from "@eltruco/cliente/voces.ts";
import { vueltaEnMesa } from "@eltruco/cliente/vuelta-en-mesa.ts";
import { usePresentacionTercetos } from "./presentacion";
import "./tercetos.css";

type Props = {
  mesa: Mesa;
  partida: PartidaTercetos;
  base: string;
  bloqueada: boolean;
  puedeReportar: boolean;
  estadoRed?: string;
  aviso?: string;
  jugar: (accion?: Eleccion) => void;
  presencioReparto: boolean;
  indicar?: ElegirIndicacion;
  reconexion: number;
};

const nombreDelLance = (lance: LanceTercetos) =>
  lance.tipo === "redondilla" ? "Redondilla" : `Duelo ${lance.duelo} de 3`;
const motivoDelCierre = { vueltas: "las vueltas", rechazo: "el rechazo", envido: "el envido", flor: "la flor", mazo: "el retiro al mazo" };

function DetallesDelLance({ acciones = [], cobros, vueltas, nombre }: Pick<VistaTercetos, "cobros" | "vueltas"> & {
  acciones?: VistaTercetos["acciones"]; nombre: (asiento: number) => string;
}) {
  return <>
    {acciones.length > 0 && <ol aria-label="Jugadas y cantos">
      {acciones.map((a, i) => <li key={i}>{descripcionDeJugada(a, nombre)}</li>)}
    </ol>}
    {vueltas.length > 0 && <ul aria-label="Vueltas terminadas">
      {vueltas.map((v, i) => <li key={i}>{i + 1}.ª vuelta · {v.resultado.tipo === "parda"
        ? "Parda" : "Ganó " + nombre(v.resultado.asiento)}.</li>)}
    </ul>}
    {cobros.length > 0 && <ul aria-label="Tantos cobrados">
      {cobros.map((c, i) => <li key={i}>Equipo {c.equipo + 1} · {tantos(c.tantos)} por {c.motivo}
        {c.tantoGanador != null && c.asiento != null && ` (${nombre(c.asiento)} con ${c.tantoGanador})`}
        {c.valor != null && c.valor !== c.tantos && ` · valor del canto ${tantos(c.valor)}`}.</li>)}
    </ul>}
  </>;
}

function LanceCerrado({ lance, nombre, esActual }: { lance: ResumenLance; nombre: (asiento: number) => string; esActual: boolean }) {
  return <details className="j-historia">
    <summary>{nombreDelLance(lance)} · Ganó el equipo {lance.resultado.equipo + 1} por {motivoDelCierre[lance.resultado.motivo]} · {lance.puntos.join(" a ")}</summary>
    <ResumenDeTantos resumen={resumirTantos(lance.cobros)} propio={0} equipo={e => `Equipo ${e + 1}`}
      acciones={lance.acciones} resultado={lance.resultado} titulo="Tantos de este lance" detalle={false} />
    <DetallesDelLance {...lance} acciones={esActual ? [] : lance.acciones} nombre={nombre} />
  </details>;
}

export function MesaDeTercetos({ mesa, partida: recibida, base, bloqueada: ocupada, estadoRed, aviso, puedeReportar, jugar, indicar, presencioReparto, reconexion }: Props) {
  const { partida, voz, tablero, mostrandoCartas: presentando } = usePresentacionTercetos(recibida, presencioReparto, reconexion);
  const bloqueada = ocupada || presentando;
  const { vista, lance, historialLances } = partida;
  const nombre = (asiento: number) => mesa.asientos[asiento].nombre!;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const { cerrada, vuelta, numeroVuelta, jugadaVisible, detalleVuelta } = vueltaEnMesa(vista, lance.activos.length, nombre);
  const voces = voz ? [voz] : vocesEnReposo(vista);
  const esPico = lance.tipo === "pico-a-pico";
  const pie = !esPico && indicar ? partida.pie : undefined;
  const espera = presentando ? undefined : esperaDelCompanero(pie, nombre);
  const titulo = presentando && !vista.resultado
    ? voz ? nombre(voz.asiento) : "Vuelta " + numeroVuelta
    : espera?.titulo ?? palabraDeTercetos(mesa, partida);
  const indicaciones = esPico ? undefined : partida.indicaciones;
  const frase = useVozDelPie(partida.manoNumero, indicaciones, vista.acciones.length, partida);
  const numeroDeDuelo = (asiento: number) => 1 + ((asiento - vista.mano + 6) % 3);
  const dueloPropio = numeroDeDuelo(mesa.miAsiento);
  const yaJugaron = new Set<number>(historialLances.flatMap(l => l.activos));
  function estadoDelPuesto(asiento: number) {
    if (!esPico) return;
    if (yaJugaron.has(asiento)) return "Ya jugó";
    if (vista.estado === "terminado") return "Sin jugar";
    if (lance.activos.some(a => a === asiento)) return "En duelo";
    return "Espera el duelo " + numeroDeDuelo(asiento);
  }
  const rivales = esPico && lance.activos.map(a => `${mesa.asientos[a].nombre} (equipo ${mesa.asientos[a].equipo + 1})`).join(" y ");
  const jugando = vista.estado === "jugando" ? vista : null;
  const opciones = jugando?.legales.filter(tipo => tipo !== "carta") ?? [];
  const esFin = partida.contexto.fase === "chico-terminado";
  const cerrados = historialLances.at(-1);
  const ultimoCobro = vista.cobros.at(-1) ?? cerrados?.cobros.at(-1);
  const esLanceActual = (l: LanceTercetos) => l.duelo === lance.duelo && l.tipo === lance.tipo;
  const finalEnHistorial = cerrados && esLanceActual(cerrados);
  return <>
    <Tanteador meta={partida.meta} puntos={partida.puntos} propio={propio} equipo={e => e === propio ? "Tu equipo" : "Rivales"} />
    <div className="j-partida j-partida--jugador j-seis" ref={tablero}>
      <Tapete
        base={base}
        asientos={mesa.asientos.map(a => {
          const papel = a.asiento === mesa.miAsiento ? "Vos" : a.equipo === propio ? "Compañero" : "Rival";
          const etiquetas = [papel, "Equipo " + (a.equipo + 1), estadoDelPuesto(a.asiento)];
          return { ...a, papel: etiquetas.filter(Boolean).join(" · "), etiqueta: `Asiento ${a.asiento + 1} · ${a.nombre}` };
        })}
        asientoInferior={mesa.miAsiento}
        dador={vista.dador}
        mano={vista.mano}
        muestra={vista.muestra}
        titulo={"Reparto " + partida.manoNumero}
        estado={esPico ? "Pico a pico" : "Redondilla"}
        terminada={Boolean(vista.resultado && !cerrada)}
        numeroVuelta={numeroVuelta}
        vuelta={vuelta}
        participantes={lance.activos}
        manosOcultas={{ jugadas: vista.acciones.filter(a => a.tipo === "carta"), asientoVisible: jugando?.asiento }}
        detalle={(asiento, carta, ganadora) => {
          const prueba = vista.resultado && vista.pruebasDeTantos?.find(p => p.asiento === asiento);
          return {
            ocultaDorsos: Boolean(prueba) || (esPico && (vista.estado === "terminado" || yaJugaron.has(asiento))),
            contenido: prueba
              ? <PruebaEnMesa prueba={prueba} base={base} jugada={carta} ganadora={ganadora}
                  acciones={historialLances.find(l => l.duelo === prueba.duelo)?.acciones ?? vista.acciones} />
              : <><GloboDeVoz voz={voces.find(v => v.asiento === asiento)} />
                <PalabraDelPie indicacion={frase} asiento={asiento} nombre={nombre}/></>,
            reemplazaJugada: Boolean(carta && prueba?.cartas.includes(carta)),
          };
        }}
        pie={pie && {vista:pie, mano:partida.manoNumero}}
        zonaJugador={<ZonaJugador titulo={estadoRed ?? titulo ?? "Esperando la jugada"} bloqueada={bloqueada}
          detalle={<>
            {aviso && <p className="j-aviso">{aviso}</p>}
            <strong className="j-seis-lance">{nombreDelLance(lance)}{esPico && ` · ${rivales}`}</strong>
            <AvisoFlor pendiente={vista.pendiente} porDeclararFlor={vista.porDeclararFlor} nombre={nombre} />
            {presentando && <p>{voz?.texto || detalleVuelta || jugadaVisible}</p>}
            {vista.resultado && <p>El cierre fue por {motivoDelCierre[vista.resultado.motivo]}.</p>}
            {espera && <p>{espera.indicacion}</p>}
            {!presentando && vista.estado === "esperando" && <p>{dueloPropio > (lance.duelo ?? 0)
              ? `Te toca en el duelo ${dueloPropio} de 3.` : "Ya jugaste tu duelo. Esperá el próximo reparto."}</p>}
            {jugando?.legales.length === 1 && jugando.legales[0] === "flor" &&
              <p>Cantá tu flor antes de jugar una carta.</p>}
            {opciones.includes("con-flor-quiero") && <p>{respuestaConFlor}</p>}
            {opciones.includes("paso-flor") && <p>No tenés flor en esta mano.</p>}
            {vista.pendiente && (vista.pendiente.tipo !== "flor" || vista.porDeclararFlor == null) &&
              <p>{nombre(vista.pendiente.asiento)} cantó {canto[vista.pendiente.tipo].toLowerCase()}.</p>}
            {vista.trucoPendiente && vista.pendiente && vista.pendiente.tipo !== vista.trucoPendiente.tipo &&
              <p>Queda pendiente el {canto[vista.trucoPendiente.tipo].toLowerCase()} de {mesa.asientos[vista.trucoPendiente.asiento].nombre}.</p>}
            {(opciones.includes("falta-envido") || vista.pendiente?.tipo === "falta-envido") && (
              <p className="j-seis-falta">Falta envido · Si gana tu equipo, cobra {tantos(vista.faltaPorEquipo[propio])}. Si ganan los rivales, cobran {tantos(vista.faltaPorEquipo[1 - propio])}.</p>
            )}
          </>}
          sena={pie && indicar && (pie.pie === mesa.miAsiento
            ? <AccionesDelPie pie={pie} nombre={nombre} bloqueada={bloqueada} elegir={indicar}/>
            : <SenasEnviadas pie={pie} muestra={vista.muestra} nombre={nombre}/>)}
          mano={jugando && <ManoJugador cartas={jugando.cartas} habilitada={!bloqueada && jugando.legales.includes("carta")} base={base} jugar={jugar} />}
          cantos={controlesDeCantos(opciones, bloqueada, jugar)}
          continuacion={(esFin || vista.estado === "terminado") && <Continuacion fin={esFin} bloqueada={bloqueada} base={base} repartir={() => jugar()} />}
        />}
      />
      <section className="j-jugada-panel">
        {vista.estado === "terminado" && vista.resumenReparto && <ResumenDeTantos
          resumen={vista.resumenReparto} propio={propio} equipo={e => e === propio ? "Tu equipo" : "Rivales"}
          titulo="Tantos de este reparto" detalle={false} />}
        {ultimoCobro && <p>Último cobro · Equipo {ultimoCobro.equipo + 1}, {tantos(ultimoCobro.tantos)} por {ultimoCobro.motivo}.</p>}
        <HistorialDeMano key={`${partida.manoNumero}-${lance.duelo}`} acciones={vista.acciones} cobros={vista.cobros}
          nombre={nombre} indicaciones={indicaciones} titulo={esPico ? "Historial del duelo" : "Historial de la redondilla"}>
          {puedeReportar && <ReporteDeJugada mesaId={mesa.id} partida={partida} vuelta={numeroVuelta}
            presentando={presentando} voz={voz?.indice} />}
        </HistorialDeMano>
        {jugando && <dl className="j-cuenta">
          <div><dt>Tus tantos</dt><dd>{jugando.tantosPropios.total} de {jugando.tantosPropios.modalidad}</dd></div>
          {!presentando && <div><dt>Valor del truco</dt><dd>{tantos(vista.valorTruco)}</dd></div>}
        </dl>}
        <section className="j-seis-historial" aria-label="Historial del reparto">
          {historialLances.map(l => <LanceCerrado key={l.duelo ?? "redondilla"} lance={l} nombre={nombre} esActual={esLanceActual(l)} />)}
          {!finalEnHistorial && (vista.vueltas.length > 0 || vista.cobros.length > 0) && <details className="j-historia">
            <summary>Vueltas y tantos de {esPico ? "este duelo" : "la redondilla"}</summary>
            <DetallesDelLance cobros={vista.cobros} vueltas={vista.vueltas} nombre={nombre} />
          </details>}
        </section>
      </section>
    </div>
  </>;
}
