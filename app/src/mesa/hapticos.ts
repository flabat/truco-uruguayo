import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import type { Vibracion } from "./efectos.ts";

/** En la web no hay hápticos. Quien llama revisa la preferencia antes de vibrar. */
export function vibrar(v: Vibracion) {
  if (Platform.OS === "web") return;
  const hecho = v === "liviano" ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    : v === "medio" ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    : Haptics.notificationAsync(v === "aviso" ? Haptics.NotificationFeedbackType.Warning
      : Haptics.NotificationFeedbackType.Success);
  hecho.catch(() => {});
}
