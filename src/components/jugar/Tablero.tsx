import { ResumenDeTantos } from "./ResumenDeTantos";
import { motivoDelCobro } from "../../lib/cobros";
import { canto, respuestaConFlor } from "../../lib/cantos";
import type { ReactNode } from "react";
import { ZonaJugador } from "./ZonaJugador";
import { AvisoFlor, HistorialDeMano, nombrar, tantos } from "./HistorialDeMano";
import type { CardId } from "../../motor/cartas";
import type { PruebaDeTantos, VistaOnline } from "../../motor/mesa-online";
import { cuentaDelChico, mitadesDelChico } from "../../motor/chico";
import type { Eleccion, Mesa, Partida, Tipo } from "./cliente";
import { GloboDeVoz, PalabraDelPie, useVozDelPie, vocesEnReposo, type Voz } from "./Voz";
import { Naipe, Tapete } from "./Tapete";
import { AccionesDelPie, esperaDelCompanero, SenasEnviadas, type ElegirIndicacion } from "./GloboDelCompanero";
import { ReporteDeJugada } from "./ReporteDeJugada";

type Canto = Exclude<Tipo, "carta">;
const grupos: { nombre: string; opciones: Canto[] }[] = [
  { nombre: "Responder", opciones: ["con-flor-quiero", "quiero", "no-quiero", "paso-flor"] },
  { nombre: "Truco", opciones: ["truco", "retruco", "vale-cuatro"] },
  {
    nombre: "Envido y flor",
    opciones: ["envido", "real-envido", "falta-envido", "flor", "con-flor-envido", "contraflor-al-resto"],
  },
  { nombre: "Retiro", opciones: ["mazo"] },
];

export function PruebaEnMesa({ prueba, acciones, base, jugada, ganadora }: {
  prueba: PruebaDeTantos; acciones: VistaOnline["acciones"]; base: string; jugada?: CardId; ganadora?: boolean;
}) {
  const titulo = (prueba.motivo === "flor" ? "Flor ganadora" : "Envido ganador") + " · " + tantos(prueba.total);
  const tipos = prueba.motivo === "flor" ? ["contraflor-al-resto", "con-flor-envido"] : ["falta-envido", "real-envido"];
  const subida = acciones.flatMap(a => a.tipo !== "carta" && tipos.includes(a.tipo) ? [a.tipo] : []).at(-1);
  const detalle = [subida && canto[subida], prueba.duelo && "Duelo " + prueba.duelo]
    .filter(Boolean).join(" · ");
  return <figure className="j-prueba-tantos" aria-label={titulo}>
    <figcaption>{titulo}{detalle && <small>{detalle}</small>}</figcaption>
    <div className="j-cartas-prueba">{prueba.cartas.map(carta => (
      <div key={carta} className={carta === jugada ? (ganadora ? "j-jugada j-ganadora" : "j-jugada") : undefined}>
        <Naipe id={carta} base={base} />
        {ganadora && carta === jugada && <small>Ganó la vuelta</small>}
      </div>
    ))}</div>
  </figure>;
}

