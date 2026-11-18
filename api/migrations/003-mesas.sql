ALTER TABLE juego.ingresos ADD COLUMN regreso text NOT NULL DEFAULT '/#jugador';

CREATE TABLE juego.mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modo text NOT NULL CHECK (modo IN ('1v1', '2v2')),
  creador uuid NOT NULL REFERENCES juego.jugadores(id),
  invitacion text NOT NULL UNIQUE
);

CREATE TABLE juego.asientos (
  mesa uuid NOT NULL REFERENCES juego.mesas(id),
  asiento smallint NOT NULL CHECK (asiento BETWEEN 0 AND 3),
  jugador uuid REFERENCES juego.jugadores(id),
  computadora boolean NOT NULL,
  PRIMARY KEY (mesa, asiento),
  UNIQUE (mesa, jugador),
  CHECK (computadora = (jugador IS NULL))
);
