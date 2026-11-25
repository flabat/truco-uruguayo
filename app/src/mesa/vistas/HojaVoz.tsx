import { mensajeDe } from "@eltruco/cliente/cliente.ts";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colores, fuentes } from "../../tema.ts";
import { cliente } from "../../ingreso/plataforma.ts";
import { abrirAparte } from "../web.ts";
import { BotonDeHoja, estilosDeHoja } from "./PartesDeHoja.tsx";

/** La voz de la mesa por Discord, con el mismo alcance que `VozDiscord` de la mesa web. */
export function HojaVoz({ ruta, disponible, espectador, exhibicion }: {
  ruta: string;
  disponible: boolean;
  espectador?: boolean;
  exhibicion?: boolean;
}) {
  const [pendiente, ocupar] = useState(false);
  const [destino, guardar] = useState<{ enlace: string; vence: string }>();
  const [aviso, avisar] = useState("");
  const solicitud = useRef<AbortController | null>(null);
  useEffect(() => () => solicitud.current?.abort(), []);
  useEffect(() => {
    if (!destino) return;
    const timer = setTimeout(() => {
      guardar(undefined);
      avisar("El enlace venció. Podés pedir otro para esta mesa.");
    }, Math.max(0, Date.parse(destino.vence) - Date.now()));
    return () => clearTimeout(timer);
  }, [destino]);

  async function preparar() {
    if (solicitud.current) return;
    const controller = new AbortController();
    solicitud.current = controller;
    ocupar(true);
    avisar("Preparando el enlace…");
    try {
      guardar(await cliente.pedir<{ enlace: string; vence: string }>(ruta + "/voz", {}, controller.signal));
      avisar("Enlace listo.");
    } catch (e) {
      if (!controller.signal.aborted) avisar(mensajeDe(e));
    } finally {
      solicitud.current = null;
      if (!controller.signal.aborted) ocupar(false);
    }
  }

  return (
    <View testID="hoja-voz">
      {/* Acá va la voz propia de la etapa 6. */}
      <View testID="lugar-voz-propia" />
      {disponible ? (
        <>
          <Text style={estilos.titulo}>{espectador ? "Voz de esta mesa en Discord" : "Voz en Discord"}</Text>
          <Text style={estilosDeHoja.nota}>
            Sala abierta. Cualquier persona con acceso a la categoría Mesas puede entrar y escuchar.
            {espectador ? " Jugadores y espectadores pueden conversar." : ""}
            {exhibicion ? " Las computadoras juegan sin audio." : ""}
          </Text>
          <View style={estilosDeHoja.botones}>
            <BotonDeHoja alPresionar={() => void preparar()} deshabilitado={pendiente}>
              {destino ? "Renovar enlace" : "Abrir voz de la mesa"}
            </BotonDeHoja>
            {destino?.enlace.startsWith("https://") ? (
              <BotonDeHoja principal alPresionar={() => abrirAparte(destino.enlace)}>Entrar a Discord ↗</BotonDeHoja>
            ) : null}
          </View>
          {aviso ? <Text role="status" style={[estilosDeHoja.nota, estilos.aviso]}>{aviso}</Text> : null}
        </>
      ) : (
        <Text style={estilosDeHoja.nota}>Esta mesa no tiene voz por Discord.</Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  titulo: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 15, marginBottom: 4, marginTop: 4 },
  aviso: { marginTop: 6 },
});
