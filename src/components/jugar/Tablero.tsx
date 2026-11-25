import { ResumenDeTantos } from "./ResumenDeTantos";
import { motivoDelCobro } from "@eltruco/cliente/cobros.ts";
import { canto } from "@eltruco/cliente/cantos.ts";
import type { ReactNode } from "react";
import { ZonaJugador } from "./ZonaJugador";
import { AvisoFlor, HistorialDeMano } from "./HistorialDeMano";
import { nombrar, tantos } from "@eltruco/cliente/textos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { PruebaDeTantos, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { Eleccion, Mesa, Partida, Tipo } from "./cliente";
import { GloboDeVoz, PalabraDelPie } from "./Voz";
import { useVozDelPie, vocesEnReposo, type Voz } from "@eltruco/cliente/voces.ts";
import { estadoDelTurno, tanteador } from "@eltruco/cliente/turno.ts";
import { Naipe, Tapete } from "./Tapete";
import { AccionesDelPie, esperaDelCompanero, SenasEnviadas, type ElegirIndicacion } from "./GloboDelCompanero";
import { vueltaEnMesa } from "@eltruco/cliente/vuelta-en-mesa.ts";
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

export function controlesDeCantos(legales: readonly Tipo[], bloqueada: boolean, jugar: (a: Eleccion) => void) {
  const disponibles = grupos
    .map((g) => ({ ...g, opciones: g.opciones.filter((tipo) => legales.includes(tipo)) }))
    .filter((g) => g.opciones.length);
  return disponibles.length > 0 && disponibles.map((grupo) => (
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
  ));
}

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

export function Tanteador({ meta, puntos, propio, equipo }: {
  meta: number; puntos: readonly [number, number]; propio: number; equipo: (n: number) => string;
}) {
  const datos = tanteador(meta, puntos, propio, equipo);
  return (
      <div className="j-tanteador" role="group" aria-label="Tanteador">
        <div className="j-meta">
          <b>{datos.meta}</b>
          <small>{datos.detalle}</small>
        </div>
        {datos.equipos.map((e) => (
          <div key={e.equipo} role="group" aria-labelledby={"j-equipo-" + e.equipo}>
            <span id={"j-equipo-" + e.equipo}>{e.nombre}</span>
            <strong>{e.puntos}</strong>
            <small>{e.cuenta}</small>
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
  const fin = partida.contexto.fase === "chico-terminado";
  const { cerrada, vuelta, numeroVuelta, detalleVuelta, jugadaVisible } = vueltaEnMesa(v, partida.lance.activos.length, nombre);
  const relato = voz
    ? { titulo: nombre(voz.asiento), indicacion: voz.texto }
    : { titulo: "Vuelta " + numeroVuelta, indicacion: detalleVuelta || jugadaVisible };
  const { titulo, indicacion } = mostrandoCartas && !resultado ? relato : esperaDelCompanero(pie, nombre) ?? estadoDelTurno(mesa, partida, v);
  const pruebaPropia = resultado && v.pruebasDeTantos?.find(p => p.asiento === mesa.miAsiento);
  const cartas = v.cartas.filter(carta => !pruebaPropia || !pruebaPropia.cartas.includes(carta));
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
          vuelta={vuelta}
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
            cantos={controlesDeCantos(v.legales, bloqueada, jugar)}
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
