# BG Tournament

Ranking de un torneo de juegos de mesa.

- **`/`** — ranking con la foto de cada jugador, de más a menos puntos, y estadísticas (juego más jugado, quién jugó más, quién perdió más, últimas partidas…).
- **`/configuracion`** — agregar jugadores y juegos (ambos con foto), registrar sesiones con sus partidas (juego, integrantes y puestos), editarlas o borrarlas, y un listado ordenable por jugadas / puntos / perdidas.

El primer puesto de cada partida suma **1 punto**. En el ranking solo aparecen quienes jugaron al menos una partida.

### Sesiones

Las partidas se agrupan en **sesiones** (una jornada de juego con su fecha). En **Configuración → Sesiones**:

1. **Agregar sesión** y poner la fecha.
2. **Agregar partida**: cada partida es una fila con el juego y las caritas de los integrantes. Se guarda sola al tener juego e integrantes.
3. Tocar las caritas en orden para marcar los puestos: la primera es el 1.º, la siguiente el 2.º, y así. Tocar de nuevo una carita le quita el puesto y los demás suben.
4. **Subir sesión**: hasta entonces sus partidas no cuentan en el ranking público ni se ven en el home.

El botón **Animar** del home muestra cómo estaba el ranking antes de la última sesión subida y desliza a cada jugador hasta su puesto actual. No se guarda nada aparte: se calcula con las partidas de cada sesión.

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
