import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calcularMesa } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { colores, fuentes } from "../tema.ts";
import { CapaLienzo } from "./CapaLienzo";
import type { Atajo } from "./atajos.ts";
import type { EventosDeMesa } from "./eventos.ts";
import { transicionDeHoja, type Canto, type HojaCantos as DatosHojaCantos } from "./hoja-cantos.ts";
import { ManoPropia, type JugarSinGesto } from "./ManoPropia.tsx";
import { entradaDeGeometria, type MesaVisible } from "./modelo.ts";
import type { SenasEnMesa } from "./senas.ts";
import { useAtajos } from "./useAtajos.ts";
import { useManoAnimada } from "./useManoAnimada.ts";
import { useReparto } from "./useReparto.ts";
import { Asientos } from "./vistas/Asientos.tsx";
import { Barra } from "./vistas/Barra.tsx";
import { Estado } from "./vistas/Estado.tsx";
import { FinDeMano } from "./vistas/FinDeMano.tsx";
import { enRect } from "./vistas/estilo.ts";
import { Hoja } from "./vistas/Hoja.tsx";
import { Paneles } from "./vistas/Paneles.tsx";
import { HojaCantos } from "./vistas/HojaCantos.tsx";
import { PieDelEspectador } from "./vistas/PieDelEspectador.tsx";
import { franjaDeSenas, Senas, SenasRecibidas, type Indicar } from "./vistas/Senas.tsx";
import { Tira, titulosDePestana, type Pestana } from "./vistas/Tira.tsx";

export type { Pestana } from "./vistas/Tira.tsx";

export interface AccionesMesa {
  jugarCarta: (id: CardId) => void;
  cantar: (tipo: Canto) => void;
  indicar: Indicar;
  repartir: () => void;
  /** «Crear otra mesa» al terminar el chico. */
  crearMesa: () => void;
  salir: () => void;
}

interface Props {
  mesa: MesaVisible;
  senas: SenasEnMesa;
  /** `hojaDeCantos(...)` ya calculada; null si no hay cantos legales. */
  hojaCantos: DatosHojaCantos | null;
  acciones: AccionesMesa;
  /** El contenido de las hojas de la tira y de ☰. La hoja pone el título; sin contenido queda vacía. */
  extra?: Partial<Record<Pestana, ReactNode>>;
  /** Jugadas rechazadas o que no se pudieron enviar: ver `ManoPropia`. */
  rechazos: number;
  conectada: boolean;
  /** Lo que anuncia la cola de presentación: el reparto y los cobros se animan al oírlo. */
  eventos?: EventosDeMesa;
  /** Modo liviano: `livianoActivo(preferencias, reducirMovimiento)`. */
  liviano?: boolean;
  /** Hápticos al levantar y apoyar una carta. */
  hapticos?: boolean;
}

type HojaAbierta = "cantos" | Pestana | null;

/**
 * La mesa entera. Una sola geometría (`calcularMesa`) ubica el lienzo del fondo, la mano que se
 * toca y las vistas de texto. Con una hoja abierta, la geometría recibe su alto y la mano sube.
 */
