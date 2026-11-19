#!/bin/sh
set -eu
# psql cita los valores como literales; no interpolar contraseñas en el SQL.
psql -v ON_ERROR_STOP=1 --username postgres --dbname truco <<'SQL'
\getenv clave_juego GAME_DB_PASSWORD
\getenv clave_identidad ID_DB_PASSWORD
CREATE ROLE mesa_app LOGIN PASSWORD :'clave_juego';
CREATE ROLE mesa_id LOGIN PASSWORD :'clave_identidad';
REVOKE ALL ON DATABASE truco FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE truco TO mesa_app;
GRANT CONNECT ON DATABASE truco TO mesa_id;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mesa_app;
CREATE SCHEMA identidad AUTHORIZATION mesa_id;
SQL
