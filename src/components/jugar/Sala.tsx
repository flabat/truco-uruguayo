import { useEffect, useRef, useState } from "react";
import {
  ErrorMesa,
  idComando,
  mensajeDe,
  pedir,
  useMesa,
  type Eleccion,
  type Jugador,
  type Mesa,
  type Modo,
} from "./cliente";
import PieMesa from "./PieMesa";
import SalonEnVivo from "./SalonEnVivo";
import VisorEspectador from "./VisorEspectador";
import { VozDiscord } from "./VozDiscord";
import { EnJuego } from "./Tablero";
import { signalVersionFor } from "../../../training/contracts/index";
import { MesaDeTercetos } from "./Tercetos";
import { MesaConSenas } from "./Senas";
import { usePresentacionVueltas } from "./presentacion-vueltas";
import { esMetaDeChico, metaMaxima, metaPorModalidad, mitadesDelChico } from "../../motor/chico";

const modalidades = {
  "1v1": ["1 contra 1", "Mano a mano"],
  "2v2": ["2 contra 2", "En parejas"],
  "3v3": ["3 contra 3", "En tercetos"],
} as const;

function Ingreso({ volver, invitada }: { volver: string; invitada?: boolean }) {
  const mirando = volver.startsWith("/jugar/?mirar=");
  return (
    <div className="j-panel">
      <h2>{invitada ? "Te invitaron a una mesa" : mirando ? "Ingresá para mirar la mesa" : "Entrá con tu jugador"}</h2>
      <p>
        {invitada
          ? "Ingresá para ocupar tu asiento con los demás jugadores."
          : mirando ? "Al volver del ingreso vas a ver las jugadas públicas." : "Ingresá para mirar partidas en vivo o crear tu mesa."}
      </p>
      <form action="/api/auth/login" method="get">
        <input type="hidden" name="volver" value={volver} />
        <button className="button">Ingresar al juego</button>
      </form>
    </div>
  );
}

function Visibilidad({ publica }: { publica: boolean }) {
  return <p className="j-ayuda">{publica
    ? "Mesa pública. Quienes ingresen al salón pueden ver las jugadas y, si la voz está habilitada, entrar al Discord de esta mesa."
    : "Mesa privada por invitación."}</p>;
}

