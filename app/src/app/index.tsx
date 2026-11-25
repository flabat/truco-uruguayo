import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { destinoDeEnlace, destinoPendiente, rutaDe, type Destino } from "../salon/enlaces.ts";
import { guardadoDeDestino } from "../salon/plataforma.ts";
import { Salon } from "../salon/Salon.tsx";

const titulos: Record<Destino["tipo"] | "ninguno", [string, string]> = {
  invitacion: ["Te invitaron a una mesa", "Ingresá para ocupar tu asiento con los demás jugadores."],
  mirar: ["Ingresá para mirar la mesa", "Al volver del ingreso vas a ver las jugadas públicas."],
  mesa: ["Volvé a tu mesa", "Ingresá para seguir jugando en tu mesa."],
  ninguno: ["Entrá a jugar", "Ingresá con tu cuenta de El Truco para jugar en línea con personas y computadoras."],
};

/** Inicio: ingreso o salón. También recibe los enlaces `?invitacion=`, `?mesa=` y `?mirar=`. */
export default function Inicio() {
  const { estado, ingresar, reintentar } = useSesion();
  const parametros = useLocalSearchParams();
  const destino = destinoDeEnlace(parametros);
  const [ingresando, setIngresando] = useState(false);
  const retomado = useRef<Destino | null | undefined>(undefined);

  // Sin sesión, el destino se guarda: en la web el ingreso sale de la app y vuelve a /jugar/.
  const fuera = estado.tipo === "fuera";
  useEffect(() => {
    if (fuera && destino) destinoPendiente(guardadoDeDestino, destino);
  }, [fuera, destino?.tipo, destino && (destino.tipo === "invitacion" ? destino.token : destino.id)]);

  if (estado.tipo === "cargando") return <Cargando />;
  if (estado.tipo === "sinConexion") {
    return (
      <Pantalla titulo="Sin conexión">
        <Parrafo>No pudimos conectar con El Truco. Revisá tu conexión y probá de nuevo.</Parrafo>
        <Boton onPress={reintentar}>Reintentar</Boton>
      </Pantalla>
    );
  }
  if (estado.tipo === "dentro") {
    if (retomado.current === undefined) {
      const guardado = destinoPendiente(guardadoDeDestino, null);
      retomado.current = destino ?? guardado;
    }
    const ir = retomado.current;
    if (ir) {
      retomado.current = null;
      return <Redirect href={rutaDe(ir) as Href} />;
    }
    return <Salon jugador={estado.jugador} />;
  }
  const [titulo, texto] = titulos[destino?.tipo ?? "ninguno"];
  return (
    <Pantalla titulo={titulo}>
      {estado.aviso ? <Aviso>{estado.aviso}</Aviso> : null}
      <Parrafo>{texto}</Parrafo>
      <Boton
        ocupado={ingresando}
        onPress={() => { setIngresando(true); ingresar().finally(() => setIngresando(false)); }}
      >
        Ingresar
      </Boton>
    </Pantalla>
  );
}
