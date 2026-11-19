#!/bin/sh
set -eu
umask 077
tag=truco-produccion
case "${1:-}" in
  iniciar) exec restic init ;;
  listar) exec restic snapshots --tag "$tag" ;;
  guardar)
    # restic descarta la instantánea si pg_dump termina con error.
    restic backup --host truco --tag "$tag" --stdin-filename truco.dump \
      --stdin-from-command -- pg_dump --format=custom --no-password
    restic forget --host truco --tag "$tag" --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    ;;
  restaurar)
    : "${2:?Indicá el ID de la instantánea}"
    # Admitir sólo la base recién inicializada. El esquema identidad ya existe vacío.
    tablas=$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'")
    [ "$tablas" = 0 ] || { echo 'La restauración requiere una base nueva y vacía.' >&2; exit 1; }
    temporal=$(mktemp)
    trap 'rm -f "$temporal"' EXIT
    restic dump "$2" /truco.dump > "$temporal"
    pg_restore --clean --if-exists --single-transaction --exit-on-error --dbname="$PGDATABASE" "$temporal"
    ;;
  programar)
    while :; do
      if respaldo guardar; then
        date +%s > /tmp/ultimo-respaldo
        sleep 86400
      else
        echo 'Falló el respaldo. Nuevo intento en cinco minutos.' >&2
        sleep 300
      fi
    done
    ;;
  *) echo 'Usá iniciar, guardar, listar, restaurar ID o programar.' >&2; exit 2 ;;
esac