function AbrirMesa({
  salonHabilitado,
  base,
  anterior,
  abrir,
}: {
  base: string;
  anterior: string | null;
  salonHabilitado: boolean;
  abrir: (id: string, aviso: string) => void;
}) {
  const [modo, elegir] = useState<Modo>("2v2");
  const [tercetos, habilitarTercetos] = useState(false);
  useEffect(() => {
    const cancel = new AbortController();
    pedir<{ modos: Modo[] }>("/api/modalidades", undefined, cancel.signal)
      .then(({ modos }) => habilitarTercetos(Array.isArray(modos) && modos.includes("3v3")))
      .catch(() => { /* Un servidor anterior sigue ofreciendo duelo y parejas. */ });
    return () => cancel.abort();
  }, []);
  const [puntaje, cambiarPuntaje] = useState(String(metaPorModalidad[modo]));
  const meta = Number(puntaje);
  const metaValida = esMetaDeChico(meta);
  const [publica, publicar] = useState(true);
  const [senas, habilitarSenas] = useState(false);
  const [ocupado, ocupar] = useState(false);
  const [error, avisar] = useState("");
  async function crear(conBots: boolean) {
    if (ocupado || !metaValida) return;
    ocupar(true);
    avisar("");
    try {
      const mesa = await pedir<Mesa>("/api/mesas", {
        modo, publica: salonHabilitado && modo !== "3v3" && publica, ...(meta !== metaPorModalidad[modo] && { meta }), ...(modo === "2v2" && senas && { formato: "pairs-private-senas" }),
      });
      const destino = base + "jugar/?mesa=" + encodeURIComponent(mesa.id);
      // Guardar el enlace antes de llenar la mesa permite retomarla tras un corte.
      history.replaceState(null, "", destino);
      let aviso = "";
      try {
        if (conBots) {
          for (const lugar of mesa.asientos.filter((a) => a.tipo === "vacio")) {
            await pedir("/api/mesas/" + mesa.id + "/computadoras", { asiento: lugar.asiento });
          }
        }
      } catch (e) {
        aviso = "La mesa está creada. " + mensajeDe(e);
      }
      abrir(mesa.id, aviso);
    } catch (e) {
      avisar(mensajeDe(e));
      ocupar(false);
    }
  }
  return (
    <div className="j-crear">
      <div className="j-panel">
        {anterior && (
          <a className="j-volver" href={base + "jugar/?mesa=" + encodeURIComponent(anterior)}>
            Volver a mi mesa →
          </a>
        )}
        <h2>Crear una mesa</h2>
        {salonHabilitado && <a className="j-link" href={base + "jugar/"}>Volver al salón</a>}
        <fieldset disabled={ocupado}>
          <legend>Modalidad</legend>
          <div className="j-modos">
            {(["1v1", "2v2", "3v3"] as const).filter(m => m !== "3v3" || tercetos).map(m => (
              <label key={m} className={modo === m ? "elegido" : ""}>
                <input type="radio" name="modo" checked={m === modo} onChange={() => {
                  elegir(m);
                  cambiarPuntaje(String(metaPorModalidad[m]));
                }} />
                <span>
                  <strong>{modalidades[m][0]}</strong>
                  <small>{modalidades[m][1]}</small>
                </span>
              </label>
            ))}
          </div>
          {modo === "2v2" && (
            <label className="j-habilitar-senas">
              <input type="checkbox" checked={senas} onChange={e => habilitarSenas(e.target.checked)} />
              Permitir señas entre compañeros
            </label>
          )}
          {salonHabilitado && modo !== "3v3" && <label className="j-habilitar-senas">
            <input type="checkbox" checked={publica} onChange={e => publicar(e.target.checked)} />
            Mostrar en el salón
          </label>}
          <Visibilidad publica={salonHabilitado && modo !== "3v3" && publica} />
        </fieldset>
        <div className="j-elegir-meta">
          <label htmlFor="meta-chico">Tantos para ganar el chico</label>
          <input id="meta-chico" type="number" min="2" max={metaMaxima} step="2" required value={puntaje}
            disabled={ocupado} aria-describedby="mitades-chico" aria-invalid={!metaValida}
            onChange={e => cambiarPuntaje(e.target.value)} />
          <small id="mitades-chico" aria-live="polite">
            {metaValida ? mitadesDelChico(meta) : "Elegí un número par desde 2."}
          </small>
        </div>
        <div className="j-acciones">
          <button className="button" disabled={ocupado || !metaValida} onClick={() => crear(false)}>
            Crear mesa
          </button>
          <button className="j-sec" disabled={ocupado || !metaValida} onClick={() => crear(true)}>
            Jugar con computadoras
          </button>
        </div>
        <p className="j-ayuda">
          Compartí la invitación con tus amigos o completá los lugares con computadoras.
        </p>
        <p role="status">{ocupado ? "Preparando la mesa…" : error}</p>
      </div>
      <div className="j-ilustracion" aria-hidden="true">
        {["espadas-01", "copas-12", "oros-07"].map((c) => (
          <img key={c} alt="" src={base + "img/cartas/tatu/" + c + ".webp"} />
        ))}
      </div>
    </div>
  );
}

function Invitacion({ enlace }: { enlace: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [mensaje, avisar] = useState("");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      avisar("Invitación copiada.");
    } catch {
      input.current?.focus();
      input.current?.select();
      let copiada = false;
      try {
        copiada = document.execCommand?.("copy") ?? false;
      } catch {
        /* El usuario puede copiar el texto seleccionado manualmente. */
      }
      avisar(copiada ? "Invitación copiada." : "Enlace seleccionado. Copialo para compartirlo.");
    }
  }
  return (
    <div className="j-invita">
      <label htmlFor="invitacion">Enlace de invitación</label>
      <div>
        <input id="invitacion" ref={input} value={enlace} readOnly onFocus={(e) => e.target.select()} />
        <button className="j-sec" onClick={copiar}>
          Copiar invitación
        </button>
      </div>
      <span role="status">{mensaje}</span>
    </div>
  );
}