function estadoDelTurno(mesa: Mesa, partida: Partida, vista: VistaOnline) {
  const { resultado, pendiente, porDeclararFlor, turno, legales } = vista;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  if (resultado) {
    const fin = partida.ganadorPartida !== null;
    const victoria = resultado.equipo === propio;
    const motivos = { mazo: "el retiro al mazo", vueltas: "las vueltas", rechazo: "el rechazo", envido: "el envido", flor: "la flor" };
    return {
      titulo: fin
        ? victoria
          ? "Ganaste la partida"
          : "Ganó el rival"
        : victoria
          ? "Ganaste la mano"
          : "El rival ganó la mano",
      indicacion: resultado.motivo === "mazo"
        ? `${mesa.asientos[1 - resultado.equipo].nombre} se fue al mazo.`
        : `El cierre fue por ${motivos[resultado.motivo]}.`,
    };
  }
  if (porDeclararFlor !== null) {
    const esTuTurno = porDeclararFlor === mesa.miAsiento;
    if (legales.includes("con-flor-quiero")) return { titulo: "Te toca declarar", indicacion: respuestaConFlor };
    return {
      titulo: esTuTurno ? "Te toca declarar" : "Declara " + mesa.asientos[porDeclararFlor].nombre,
      indicacion: esTuTurno
        ? legales.includes("paso-flor") ? "No tenés flor en esta mano." : "Cantá tu flor."
        : "Esperando su declaración de flor.",
    };
  }
  if (pendiente) {
    const cantor = mesa.asientos[pendiente.asiento];
    const titulo = canto[pendiente.tipo];
    let respuesta = mesa.modo === "1v1" ? "Tu rival responde." : "Responde el equipo rival.";
    if (cantor.equipo !== propio) respuesta = "Responde tu equipo.";
    if (legales.length)
      respuesta = legales.includes("flor") ? "Cantá tu flor para responder." : "Podés responder.";
    return { titulo, indicacion: `${cantor.nombre} cantó ${titulo.toLowerCase()}. ${respuesta}` };
  }
  if (turno === mesa.miAsiento) {
    let indicacion = "Elegí una carta en el tapete.";
    if (legales.length > 1) indicacion = "Elegí una carta en el tapete o hacé un canto.";
    if (legales.includes("mazo") && !legales.includes("carta")) indicacion = "Podés irte al mazo.";
    if (legales.includes("flor")) indicacion = "Cantá tu flor antes de tirar la primera carta.";
    return { titulo: "Tu turno", indicacion };
  }
  return {
    titulo: turno === null ? "Esperando la jugada" : "Turno de " + mesa.asientos[turno].nombre,
    indicacion: "Esperando la jugada.",
  };
}

export function Tanteador({ meta, puntos, propio, equipo }: {
  meta: number; puntos: readonly [number, number]; propio: number; equipo: (n: number) => string;
}) {
  return (
      <div className="j-tanteador" role="group" aria-label="Tanteador">
        <div className="j-meta">
          <b>Chico a {meta}</b>
          <small>Acumulado · {mitadesDelChico(meta)}</small>
        </div>
        {[propio, 1 - propio].map((e) => (
          <div key={e} role="group" aria-labelledby={"j-equipo-" + e}>
            <span id={"j-equipo-" + e}>{equipo(e)}</span>
            <strong>{puntos[e]}</strong>
            <small>{cuentaDelChico(puntos[e], meta)}</small>
          </div>
        ))}
      </div>
  );
}

export function ManoJugador({ cartas, habilitada, base, jugar }: {
  cartas: readonly CardId[]; habilitada: boolean; base: string; jugar: (a: Eleccion) => void;
}) {
  return <div className="j-mano" role="group" aria-label="Tus cartas">
    {cartas.map(carta => <button key={carta} disabled={!habilitada}
      aria-label={"Jugar " + nombrar(carta)} onClick={() => jugar({ tipo: "carta", carta })}>
      <Naipe base={base} id={carta} />
    </button>)}
  </div>;
}

export function Continuacion({ fin, bloqueada, base, repartir }: {
  fin: boolean; bloqueada: boolean; base: string; repartir: () => void;
}) {
  if (fin) return <a className="button" href={base + "jugar/"}>Crear otra mesa</a>;
  return <button className="button" disabled={bloqueada} onClick={repartir}>Repartir otra mano</button>;
}

