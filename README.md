# LoL Tracker

Herramienta comunitaria no oficial para consultar estadisticas propias o de un grupo con consentimiento. No esta afiliada, patrocinada ni aprobada por Riot Games.

## Uso local

1. Copia `.env.example` como `.env`.
2. Configura `RIOT_API_KEY` en `.env`.
3. Ejecuta:

```bash
npm install
npm run dev:local
```

Abre `http://localhost:3000`.

## Despliegue publico

Un proyecto accesible a la comunidad no debe utilizar una Development o Interim API Key. Antes de publicar, solicita y configura una Production API Key aprobada especificamente para este proyecto.

En el proveedor de hosting configura estas variables, sin subir `.env` al repositorio:

```text
RIOT_API_KEY=tu_production_key
RIOT_KEY_TYPE=production
PUBLIC_DEPLOYMENT=true
```

El servidor rechazara las consultas publicas si `RIOT_KEY_TYPE` no es `production`. Cada proyecto debe tener su propia aplicacion y key aprobada por Riot.

## Privacidad y uso responsable

- Comparte una tabla solo con el consentimiento de las personas incluidas.
- La tabla esta pensada para seguimiento personal y mejora del grupo.
- No uses la aplicacion para avergonzar, reportar o evaluar negativamente a otros jugadores.
- El ID compartido contiene los Riot ID de la tabla; tratalo como informacion compartible solo con personas autorizadas.
- No introduzcas la API key en el frontend ni en GitHub.


## Perfil y preparacion de base de datos

La busqueda del tracker abre `perfil.html` y consulta `/api/perfil`. El perfil muestra icono, nivel, mayor maestria, campeon con mejor winrate reciente, ultimas 10 partidas y jugadores recurrentes.

El archivo `supabase-schema.sql` contiene el esquema para persistir cuentas y partidas. El backend usa `SUPABASE_SERVICE_ROLE_KEY` para guardar cuentas, `matchId` y resultados; las partidas ya almacenadas no vuelven a solicitarse a Riot. Si Supabase no esta configurado, el proyecto continua funcionando con Riot directamente.
