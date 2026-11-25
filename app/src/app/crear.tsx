import { mensajeDe, type Mesa, type Modo } from "@eltruco/cliente/cliente.ts";
import { metaPorModalidad } from "@eltruco/motor/chico.ts";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { Jugador } from "../api/cliente.ts";
import { EnlaceTexto, Hoja, Opcion } from "../componentes/salon.tsx";
import { Aviso, Boton, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { cliente } from "../ingreso/plataforma.ts";
import { usePrecargaDeMesa } from "../precarga/usePrecargaDeMesa.ts";
import { cuerpoDeMesaNueva, modalidadesOfrecidas, textoDeMeta, textoVisibilidad } from "../salon/mesa-nueva.ts";
import { RequiereJugador } from "../salon/RequiereJugador.tsx";
import { colores, fuentes } from "../tema.ts";

const modalidades: Record<Modo, [string, string]> = {
  "1v1": ["1 contra 1", "Mano a mano"],
  "2v2": ["2 contra 2", "En parejas, con señas automáticas al pie"],
  "3v3": ["3 contra 3", "En tercetos"],
};

export default function PantallaCrear() {
  return <RequiereJugador destino={{ tipo: "crear" }}>{jugador => <CrearMesa jugador={jugador} />}</RequiereJugador>;
}

function CrearMesa({ jugador }: { jugador: Jugador }) {
  usePrecargaDeMesa();
  const salonHabilitado = jugador.salonHabilitado === true;
  const [ofrecidas, setOfrecidas] = useState<{ modos: Modo[]; senasPie: Modo[] }>({ modos: ["1v1", "2v2"], senasPie: [] });
  const [modo, setModo] = useState<Modo>("2v2");
  const [puntaje, setPuntaje] = useState(String(metaPorModalidad["2v2"]));
  const [publica, setPublica] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const cancel = new AbortController();
    cliente.pedir<{ modos: Modo[]; senasPie?: Modo[] }>("/api/modalidades", undefined, cancel.signal)
      .then(({ modos, senasPie }) => setOfrecidas({ modos: Array.isArray(modos) ? modos : [], senasPie: senasPie ?? [] }))
      .catch(() => { /* Sin respuesta se ofrecen duelo y parejas. */ });
    return () => cancel.abort();
  }, []);
  const meta = textoDeMeta(puntaje);
  const puedePublicar = salonHabilitado && modo !== "3v3";

  async function crear(conComputadoras: boolean) {
    if (ocupado || !meta.valida) return;
    setOcupado(true);
    setError("");
    try {
      const mesa = await cliente.pedir<Mesa>("/api/mesas", cuerpoDeMesaNueva({
        modo, meta: meta.meta, publica, salonHabilitado, senasPie: ofrecidas.senasPie,
      }));
      let aviso = "";
      if (conComputadoras) {
        try {
          for (const lugar of mesa.asientos.filter(a => a.tipo === "vacio")) {
            await cliente.pedir(`/api/mesas/${mesa.id}/computadoras`, { asiento: lugar.asiento });
          }
        } catch (e) {
          aviso = "La mesa está creada. " + mensajeDe(e);
        }
      }
      router.replace(`/sala/${mesa.id}?nueva=1${aviso ? "&aviso=" + encodeURIComponent(aviso) : ""}` as Href);
    } catch (e) {
      setError(mensajeDe(e));
      setOcupado(false);
    }
  }

  return (
    <Pantalla titulo="Crear una mesa">
      <EnlaceTexto alTocar={() => (router.canGoBack() ? router.back() : router.replace("/"))}>Volver al salón</EnlaceTexto>
      <Hoja titulo="Modalidad">
        <View role="radiogroup" aria-label="Modalidad" style={estilos.grupo}>
          {modalidadesOfrecidas(ofrecidas.modos).map(m => (
            <Opcion
              key={m}
              titulo={modalidades[m][0]}
              detalle={modalidades[m][1]}
              elegida={m === modo}
              deshabilitada={ocupado}
              alElegir={() => { setModo(m); setPuntaje(String(metaPorModalidad[m])); }}
            />
          ))}
        </View>
        {modo === "2v2" ? (
          <Parrafo suave>El pie ve en privado los gestos de su compañero. Toda la mesa oye sus indicaciones.</Parrafo>
        ) : null}
      </Hoja>
      <Hoja titulo="Chico">
        <Text nativeID="etiqueta-meta" style={estilos.etiqueta}>Tantos para ganar el chico</Text>
        <TextInput
          aria-label="Tantos para ganar el chico"
          aria-labelledby="etiqueta-meta"
          inputMode="numeric"
          editable={!ocupado}
          value={puntaje}
          onChangeText={setPuntaje}
          style={[estilos.campo, !meta.valida && estilos.campoInvalido]}
        />
        <Text aria-live="polite" style={[estilos.ayuda, !meta.valida && { color: colores.acento }]}>{meta.ayuda}</Text>
      </Hoja>
      <Hoja titulo="Visibilidad">
        {puedePublicar ? (
          <Opcion tipo="checkbox" titulo="Mostrar en el salón" elegida={publica} deshabilitada={ocupado} alElegir={() => setPublica(p => !p)} />
        ) : null}
        <Parrafo suave>{textoVisibilidad(puedePublicar && publica)}</Parrafo>
      </Hoja>
      {error ? <Aviso>{error}</Aviso> : null}
      {ocupado ? <Aviso>Preparando la mesa…</Aviso> : null}
      <Boton ocupado={ocupado || !meta.valida} onPress={() => void crear(false)}>Crear mesa</Boton>
      <Boton variante="secundario" ocupado={ocupado || !meta.valida} onPress={() => void crear(true)}>Jugar con computadoras</Boton>
      <Parrafo suave>Compartí la invitación con tus amigos o completá los lugares con computadoras.</Parrafo>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 10 },
  etiqueta: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 16 },
  campo: {
    borderColor: colores.borde,
    borderRadius: 999,
    borderWidth: 2,
    color: colores.tinta,
    fontFamily: fuentes.texto,
    fontSize: 18,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  campoInvalido: { borderColor: colores.acento },
  ayuda: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 14 },
});
