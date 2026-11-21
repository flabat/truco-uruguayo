import { motivoDelCobro } from "../../lib/cobros";
import { canto, respuestaConFlor } from "../../lib/cantos";
import { useEffect, useRef } from "react";
import { AvisoFlor, HistorialDeMano, nombrar, tantos } from "./HistorialDeMano";
import type { CardId } from "../../motor/cartas";
import type { PruebaDeTantos, VistaOnline } from "../../motor/mesa-online";
import { cuentaDelChico, mitadesDelChico } from "../../motor/chico";
import type { Eleccion, Mesa, Partida, Tipo } from "./cliente";
import { GloboDeVoz, vocesEnReposo, type Voz } from "./Voz";
import { Naipe, Tapete } from "./Tapete";

type Canto = Exclude<Tipo, "carta">;
const grupos: { nombre: string; opciones: Canto[] }[] = [
  { nombre: "Responder", opciones: ["con-flor-quiero", "quiero", "no-quiero", "paso-flor"] },
  { nombre: "Truco", opciones: ["truco", "retruco", "vale-cuatro"] },
  {
    nombre: "Envido y flor",
    opciones: ["envido", "real-envido", "falta-envido", "flor", "con-flor-envido", "contraflor-al-resto"],
  },
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
        ? `${mesa.asientos[1 - resultado.equipo].nombre} se fue al mazo. Se anotaron ${tantos(resultado.tantos)}.`
        : `Se anotaron ${tantos(resultado.tantos)} por ${motivos[resultado.motivo]}.`,
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
          <small>{mitadesDelChico(meta)}</small>
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

export function EnJuego({
  mesa,
  partida,
  bloqueada,
  mostrandoCartas = false,
  voz,
  base,
  jugar,
}: {
  mesa: Mesa;
  partida: Partida;
  bloqueada: boolean;
  mostrandoCartas?: boolean;
  voz?: Voz;
  base: string;
  jugar: (a?: Eleccion) => void;
}) {
  const v = partida.vista!;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const equipo = (e: number) =>
    mesa.modo === "1v1" ? (e === propio ? "Vos" : "Tu rival") : e === propio ? "Tu equipo" : "Rivales";
  const nombre = (a: number) => mesa.asientos[a].nombre!;
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
  const { titulo, indicacion } = mostrandoCartas && !resultado ? relato : estadoDelTurno(mesa, partida, v);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const desdeTeclado = useRef(false);
  useEffect(() => {
    if (desdeTeclado.current && document.activeElement === document.body) {
      encabezado.current?.focus();
      desdeTeclado.current = false;
    }
    if (!mostrandoCartas) desdeTeclado.current = false;
  }, [partida.version, mostrandoCartas, v.acciones.length]);
  const disponibles = grupos
    .map((g) => ({ ...g, opciones: g.opciones.filter((tipo) => v.legales.includes(tipo)) }))
    .filter((g) => g.opciones.length);
  const cobrados = v.cobros;
  return (
    <>
      <Tanteador meta={partida.meta} puntos={partida.puntos} propio={propio} equipo={equipo} />
      <div
        className="j-partida"
        onClickCapture={(e) => {
          if (e.target instanceof Element && e.target.closest("button"))
            desdeTeclado.current = e.detail === 0;
        }}
      >
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
            const esPropio = asiento === mesa.miAsiento;
            const prueba = resultado && v.pruebasDeTantos?.find(p => p.asiento === asiento);
            const mano = esPropio ? v.cartas.filter(c => !prueba || !prueba.cartas.includes(c)) : [];
            return {
              contenido: prueba
                ? <PruebaEnMesa prueba={prueba} acciones={v.acciones} base={base} jugada={carta} ganadora={ganadora} />
                : <GloboDeVoz voz={voces.find(dicho => dicho.asiento === asiento)} />,
              ocultaDorsos: Boolean(prueba),
              reemplazaJugada: Boolean(carta && prueba?.cartas.includes(carta)),
              mano: mano.length > 0 && <div className="j-mano" role="group" aria-label="Tus cartas">
                {mano.map(c => <button
                  key={c}
                  disabled={bloqueada || !v.legales.includes("carta")}
                  aria-label={"Jugar " + nombrar(c)}
                  onClick={() => jugar({ tipo: "carta", carta: c })}
                >
                  <Naipe base={base} id={c} />
                </button>)}
              </div>,
            };
          }}
        />
        <section className="j-jugada-panel">
          <div role="status" aria-live="polite" aria-atomic="true">
            <AvisoFlor pendiente={pendientes} porDeclararFlor={v.porDeclararFlor} nombre={nombre} />
            <h2 ref={encabezado} tabIndex={-1}>
              {titulo}
            </h2>
            <p>{indicacion}{resultado && detalleVuelta && " " + detalleVuelta}</p>
          </div>
          {v.trucoPendiente && pendientes && v.trucoPendiente.tipo !== pendientes.tipo && (
            <p className="j-reserva">
              Queda pendiente el {canto[v.trucoPendiente.tipo].toLowerCase()} de{" "}
              {nombre(v.trucoPendiente.asiento)}.
            </p>
          )}
          {disponibles.map((grupo) => (
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
          {fin ? (
            <a className="button" href={base + "jugar/"}>
              Crear otra mesa
            </a>
          ) : (
            resultado && (
              <button className="button" disabled={bloqueada} onClick={() => jugar()}>
                Repartir otra mano
              </button>
            )
          )}
          <HistorialDeMano key={partida.manoNumero} acciones={v.acciones} cobros={v.cobros} nombre={nombre} />
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
          {cobrados.length > 0 && (
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
