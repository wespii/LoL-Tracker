// Logica compartida para consultar la Riot API.
const PLATFORM_TO_CONTINENT = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', kr: 'asia', jp1: 'asia',
};
const QUEUE_MAP = { solo: 'RANKED_SOLO_5x5', flex: 'RANKED_FLEX_SR' };
const NORMAL_QUEUES = new Set([400, 430, 480, 490]);
const PLAYER_CACHE = new Map();
const IN_FLIGHT = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getContinentalRegion(region) {
  const platform = (region || '').toLowerCase();
  const continent = PLATFORM_TO_CONTINENT[platform];
  if (!continent) throw { status: 400, code: 'BAD_REGION', message: `Region "${region}" no reconocida` };
  return continent;
}

async function riotRequest(url, apiKey) {
  if (!apiKey) throw { status: 500, code: 'MISSING_KEY', message: 'RIOT_API_KEY no esta configurada en el servidor' };
  let res;
  try { res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } }); }
  catch (_) { throw { status: 502, code: 'NETWORK_ERROR', message: 'No se pudo conectar con los servidores de Riot' }; }
  if (res.ok) return res.json();
  switch (res.status) {
    case 400: throw { status: 400, code: 'BAD_REQUEST', message: 'Riot rechazo la consulta' };
    case 401: throw { status: 401, code: 'UNAUTHORIZED', message: 'La API key no es valida' };
    case 403: throw { status: 403, code: 'FORBIDDEN', message: 'La API key no tiene permisos' };
    case 404: throw { status: 404, code: 'NOT_FOUND', message: 'No se encontro esa cuenta' };
    case 429: { const retryAfter = res.headers.get('retry-after') || '5'; throw { status: 429, code: 'RATE_LIMITED', message: `Limite de Riot alcanzado. Espera ${retryAfter}s`, retryAfter: Number(retryAfter) }; }
    case 503: throw { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'La API de Riot no esta disponible' };
    default: throw { status: res.status, code: 'UNKNOWN', message: `Error inesperado de Riot (${res.status})` };
  }
}

async function fetchNormalStats(puuid, continent, apiKey) {
  const normalQueueIds = [400, 430, 480, 490];
  const uniqueIds = new Set();
  for (const queueId of normalQueueIds) {
    const idsUrl = `https://${continent}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=50&queue=${queueId}`;
    const ids = await riotRequest(idsUrl, apiKey);
    ids.forEach(id => uniqueIds.add(id));
  }
  const matchIds = [...uniqueIds].slice(0, 50);
  let wins = 0, losses = 0;
  const championCounts = {};
  for (let i = 0; i < matchIds.length && wins + losses < 50; i += 5) {
    const batch = matchIds.slice(i, i + 5).map(matchId => {
      const matchUrl = `https://${continent}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
      return riotRequest(matchUrl, apiKey);
    });
    const matches = await Promise.all(batch);
    for (const match of matches) {
      if (!NORMAL_QUEUES.has(Number(match.info.queueId))) continue;
      const participant = match.info.participants.find(p => p.puuid === puuid);
      if (!participant) continue;
      if (participant.win) wins++; else losses++;
      if (participant.championName) championCounts[participant.championName] = (championCounts[participant.championName] || 0) + 1;
      if (wins + losses >= 50) break;
    }
  }
  const mostPlayed = Object.entries(championCounts).sort((a, b) => b[1] - a[1])[0];
  return { wins, losses, games: wins + losses, limit: 50, mostPlayed: mostPlayed ? { name: mostPlayed[0], games: mostPlayed[1] } : null };
}

async function fetchPlayerDataUncached({ gameName, tagLine, region, queue = 'solo' }, apiKey) {
  if (!gameName || !tagLine || !region) throw { status: 400, code: 'MISSING_PARAMS', message: 'Faltan parametros' };
  const normalizedGameName = String(gameName).trim();
  const normalizedTagLine = String(tagLine).trim().replace(/^#/, '');
  if (!normalizedGameName || !normalizedTagLine) throw { status: 400, code: 'BAD_RIOT_ID', message: 'Riot ID invalido' };
  const platform = region.toLowerCase();
  const continent = getContinentalRegion(platform);
  const cacheKey = `${normalizedGameName.toLowerCase()}#${normalizedTagLine.toLowerCase()}@${platform}:${queue}`;
  const cached = PLAYER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const accountUrl = `https://${continent}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(normalizedGameName)}/${encodeURIComponent(normalizedTagLine)}`;
  const account = await riotRequest(accountUrl, apiKey);
  if (queue === 'normal') {
    const result = { gameName: account.gameName, tagLine: account.tagLine, normal: await fetchNormalStats(account.puuid, continent, apiKey) };
    PLAYER_CACHE.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  const queueType = QUEUE_MAP[queue] || QUEUE_MAP.solo;
  const leagueUrl = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`;
  const entries = await riotRequest(leagueUrl, apiKey);
  const entry = entries.find(e => e.queueType === queueType) || null;
  const result = { gameName: account.gameName, tagLine: account.tagLine, ranked: entry ? { tier: entry.tier, rank: entry.rank, lp: entry.leaguePoints, wins: entry.wins, losses: entry.losses } : null };
  PLAYER_CACHE.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function fetchPlayerData(params, apiKey) {
  const key = `${String(params.gameName || "").toLowerCase()}#${String(params.tagLine || "").toLowerCase()}@${String(params.region || "").toLowerCase()}:${params.queue || "solo"}`;
  if (IN_FLIGHT.has(key)) return IN_FLIGHT.get(key);
  const request = fetchPlayerDataUncached(params, apiKey);
  IN_FLIGHT.set(key, request);
  try { return await request; } finally { IN_FLIGHT.delete(key); }
}

module.exports = { fetchPlayerData };




















