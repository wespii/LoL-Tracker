const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function getSecret(name) {
  if (process.env[name]) return process.env[name].trim();
  try { return fs.readFileSync(`/etc/secrets/${name}`, 'utf8').trim(); } catch (_) { return ''; }
}

const url = getSecret('SUPABASE_URL');
const key = getSecret('SUPABASE_SERVICE_ROLE_KEY');
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

function enabled() { return Boolean(supabase); }

async function savePlayer({ puuid, gameName, tagLine, region, summonerLevel, profileIconId }) {
  if (!enabled()) return;
  const { error } = await supabase.from('players').upsert({ puuid, game_name: gameName, tag_line: tagLine, region, summoner_level: summonerLevel || null, profile_icon_id: profileIconId || null, updated_at: new Date().toISOString() });
  if (error) console.error('[Supabase] savePlayer:', error.message);
}

async function getCachedPlayerMatches(puuid, matchIds) {
  if (!enabled() || !matchIds.length) return [];
  const { data, error } = await supabase.from('player_matches').select('match_id, champion_id, champion_name, champion_image, win, team_id, played_at, matches(queue_id, game_creation, game_end)').eq('puuid', puuid).in('match_id', matchIds);
  if (error) { console.error('[Supabase] getCachedPlayerMatches:', error.message); return []; }
  return data || [];
}

async function saveMatchAndPlayer({ matchId, region, match, puuid, participant, champion }) {
  if (!enabled()) return;
  const info = match.info;
  const { error: matchError } = await supabase.from('matches').upsert({ match_id: matchId, region, queue_id: Number(info.queueId), game_creation: info.gameCreation ? new Date(info.gameCreation).toISOString() : null, game_end: info.gameEndTimestamp ? new Date(info.gameEndTimestamp).toISOString() : null });
  if (matchError) { console.error('[Supabase] saveMatch:', matchError.message); return; }
  const { error } = await supabase.from('player_matches').upsert({ puuid, match_id: matchId, champion_id: participant.championId || null, champion_name: participant.championName || champion || null, champion_image: null, win: Boolean(participant.win), team_id: participant.teamId || null, played_at: info.gameEndTimestamp ? new Date(info.gameEndTimestamp).toISOString() : new Date(info.gameCreation || Date.now()).toISOString() });
  if (error) console.error('[Supabase] savePlayerMatch:', error.message);
}

function makeTableCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function createSharedTable(tables) {
  if (!enabled()) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeTableCode();
    const { data, error } = await supabase.from('shared_tables').insert({ code, tables }).select('code').single();
    if (!error) return data.code;
    if (error.code !== '23505') console.error('[Supabase] createSharedTable:', error.message);
  }
  throw new Error('No se pudo generar un código de tabla');
}

async function getSharedTable(code) {
  if (!enabled()) return null;
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(normalized)) return null;
  const { data, error } = await supabase.from('shared_tables').select('tables').eq('code', normalized).maybeSingle();
  if (error) { console.error('[Supabase] getSharedTable:', error.message); throw error; }
  return data ? data.tables : null;
}

module.exports = { enabled, savePlayer, getCachedPlayerMatches, saveMatchAndPlayer, createSharedTable, getSharedTable };
