import type { MesaRetomable } from "@eltruco/cliente/salon.ts";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Hoja, Pildora } from "../componentes/salon.tsx";
import { Aviso, Boton } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { colores, fuentes } from "../tema.ts";
import { rutaDe } from "./enlaces.ts";
import { agruparMisMesas, estadoDeMiMesa } from "./mis-mesas.ts";
import { useConsulta } from "./useConsulta.ts";

const modalidades = { "1v1": "Duelo", "2v2": "Parejas", "3v3": "Tercetos" };
const fechaLocal = new Intl.DateTimeFormat("es-UY", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function FilaMesa({ mesa, unica, numero }: { mesa: MesaRetomable; unica: boolean; numero: number }) {
  const { id, modo, participantes, puntos, meta, teToca, ultimaActividad } = mesa;
  const compania = participantes.length ? "con " + participantes.join(", ") : "solo vos";
  const estado = estadoDeMiMesa(mesa);
  const fecha = ultimaActividad ? fechaLocal.format(new Date(ultimaActividad)) : null;
  const etiqueta = `Continuar mesa ${numero}, ${modalidades[modo]} a ${meta} tantos, ${compania}, ${estado}`
    + (fecha ? ", última actividad " + fecha : "");
  return (
    <View role="listitem" testID={"mi-mesa-" + id} style={estilos.fila}>
      <Text role="heading" aria-level={unica ? 2 : 3} style={estilos.titulo}>{modalidades[modo]} · A {meta} tantos</Text>
      <Text style={estilos.texto}>{participantes.length ? participantes.join(" · ") : "Solo vos"}</Text>
      <Text style={estilos.texto}>
        {estado}
        {puntos ? ` · Tu equipo ${puntos[0]} · Rivales ${puntos[1]}` : ""}
      </Text>
      {teToca ? <Pildora clara>Te toca</Pildora> : null}
      {fecha ? <Text style={estilos.fecha}>Última actividad · {fecha}</Text> : null}
      <Boton etiqueta={unica ? undefined : etiqueta} onPress={() => router.push(rutaDe({ tipo: "mesa", id }) as Href)}>
        {unica ? "Volver a mi mesa" : "Continuar"}
      </Boton>
    </View>
  );
}

export function MisMesas({ jugadorId }: { jugadorId: string }) {
  const { reintentar: recargarSesion } = useSesion();
  const { datos, estado, reintentar } = useConsulta<{ jugadorId: string; mesas: MesaRetomable[] }>("/api/mis-mesas", 15_000);
  const [expandidas, setExpandidas] = useState(false);
  const cambioDeSesion = estado === "sin-sesion" || (datos !== null && datos.jugadorId !== jugadorId);
  useEffect(() => {
    if (cambioDeSesion) recargarSesion();
  }, [cambioDeSesion, recargarSesion]);

  if (cambioDeSesion) return null;
  const mesas = datos?.mesas ?? [];
  const error = estado === "error" || estado === "no-disponible";
  if (!mesas.length && !error) return estado === "cargando" ? <Aviso>Buscando tus mesas…</Aviso> : null;
  const { visibles, anteriores } = agruparMisMesas(mesas, Date.now());
  const unica = mesas.length === 1;
  return (
    <View role="region" aria-label="Mis mesas">
      <Hoja titulo={unica ? undefined : "Mis mesas"}>
        {error ? (
          <>
            <Aviso>{datos ? "No se pudieron actualizar tus mesas." : "No se pudieron cargar tus mesas."}</Aviso>
            <Boton variante="secundario" onPress={reintentar}>Reintentar mis mesas</Boton>
          </>
        ) : null}
        {visibles.length > 0 ? (
          <View role="list" style={estilos.lista}>
            {visibles.map((mesa, i) => <FilaMesa key={mesa.id} mesa={mesa} unica={unica} numero={i + 1} />)}
          </View>
        ) : null}
        {anteriores.length > 0 ? (
          <Boton variante="secundario" expandido={expandidas} onPress={() => setExpandidas(anterior => !anterior)}>
            {`Mesas anteriores (${anteriores.length})`}
          </Boton>
        ) : null}
        {expandidas && anteriores.length > 0 ? (
          <View role="list" style={estilos.lista}>
            {anteriores.map((mesa, i) => <FilaMesa key={mesa.id} mesa={mesa} unica={false} numero={visibles.length + i + 1} />)}
          </View>
        ) : null}
      </Hoja>
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: 20 },
  fila: { gap: 6 },
  titulo: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 18 },
  texto: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 16 },
  fecha: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 14 },
});
