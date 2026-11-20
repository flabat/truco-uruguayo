# Truco Oriental

Truco uruguayo con muestra para jugar en el navegador. La misma aplicación reúne las mesas de duelo, parejas y tercetos, la guía de reglas con sus fuentes y la práctica individual.

## Desarrollo local

Para jugar una partida, levantá la aplicación completa con Docker Compose desde la raíz del repositorio.

```sh
docker compose up --build --wait
```

Abrí [Truco Oriental](http://localhost:8081/). Podés leer las reglas o practicar como invitado. Para crear una mesa o aceptar una invitación, ingresá con una de las cuentas de prueba de la [guía del entorno local](docs/entorno-local.md). Compose levanta la web, la API que aplica el motor de juego, PostgreSQL y el proveedor de identidad.

Para trabajar solo en la interfaz, usá Node.js 24 y npm.

```sh
npm ci
npm run dev
```

Abrí la dirección que imprime Astro. Para revisar la interfaz compilada en `dist/`, ejecutá los siguientes comandos. Tanto el servidor de desarrollo como la vista previa sirven la guía y la práctica individual. Las mesas multijugador requieren los servicios de Compose.

```sh
npm run build
npm run preview
```

## Producción

La [guía del VPS](docs/produccion.md) incluye el despliegue con Docker Compose, HTTPS, cuentas, copias externas y el ensayo local de recuperación. Para cambiar la cantidad de mesas en vivo, pausar las exhibiciones o recuperar el servicio, seguí el [procedimiento de operación del salón](docs/multijugador/salon-en-vivo/operacion.md).

## Contenido y componentes

Las páginas se editan en `src/pages/` y las reglas con sus fuentes en `src/data/`. Astro compila la interfaz para la raíz del sitio.

El [diseño de la ruta de aprendizaje](docs/aprendizaje/README.md) describe el motor de reglas, el simulador reproducible de parejas y la autoría de lecciones. El [plan por fases](docs/aprendizaje/plan.md) enlaza los issues y sus dependencias para implementar en paralelo.

La [guía de entrenamiento local](training/README.md) permite entrenar rivales de computadora para duelos y parejas, reproducir chicos y verificar la evaluación por formato.

El [formato de replay de un chico](docs/multijugador/replay-chico.md) incluye cuatro partidas de referencia y un ejemplo para reconstruir una jugada desde el asiento que la vio.

El [diseño del juego de a seis](docs/multijugador/tercetos/README.md) describe la mesa de tres contra tres, la meta configurable de 50 tantos y los tres duelos de un pico a pico. El [plan de implementación](docs/multijugador/tercetos/implementacion.md) reúne las dependencias y las pruebas de cada entrega.

## Trabajo en el repositorio

Seguí la [guía de contribución](CONTRIBUTING.md) para reservar un issue, trabajar en una rama aislada y abrir un pull request contra `main`. Después de instalar Chromium como indica la guía y con Python 3 disponible, ejecutá `npm run check` para repetir localmente la verificación de GitHub Actions.

Las ilustraciones de ambiente se generaron para esta guía. La [baraja Tatú](scripts/tatu/README.md) se dibujó a partir de la digitalización de GlyphEnjoyer. Sus 50 caras y el reverso tienen fuentes SVG editables en `arte/tatu/`. Después de editar, ejecutá `npm run cartas:generar` para actualizar los WebP del sitio. Las fuentes tipográficas DM Sans y DM Serif Text se sirven con el sitio desde sus paquetes de Fontsource.
