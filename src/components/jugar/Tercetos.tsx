import { useEffect, useRef } from "react";
import type { LanceTercetos, ResumenLance, VistaTercetos } from "../../motor/mesa-online";
import { canto, Naipe, nombrar, Tanteador, tantos } from "./Tablero";
import type { Eleccion, Mesa, PartidaTercetos } from "./cliente";
import "./tercetos.css";

type Props = {
  mesa: Mesa;
  partida: PartidaTercetos;
  base: string;
  bloqueada: boolean;
  jugar: (accion?: Eleccion) => void;
};

const nombreDelLance = (lance: LanceTercetos) =>
  lance.tipo === "redondilla" ? "Redondilla" : `Duelo ${lance.duelo} de 3`;
const motivoDelCierre = { vueltas: "las vueltas", rechazo: "el rechazo", envido: "el envido", flor: "la flor", mazo: "el retiro al mazo" };

function palabra(mesa: Mesa, partida: PartidaTercetos) {
  const { vista, lance, ganadorPartida } = partida;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const nombre = (a: number) => mesa.asientos[a].nombre;
  if (ganadorPartida !== null) return ganadorPartida === propio ? "Tu equipo ganó el chico" : "El rival ganó el chico";
  if (vista.estado === "terminado") return "Reparto terminado";
  if (vista.porDeclararFlor != null) {
    return vista.porDeclararFlor === mesa.miAsiento ? "Te toca declarar" : `Declara ${nombre(vista.porDeclararFlor)}`;
  }
  if (vista.pendiente) {
    const { asiento } = vista.pendiente;
    if (vista.estado === "jugando" && vista.legales.length) return "Podés responder";
    if (lance.tipo === "pico-a-pico") {
      return `Responde ${nombre(lance.activos.find(a => a !== asiento)!)}`;
    }
    return `Responde el equipo ${mesa.asientos[asiento].equipo === 0 ? 2 : 1}`;
  }
  if (vista.turno === mesa.miAsiento) return "Tu turno";
  return vista.turno == null ? "Esperando la jugada" : "Turno de " + nombre(vista.turno);
}

function Puestos({ mesa, partida, base }: Pick<Props, "mesa" | "partida" | "base">) {
  const { vista, lance } = partida;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const ultima = vista.vueltas.at(-1);
  const enCurso = Boolean(vista.vueltaActual?.jugadas.length);
  const vuelta = enCurso ? vista.vueltaActual : ultima;
  return (
    <div className="j-seis-puestos" role="group" aria-label="Los seis asientos">
      {mesa.asientos.map(({ asiento, equipo, nombre }) => {
        const papel = asiento === mesa.miAsiento ? "Vos" : equipo === propio ? "Compañero" : "Rival";
        const jugada = vuelta?.jugadas.find(j => j.asiento === asiento);
        const ganador = !enCurso && ultima?.resultado.tipo === "ganada" && ultima.resultado.asiento === asiento;
        return (
          <div key={asiento} className="j-seis-puesto" data-pos={(asiento - mesa.miAsiento + 6) % 6}
            data-activo={lance.activos.some(a => a === asiento)} role="group" aria-label={`Asiento ${asiento + 1} · ${nombre}`}>
            <div className="j-seis-nombre">
              <strong>{nombre}</strong>
              <span>{papel} · Equipo {equipo + 1}</span>
              {(asiento === vista.mano || asiento === vista.dador) &&
                <b>{asiento === vista.dador ? "Dador" : "Mano"}</b>}
            </div>
            {asiento === vista.dador && (
              <div className="j-seis-muestra" role="img" aria-label={"Mazo y muestra · " + nombrar(vista.muestra)}>
                <img className="j-seis-mazo" alt="" src={base + "img/cartas/tatu/reverso.webp"} />
                <Naipe id={vista.muestra} base={base} />
              </div>
            )}
            {jugada && <div className="j-seis-jugada">
              <Naipe id={jugada.carta} base={base} />
              {ganador && <small>Ganó</small>}
            </div>}
          </div>
        );
      })}
      <div className="j-seis-centro">
        <strong>{enCurso || !ultima ? `Vuelta ${vista.vueltas.length + 1}` : `Vuelta ${vista.vueltas.length} terminada`}</strong>
        {!enCurso && ultima && <span>{ultima.resultado.tipo === "parda" ? "Parda" : `Ganó ${mesa.asientos[ultima.resultado.asiento].nombre}`}</span>}
        <span>Muestra · {nombrar(vista.muestra)}</span>
      </div>
    </div>
  );
}

