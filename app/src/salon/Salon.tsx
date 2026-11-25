import { participantesMesa, type ResumenMesa } from "@eltruco/cliente/salon.ts";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { Jugador } from "../api/cliente.ts";
import { EnlaceTexto, Hoja, Pano } from "../componentes/salon.tsx";
import { Aviso, Boton, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { mirarMesa } from "../mesa/entrada.tsx";
import { usePrecargaDeMesa } from "../precarga/usePrecargaDeMesa.ts";
import { colores, fuentes } from "../tema.ts";
import { crearAvisoDeComunidad, discordComunidad } from "./comunidad.ts";
import { rutaDe } from "./enlaces.ts";
import { contar, guardadoDelDispositivo, memoriaDeMesa } from "./plataforma.ts";
import { useConsulta } from "./useConsulta.ts";

const avisoDeComunidad = crearAvisoDeComunidad(guardadoDelDispositivo);

/** «¿Buscás con quién jugar?», como en el salón de /jugar/. «Ahora no» lo oculta para este jugador. */
function Comunidad({ jugador }: { jugador: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let vigente = true;
    void avisoDeComunidad.visible(jugador).then(v => { if (vigente) setVisible(v); });
    return () => { vigente = false; };
  }, [jugador]);
  if (!visible) return null;
  return (
    <View aria-label="Comunidad de Discord" role="region">
      <Hoja titulo="¿Buscás con quién jugar?">
        <Parrafo suave>Sumate a la comunidad de Discord para encontrar jugadores y conversar sobre el truco.</Parrafo>
        <Boton variante="secundario" onPress={() => {
          contar("discord");
          void Linking.openURL(discordComunidad);
        }}>
          Unirme al Discord ↗
        </Boton>
        <EnlaceTexto alTocar={() => {
          setVisible(false);
          void avisoDeComunidad.ocultar(jugador);
        }}>
          Ahora no
        </EnlaceTexto>
      </Hoja>
    </View>
  );
}

export function Salon({ jugador }: { jugador: Jugador }) {
  usePrecargaDeMesa();
  const { reintentar: recargarSesion } = useSesion();
  const [anterior, setAnterior] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    void memoriaDeMesa.leer(jugador.id).then(id => { if (vigente) setAnterior(id); });
    return () => { vigente = false; };
  }, [jugador.id]);
  const habilitado = jugador.salonHabilitado === true;
  const { datos, estado, reintentar } = useConsulta<{ mesas: ResumenMesa[] }>(habilitado ? "/api/salon/mesas" : null, 15_000);
  useEffect(() => {
    if (estado === "sin-sesion") recargarSesion();
  }, [estado, recargarSesion]);
  const mesas = datos?.mesas;
  const error = estado === "error" || estado === "no-disponible";

  return (
    <Pantalla titulo="Mesas en juego">
      <View style={estilos.fila}>
        <Text style={estilos.saludo}>Hola, {jugador.nombre}</Text>
        <EnlaceTexto alTocar={() => router.push("/perfil" as Href)}>Tu perfil</EnlaceTexto>
      </View>
      {anterior ? (
        <Boton variante="secundario" onPress={() => router.push(rutaDe({ tipo: "mesa", id: anterior }) as Href)}>
          Volver a mi mesa
        </Boton>
      ) : null}
      <Boton onPress={() => router.push("/crear" as Href)}>Crear mesa</Boton>
      <Comunidad jugador={jugador.id} />
      {!habilitado ? <Parrafo suave>El salón está cerrado. Podés crear una mesa privada e invitar a quien quieras.</Parrafo> : null}
      {habilitado && estado === "cargando" && !datos ? <Aviso>Buscando mesas…</Aviso> : null}
      {habilitado && error ? (
        <>
          <Aviso>{datos ? "Reconectando con el salón…" : "No se pudo cargar la lista de mesas."}</Aviso>
          <Boton variante="secundario" onPress={reintentar}>Reintentar</Boton>
        </>
      ) : null}
      {habilitado && estado === "listo" && mesas?.length === 0 ? <Parrafo suave>Todavía no hay mesas en juego.</Parrafo> : null}
      {mesas && mesas.length > 0 && estado !== "no-disponible" ? (
        <View role="list" aria-label="Mesas públicas" style={estilos.lista}>
          {mesas.map(mesa => (
            <View role="listitem" key={mesa.id} testID={"mesa-" + mesa.id}>
              <Pano>
                <Text role="heading" aria-level={2} style={estilos.modo}>{mesa.modo === "1v1" ? "Duelo" : "Parejas"}</Text>
                <Text style={estilos.detalle}>{participantesMesa(mesa)}</Text>
                <Text style={estilos.detalle}>Mano {mesa.manoNumero} · {mesa.puntos[0]} a {mesa.puntos[1]} de {mesa.meta}</Text>
                <View style={estilos.accion}>
                  <Boton variante="claro" onPress={() => mirarMesa(mesa.id)}>Mirar</Boton>
                </View>
              </Pano>
            </View>
          ))}
        </View>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  fila: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  saludo: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 16, flexShrink: 1 },
  lista: { gap: 12 },
  modo: { color: colores.papel, fontFamily: fuentes.titulo, fontSize: 22 },
  detalle: { color: "#d8e3dc", fontFamily: fuentes.texto, fontSize: 15 },
  accion: { alignItems: "flex-start", marginTop: 4 },
});
