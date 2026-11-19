CREATE TABLE juego.artefactos (
  pin text PRIMARY KEY CHECK (pin ~ '^[a-f0-9]{64}$'),
  formato text NOT NULL CHECK (formato IN ('duel','pairs','pairs-senas')),
  contenido jsonb NOT NULL
);
CREATE TABLE juego.activaciones (
  formato text PRIMARY KEY CHECK (formato IN ('duel','pairs','pairs-senas')),
  pin text NOT NULL REFERENCES juego.artefactos(pin)
);
ALTER TABLE juego.mesas ADD COLUMN politica text NOT NULL DEFAULT 'incumbent-online-v1';
UPDATE juego.mesas SET politica='fixture-senas-v1' WHERE solo_computadoras AND version_senas IS NOT NULL;

CREATE TABLE juego.turnos_bot (
  mesa uuid PRIMARY KEY REFERENCES juego.mesas(id)
);
CREATE TABLE juego.inferencias (
  mesa uuid NOT NULL, mano integer NOT NULL, version_anterior integer NOT NULL,
  asiento smallint NOT NULL, solicitada text NOT NULL, aplicada text NOT NULL,
  fallback text, latencia_ms double precision NOT NULL,
  PRIMARY KEY (mesa, mano, version_anterior),
  FOREIGN KEY (mesa, mano) REFERENCES juego.manos(mesa, numero) ON DELETE CASCADE
);
