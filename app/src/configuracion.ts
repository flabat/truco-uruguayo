import { Platform } from "react-native";

/** En la web la app comparte origen con la API (y su cookie); las apps hablan con eltru.co o con EXPO_PUBLIC_API_URL. */
export const baseDeLaApi = Platform.OS === "web"
  ? globalThis.location.origin
  : process.env.EXPO_PUBLIC_API_URL ?? "https://eltru.co";