export function EnJuego({
  mesa,
  partida,
  bloqueada,
  puedeReportar,
  mostrandoCartas = false,
  estadoRed,
  aviso,
  sena,
  indicar,
  voz,
  base,
  jugar,
}: {
  mesa: Mesa;
  partida: Partida;
  bloqueada: boolean;
  puedeReportar: boolean;
  mostrandoCartas?: boolean;
  estadoRed?: string;
  aviso?: string;
  sena?: ReactNode;
  indicar?: ElegirIndicacion;
  voz?: Voz;
  base: string;
  jugar: (a?: Eleccion) => void;
}) {
  const v = partida.vista!;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const equipo = (e: number) =>
    mesa.modo === "1v1" ? (e === propio ? "Vos" : "Tu rival") : e === propio ? "Tu equipo" : "Rivales";
  const nombre = (a: number) => mesa.asientos[a].nombre!;
  const pie = indicar ? partida.pie : undefined;
  const frase = useVozDelPie(partida.manoNumero, partida.indicaciones, v.acciones.length, partida);
  const voces = voz ? [voz] : vocesEnReposo(v);
  const pendientes = v.pendiente;
  const resultado = v.resultado;
  const fin = partida.ganadorPartida !== null;
  const cerrada = !v.vueltaActual && (!resultado || resultado.motivo === "vueltas")
    ? v.vueltas.at(-1)
    : undefined;
  const numeroVuelta = v.vueltas.length + (cerrada ? 0 : 1);
  const ganador = cerrada?.resultado.tipo === "ganada" ? cerrada.resultado.asiento : undefined;
  const ganadora = cerrada?.jugadas.find(j => j.asiento === ganador);
  // La presentación mantiene la vuelta completa abierta mientras carga su último naipe.
  const cargandoCierre = v.vueltaActual?.jugadas.length === mesa.asientos.length;
  const ultima = cargandoCierre ? undefined : (v.vueltaActual ?? cerrada)?.jugadas.at(-1);
  const jugadaVisible = ultima ? nombre(ultima.asiento) + " jugó " + nombrar(ultima.carta).toLowerCase() + "." : "";
  const detalleVuelta = cerrada && [
    ultima?.asiento !== ganador ? jugadaVisible : "",
    ganadora
      ? nombre(ganadora.asiento) + " ganó la vuelta con su " + nombrar(ganadora.carta).toLowerCase() + "."
      : "La vuelta fue parda.",
  ].filter(Boolean).join(" ");
  const relato = voz
    ? { titulo: nombre(voz.asiento), indicacion: voz.texto }
    : { titulo: "Vuelta " + numeroVuelta, indicacion: detalleVuelta || jugadaVisible };
  const { titulo, indicacion } = mostrandoCartas && !resultado ? relato : esperaDelCompanero(pie, nombre) ?? estadoDelTurno(mesa, partida, v);
  const pruebaPropia = resultado && v.pruebasDeTantos?.find(p => p.asiento === mesa.miAsiento);
  const cartas = v.cartas.filter(carta => !pruebaPropia || !pruebaPropia.cartas.includes(carta));
  const disponibles = grupos
    .map((g) => ({ ...g, opciones: g.opciones.filter((tipo) => v.legales.includes(tipo)) }))
    .filter((g) => g.opciones.length);
  const cobrados = v.resumenTantos?.cobros ?? v.cobros;
  return (
    <>
      <Tanteador meta={partida.meta} puntos={partida.puntos} propio={propio} equipo={equipo} />
      <div className="j-partida j-partida--jugador">
        <Tapete
          base={base}
          asientos={mesa.asientos.map(a => {
            const papel = a.asiento === mesa.miAsiento ? "Vos" : a.equipo === propio ? "Tu pareja" : "Rival";
            return { ...a, papel, etiqueta: papel + " · " + a.nombre };
          })}
          asientoInferior={mesa.miAsiento}
          dador={v.dador}
          mano={v.mano}
          muestra={v.muestra}
          titulo={"Mano " + partida.manoNumero}
          numeroVuelta={numeroVuelta}
          vuelta={v.vueltaActual ?? cerrada}
          terminada={Boolean(resultado && !cerrada)}
          manosOcultas={{ jugadas: v.acciones.filter(a => a.tipo === "carta"), asientoVisible: mesa.miAsiento }}
          detalle={(asiento, carta, ganadora) => {
            const prueba = resultado && v.pruebasDeTantos?.find(p => p.asiento === asiento);
            return {
              contenido: prueba
                ? <PruebaEnMesa prueba={prueba} acciones={v.acciones} base={base} jugada={carta} ganadora={ganadora} />
                : <><GloboDeVoz voz={voces.find(dicho => dicho.asiento === asiento)} />
                  <PalabraDelPie indicacion={frase} asiento={asiento} nombre={nombre} /></>,
              ocultaDorsos: Boolean(prueba),
              reemplazaJugada: Boolean(carta && prueba?.cartas.includes(carta)),
            };
          }}
          pie={pie && {vista:pie, mano:partida.manoNumero}}
          zonaJugador={<ZonaJugador
            titulo={estadoRed ?? titulo}
            bloqueada={bloqueada}
            detalle={<>
              {aviso && <p className="j-aviso">{aviso}</p>}
              <AvisoFlor pendiente={pendientes} porDeclararFlor={v.porDeclararFlor} nombre={nombre} />
              {(!estadoRed || mostrandoCartas || resultado) && (
                <p>{indicacion}{resultado && detalleVuelta && " " + detalleVuelta}</p>
              )}
              {v.trucoPendiente && pendientes && v.trucoPendiente.tipo !== pendientes.tipo && (
                <p className="j-reserva">
                  Queda pendiente el {canto[v.trucoPendiente.tipo].toLowerCase()} de{" "}
                  {nombre(v.trucoPendiente.asiento)}.
                </p>
              )}
            </>}
            sena={pie && indicar ? (pie.pie === mesa.miAsiento
              ? <AccionesDelPie pie={pie} nombre={nombre} bloqueada={bloqueada} elegir={indicar}/>
              : <SenasEnviadas pie={pie} muestra={v.muestra} nombre={nombre}/>) : sena}
            mano={cartas.length > 0 && <ManoJugador cartas={cartas} habilitada={!bloqueada && v.legales.includes("carta")} base={base} jugar={jugar} />}
            cantos={disponibles.length > 0 && disponibles.map((grupo) => (
              <fieldset className="j-opciones" key={grupo.nombre} aria-label={grupo.nombre}>
                {disponibles.length > 1 && <legend>{grupo.nombre}</legend>}
                <div className="j-cantos">
                  {grupo.opciones.map((tipo) => (
                    <button
                      key={tipo}
                      className={tipo === "quiero" || tipo === "paso-flor" || tipo === "flor" ? "button" : "j-sec"}
                      disabled={bloqueada}
                      onClick={() => jugar({ tipo })}
                    >
                      {canto[tipo]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            continuacion={(fin || resultado) && <Continuacion fin={fin} bloqueada={bloqueada} base={base} repartir={() => jugar()} />}
          />}
        />
        <section className="j-jugada-panel">
          {resultado && v.resumenTantos && <ResumenDeTantos resumen={v.resumenTantos} propio={propio}
            equipo={e => mesa.modo === "1v1" ? `${equipo(e)} (${nombre(e)})` : equipo(e)}
            acciones={v.acciones} resultado={resultado} nombre={nombre} />}
          <HistorialDeMano key={partida.manoNumero} acciones={v.acciones} cobros={v.cobros} nombre={nombre} indicaciones={partida.indicaciones}>
            {puedeReportar && <ReporteDeJugada mesaId={mesa.id} partida={partida} vuelta={numeroVuelta}
              presentando={mostrandoCartas} voz={voz?.indice} />}
          </HistorialDeMano>
          {!resultado && !(mostrandoCartas && voz) && (
            <dl className="j-cuenta">
              <div>
                <dt>Tus tantos</dt>
                <dd>
                  {v.tantosPropios.total} de {v.tantosPropios.modalidad}
                </dd>
              </div>
              <div>
                <dt>Valor de la mano</dt>
                <dd>{tantos(v.valorTruco)}</dd>
              </div>
            </dl>
          )}
          {(!resultado || !v.resumenTantos) && cobrados.length > 0 && (
            <section className="j-lances">
              <h3>Tantos cobrados</h3>
              <ul>
                {cobrados.map((c, i) => (
                  <li key={i}>
                    <b>
                      {equipo(c.equipo)} · {tantos(c.tantos)}
                    </b>{" "}
                    por {motivoDelCobro(c, v.acciones, resultado)}
                    {c.tantoGanador != null &&
                      " (" + (c.asiento != null ? nombre(c.asiento) + " con " : "") + c.tantoGanador + ")"}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {v.vueltas.length > 0 && (
            <ol className="j-vueltas" aria-label="Vueltas terminadas">
              {v.vueltas.map((vuelta, i) => (
                <li key={i}>
                  <details>
                    <summary>
                      {i + 1}.ª vuelta ·{" "}
                      <strong>
                        {vuelta.resultado.tipo === "parda" ? "Parda" : equipo(vuelta.resultado.equipo)}
                      </strong>
                    </summary>
                    <ul>
                      {vuelta.jugadas.map((j) => (
                        <li key={j.asiento}>
                          {nombre(j.asiento)} · {nombrar(j.carta)}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
