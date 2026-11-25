import { getRandomValues } from "expo-crypto";

// Hermes no trae crypto.getRandomValues y idComando lo necesita.
const global = globalThis as unknown as { crypto?: { getRandomValues?: typeof getRandomValues } };
global.crypto ??= {};
global.crypto.getRandomValues ??= getRandomValues;
