-- Un asiento cedido sigue siendo humano para las reglas y el replay, pero lo juega una computadora.
ALTER TABLE juego.asientos ADD COLUMN cedido boolean NOT NULL DEFAULT false CHECK (NOT cedido OR jugador IS NOT NULL);
-- Una mesa en espera se cancela cuando quien la creó deja el juego.
ALTER TABLE juego.mesas ADD COLUMN cancelada timestamptz;
