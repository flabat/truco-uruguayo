ALTER TABLE juego.mesas
  DROP CONSTRAINT mesas_modo_check,
  ADD CHECK (modo IN ('1v1', '2v2', '3v3')),
  ADD COLUMN perfil_tercetos text,
  ADD CHECK (CASE WHEN modo = '3v3' THEN perfil_tercetos IS NOT NULL AND perfil_tercetos = 'tercetos-v1'
                  ELSE perfil_tercetos IS NULL END);

ALTER TABLE juego.asientos DROP CONSTRAINT asientos_asiento_check,
  ADD CHECK (asiento BETWEEN 0 AND 5);

CREATE FUNCTION juego.validar_capacidad_asiento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  capacidad integer;
BEGIN
  SELECT CASE modo WHEN '1v1' THEN 2 WHEN '2v2' THEN 4 WHEN '3v3' THEN 6 END INTO STRICT capacidad
    FROM juego.mesas WHERE id = NEW.mesa FOR SHARE;
  IF NEW.asiento >= capacidad THEN
    RAISE EXCEPTION 'Asiento fuera de la capacidad de la mesa' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capacidad_asiento BEFORE INSERT OR UPDATE OF mesa, asiento ON juego.asientos
  FOR EACH ROW EXECUTE FUNCTION juego.validar_capacidad_asiento();

-- La modalidad y el perfil fijan la capacidad y el lector de los repartos.
CREATE FUNCTION juego.conservar_modalidad() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.modo IS DISTINCT FROM OLD.modo OR NEW.perfil_tercetos IS DISTINCT FROM OLD.perfil_tercetos THEN
    RAISE EXCEPTION 'La modalidad de una mesa es permanente' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER modalidad_fija BEFORE UPDATE OF modo, perfil_tercetos ON juego.mesas
  FOR EACH ROW EXECUTE FUNCTION juego.conservar_modalidad();

ALTER TABLE juego.manos
  ADD COLUMN meta_tercetos integer,
  ADD COLUMN tipo_reparto text,
  ADD CHECK (CASE WHEN version_reglas = 2
    THEN meta_tercetos IS NOT NULL AND meta_tercetos >= 2 AND meta_tercetos % 2 = 0
      AND tipo_reparto IS NOT NULL AND tipo_reparto IN ('redondilla', 'pico-a-pico')
    ELSE meta_tercetos IS NULL AND tipo_reparto IS NULL END);
