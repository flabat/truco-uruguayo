import { DMSans_400Regular, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { DMSerifText_400Regular } from "@expo-google-fonts/dm-serif-text";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Cargando } from "../componentes/ui.tsx";
import { ProveedorDeSesion } from "../ingreso/contexto.tsx";
import { colores } from "../tema.ts";

// La pantalla de inicio nativa queda hasta que cargan las tipografías.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Raiz() {
  const [listas, error] = useFonts({ DMSerifText_400Regular, DMSans_400Regular, DMSans_600SemiBold });
  useEffect(() => {
    if (listas || error) SplashScreen.hideAsync().catch(() => {});
  }, [listas, error]);
  return (
    <SafeAreaProvider>
      {/* Iconos oscuros sobre el papel crema; la mesa los pide claros. */}
      <StatusBar style="dark" />
      {listas || error ? (
        <ProveedorDeSesion>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.papel } }} />
        </ProveedorDeSesion>
      ) : <Cargando />}
    </SafeAreaProvider>
  );
}
