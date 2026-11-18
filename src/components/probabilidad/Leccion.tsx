import { useEffect, useId, useRef, useState } from "react";
import { crearLeccionProbabilidad } from "../../aprendizaje/probabilidad/leccion";
import { escenas, textosProbabilidad, type Escena } from "../../aprendizaje/probabilidad/escenas";
import { crearClienteAnalisis, type EstadoConsulta } from "../../probabilidad/cliente";
import { posicionPublica } from "../../probabilidad/informacion";
import { asientos, nombre, pareja, resultadoMano } from "../mesa/relato";
import { contrastarCartas, motivoSinCifras, presentarResultado } from "./presentacion";
import { Tapete } from "./Tapete";

export default function Leccion({ base }: { base: string }) {
  const [juego] = useState(() => crearLeccionProbabilidad());
  const [vista, mostrar] = useState(() => juego.vista());
  const [consulta, informar] = useState<EstadoConsulta | null>(null);
  const cliente = useRef<ReturnType<typeof crearClienteAnalisis> | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const botonComparar = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => () => cliente.current?.cancelar(), []);

  function actualizar(enfocar = false) {
    mostrar(juego.vista());
    if (enfocar) titulo.current?.focus();
  }
  function cancelarConsulta() {
    cliente.current?.cancelar();
    informar(null);
  }
  function comparar() {
    if (!juego.comparar()) return;
    actualizar();
    cliente.current ??= crearClienteAnalisis();
    cliente.current.consultar(posicionPublica(juego.vista().mesa), informar);
  }
  function abrir(escena: Escena) {
    cancelarConsulta();
    juego.abrir(escena);
    actualizar(true);
  }
  function repasar(posicion: number | null) {
    cancelarConsulta();
    if (juego.reproducir(posicion)) {
      actualizar(true);
      if (juego.vista().revelada) comparar();
    }
  }
  function jugar() {
    if (!juego.confirmar()) return;
    cancelarConsulta();
    actualizar(true);
  }

  const { mesa, ejemplo, prediccion, inspeccionada, revelada, fase, cursor, total } = vista;
  const fin = mesa.equipoGanador !== null;
  const repaso = cursor !== null;
  const propio = mesa.turno === 0;
  const unica = mesa.cartas.length === 1;
  const pasado = mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  const resultado = consulta?.tipo === "resultado" ? consulta.resultado : null;
  const completo = resultado?.tipo === "completo" ? resultado : null;
  const resumen = completo && consulta?.tipo === "resultado" ? presentarResultado(completo, consulta.origen) : null;
  const otra = prediccion && prediccion !== inspeccionada ? prediccion : mesa.cartas.find(carta => carta !== inspeccionada);
  const contraste = completo && inspeccionada && otra ? contrastarCartas(completo, inspeccionada, otra) : "";
  let aviso = "";
  if (consulta?.tipo === "calculando") aviso = "Calculando las chances de tu pareja…";
  if (consulta?.tipo === "error") aviso = "No pudimos calcular estas chances.";
  if (resultado && resultado.tipo !== "completo") aviso = motivoSinCifras(resultado.tipo);
  if (resumen) aviso = "Comparación lista. " + resumen.lectura;

  const encabezado = fin ? pareja(mesa.equipoGanador!) + " ganó la mano"
    : repaso ? "Jugada " + cursor + " de " + total
    : ejemplo ? escenas[ejemplo].titulo
    : unica ? "Te queda una carta" : "¿Qué carta jugarías?";
  return <div className="prob-interactiva">
    <div className="prob-escenas" role="group" aria-label="Elegí una posición">
      <button type="button" aria-pressed={vista.escena === "salida"} onClick={() => abrir("salida")}>La salida</button>
      <button type="button" aria-pressed={vista.escena === "segunda"} onClick={() => abrir("segunda")}>La segunda vuelta</button>
      <button type="button" onClick={() => abrir("practica")}>Practicar con otra mano</button>
    </div>
    <div className="mesa-columnas">
      <Tapete mesa={mesa} enRepaso={repaso} base={base}/>
      <section className="mesa-panel" aria-labelledby={id + "-titulo"}>
        <h2 ref={titulo} tabIndex={-1} id={id + "-titulo"}>{encabezado}</h2>
        {fin ? <p>{resultadoMano(mesa)}</p> : repaso ? <p>Así estaba la mesa en ese momento.</p>
          : <p>{ejemplo ? escenas[ejemplo].consigna : unica ? "Podés ver cómo puede terminar la mano antes de jugarla." : escenas.practica.consigna}</p>}
        {propio && <>
          <div className="mesa-naipes" role="group" aria-label={revelada ? "Elegí una carta para comparar" : "Tus cartas"}>
            {mesa.cartas.map(carta => <button type="button" key={carta} className="ap-carta"
              aria-pressed={(revelada ? inspeccionada : prediccion) === carta}
              aria-label={(revelada ? "Comparar " : "Predecir ") + nombre(carta)}
              disabled={repaso && !revelada}
              onClick={() => { if (revelada) juego.inspeccionar(carta); else juego.predecir(carta); actualizar(); }}>
                <img src={base + "img/cartas/tatu/" + carta + ".webp"} width="384" height="596" alt="" />
                <span>{nombre(carta)}</span>
            </button>)}
          </div>
          {!repaso && prediccion && <p className="prob-eleccion">Tu predicción: <strong>{nombre(prediccion)}</strong></p>}
          <div className="prob-acciones">
            <button ref={botonComparar} type="button" className="ap-opcion"
              aria-disabled={(!repaso && !unica && !prediccion) || (consulta !== null && consulta.tipo !== "error" && resultado?.tipo !== "presupuesto-agotado")}
              onClick={e => { if (e.currentTarget.getAttribute("aria-disabled") !== "true") comparar(); }}>
              {consulta?.tipo === "error" || resultado?.tipo === "presupuesto-agotado" ? "Reintentar el cálculo" : "Comparar las cartas"}
            </button>
            {consulta?.tipo === "calculando" && <button type="button" className="ap-link"
              onClick={() => { cancelarConsulta(); botonComparar.current?.focus(); }}>Cancelar el cálculo</button>}
            {!repaso && inspeccionada && <button type="button" className="button" onClick={jugar}>Jugar {nombre(inspeccionada)}</button>}
          </div>
        </>}
        <p className="prob-aviso" role="status" aria-atomic="true">{aviso}</p>
      </section>
    </div>
    {resumen && completo && <section className="prob-resultados" aria-labelledby={id + "-chances"}>
      <h2 id={id + "-chances"}>Chances de ganar la mano</h2>
      <p>{resumen.metodo} · {resumen.denominador}</p>
      <table><caption className="sr-only">Victorias de tu pareja por carta jugada</caption>
        <thead><tr><th scope="col">Carta</th><th scope="col">Probabilidad</th><th scope="col">Manos ganadas</th></tr></thead>
        <tbody>{resumen.filas.map(fila => <tr key={fila.carta} className={inspeccionada === fila.carta ? "prob-fila" : ""}>
          <th scope="row"><button type="button" aria-pressed={inspeccionada === fila.carta}
            onClick={() => { juego.inspeccionar(fila.carta); actualizar(); }}>{fila.nombre}</button></th>
          <td>{fila.porcentaje}</td><td>{fila.victorias}</td>
        </tr>)}</tbody>
      </table>
      {contraste && <p className="prob-contraste">{contraste}</p>}
      {ejemplo && <p>{escenas[ejemplo].explicacion}</p>}
      <details><summary>Cómo se calculó</summary>
        <p>{textosProbabilidad.informacion} {textosProbabilidad.politica}</p>
        <p>{completo.metodo === "exacto" ? textosProbabilidad.exacto : textosProbabilidad.estimacion} {textosProbabilidad.puntos}</p>
      </details>
    </section>}
    {(total > 0 || fase === "repaso") && <section className="prob-historial" aria-label="Repaso de la mano">
      <div className="prob-acciones">
        {repaso ? <>
          <button type="button" className="ap-opcion" disabled={cursor === 0} onClick={() => repasar(cursor! - 1)}>Anterior</button>
          <button type="button" className="ap-opcion" disabled={cursor === total} onClick={() => repasar(cursor! + 1)}>Siguiente jugada</button>
          <button type="button" className="ap-link" onClick={() => repasar(null)}>Volver al presente</button>
        </> : <button type="button" className="ap-opcion" onClick={() => repasar(fin ? 0 : total - 1)}>Repasar la mano</button>}
      </div>
      {pasado.length > 0 && <details><summary>Jugadas vistas hasta acá ({pasado.length})</summary>
        <ol>{pasado.map(j => <li key={j.carta}>{asientos[j.asiento]} · {nombre(j.carta)}</li>)}</ol>
      </details>}
    </section>}
  </div>;
}
