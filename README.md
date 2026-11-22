# BG Tournament

Ranking de un torneo de juegos de mesa.

- **`/`** — ranking con la foto de cada jugador, de más a menos puntos, y estadísticas (juego más jugado, quién jugó más, quién perdió más, últimas partidas…).
- **`/configuracion`** — agregar jugadores y juegos (ambos con foto), registrar sesiones con sus partidas (juego, integrantes y puestos), editarlas o borrarlas, y un listado ordenable por jugadas / puntos / perdidas.

En el ranking solo aparecen quienes jugaron al menos una partida; siempre ocupa 10 espacios y con "Ver todos" se ve el resto. Cada jugador tiene su propio puesto: en un empate va primero quien llegó antes a ese valor. La explicación para los jugadores está en **`/doc`**. Un desplegable permite ordenarlo por **Elo** (por defecto), **Victorias**, **Promedio de victoria** o **Puntos**.

### Elo

Todos empiezan en 1000. En cada partida, con los puntajes de antes de jugarla:

- Cada jugador **con puesto** suma como en un duelo ganado contra el **promedio de los que quedaron debajo** (los puestos siguientes y los que no tienen puesto); el 1.º se mide contra el promedio de todos los demás. Ganarle a rivales con más Elo da más.
- Los que **no tienen puesto** restan como si hubieran perdido contra el **último puesto registrado**.
- Si todos tienen puesto, el último resta como si hubiera perdido contra el puesto anterior.

La fórmula es la del Elo clásico: `cambio = K × (resultado − esperado)`, con `esperado = 1 / (1 + 10^((rival − propio) / 400))`. K es 32, y 48 en las primeras 5 partidas de cada jugador. En Elo y en promedio de victoria hacen falta 3 partidas para entrar en la clasificación; antes el jugador aparece como "Provisional", debajo de los clasificados. Estos valores están en `ELO`, en `lib/stats.ts`.

### Puntos

Además, cada partida reparte puntos según el puesto: por defecto **3** al 1.º, **2** al 2.º y **1** al 3.º. Se cambia en **Configuración → Ajustes**.

### Sesiones

Las partidas se agrupan en **sesiones** (una jornada de juego con su fecha). En **Configuración → Sesiones**:

1. **Agregar sesión** y poner la fecha.
2. **Agregar partida**: cada partida es una fila con el juego y las caritas de los integrantes. Se guarda sola al tener juego e integrantes.
3. Tocar las caritas en orden para marcar los puestos: la primera es el 1.º, la siguiente el 2.º, y así. Tocar de nuevo una carita le quita el puesto y los demás suben.
4. **Subir sesión**: hasta entonces sus partidas no cuentan en el ranking público ni se ven en el home.

El botón **Animar** del home muestra cómo estaba el ranking antes de la última sesión subida y desliza a cada jugador hasta su puesto actual. No se guarda nada aparte: se calcula con las partidas de cada sesión.

Cada jugador puede tener un **studio** (Product, Movement, Understanding, Operaciones o Externo), que se elige en **Configuración → Jugadores** y se muestra como un ícono sobre su foto en el ranking.

En el home, la sección **Studios** muestra un gráfico de barras con las partidas ganadas por cada studio (los externos no entran), y la etiqueta **MVP** marca al jugador de cada studio que más ganó en los últimos 30 días.

Cada jugador puede tener además una **foto grande con fondo transparente** (PNG o WebP), que se sube en **Configuración → Jugadores** y se sirve en `/api/photo/<id>full`. Todavía no se muestra en el home.

Los botones de video y de configuración solo se ven con sesión de administrador (arriba a la derecha). El de **video** abre un modal para crear un MP4 con solo el cuadro del ranking (completo o un rango de posiciones): los tres primeros puestos aparecen de uno en uno con el puntaje subiendo y el resto casi seguidos, con sonido opcional, pensado para ponerlo encima de otro video; se genera en el navegador (Chrome, Edge o Safari actualizados). Desde el mismo modal se puede animar el ranking en la página.

**Video con fondo transparente.** El MP4 no guarda transparencia, así que con la casilla "Fondo transparente" la web exporta un archivo `-alfa.mp4` (color arriba, máscara abajo) y hay que convertirlo en la Mac:

```bash
npm run transparente -- ~/Downloads/ranking-sesion-2-alfa.mp4
```

Eso crea al lado un `-transparente.mov` (HEVC con canal alfa), que el iPhone y Edits de Instagram aceptan como capa encima de otro video. Necesita macOS y `ffmpeg` (`brew install ffmpeg`). Para iniciar sesión se entra directamente a `/configuracion`.

Los jugadores sin foto muestran una imagen por defecto, que se puede cambiar en **Configuración → Jugadores**. En **Configuración → Ajustes** se puede descargar una copia de todo (con fotos) e importarla en otra instalación, por ejemplo para pasar datos de local a Vercel.

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
