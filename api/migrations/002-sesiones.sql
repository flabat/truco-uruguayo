CREATE TABLE juego.jugadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisor text NOT NULL,
  sujeto text NOT NULL,
  nombre text NOT NULL,
  UNIQUE (emisor, sujeto)
);

CREATE TABLE juego.ingresos (
  clave text PRIMARY KEY,
  estado text NOT NULL,
  nonce text NOT NULL,
  verificador text NOT NULL,
  vence timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE juego.sesiones (
  clave text PRIMARY KEY,
  jugador uuid NOT NULL REFERENCES juego.jugadores(id),
  vence timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
