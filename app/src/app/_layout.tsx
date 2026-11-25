import { DMSans_400Regular, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { DMSerifText_400Regular } from "@expo-google-fonts/dm-serif-text";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colores } from "../tema";

export default function Raiz() {
  const [listas] = useFonts({ DMSerifText_400Regular, DMSans_400Regular, DMSans_600SemiBold });
  if (!listas) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.papel } }} />
    </>
  );
}
