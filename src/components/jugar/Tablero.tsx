import { useEffect, useRef } from "react";
import { canto } from "../../lib/cantos";
import { AvisoFlor, HistorialDeMano, nombrar, tantos } from "./HistorialDeMano";
import type { CardId } from "../../motor/cartas";
import type { VueltaCerrada } from "../../motor/mano";
import type { VistaOnline } from "../../motor/mesa-online";
import { cuentaDelChico, mitadesDelChico } from "../../motor/chico";
import type { Asiento, Eleccion, Mesa, Partida, Tipo } from "./cliente";

type Canto = Exclude<Tipo, "carta">;
const grupos: { nombre: string; opciones: Canto[] }[] = [
  { nombre: "Responder", opciones: ["quiero", "no-quiero", "paso-flor"] },
  { nombre: "Truco", opciones: ["truco", "retruco", "vale-cuatro"] },
  {
    nombre: "Envido y flor",
    opciones: ["envido", "real-envido", "falta-envido", "flor", "con-flor-envido", "contraflor-al-resto"],
  },
];

export function Naipe({ id, base }: { id: CardId; base: string }) {
  return <img src={base + "img/cartas/tatu/" + id + ".webp"} width={384} height={596} alt={nombrar(id)} />;
}

function AsientoEnMesa({
  asiento,
  mesa,
  vista,
  cerrada,
  base,
  bloqueada,
  jugar,
}: {
  asiento: Asiento;
  mesa: Mesa;
  vista: VistaOnline;
  cerrada?: VueltaCerrada;
  base: string;
  bloqueada: boolean;
  jugar: (a: Eleccion) => void;
}) {
  const propio = asiento.asiento === mesa.miAsiento;
  const dador = asiento.asiento === vista.dador;
  const n = mesa.asientos.length;
  const relativo = (asiento.asiento - mesa.miAsiento + n) % n;
  const lugar = propio
    ? "vos"
    : n === 2 || relativo === 2
      ? "frente"
      : relativo === 1
        ? "derecha"
        : "izquierda";
  const vuelta = vista.vueltaActual ?? cerrada;
  const jugada = vuelta?.jugadas.find((j) => j.asiento === asiento.asiento);
  const ganadora = cerrada?.resultado.tipo === "ganada" && cerrada.resultado.asiento === asiento.asiento;
  const restantes =
    3 - vista.acciones.filter((a) => a.tipo === "carta" && a.asiento === asiento.asiento).length;
  const papel = propio
    ? "Vos"
    : n === 2 || asiento.equipo !== mesa.asientos[mesa.miAsiento].equipo
      ? "Rival"
      : "Tu pareja";
  return (
    <div className={"j-puesto j-" + lugar} role="group" aria-label={papel + " · " + asiento.nombre}>
      <div className="j-ocupante">
        <div className="j-persona">
          <b>{asiento.nombre}</b>
          <span>
            {papel}
            {dador && " · Dador"}
            {asiento.asiento === vista.mano && " · Mano"}
          </span>
        </div>
        {jugada && (
          <div className={ganadora ? "j-jugada j-ganadora" : "j-jugada"}>
            <Naipe base={base} id={jugada.carta} />
            {ganadora && <small>Ganó la vuelta</small>}
          </div>
        )}
        {!jugada && !propio && restantes > 0 && (
          <div className="j-dorsos" role="img" aria-label={restantes + " cartas en mano"}>
            {Array.from({ length: restantes }, (_, i) => (
              <img key={i} alt="" width={384} height={596} src={base + "img/cartas/tatu/reverso.webp"} />
            ))}
          </div>
        )}
      </div>
      {dador && (
        <div className="j-muestra" role="img" aria-label={"Muestra " + nombrar(vista.muestra)}>
          <div aria-hidden="true">
            <Naipe base={base} id={vista.muestra} />
            <img
              className="j-mazo"
              src={base + "img/cartas/tatu/reverso.webp"}
              alt=""
              width={384}
              height={596}
            />
          </div>
          <small aria-hidden="true">Muestra</small>
          <strong aria-hidden="true">{nombrar(vista.muestra)}</strong>
        </div>
      )}
      {propio && (
        <div className="j-mano" role="group" aria-label="Tus cartas">
          {vista.cartas.map((c) => (
            <button
              key={c}
              disabled={bloqueada || !vista.legales.includes("carta")}
              aria-label={"Jugar " + nombrar(c)}
              onClick={() => jugar({ tipo: "carta", carta: c })}
            >
              <Naipe base={base} id={c} />
              <span>{nombrar(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  base,
  jugar,
}: {
  mesa: Mesa;
  partida: Partida;
  bloqueada: boolean;
  mostrandoCartas?: boolean;
  base: string;
  jugar: (a?: Eleccion) => void;
}) {
  const v = partida.vista!;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const equipo = (e: number) =>
    mesa.modo === "1v1" ? (e === propio ? "Vos" : "Tu rival") : e === propio ? "Tu equipo" : "Rivales";
  const nombre = (a: number) => mesa.asientos[a].nombre!;
  const pendientes = v.pendiente;
  const resultado = v.resultado;
  const fin = partida.ganadorPartida !== null;
  const cerrada = !v.vueltaActual && (!resultado || resultado.motivo === "vueltas")
    ? v.vueltas.at(-1)
    : undefined;
  const numeroVuelta = v.vueltas.length + (cerrada ? 0 : 1);
  const ganador = cerrada?.resultado.tipo === "ganada" ? cerrada.resultado.asiento : undefined;
  const ganadora = cerrada?.jugadas.find(j => j.asiento === ganador);
  const veredicto = ganadora ? "Ganó " + nombre(ganadora.asiento) : cerrada && "Parda";
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
  const { titulo, indicacion } = mostrandoCartas && !resultado
    ? { titulo: "Vuelta " + numeroVuelta, indicacion: detalleVuelta || jugadaVisible }
    : estadoDelTurno(mesa, partida, v);
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
  const cobrados = v.cobros.filter((c) => c.motivo !== "truco");
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
        <section className="j-tapete" aria-label="Tapete">
          <header>
            <strong>Mano {partida.manoNumero}</strong>
            <div className="j-estado-vuelta">
              <span>{resultado && !cerrada ? "Terminada" : "Vuelta " + numeroVuelta}</span>
              {veredicto && <b>{veredicto}</b>}
            </div>
          </header>
          <div className={"j-puestos " + (mesa.modo === "1v1" ? "j-duelo" : "")}>
            {mesa.asientos.map((a) => (
              <AsientoEnMesa
                key={a.asiento}
                asiento={a}
                mesa={mesa}
                vista={v}
                cerrada={cerrada}
                base={base}
                bloqueada={bloqueada}
                jugar={jugar}
              />
            ))}
          </div>
        </section>
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
          {!resultado && (
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
                    por {c.motivo}
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
