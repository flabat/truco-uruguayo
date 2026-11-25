import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Jugador } from "../api/cliente.ts";
import { Confirmacion } from "../componentes/Confirmacion.tsx";
import { EnlaceTexto } from "../componentes/salon.tsx";
import { Aviso, Boton, Cargando, Pantalla } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { colores, fuentes } from "../tema.ts";

const textoEliminar = "Cerramos tu sesión en todos tus dispositivos y te sacamos de tus mesas. "
  + "Tenés 30 días para arrepentirte: si volvés a ingresar antes, cancelamos la eliminación. "
  + "Después borramos tu cuenta y lo que te identifica; las partidas que jugaste con otras personas quedan sin tu nombre.";

export default function PantallaPerfil() {
  const { estado } = useSesion();
  if (estado.tipo === "cargando") return <Cargando />;
  if (estado.tipo !== "dentro") return <Redirect href="/" />;
  return <Perfil jugador={estado.jugador} aviso={estado.aviso} />;
}

function Perfil({ jugador, aviso }: { jugador: Jugador; aviso?: string }) {
  const { cerrarSesion, eliminarCuenta } = useSesion();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarEliminacion() {
    setOcupado(true);
    setError(null);
    try {
      // Sin sesión, la pantalla vuelve sola al ingreso con el aviso de la baja.
      await eliminarCuenta();
    } catch {
      setError("No pudimos pedir la eliminación. Probá de nuevo.");
      setConfirmando(false);
      setOcupado(false);
    }
  }

  return (
    <Pantalla titulo="Tu perfil">
      <EnlaceTexto alTocar={() => (router.canGoBack() ? router.back() : router.replace("/"))}>Volver al salón</EnlaceTexto>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {error ? <Aviso>{error}</Aviso> : null}
      <View style={estilos.ficha}>
        <Text style={estilos.etiqueta}>Nombre</Text>
        <Text style={estilos.nombre}>{jugador.nombre}</Text>
        <Text style={estilos.etiqueta}>ID de jugador</Text>
        <Text selectable style={estilos.id}>{jugador.id}</Text>
      </View>
      <Boton variante="secundario" ocupado={ocupado} onPress={() => {
        setOcupado(true);
        void cerrarSesion();
      }}>
        Cerrar sesión
      </Boton>
      <Boton variante="peligro" ocupado={ocupado} onPress={() => setConfirmando(true)}>Eliminar mi cuenta</Boton>
      <Confirmacion
        visible={confirmando}
        titulo="¿Eliminar tu cuenta?"
        texto={textoEliminar}
        confirmar="Eliminar mi cuenta"
        ocupado={ocupado}
        alConfirmar={confirmarEliminacion}
        alCancelar={() => setConfirmando(false)}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  ficha: { borderColor: colores.borde, borderRadius: 16, borderWidth: 1, gap: 4, padding: 16, backgroundColor: "#fffdf6" },
  etiqueta: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 13, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  nombre: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 24 },
  id: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 15 },
});
