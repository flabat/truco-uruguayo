export const palos = [
  { id: "oros", nombre: "Oros" },
  { id: "copas", nombre: "Copas" },
  { id: "espadas", nombre: "Espadas" },
  { id: "bastos", nombre: "Bastos" },
] as const;

const figuras: Record<number, string> = { 1: "As", 10: "Sota", 11: "Caballo", 12: "Rey" };

export const baraja = palos.map(({ id, nombre }) => ({
  id,
  nombre,
  cartas: Array.from({ length: 12 }, (_, i) => {
    const valor = i + 1;
    return {
      id: id + "-" + String(valor).padStart(2, "0"),
      nombre: (figuras[valor] ?? valor) + " de " + id,
    };
  }),
}));

export const extras = [
  { id: "comodin-01", nombre: "Comodín del tatú" },
  { id: "comodin-02", nombre: "Comodín del conejo" },
  { id: "reverso", nombre: "Reverso" },
];

export const cartasPorId = new Map(
  [...baraja.flatMap((palo) => palo.cartas), ...extras].map((carta) => [carta.id, carta]),
);
