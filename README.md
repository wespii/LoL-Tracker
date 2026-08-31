# LoL Tracker con Riot API — desplegable en Netlify

Tabla de clasificatoria para hasta 10 jugadores con winrate automático y datos
de rango/LP/W-L traídos de la Riot API. Corre entero en Netlify: el "backend"
es una Netlify Function, no un servidor Express persistente.

## Por qué pasó el 404 y por qué Express no sirve tal cual en Netlify

Netlify es **hosting estático + funciones serverless**. No mantiene procesos
corriendo 24/7, así que un `server.js` con Express nunca se ejecuta ahí — por
eso `/api/jugador` devolvía 404: ese archivo/ruta simplemente no existe como
archivo estático. La solución es mover esa lógica a una **Netlify Function**
(`netlify/functions/jugador.js`), que Netlify sí sabe ejecutar bajo demanda.

## 1. Conseguir tu API key

1. https://developer.riotgames.com → login con tu cuenta de Riot.
2. Copiá la Development Key (`RGAPI-...`).
3. **Expira cada 24hs.** Cuando te tire 403 en vez de datos, esa es la causa
   más probable: hay que volver a copiarla y actualizar la variable de
   entorno (ver paso 4 de despliegue).

## 2. Correr en local

```bash
npm install
cp .env.example .env
# pegá tu RIOT_API_KEY en .env
```

Dos formas de levantarlo local:

- **`npm run dev:local`** → corre `server.js` (Express) en `localhost:3000`. Simple, sirve para probar rápido.
- **`npm run dev:netlify`** → corre `netlify dev` (necesita `netlify-cli`, ya está en devDependencies). Esto simula el entorno real de Netlify: sirve `public/`, ejecuta las functions de `netlify/functions/`, y aplica los redirects de `netlify.toml`. **Usá este modo antes de deployar**, así probás exactamente lo que va a pasar en producción.

## 3. Desplegar en Netlify (paso a paso)

1. Subí el repo a GitHub.
2. En Netlify: **Add new site → Import an existing project** → elegí el repo.
3. Netlify va a detectar el `netlify.toml` solo. Confirmá:
   - Build command: `npm install`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. **Site settings → Environment variables → Add a variable**:
   `RIOT_API_KEY` = tu key. (Netlify Functions lee `process.env.RIOT_API_KEY`
   de acá, no del `.env` — el `.env` es solo para local y no se sube al repo).
5. Deploy. Tu tracker va a quedar en algo como `https://tu-tracker.netlify.app`.
6. **Cada vez que la key expire** (24hs): repetí el paso 4 con la key nueva
   y hacé "Trigger deploy" (o redeployá) para que tome el cambio.
   Alternativa sin rebuild: `netlify env:set RIOT_API_KEY nueva-key` con la
   CLI — las functions la toman al toque.

### ¿Y si prefiero un backend "de verdad" en vez de functions?

También es válido: desplegás `server.js` en Render/Railway (que sí sostienen
procesos persistentes) y en Netlify publicás solo `public/` como sitio
estático, apuntando el fetch del frontend a la URL de ese backend externo
(habilitando CORS ahí, `server.js` ya trae el paquete `cors`). Es más piezas
para mantener; para 10 usuarios, Netlify Functions alcanza y sobra.

## Estructura final

```
lol-tracker-project/
├── netlify.toml            # build, functions y redirects (soluciona el 404)
├── package.json
├── .env.example
├── public/
│   └── index.html          # cliente
├── src/
│   └── riotClient.js       # llamadas a Riot + manejo de 400/401/403/404/429
├── netlify/functions/
│   └── jugador.js          # "backend" real en producción (Netlify)
└── server.js                # backend opcional solo para local / deploy alternativo
```

## Regiones soportadas

`na1, euw1, eun1, kr, br1, la1, la2, oc1, tr1, ru, jp1`
