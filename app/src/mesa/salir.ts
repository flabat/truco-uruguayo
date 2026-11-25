import { router } from "expo-router";

// Aparte de entrada.tsx para que las pantallas de la mesa lo usen sin importarse en ciclo.
export const volverAlSalon = () => router.replace("/");
