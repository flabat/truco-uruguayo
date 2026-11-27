-- Avisos de Apple ya aplicados (#468): repetir uno no cambia nada. La clave es un hash, sin el sub de Apple.
CREATE TABLE juego.avisos_apple (
  clave text PRIMARY KEY,
  recibido timestamptz NOT NULL DEFAULT now()
);
