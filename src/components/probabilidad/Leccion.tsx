import { useEffect, useId, useRef, useState } from "react";
import { crearLeccionProbabilidad } from "../../aprendizaje/probabilidad/leccion";
import { escenas, textosProbabilidad, type Escena } from "../../aprendizaje/probabilidad/escenas";
import type { VistaAsiento } from "@eltruco/motor/mano.ts";
import { crearClienteAnalisis, type EstadoConsulta } from "../../probabilidad/cliente";
import { posicionPublica } from "../../probabilidad/informacion";
import { asientos, nombre, pareja, resultadoMano } from "../mesa/relato";
import { contrastarCartas, motivoSinCifras, presentarResultado } from "./presentacion";
import { CartaEnLeccion, TapeteLeccion } from "../mesa/TapeteLeccion";

export default function Leccion({ base }: { base: string }) {
  const [juego] = useState(() => crearLeccionProbabilidad());
  const [vista, mostrar] = useState(() => juego.vista());
  const [cliente] = useState(() => crearClienteAnalisis());
  const [pedido, informar] = useState<{ mesa: VistaAsiento; estado: EstadoConsulta | { tipo: "cancelado" } } | null>(null);
  const [intento, reintentar] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const botonChances = useRef<HTMLButtonElement>(null);
  const botonCancelar = useRef<HTMLButtonElement>(null);
  const primeraCarta = useRef<HTMLButtonElement>(null);
  const enfocar = useRef(false);
  const id = useId();
  const { mesa, ejemplo, seleccionada, prediccion, revelada, cursor, total } = vista;
  const fin = mesa.equipoGanador !== null;
  const repaso = cursor !== null;
  const propio = mesa.turno === 0;

  useEffect(() => {
    if (mesa.turno === 0) cliente.consultar(posicionPublica(mesa), estado => {
      if (estado.tipo !== "calculando" && botonCancelar.current === document.activeElement) botonChances.current?.focus();
      informar({ mesa, estado });
    });
    return () => cliente.cancelar();
  }, [cliente, mesa, intento]);

  useEffect(() => {
    if (enfocar.current) {
      const destino = !repaso && primeraCarta.current ? primeraCarta.current : titulo.current;
      destino?.focus();
      enfocar.current = false;
    }
  }, [mesa, repaso]);

  function actualizar(cambiarFoco = false) {
    enfocar.current = cambiarFoco;
    mostrar(juego.vista());
  }
  function abrir(escena: Escena) {
    juego.abrir(escena);
    actualizar(true);
  }
  function repasar(posicion: number | null) {
    if (juego.reproducir(posicion)) actualizar(true);
  }

  const pasado = mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  const consulta = revelada && pedido?.mesa === mesa ? pedido.estado : null;
  const resultado = consulta?.tipo === "resultado" ? consulta.resultado : null;
  const completo = resultado?.tipo === "completo" ? resultado : null;
  const resumen = completo && consulta?.tipo === "resultado" ? presentarResultado(completo, consulta.origen) : null;
  const otra = prediccion && prediccion !== seleccionada ? prediccion : mesa.cartas.find(carta => carta !== seleccionada);
  const contraste = completo && seleccionada && otra ? contrastarCartas(completo, seleccionada, otra) : "";
  let aviso = "";
  if (consulta?.tipo === "calculando") aviso = "Calculando las chances de tu pareja…";
  if (consulta?.tipo === "cancelado") aviso = "Cálculo cancelado.";
  if (consulta?.tipo === "error") aviso = "No pudimos calcular estas chances.";
  if (resultado && resultado.tipo !== "completo") aviso = motivoSinCifras(resultado.tipo);
  if (resumen) {
    const fila = resumen.filas.find(f => f.carta === seleccionada);
    aviso = fila ? "Con " + fila.nombre + ", tu pareja ganó el " + fila.porcentaje + " de las manos con estos jugadores." : resumen.lectura;
  }

  const numero = mesa.vueltas.length + (mesa.vueltaActual ? 1 : 0);
  const turno = fin ? "Mano terminada" : propio ? repaso ? "Era tu turno" : "Te toca jugar"
    : mesa.turno === 2 ? "Turno de tu compañero" : "Turno del " + asientos[mesa.turno!].toLowerCase();
  const encabezado = repaso ? "Jugada " + cursor + " de " + total
    : fin ? pareja(mesa.equipoGanador!) + " ganó la mano"
    : ejemplo ? escenas[ejemplo].titulo
    : mesa.cartas.length === 1 ? "Te queda una carta" : "¿Qué carta jugarías?";

  return <div className="prob-interactiva">
    <div className="prob-escenas">
      <div role="group" aria-labelledby={id + "-ejemplos"}>
        <strong id={id + "-ejemplos"}>Ejemplos guiados</strong>
        <div className="prob-botones">
          <button type="button" aria-pressed={vista.escena === "salida"} onClick={() => abrir("salida")}>La salida</button>
          <button type="button" aria-pressed={vista.escena === "segunda"} onClick={() => abrir("segunda")}>La segunda vuelta</button>
        </div>
      </div>
      <button type="button" className="prob-repartir" onClick={() => abrir("practica")}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="m9 3 8 1-.4 3M6 5 2 17l6 2"/><rect x="9" y="7" width="11" height="15" rx="2"/><path d="m14.5 12 2 2.5-2 2.5-2-2.5z"/>
        </svg> Repartir otra mano
      </button>
    </div>
    <div className="mesa-columnas">
      <TapeteLeccion mesa={mesa} finDeVuelta={repaso} base={base} etiquetaCartas="Tus cartas en mano"
        cartas={mesa.cartas.map((carta, i) => <CartaEnLeccion key={carta} base={base} carta={carta}
          seleccionada={propio ? seleccionada === carta : undefined}
          referencia={i === 0 ? primeraCarta : undefined}
          elegir={propio ? () => { juego.seleccionar(carta); actualizar(); } : undefined} />)} />
      <section className="mesa-panel" aria-labelledby={id + "-titulo"}>
        <p className="prob-turno" id={id + "-turno"}>Vuelta {numero} · {turno}</p>
        <h2 ref={titulo} tabIndex={-1} aria-describedby={id + "-turno"} id={id + "-titulo"}>{encabezado}</h2>
        {repaso && <nav className="prob-acciones" aria-label="Recorrer el repaso">
          <button type="button" className="ap-opcion" disabled={cursor === 0} onClick={() => repasar(cursor - 1)}>Anterior</button>
          <button type="button" className="ap-opcion" disabled={cursor === total} onClick={() => repasar(cursor + 1)}>Siguiente jugada</button>
          <button type="button" className="ap-link" onClick={() => repasar(null)}>Volver al presente</button>
        </nav>}
        {fin ? <p>{resultadoMano(mesa)}</p> : repaso
          ? <p>{propio ? "Elegí una carta en el tapete para explorar esa decisión." : "Así estaba la mesa en ese momento."}</p>
          : <p>{ejemplo ? escenas[ejemplo].consigna : mesa.cartas.length === 1
            ? "Elegí tu última carta en el tapete para jugarla." : escenas.practica.consigna}</p>}
        {propio && <div className="prob-acciones">
          {!repaso && <button type="button" className="button" disabled={!seleccionada}
            onClick={() => { if (juego.confirmar()) actualizar(true); }}>
            {seleccionada ? "Jugar " + nombre(seleccionada) : "Jugar carta"}
          </button>}
          {repaso && seleccionada && <p>Estás explorando el {nombre(seleccionada)}.</p>}
          <button type="button" ref={botonChances} className="ap-opcion" aria-expanded={revelada} aria-controls={id + "-comparacion"}
            onClick={() => { juego.alternarChances(); actualizar(); }}>{revelada ? "Ocultar chances" : "Ver chances"}</button>
        </div>}
        <div id={id + "-comparacion"} hidden={!revelada}>
          <p className="prob-aviso" role="status" aria-atomic="true">{aviso}</p>
          {consulta?.tipo === "calculando" && <button type="button" ref={botonCancelar} className="ap-link" onClick={() => {
            cliente.cancelar();
            informar({ mesa, estado: { tipo: "cancelado" } });
            botonChances.current?.focus();
          }}>Cancelar el cálculo</button>}
          {(consulta?.tipo === "cancelado" || consulta?.tipo === "error" || resultado?.tipo === "presupuesto-agotado") &&
            <button type="button" className="ap-link" onClick={() => { botonChances.current?.focus(); reintentar(n => n + 1); }}>Reintentar el cálculo</button>}
          {resumen && completo && <section className="prob-resultados" aria-labelledby={id + "-chances"}>
            <h3 id={id + "-chances"}>Chances de ganar la mano</h3>
            <p>{resumen.metodo} · {resumen.denominador}</p>
            <table><caption className="sr-only">Victorias de tu pareja por carta jugada</caption>
              <thead><tr><th scope="col">Carta</th><th scope="col">Chance</th><th scope="col">Victorias</th></tr></thead>
              <tbody>{mesa.cartas.map(carta => {
                const fila = resumen.filas.find(f => f.carta === carta)!;
                return <tr key={carta} className={seleccionada === carta ? "prob-fila" : ""}>
                  <th scope="row">{fila.nombre}</th><td>{fila.porcentaje}</td><td>{fila.victorias}</td>
                </tr>;
              })}</tbody>
            </table>
            {contraste && <p className="prob-contraste">{contraste}</p>}
            {ejemplo && <p>{escenas[ejemplo].explicacion}</p>}
            <details><summary>Cómo se calculó</summary>
              <p>{textosProbabilidad.informacion} {textosProbabilidad.politica}</p>
              <p>{completo.metodo === "exacto" ? textosProbabilidad.exacto : textosProbabilidad.estimacion} {textosProbabilidad.puntos}</p>
            </details>
          </section>}
        </div>
        {!repaso && total > 0 && <button type="button" className="ap-link" onClick={() => repasar(fin ? 0 : total - 1)}>Repasar la mano</button>}
      </section>
    </div>
    {pasado.length > 0 && <details className="prob-historial"><summary>Jugadas vistas hasta acá ({pasado.length})</summary>
      <ol>{pasado.map(j => <li key={j.carta}>{asientos[j.asiento]} · {nombre(j.carta)}</li>)}</ol>
    </details>}
  </div>;
}
