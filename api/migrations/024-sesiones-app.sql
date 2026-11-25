-- Las sesiones de la app duran 30 días y se renuevan con el uso. Las de la web siguen en 7 días.
ALTER TABLE juego.sesiones ADD COLUMN tipo text NOT NULL DEFAULT 'web' CHECK (tipo IN ('web', 'app'));