function Historial({ acciones, cobros, vueltas, mesa }: Pick<VistaTercetos, "acciones" | "cobros" | "vueltas"> & { mesa: Mesa }) {
  return <>
    {acciones.length > 0 && <ol aria-label="Jugadas y cantos">
      {acciones.map((a, i) => <li key={i}>{mesa.asientos[a.asiento].nombre} {a.tipo === "carta"
        ? "jugó " + nombrar(a.carta).toLowerCase()
        : a.tipo === "mazo" ? "se fue al mazo" : `dijo «${canto[a.tipo]}»`}.</li>)}
    </ol>}
    {vueltas.length > 0 && <ul aria-label="Vueltas terminadas">
      {vueltas.map((v, i) => <li key={i}>{i + 1}.ª vuelta · {v.resultado.tipo === "parda"
        ? "Parda" : "Ganó " + mesa.asientos[v.resultado.asiento].nombre}.</li>)}
    </ul>}
    {cobros.length > 0 && <ul aria-label="Tantos cobrados">
      {cobros.map((c, i) => <li key={i}>Equipo {c.equipo + 1} · {tantos(c.tantos)} por {c.motivo}
        {c.tantoGanador != null && c.asiento != null && ` (${mesa.asientos[c.asiento].nombre} con ${c.tantoGanador})`}
        {c.valor != null && c.valor !== c.tantos && ` · valor del canto ${tantos(c.valor)}`}.</li>)}
    </ul>}
  </>;
}

function LanceCerrado({ lance, mesa }: { lance: ResumenLance; mesa: Mesa }) {
  return <details className="j-historia">
    <summary>{nombreDelLance(lance)} · Ganó el equipo {lance.resultado.equipo + 1} por {motivoDelCierre[lance.resultado.motivo]} · {lance.puntos.join(" a ")}</summary>
    <Historial {...lance} mesa={mesa} />
  </details>;
}

