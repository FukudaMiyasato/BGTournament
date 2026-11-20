# BG Tournament

Ranking de un torneo de juegos de mesa.

- **`/`** — ranking con la foto de cada jugador, de más a menos puntos, y estadísticas (juego más jugado, quién jugó más, quién perdió más, últimas partidas…).
- **`/configuracion`** — agregar jugadores y juegos (ambos con foto), registrar partidas (juego, quiénes jugaron, quiénes ganaron), editar o borrar partidas, y un listado ordenable por jugadas / puntos / perdidas.

Cada ganador de una partida suma **1 punto**. En el ranking solo aparecen quienes jugaron al menos una partida. El botón **Animar** muestra el ranking anterior (sin las partidas del último día jugado) y desliza a cada jugador hasta su puesto actual; no se guarda nada aparte: se calcula con las fechas de las partidas.

Los jugadores sin foto muestran una imagen por defecto, que se puede cambiar en **Configuración → Jugadores**. En **Configuración → Datos** se puede descargar una copia de todo (con fotos) e importarla en otra instalación, por ejemplo para pasar datos de local a Vercel.

## Desplegar en Vercel

1. Importa este repositorio en Vercel.
2. En el proyecto: **Storage → Create Database → Upstash (Redis)** y conéctala al proyecto. Eso crea las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. Crea las credenciales de Google (ver abajo) y agrega en **Settings → Environment Variables**:
   - `AUTH_SECRET` — un texto aleatorio largo (`openssl rand -base64 33`).
   - `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` — el cliente OAuth de Google.
   - `ADMIN_EMAILS` — los correos administradores, separados por coma. Solo ellos pueden entrar a `/configuracion`.
4. Vuelve a desplegar (Redeploy) para que tome las variables.

### Credenciales de Google

1. Entra a [Google Cloud Console → APIs y servicios → Credenciales](https://console.cloud.google.com/apis/credentials) (crea un proyecto si no tienes).
2. Configura la pantalla de consentimiento OAuth (tipo **Externo**) y publícala, o agrega los correos administradores como usuarios de prueba.
3. **Crear credenciales → ID de cliente de OAuth → Aplicación web**.
4. En **URIs de redireccionamiento autorizados** agrega:
   - `https://TU-DOMINIO.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (para probar en local)
5. Copia el ID de cliente y el secreto a las variables de entorno.

## Desarrollo local

```bash
npm install
npm run dev
```

En local no hace falta Redis: los datos se guardan en la carpeta `.data/` (ignorada por git). Si no defines las variables de Google, `/configuracion` queda abierta en local; para probar el login copia `.env.example` a `.env.local` y complétalo.
