export interface ResumenPartida {
  id: string;
  modo: "1v1" | "2v2" | "3v3";
  meta: number;
  mano: number;
  fecha: string | null;
  resultado: "ganada" | "perdida" | "sin-terminar" | "desconocido";
  puntos: { propios: number; rivales: number } | null;
}

export interface PerfilJugador {
  jugador: { id: string; nombre: string };
  partidas: ResumenPartida[];
  hayMas: boolean;
}
