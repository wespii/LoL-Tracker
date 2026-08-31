// src/riotClient.js
// Lógica compartida para hablar con la Riot API. La usan tanto
// netlify/functions/jugador.js (producción) como server.js (local/otro host).

// Account-V1 (Riot ID -> puuid) SOLO acepta regiones continentales.
// Summoner-V4 y League-V4 SOLO aceptan regiones de plataforma/servidor.
const PLATFORM_TO_CONTINENT = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
};

const QUEUE_MAP = {
  solo: 'RANKED_SOLO_5x5',
  flex: 'RANKED_FLEX_SR',
};

function getContinentalRegion(platformRegion) {
  const platform = (platformRegion || '').toLowerCase();
  const continent = PLATFORM_TO_CONTINENT[platform];
  if (!continent) {
    throw {
      status: 400,
      code: 'BAD_REGION',
      message: `Región "${platformRegion}" no reconocida. Usá una región de servidor válida (na1, euw1, kr, etc.)`,
    };
  }
  return continent;
}

async function riotRequest(url, apiKey) {
  if (!apiKey) {
    throw { status: 500, code: 'MISSING_KEY', message: 'RIOT_API_KEY no está configurada en el entorno del servidor' };
  }

  let res;
  try {
    res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  } catch (networkErr) {
    console.error('[Riot API] Error de red:', networkErr.message);
    throw { status: 502, code: 'NETWORK_ERROR', message: 'No se pudo conectar con los servidores de Riot' };
  }

  if (res.ok) return res.json();

  let detail = '';
  try { detail = await res.text(); } catch (_) { /* noop */ }

  switch (res.status) {
    case 400:
      console.error('[Riot API] 400 Bad Request:', detail);
      throw { status: 400, code: 'BAD_REQUEST', message: 'Riot rechazó la consulta (parámetros inválidos)' };

    case 401:
      console.error('[Riot API] 401 Unauthorized: el header X-Riot-Token no llegó o está vacío');
      throw { status: 401, code: 'UNAUTHORIZED', message: 'No se está enviando la API key correctamente' };

    case 403:
      console.error('[Riot API] 403 Forbidden: la key es inválida o no tiene acceso a este endpoint');
      throw {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Tu Riot API key es inválida o no tiene permisos para este endpoint',
      };

    case 404:
      throw { status: 404, code: 'NOT_FOUND', message: 'No se encontró esa cuenta (revisá Nombre#TAG y la región)' };

    case 429: {
      const retryAfter = res.headers.get('retry-after') || '5';
      console.error(`[Riot API] 429 Too Many Requests: reintentar en ${retryAfter}s`);
      throw {
        status: 429,
        code: 'RATE_LIMITED',
        message: `Se alcanzó el límite de peticiones de Riot. Esperá ${retryAfter}s y volvé a intentar`,
        retryAfter: Number(retryAfter),
      };
    }

    case 503:
      throw { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'La API de Riot no está disponible en este momento' };

    default:
      console.error(`[Riot API] Error ${res.status}:`, detail);
      throw { status: res.status, code: 'UNKNOWN', message: `Error inesperado de Riot (${res.status})` };
  }
}

async function fetchPlayerData({ gameName, tagLine, region, queue = 'solo' }, apiKey) {
  if (!gameName || !tagLine || !region) {
    throw { status: 400, code: 'MISSING_PARAMS', message: 'Faltan parámetros: gameName, tagLine, region' };
  }
  const normalizedGameName = String(gameName).trim();
  const normalizedTagLine = String(tagLine).trim().replace(/^#/, '');
  if (!normalizedGameName || !normalizedTagLine) {
    throw { status: 400, code: 'BAD_RIOT_ID', message: 'Riot ID inválido. Formato esperado: Nombre#TAG' };
  }

  const platform = region.toLowerCase();
  const continent = getContinentalRegion(platform);

  const accountUrl = `https://${continent}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(normalizedGameName)}/${encodeURIComponent(normalizedTagLine)}`;
  const account = await riotRequest(accountUrl, apiKey);

  const queueType = QUEUE_MAP[queue] || QUEUE_MAP.solo;
  const summonerUrl = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`;
  const summoner = await riotRequest(summonerUrl, apiKey);
  let entry = null;
  const summonerId = summoner.id || summoner.summonerId;

  if (summonerId) {
    const leagueUrl = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
    const entries = await riotRequest(leagueUrl, apiKey);
    entry = entries.find(e => e.queueType === queueType) || null;
  } else {
    const leagueByPuuidUrl = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`;
    const byPuuidEntries = await riotRequest(leagueByPuuidUrl, apiKey);
    entry = byPuuidEntries.find(e => e.queueType === queueType) || null;
  }

  return {
    gameName: account.gameName,
    tagLine: account.tagLine,
    summonerLevel: summoner.summonerLevel,
    profileIconId: summoner.profileIconId,
    ranked: entry
      ? { tier: entry.tier, rank: entry.rank, lp: entry.leaguePoints, wins: entry.wins, losses: entry.losses }
      : null,
  };
}

module.exports = { fetchPlayerData };