-- La app inicia el ingreso con un desafío S256 y recibe un código de canje de un solo uso.
ALTER TABLE juego.ingresos ADD COLUMN desafio_app text;
CREATE TABLE juego.canjes (
  clave text PRIMARY KEY,
  jugador uuid NOT NULL REFERENCES juego.jugadores(id),
  desafio text NOT NULL,
  baja_cancelada boolean NOT NULL DEFAULT false,
  vence timestamptz NOT NULL DEFAULT now() + interval '60 seconds'
);
