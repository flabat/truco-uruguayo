import { getRandomValues } from "expo-crypto";

// Hermes no trae crypto.getRandomValues y idComando lo necesita.
const alcance = globalThis as unknown as { crypto?: { getRandomValues?: typeof getRandomValues } };
alcance.crypto ??= {};
alcance.crypto.getRandomValues ??= getRandomValues;
