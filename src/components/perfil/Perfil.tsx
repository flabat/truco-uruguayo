import { useEffect, useRef, useState } from "react";
import type { PerfilJugador, ResumenPartida } from "../../lib/perfil";
import "./perfil.css";

const modalidades: Record<ResumenPartida["modo"], string> = {
  "1v1": "Duelo", "2v2": "Parejas", "3v3": "Tercetos",
};
const resultados: Record<ResumenPartida["resultado"], string> = {
  ganada: "Ganada", perdida: "Perdida", "sin-terminar": "Sin terminar", desconocido: "Resultado sin datos",
};
const fechaLocal = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const fechaBaja = new Intl.DateTimeFormat("es-UY", { dateStyle: "long" });
const textoConfirmacion = "Vas a cerrar sesión en todos tus dispositivos. En las partidas empezadas, una computadora juega en tu lugar; "
  + "las mesas que creaste y todavía esperan jugadores se cancelan. Tenés 30 días para arrepentirte: si volvés a ingresar, "
  + "cancelamos la eliminación. Después borramos tu cuenta y tus datos personales.";

type Vista =
  | { estado: "cargando" | "sin-sesion" | "error" }
  | { estado: "lista"; perfil: PerfilJugador; pagina: number }
  | { estado: "baja-pedida"; vence: string };

export default function Perfil({ base }: { base: string }) {
  const [vista, mostrar] = useState<Vista>({ estado: "cargando" });
  const dialogo = useRef<HTMLDialogElement>(null);
  const [enviando, enviar] = useState(false);
  const [errorBaja, fallarBaja] = useState(false);
  const [bajaCancelada] = useState(() => typeof location !== "undefined" && new URLSearchParams(location.search).get("baja") === "cancelada");

  async function eliminarCuenta() {
    enviar(true);
    fallarBaja(false);
    try {
      const respuesta = await fetch("/api/cuenta/eliminar", { method: "POST", cache: "no-store" });
      if (!respuesta.ok) throw new Error();
      const { vence } = await respuesta.json();
      dialogo.current?.close();
      mostrar({ estado: "baja-pedida", vence });
    } catch {
      fallarBaja(true);
    } finally {
      enviar(false);
    }
  }
  useEffect(() => {
    let solicitud: AbortController | undefined;
    async function cargar() {
      solicitud?.abort();
      const actual = new AbortController();
      solicitud = actual;
      mostrar({ estado: "cargando" });
      const pagina = new URLSearchParams(location.search).get("pagina") ?? "1";
      try {
        const respuesta = await fetch("/api/perfil?pagina=" + encodeURIComponent(pagina), {
          cache: "no-store",
          signal: actual.signal,
        });
        if (actual.signal.aborted) return;
        if (respuesta.status === 401) {
          mostrar({ estado: "sin-sesion" });
          return;
        }
        if (!respuesta.ok) throw new Error();
        const perfil: PerfilJugador = await respuesta.json();
        if (!actual.signal.aborted) mostrar({ estado: "lista", perfil, pagina: Number(pagina) });
      } catch {
        if (!actual.signal.aborted) mostrar({ estado: "error" });
      }
    }
    void cargar();
    const alVolver = (evento: PageTransitionEvent) => { if (evento.persisted) void cargar(); };
    window.addEventListener("pageshow", alVolver);
    return () => {
      solicitud?.abort();
      window.removeEventListener("pageshow", alVolver);
    };
  }, []);

  if (vista.estado === "cargando") return <p role="status">Consultando tu perfil…</p>;
  if (vista.estado === "baja-pedida") return (
    <p role="status">Pediste eliminar tu cuenta. Se elimina el {fechaBaja.format(new Date(vista.vence))} si no volvés a ingresar.</p>
  );
  if (vista.estado === "sin-sesion") return (
    <form action="/api/auth/login" method="get">
      <p>Ingresá para ver tu perfil y tus partidas.</p>
      <input type="hidden" name="volver" value="/perfil/" />
      <button className="button" type="submit">Ingresar al juego</button>
    </form>
  );
  if (vista.estado === "error") return (
    <>
      <p role="alert">No se pudo cargar tu perfil.</p>
      <a className="text-link" href={base + "perfil/"}>Volver a intentar</a>
    </>
  );
  if (vista.estado !== "lista") return null;

  const { perfil, pagina } = vista;
  return (
    <>
      {bajaCancelada && <p role="status" className="perfil-aviso">Cancelamos la eliminación de tu cuenta.</p>}
      <div className="perfil-cuenta">
        <div>
          <p className="perfil-nombre">{perfil.jugador.nombre}</p>
          <p className="perfil-id">ID de jugador <code>{perfil.jugador.id}</code></p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="perfil-salir" type="submit">Cerrar sesión</button>
        </form>
      </div>
      <section aria-labelledby="mis-partidas">
        <h2 id="mis-partidas">Mis partidas</h2>
        {perfil.partidas.length ? (
          <ul className="perfil-partidas">
            {perfil.partidas.map(partida => (
              <li key={partida.id}>
                <div>
                  <h3>{modalidades[partida.modo]} · A {partida.meta} tantos</h3>
                  {partida.fecha && <time dateTime={partida.fecha}>{fechaLocal.format(new Date(partida.fecha))}</time>}
                </div>
                <div>
                  <p className="perfil-resultado" data-resultado={partida.resultado}>{resultados[partida.resultado]}</p>
                  {partida.puntos && <p>Tu equipo {partida.puntos.propios} · Rivales {partida.puntos.rivales}</p>}
                </div>
                <a className="text-link" href={base + "jugar/?mesa=" + encodeURIComponent(partida.id)}>
                  Abrir mesa
                </a>
              </li>
            ))}
          </ul>
        ) : <p>{pagina === 1 ? "Todavía no jugaste ninguna partida." : "No hay partidas en esta página."}</p>}
        {(pagina > 1 || perfil.hayMas) && (
          <nav className="perfil-paginas" aria-label="Páginas de mis partidas">
            {pagina > 1 && <a className="text-link" href={"?pagina=" + (pagina - 1)}>Anterior</a>}
            <span>Página {pagina}</span>
            {perfil.hayMas && <a className="text-link" href={"?pagina=" + (pagina + 1)}>Siguiente</a>}
          </nav>
        )}
      </section>
      <a className="button" href={base + "jugar/"}>Jugar al truco</a>
      <section className="perfil-baja" aria-labelledby="eliminar-cuenta">
        <h2 id="eliminar-cuenta">Eliminar mi cuenta</h2>
        <button className="perfil-eliminar" type="button" onClick={() => { fallarBaja(false); dialogo.current?.showModal(); }}>
          Eliminar mi cuenta
        </button>
      </section>
      <dialog ref={dialogo} className="perfil-dialogo" aria-labelledby="confirmar-baja">
        <h2 id="confirmar-baja">Eliminar mi cuenta</h2>
        <p>{textoConfirmacion}</p>
        {errorBaja && <p role="alert">No se pudo pedir la eliminación. Volvé a intentar.</p>}
        <div className="perfil-dialogo-botones">
          <button className="perfil-eliminar" type="button" disabled={enviando} onClick={eliminarCuenta}>Eliminar mi cuenta</button>
          <button className="perfil-salir" type="button" onClick={() => dialogo.current?.close()}>Volver</button>
        </div>
      </dialog>
    </>
  );
}