export function MesaPantalla({ mesa, senas, hojaCantos, acciones, extra, rechazos, conectada, eventos, liviano = false, hapticos = false }: Props) {
  const ventana = useWindowDimensions();
  const area = useSafeAreaInsets();
  const ancho = Math.max(0, ventana.width - area.left - area.right);
  const alto = Math.max(0, ventana.height - area.top - area.bottom);

  const [elegida, elegir] = useState<HojaAbierta>(null);
  // El alto medido es de la hoja que lo midió: al cambiar de hoja vuelve a 0 hasta medirse.
  const [medida, cambiarMedida] = useState<{ hoja: HojaAbierta; alto: number }>({ hoja: null, alto: 0 });

  // La hoja de Cantos sube sola al responder o declarar, y se cierra si el canto ya no está.
  const anterior = useRef<DatosHojaCantos | null>(null);
  useEffect(() => {
    const previa = anterior.current;
    anterior.current = hojaCantos;
    elegir(a => {
      const t = transicionDeHoja(previa, hojaCantos, a === "cantos");
      return t.abierta ? "cantos" : a === "cantos" ? null : a;
    });
  }, [hojaCantos]);

  // Hasta que corre el efecto, una hoja de Cantos que ya no existe no se muestra.
  const abierta: HojaAbierta = elegida === "cantos" && !hojaCantos ? null : elegida;
  const altoHoja = medida.hoja === abierta ? medida.alto : 0;
  const forzada = hojaCantos !== null && !hojaCantos.cerrable;
  const cerrable = abierta !== "cantos" || !forzada;

  const geometria = useMemo(
    () => ancho > 0 && alto > 0
      ? calcularMesa(entradaDeGeometria(mesa, { ancho, alto }, abierta ? { alto: altoHoja } : null))
      : null,
    [mesa, ancho, alto, abierta !== null, altoHoja],
  );
  const mano = useManoAnimada(mesa.manoPropia, geometria?.mano ?? []);
  const reparto = useReparto(eventos, geometria, mesa, liviano);
  // Mientras se reparte, la mano no se toca: sus cartas todavía están volando o de dorso.
  const puedeJugarCarta = mesa.puedeJugarCarta && !reparto;

  const cerrar = useCallback(() => elegir(a => (a === "cantos" && forzada ? a : null)), [forzada]);
  const abrir = useCallback((hoja: Exclude<HojaAbierta, null>) => {
    // Con un canto por responder, nada tapa la hoja de respuesta.
    if (!forzada) elegir(hoja);
  }, [forzada]);
  const cantar = useCallback((tipo: Canto) => {
    if (!forzada) elegir(null);
    acciones.cantar(tipo);
  }, [acciones, forzada]);
  // Atajos de teclado (solo web). La carta va por `ManoPropia`, que traba la mano como el toque.
  const jugarSinGesto = useRef<JugarSinGesto | null>(null);
  const aplicarAtajo = useCallback((a: Atajo) => {
    if (a.tipo === "carta") jugarSinGesto.current?.(a.carta);
    else if (a.tipo === "abrir-cantos") abrir("cantos");
    else if (a.tipo === "canto") cantar(a.canto);
    else cerrar();
  }, [abrir, cantar, cerrar]);
  useAtajos(aplicarAtajo, {
    mano: mesa.manoPropia, puedeJugarCarta: mesa.propio != null && puedeJugarCarta, hoja: hojaCantos, hojaAbierta: abierta !== null,
  });

  const medir = useCallback((h: number) => cambiarMedida(m => (
    m.hoja === abierta && Math.abs(m.alto - h) < 1 ? m : { hoja: abierta, alto: h }
  )), [abierta]);

  // Con una hoja abierta la mano sube al paño: la tarjeta de fin se oculta para no taparla.
  const conFin = mesa.fin !== null && !abierta;
  const tercetos = mesa.modalidad === "3v3";
  const titulos = titulosDePestana(tercetos);

  let contenido: ReactNode = null;
  if (abierta === "cantos" && hojaCantos) contenido = <HojaCantos hoja={hojaCantos} cantar={cantar} />;
  else if (abierta && abierta !== "cantos") {
    contenido = (
      <View style={estilos.pestana}>
        <Text role="heading" aria-level={2} style={estilos.tituloPestana}>{titulos[abierta]}</Text>
        {extra?.[abierta] ?? null}
        {abierta === "mano" && senas.tipo === "silencio" ? <SenasRecibidas recibidas={senas.recibidas} /> : null}
      </View>
    );
  }

  return (
    <GestureHandlerRootView testID="mesa" style={estilos.raiz}>
      {geometria ? (
        <View style={[estilos.area, { left: area.left, top: area.top, width: ancho, height: alto }]}>
          <CapaLienzo geometria={geometria} mesa={mesa} mano={mano} liviano={liviano} reparto={reparto} />
          {abierta && cerrable ? (
            <Pressable accessibilityLabel="Cerrar la hoja" onPress={cerrar} style={enRect(geometria.pano)} />
          ) : null}
          <Asientos mesa={mesa} geometria={geometria} />
          {/* La tarjeta de fin de mano ya dice quién ganó y por qué. */}
          {conFin ? null : <Estado rect={geometria.estado} estado={mesa.estado} fila={franjaDeSenas(senas, acciones.indicar)} />}
          {/* En el escritorio, lo de Más está siempre a la vista en el panel derecho: no hay ☰. */}
          <Barra rect={geometria.barra} tanteador={mesa.tanteador} conectada={conectada} eventos={eventos} liviano={liviano}
            abrirMas={geometria.paneles ? undefined : () => abrir("mas")} />
          {mesa.propio != null ? (
            <ManoPropia mano={mano} pano={geometria.pano} habilitada={puedeJugarCarta}
              jugar={acciones.jugarCarta} rechazos={rechazos} sinGesto={jugarSinGesto} hapticos={hapticos} />
          ) : null}
          <Senas senas={senas} geometria={geometria} />
          {geometria.espectador ? <PieDelEspectador rect={geometria.espectador} salir={acciones.salir} /> : null}
          {mesa.fin && conFin ? (
            <FinDeMano fin={mesa.fin} rect={geometria.pano}
              alPresionar={mesa.fin.boton === "Crear otra mesa" ? acciones.crearMesa : acciones.repartir} />
          ) : null}
          {geometria.cantos && hojaCantos ? (
            <Pressable accessibilityRole="button" onPress={() => abrir("cantos")}
              style={({ pressed }) => [enRect(geometria.cantos!), estilos.cantos, pressed && estilos.apretado]}>
              <Text style={estilos.textoCantos}>Cantos</Text>
            </Pressable>
          ) : null}
          {geometria.paneles ? (
            <Paneles paneles={geometria.paneles} titulos={titulos} extra={extra}
              recibidas={senas.tipo === "silencio" ? <SenasRecibidas recibidas={senas.recibidas} /> : null} />
          ) : null}
          {geometria.tira && !abierta ? <Tira rect={geometria.tira} tercetos={tercetos} abierta={abierta} abrir={abrir} /> : null}
          <Hoja key={abierta ?? "cerrada"} abierta={abierta !== null} cerrable={cerrable} alCerrar={cerrar} alMedir={medir}
            rect={geometria.hoja} relleno={area.bottom} etiqueta={abierta === "cantos" ? hojaCantos?.encabezado ?? "Cantos" : abierta ? titulos[abierta] : ""}>
            {contenido}
          </Hoja>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const estilos = StyleSheet.create({
  raiz: { backgroundColor: colores.panoOscuro, flex: 1, overflow: "hidden" },
  area: { position: "absolute" },
  cantos: {
    alignItems: "center", backgroundColor: colores.acento, borderRadius: 999, boxShadow: "0 4px 10px rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
  },
  apretado: { opacity: 0.85 },
  textoCantos: { color: "#ffffff", fontFamily: fuentes.textoFuerte, fontSize: 15 },
  pestana: { gap: 8 },
  tituloPestana: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 20 },
});