export function MesaDeTercetos({ mesa, partida, base, bloqueada, jugar }: Props) {
  const { vista, lance, historialLances } = partida;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const titulo = palabra(mesa, partida);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const teclado = useRef(false);
  useEffect(() => {
    if (teclado.current && document.activeElement === document.body) encabezado.current?.focus();
    teclado.current = false;
  }, [partida.version]);

  const esPico = lance.tipo === "pico-a-pico";
  const dueloPropio = 1 + ((mesa.miAsiento - vista.mano + 6) % 3);
  const rivales = esPico && lance.activos.map(a => `${mesa.asientos[a].nombre} (equipo ${mesa.asientos[a].equipo + 1})`).join(" y ");
  const jugando = vista.estado === "jugando" ? vista : null;
  const opciones = jugando?.legales.filter(tipo => tipo !== "carta") ?? [];
  const esFin = partida.ganadorPartida !== null;
  const cerrados = historialLances.at(-1);
  const ultimoCobro = vista.cobros.at(-1) ?? cerrados?.cobros.at(-1);
  const finalEnHistorial = cerrados && cerrados.duelo === lance.duelo && cerrados.tipo === lance.tipo;
  return <>
    <Tanteador meta={partida.meta} puntos={partida.puntos} propio={propio} equipo={e => e === propio ? "Tu equipo" : "Rivales"} />
    <div className="j-partida j-seis" onClickCapture={e => {
      if (e.target instanceof Element && e.target.closest("button")) teclado.current = e.detail === 0;
    }}>
      <section className="j-tapete" aria-label="Tapete">
        <header><strong>Reparto {partida.manoNumero}</strong><span>{esPico ? "Pico a pico" : "Redondilla"}</span></header>
        <Puestos mesa={mesa} partida={partida} base={base} />
        {jugando && <div className="j-mano" role="group" aria-label="Tus cartas">
          {jugando.cartas.map(carta => <button key={carta} disabled={bloqueada || !jugando.legales.includes("carta")}
            aria-label={"Jugar " + nombrar(carta)} onClick={() => jugar({ tipo: "carta", carta })}>
            <Naipe base={base} id={carta} /><span>{nombrar(carta)}</span>
          </button>)}
        </div>}
      </section>
      <section className="j-jugada-panel">
        <div role="status" aria-atomic="true">
          <strong className="j-seis-lance">{nombreDelLance(lance)}{esPico && ` · ${rivales}`}</strong>
          <h2 ref={encabezado} tabIndex={-1}>{titulo}</h2>
          {vista.estado === "esperando" && <p>{dueloPropio > (lance.duelo ?? 0)
            ? `Te toca en el duelo ${dueloPropio} de 3.` : "Ya jugaste tu duelo. Esperá el próximo reparto."}</p>}
          {jugando?.legales.length === 1 && jugando.legales[0] === "flor" &&
            <p>Cantá tu flor antes de jugar una carta.</p>}
          {vista.pendiente && <p>{mesa.asientos[vista.pendiente.asiento].nombre} cantó {canto[vista.pendiente.tipo].toLowerCase()}.</p>}
          {vista.trucoPendiente && vista.pendiente && vista.pendiente.tipo !== vista.trucoPendiente.tipo &&
            <p>Queda pendiente el {canto[vista.trucoPendiente.tipo].toLowerCase()} de {mesa.asientos[vista.trucoPendiente.asiento].nombre}.</p>}
          {ultimoCobro && <p>Último cobro · Equipo {ultimoCobro.equipo + 1}, {tantos(ultimoCobro.tantos)} por {ultimoCobro.motivo}.</p>}
        </div>
        {jugando && <dl className="j-cuenta">
          <div><dt>Tus tantos</dt><dd>{jugando.tantosPropios.total} de {jugando.tantosPropios.modalidad}</dd></div>
          <div><dt>Valor del truco</dt><dd>{tantos(vista.valorTruco)}</dd></div>
        </dl>}
        {(opciones.includes("falta-envido") || vista.pendiente?.tipo === "falta-envido") && (
          <p className="j-seis-falta">Falta envido · Si gana tu equipo, cobra {tantos(vista.faltaPorEquipo[propio])}. Si ganan los rivales, cobran {tantos(vista.faltaPorEquipo[1 - propio])}.</p>
        )}
        {opciones.length > 0 && <div className="j-cantos" role="group" aria-label="Cantos y respuestas">
          {opciones.map(tipo => <button key={tipo} className={tipo === "quiero" ? "button" : "j-sec"} disabled={bloqueada}
            onClick={() => jugar({ tipo })}>{canto[tipo]}</button>)}
        </div>}
        {esFin ? <a className="button" href={base + "jugar/"}>Crear otra mesa</a> : vista.estado === "terminado" &&
          <button className="button" disabled={bloqueada} onClick={() => jugar()}>Repartir otra mano</button>}
      </section>
    </div>
    <section className="j-seis-historial" aria-label="Historial del reparto">
      {historialLances.map(l => <LanceCerrado key={l.duelo ?? "redondilla"} lance={l} mesa={mesa} />)}
      {!finalEnHistorial && vista.acciones.length > 0 && <details className="j-historia">
        <summary>Ver jugadas y cantos de {esPico ? "este duelo" : "la redondilla"}</summary>
        <Historial acciones={vista.acciones} cobros={vista.cobros} vueltas={vista.vueltas} mesa={mesa} />
      </details>}
    </section>
  </>;
}
