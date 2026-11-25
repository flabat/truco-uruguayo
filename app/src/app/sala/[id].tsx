import { mensajeDe } from "@eltruco/cliente/cliente.ts";
import { useMesa } from "@eltruco/cliente/use-mesa.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { Jugador } from "../../api/cliente.ts";
import { EnlaceTexto, Hoja, Pano, Pildora } from "../../componentes/salon.tsx";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../../componentes/ui.tsx";
import { useSesion } from "../../ingreso/contexto.tsx";
import { cliente } from "../../ingreso/plataforma.ts";
import { entrarALaMesa, volverAlSalon } from "../../mesa/entrada.tsx";
import { usePrecargaDeMesa } from "../../precarga/usePrecargaDeMesa.ts";
import { faltanParaRepartir, papelDelAsiento } from "../../salon/asientos.ts";
import { compartirInvitacion } from "../../salon/compartir.ts";
import { destinoDeEnlace, enlaceParaCompartir } from "../../salon/enlaces.ts";
import { textoVisibilidad } from "../../salon/mesa-nueva.ts";
import { avisosDeApp, compartirConElSistema, contar, copiarEnlace, memoriaDeMesa, origenWeb } from "../../salon/plataforma.ts";
import { RequiereJugador } from "../../salon/RequiereJugador.tsx";
import { colores, fuentes } from "../../tema.ts";

