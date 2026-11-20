# BG Tournament

Ranking de un torneo de juegos de mesa.

- **`/`** — ranking con la foto de cada jugador, de más a menos puntos, y estadísticas (juego más jugado, quién jugó más, quién perdió más, últimas partidas…).
- **`/configuracion`** — agregar jugadores (con foto) y juegos, registrar partidas (juego, quiénes jugaron, quiénes ganaron), editar o borrar partidas, y un listado ordenable por jugadas / puntos / perdidas.

Cada ganador de una partida suma **1 punto**.

## Desplegar en Vercel

1. Importa este repositorio en Vercel.
2. En el proyecto: **Storage → Create Database → Upstash (Redis)** y conéctala al proyecto. Eso crea las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. En **Settings → Environment Variables** agrega `ADMIN_PASSWORD` con la contraseña para entrar a `/configuracion`.
4. Vuelve a desplegar (Redeploy) para que tome las variables.

## Desarrollo local

```bash
npm install
npm run dev
```

En local no hace falta Redis ni contraseña: los datos se guardan en la carpeta `.data/` (ignorada por git). Si defines `ADMIN_PASSWORD` en `.env.local`, también se pedirá en local.