function MesaAbierta({
  id,
  jugador,
  base,
  avisoInicial = "",
  recienCreada = false,
}: {
  id: string;
  jugador: Jugador;
  base: string;
  avisoInicial?: string;
  recienCreada?: boolean;
}) {
  const { ruta, mesa, partida: recibida, conectada, error, refrescar } = useMesa(id);
  const [presencioReparto, recordarEspera] = useState(recienCreada);
  if (!presencioReparto && mesa?.lista === false) recordarEspera(true);
  const esTerceto = recibida?.formato === "triples";
  const { tablero, partida: presentada, mostrandoCartas, voz } = usePresentacionVueltas(
    esTerceto ? undefined : recibida, presencioReparto,
  );
  const partida = esTerceto ? recibida : presentada;
  const [ocupado, ocupar] = useState(false);
  const [aviso, avisar] = useState(avisoInicial);
  useEffect(() => {
    const clave = "truco.ultima-mesa." + jugador.id;
    try {
      if (mesa) localStorage.setItem(clave, mesa.id);
      if (error && [403, 404].includes(error.status) && localStorage.getItem(clave) === id)
        localStorage.removeItem(clave);
    } catch {
      /* La mesa sigue disponible en su enlace si el navegador no guarda datos. */
    }
  }, [mesa?.id, error, id, jugador.id]);
  async function enviar(path: string, datos: object) {
    ocupar(true);
    avisar("");
    try {
      // Ante una confirmación perdida, el segundo envío usa la misma clave de comando.
      try {
        await pedir(ruta + path, datos);
      } catch (e) {
        if (e instanceof ErrorMesa || !("id" in datos)) throw e;
        await pedir(ruta + path, datos);
      }
    } catch (e) {
      avisar(mensajeDe(e));
    } finally {
      await refrescar.current();
      ocupar(false);
    }
  }
  function jugada(accion?: Eleccion & { sena?: string }) {
    if (ocupado || !conectada || !partida || mostrandoCartas) return;
    void enviar(accion ? "/acciones" : "/siguiente", {
      id: idComando(),
      version: partida.version,
      ...(accion && { accion }),
    });
  }

  if (error?.status === 401) return <Ingreso volver={"/jugar/?mesa=" + encodeURIComponent(id)} />;
  if (error)
    return (
      <div className="j-panel">
        <p role="alert">{error.message}</p>
        <a className="j-link" href={base + "jugar/"}>
          Volver al salón
        </a>
      </div>
    );
  if (!mesa) return <p role="status">Conectando con tu mesa…</p>;
  const faltan = mesa.asientos.filter((a) => a.tipo === "vacio").length;
  const versionSenas = mesa.formato && mesa.formato !== "triples" ? signalVersionFor(mesa.formato) : null;
  const versionDesconocida = versionSenas && partida?.vista && partida.formato !== "triples" && partida.versionSenas !== versionSenas;
  const bloqueada = ocupado || !conectada || Boolean(versionDesconocida) || mostrandoCartas;
  return (
    <div ref={tablero}>
      <PieMesa mesa={mesa} />
      <div className="j-barra">
        <span>
          {versionSenas ? "Parejas con señas" : modalidades[mesa.modo][1]} · {jugador.nombre}
        </span>
        <a className="j-link" href={base + "jugar/"}>
          Volver al salón
        </a>
      </div>
      {mesa.vozDisponible && <VozDiscord key={mesa.id} ruta={ruta} />}
      {!conectada && (
        <p role="status" className="j-aviso">
          Reconectando con tu mesa…
        </p>
      )}
      {versionDesconocida && <p role="alert">Actualizá la aplicación para jugar con esta versión de señas.</p>}
      {aviso && (
        <p role="alert" className="j-aviso">
          {aviso}
        </p>
      )}
      {mesa.lista && partida?.vista ? (
        partida.formato === "triples" ? (
          <MesaDeTercetos base={base} mesa={mesa} partida={partida} bloqueada={bloqueada}
            jugar={jugada} presencioReparto={presencioReparto} />
        ) : versionSenas && !versionDesconocida ? (
          <MesaConSenas base={base} mesa={mesa} partida={partida} bloqueada={bloqueada} mostrandoCartas={mostrandoCartas} voz={voz} jugar={jugada} />
        ) : <EnJuego base={base} mesa={mesa} partida={partida} bloqueada={bloqueada} mostrandoCartas={mostrandoCartas} voz={voz} jugar={jugada} />
      ) : (
        <div className="j-espera">
          <div className="j-panel">
            <h2>{faltan ? "Esperando jugadores" : "Repartiendo las cartas…"}</h2>
            <Visibilidad publica={mesa.publica} />
            <p>Chico a {mesa.meta} tantos.</p>
            <p>
              {faltan === 1
                ? "Falta un jugador para repartir."
                : faltan
                  ? "Faltan " + faltan + " jugadores para repartir."
                  : "La mesa está completa."}
            </p>
            {faltan > 0 && <Invitacion enlace={mesa.invitacion} />}
          </div>
          <section className="j-asientos">
            <h2>Asientos</h2>
            {mesa.asientos.map((a) => (
              <div className="j-lugar" key={a.asiento}>
                <span className="j-numero" aria-label={"Asiento " + (a.asiento + 1)}>
                  {a.asiento + 1}
                </span>
                <div>
                  <strong>
                    {a.nombre ?? "Lugar libre"}
                    {a.asiento === mesa.miAsiento && " · Vos"}
                  </strong>
                  <small>
                    {mesa.modo !== "1v1"
                      ? "Equipo " + (a.equipo + 1)
                      : a.asiento === mesa.miAsiento
                        ? "Tu asiento"
                        : "Rival"}
                  </small>
                </div>
                {a.tipo === "vacio" && jugador.id === mesa.creadorId && (
                  <button
                    className="j-sec"
                    disabled={bloqueada}
                    aria-label={"Agregar computadora al asiento " + (a.asiento + 1)}
                    onClick={() => enviar("/computadoras", { asiento: a.asiento })}
                  >
                    Agregar computadora
                  </button>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

export default function Sala({ base }: { base: string }) {
  const [jugador, identificar] = useState<Jugador | null>();
  const [mesa, abrir] = useState<{ id: string; avisoInicial?: string; recienCreada?: boolean }>();
  const [invitacion, invitar] = useState("");
  const [vista, elegirVista] = useState<"salon" | "crear" | "mirar">("salon");
  const [observada, mirar] = useState("");
  const [previa, verPrevia] = useState<{ publica: boolean }>();
  const [aceptando, aceptar] = useState(false);
  const [volver, regresar] = useState("/jugar/");
  const [error, avisar] = useState<Error | null>(null);
  const [anterior, recordar] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    const params = new URLSearchParams(location.search);
    // Un enlace de espectador jamás se interpreta como una invitación a jugar.
    const espectador = params.has("mirar");
    const observada = params.get("mirar") ?? "";
    const crear = params.get("crear") === "1";
    const token = espectador ? null : params.get("invitacion");
    const id = espectador ? null : params.get("mesa");
    const ruta =
      "/jugar/" +
      (espectador ? "?mirar=" + encodeURIComponent(observada) : token ? "?invitacion=" + encodeURIComponent(token) : id ? "?mesa=" + encodeURIComponent(id) : crear ? "?crear=1" : "");
    mirar(observada);
    elegirVista(espectador ? "mirar" : crear ? "crear" : "salon");
    regresar(ruta);
    invitar(token ?? "");
    async function entrar() {
      try {
        const yo = await pedir<Jugador>("/api/jugador");
        if (!vigente) return;
        try {
          recordar(localStorage.getItem("truco.ultima-mesa." + yo.id));
        } catch {
          /* El enlace de invitación también permite volver a la mesa. */
        }
        if (token) {
          const previa = await pedir<{ publica: boolean; sentada: boolean; id?: string }>(
            "/api/invitaciones/" + encodeURIComponent(token));
          if (!vigente) return;
          if (previa.sentada && previa.id) {
            history.replaceState(null, "", base + "jugar/?mesa=" + encodeURIComponent(previa.id));
            abrir({ id: previa.id });
          } else verPrevia(previa);
        } else if (id) abrir({ id });
        identificar(yo);
      } catch (e) {
        if (!vigente) return;
        if (e instanceof ErrorMesa && e.status === 401) identificar(null);
        else avisar(e instanceof Error ? e : new Error(mensajeDe(e)));
      }
    }
    void entrar();
    return () => {
      vigente = false;
    };
  }, [base]);

  async function ocuparAsiento() {
    if (aceptando) return;
    aceptar(true);
    try {
      const mesa = await pedir<Mesa>("/api/invitaciones/" + encodeURIComponent(invitacion) + "/unirse", {});
      history.replaceState(null, "", base + "jugar/?mesa=" + encodeURIComponent(mesa.id));
      abrir({ id: mesa.id });
    } catch (e) {
      if (e instanceof ErrorMesa && e.status === 401) identificar(null);
      else avisar(e instanceof Error ? e : new Error(mensajeDe(e)));
    } finally {
      aceptar(false);
    }
  }

  const juego = base + "jugar/";
  const navegacion = {
    crear: () => location.assign(juego + "?crear=1"),
    volverAMiMesa: anterior ? () => location.assign(juego + "?mesa=" + encodeURIComponent(anterior)) : undefined,
    alPerderSesion: () => identificar(null),
  };
  return (
    <>
      <header className="j-titulo">
        <a className="j-link" href={base}>
          ← Volver al inicio
        </a>
        {jugador && <a className="j-link" href={base + "perfil/"}>Mi perfil</a>}
        <h1>
          {mesa ? "Mesa de " : "Jugar al "}
          <em>truco</em>
        </h1>
      </header>
      {error ? (
        <div className="j-panel">
          <p role="alert">{mensajeDe(error)}</p>
          <div className="j-acciones j-recuperar">
            {(!(error instanceof ErrorMesa) || error.status >= 500 || [408, 429].includes(error.status)) && (
              <button className="button" onClick={() => location.reload()}>
                Reintentar
              </button>
            )}
            <a className="j-link" href={base + "jugar/"}>
              Volver al salón
            </a>
            <a className="j-link" href={base + "aprender/mano/"}>
              Jugar una mano guiada
            </a>
          </div>
        </div>
      ) : jugador === undefined ? (
        <p role="status">{invitacion ? "Abriendo la invitación…" : "Consultando tu sesión…"}</p>
      ) : jugador === null ? (
        <Ingreso volver={volver} invitada={Boolean(invitacion)} />
      ) : mesa ? (
        <MesaAbierta key={mesa.id} {...mesa} jugador={jugador} base={base} />
      ) : previa ? (
        <section className="j-panel">
          <h2>Te invitaron a una mesa</h2>
          <Visibilidad publica={previa.publica} />
          <div className="j-acciones">
            <button className="button" disabled={aceptando} onClick={ocuparAsiento}>Ocupar mi asiento</button>
            <a className="j-link" href={juego}>Volver al salón</a>
          </div>
        </section>
      ) : vista === "mirar" ? (
        jugador.salonHabilitado && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(observada)
          ? <VisorEspectador id={observada} volver={() => location.assign(juego)} {...navegacion} />
          : <div className="j-panel"><p role="status">Esta mesa no está disponible para mirar.</p>
              <a className="j-link" href={juego}>Volver al salón</a></div>
      ) : vista === "crear" || !jugador.salonHabilitado ? (
        <AbrirMesa
          salonHabilitado={Boolean(jugador.salonHabilitado)}
          base={base}
          anterior={anterior}
          abrir={(id, avisoInicial) => abrir({ id, avisoInicial, recienCreada: true })}
        />
      ) : <SalonEnVivo mirar={id => location.assign(juego + "?mirar=" + encodeURIComponent(id))} {...navegacion} />}
    </>
  );
}
