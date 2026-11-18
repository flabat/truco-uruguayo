CREATE TABLE juego.manos (
  mesa uuid NOT NULL REFERENCES juego.mesas(id),
  numero integer NOT NULL CHECK (numero > 0),
  version integer NOT NULL CHECK (version > 0),
  version_reglas integer NOT NULL,
  reparto jsonb NOT NULL,
  puntos_inicio integer[] NOT NULL CHECK (cardinality(puntos_inicio) = 2),
  acciones jsonb NOT NULL,
  PRIMARY KEY (mesa, numero)
);

CREATE TABLE juego.comandos (
  mesa uuid NOT NULL,
  jugador uuid NOT NULL,
  id uuid NOT NULL,
  peticion jsonb NOT NULL,
  respuesta jsonb NOT NULL,
  PRIMARY KEY (mesa, jugador, id),
  FOREIGN KEY (mesa, jugador) REFERENCES juego.asientos(mesa, jugador)
);
