# Sonoro · Música 1° año

Plataforma de juegos y teoría para primer año de secundaria. Frontend estático + API en Vercel + base MongoDB Atlas.

## Estructura

```
index.html              Plataforma de los alumnos
docente/index.html      Panel docente  ->  /docente
api/[...path].js        API (una sola función serverless)
api/_lib/               Base de datos, autenticación y datos fijos
test/                   Pruebas (no necesitan MongoDB ni internet): npm test
assets/                 Portada original (MAD MUSIC); la versión liviana ya está dentro de index.html
games-src/              Código fuente de los juegos (referencia)
vercel.json  robots.txt  package.json  .env.example
```

## Puesta en marcha

1. **MongoDB Atlas**: cluster gratuito (M0), usuario de base de datos, y en *Network Access* permitir `0.0.0.0/0`.
   Copiar la cadena de conexión ("Drivers").
2. **GitHub**: subir esta carpeta a un repositorio.
3. **Vercel**: *Add New → Project* → importar el repo. Framework: `Other`. Sin comando de build.
4. **Variables de entorno** (Vercel → Settings → Environment Variables), y luego *Redeploy*:

| Nombre | Valor |
|---|---|
| `MONGODB_URI` | cadena de conexión de Atlas (con usuario y clave reales) |
| `JWT_SECRET` | frase larga y aleatoria (32+ caracteres) |
| `TEACHER_PASSWORD` | contraseña del docente |
| `MONGODB_DB` | (opcional) nombre de la base, por defecto `sonoro` |
| `PUBLIC_URL` | (opcional) por ejemplo `https://sonoro.vercel.app`; si no, se usa la dirección del pedido |

5. Entrar a `/docente`, iniciar sesión y **habilitar los temas y los juegos** (empiezan bloqueados).

## Si algo falla

Abrí `https://TU-SITIO.vercel.app/api/index?r=health`. Muestra qué variables están cargadas y si hay conexión con la base (nunca muestra valores secretos).

- `env` con algún `false`: la variable no está cargada. Revisá el nombre (exacto, en mayúsculas) y que esté tildada para *Production*, y hacé **Redeploy**.
- `db` con `error`: no se pudo conectar a Atlas.
  - En `MONGODB_URI` reemplazá `<password>` por la clave real, **sin los signos < >**. Si la clave tiene símbolos (`@ : / ? # %`), codificalos o usá una clave solo con letras y números.
  - En Atlas → *Network Access* tiene que estar `0.0.0.0/0` (puede tardar un minuto en activarse).
  - En Atlas → *Database Access*, el usuario necesita permiso de lectura y escritura (*Read and write to any database*).
- `404` en `/api/index`: la carpeta `api/` no se subió completa (tiene que estar `api/index.js` y `api/_lib/`).

## Cómo funciona

- Las contraseñas de los alumnos se guardan con `scrypt` (nunca en texto plano). Las sesiones son tokens firmados.
- **Blanqueo**: el docente genera un enlace de un solo uso que vence a las **24 horas**. Al blanquear, la contraseña vieja y las sesiones abiertas dejan de servir.
  El alumno abre el enlace y elige su contraseña nueva. Solo se guarda la huella del enlace, así que el panel lo muestra una única vez.
- Intentos de ingreso limitados (8 fallos → bloqueo de 15 minutos).
- Los puntos los guarda el servidor. Los juegos corren en el navegador, así que el servidor aplica topes por nivel, un tiempo mínimo entre niveles
  y un bonus fijo de 50 puntos. Un alumno con conocimientos técnicos podría igualmente intentar manipular sus puntos dentro de esos topes.

## Probar en local

```bash
npm install
npm test                 # pruebas del servidor y de las pantallas, con base falsa
npx vercel dev           # con un archivo .env copiado de .env.example
```

## Actualizar un juego

Los juegos están incrustados en `index.html`. Para cambiar uno, se reemplaza su versión (ver `games-src/`) y se vuelve a incrustar.
Los juegos por niveles avisan con `level` y `end`. La Arena Sonora (una sola batalla) avisa con `battle` (puntos al ganar, 1 a 400) y `save` (repertorio de ataques).
La plataforma le pasa a la Arena `window.SONORO = {userName, charLevel, state, topics, meFig, figs}`.