export default function PantallaSala() {
  const { id, nueva, aviso } = useLocalSearchParams<{ id: string; nueva?: string; aviso?: string }>();
  const destino = destinoDeEnlace({ mesa: id });
  if (!destino || destino.tipo !== "mesa") {
    return (
      <Pantalla titulo="Mesa no encontrada">
        <Parrafo>El enlace de la mesa no es válido.</Parrafo>
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  return (
    <RequiereJugador destino={destino}>
      {jugador => <SalaDeEspera key={destino.id} id={destino.id} jugador={jugador} recienCreada={nueva === "1"} avisoInicial={aviso ?? ""} />}
    </RequiereJugador>
  );
}

function SalaDeEspera({ id, jugador, recienCreada, avisoInicial }: {
  id: string; jugador: Jugador; recienCreada: boolean; avisoInicial: string;
}) {
  usePrecargaDeMesa();
  const { reintentar: recargarSesion } = useSesion();
  const { ruta, mesa, conectada, error, refrescar } = useMesa(cliente, id, recienCreada, avisosDeApp);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(avisoInicial);

  useEffect(() => {
    if (mesa) void memoriaDeMesa.recordar(jugador.id, mesa.id);
  }, [mesa?.id, jugador.id]);
  useEffect(() => {
    if (error && [403, 404].includes(error.status)) void memoriaDeMesa.olvidar(jugador.id, id);
    if (error?.status === 401) recargarSesion();
  }, [error, id, jugador.id, recargarSesion]);
  const lista = mesa?.lista === true;
  useEffect(() => {
    if (lista) entrarALaMesa(id);
  }, [lista, id]);

  // Sin asiento en la mesa, el enlace `?mesa=` (y el viejo /volver/?mesa=, que llega acá) la abre para mirar.
  if (error?.status === 404) return <Redirect href={("/mirar/" + id) as Href} />;
  if (error) {
    return (
      <Pantalla titulo="Mesa no disponible">
        <Aviso>{error.message}</Aviso>
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  if (!mesa || lista) return <Cargando />;

  async function agregarComputadora(asiento: number) {
    setOcupado(true);
    setAviso("");
    try {
      await cliente.pedir(ruta + "/computadoras", { asiento });
    } catch (e) {
      setAviso(mensajeDe(e));
    } finally {
      await refrescar.current();
      setOcupado(false);
    }
  }

  const faltan = mesa.asientos.filter(a => a.tipo === "vacio").length;
  const creador = jugador.id === mesa.creadorId;
  return (
    <Pantalla titulo={mesa.cancelada ? "Mesa cancelada" : "Esperando jugadores"}>
      <EnlaceTexto alTocar={volverAlSalon}>Volver al salón</EnlaceTexto>
      {!conectada ? <Aviso>Reconectando con tu mesa…</Aviso> : null}
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {mesa.cancelada ? (
        <Parrafo>Se canceló la mesa: quien la creó dejó el juego.</Parrafo>
      ) : (
        <>
          <Pano etiqueta="Mesa">
            <Pildora>{`Chico a ${mesa.meta} tantos`}</Pildora>
            <Text style={estilos.titulo}>{faltanParaRepartir(faltan)}</Text>
            <Text style={estilos.detalle}>{textoVisibilidad(mesa.publica)}</Text>
            {mesa.versionSenas === versionSenasPie ? (
              <Text style={estilos.detalle}>
                Señas automáticas al pie. Toda la mesa oye sus indicaciones.{mesa.modo === "3v3" ? " Solo en redondilla." : ""}
              </Text>
            ) : null}
          </Pano>
          {faltan > 0 ? <Invitacion enlace={enlaceParaCompartir(mesa.invitacion, origenWeb)} /> : null}
          <Hoja titulo="Asientos">
            <View role="list" aria-label="Asientos" style={estilos.asientos}>
              {mesa.asientos.map(a => (
                <View role="listitem" key={a.asiento} style={estilos.asiento}>
                  <Text aria-label={`Asiento ${a.asiento + 1}`} style={[estilos.numero, a.equipo === 1 && estilos.numeroRival]}>
                    {a.asiento + 1}
                  </Text>
                  <View style={estilos.quien}>
                    <Text style={estilos.nombre}>{(a.nombre ?? "Lugar libre") + (a.asiento === mesa.miAsiento ? " · Vos" : "")}</Text>
                    <Text style={estilos.papel}>{papelDelAsiento(mesa, a)}</Text>
                  </View>
                  {a.tipo === "vacio" && creador ? (
                    <Boton
                      variante="secundario"
                      ocupado={ocupado || !conectada}
                      etiqueta={`Agregar computadora al asiento ${a.asiento + 1}`}
                      onPress={() => void agregarComputadora(a.asiento)}
                    >
                      Computadora
                    </Boton>
                  ) : null}
                </View>
              ))}
            </View>
          </Hoja>
        </>
      )}
    </Pantalla>
  );
}

function Invitacion({ enlace }: { enlace: string }) {
  const [mensaje, setMensaje] = useState("");
  return (
    <Hoja titulo="Invitación">
      <Parrafo suave>Compartí el enlace con quienes quieras sumar a la mesa.</Parrafo>
      <TextInput
        aria-label="Enlace de invitación"
        editable={false}
        selectTextOnFocus
        value={enlace}
        style={estilos.enlace}
      />
      <Boton onPress={() => {
        contar("compartir-mesa");
        void compartirInvitacion({ enlace, compartir: compartirConElSistema, copiar: copiarEnlace }).then(setMensaje);
      }}>
        Compartir invitación
      </Boton>
      {mensaje ? <Text role="status" style={estilos.mensaje}>{mensaje}</Text> : null}
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  titulo: { color: colores.papel, fontFamily: fuentes.titulo, fontSize: 22 },
  detalle: { color: "#d8e3dc", fontFamily: fuentes.texto, fontSize: 15, lineHeight: 22 },
  asientos: { gap: 10 },
  asiento: { alignItems: "center", flexDirection: "row", gap: 12 },
  numero: {
    backgroundColor: colores.panoClaro,
    borderRadius: 18,
    color: colores.papel,
    fontFamily: fuentes.textoFuerte,
    fontSize: 16,
    height: 36,
    lineHeight: 36,
    overflow: "hidden",
    textAlign: "center",
    width: 36,
  },
  numeroRival: { backgroundColor: colores.acento },
  quien: { flex: 1 },
  nombre: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 16 },
  papel: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 14 },
  enlace: {
    backgroundColor: colores.papel,
    borderColor: colores.borde,
    borderRadius: 12,
    borderWidth: 1,
    color: colores.tinta,
    fontFamily: fuentes.texto,
    fontSize: 14,
    padding: 12,
  },
  mensaje: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 15 },
});
