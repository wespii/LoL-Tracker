// Cliente compartido para Account, League, Champion Mastery y Match-V5.
const db = require('./database');
const PLATFORM_TO_CONTINENT={na1:'americas',br1:'americas',la1:'americas',la2:'americas',oc1:'americas',euw1:'europe',eun1:'europe',tr1:'europe',ru:'europe',kr:'asia',jp1:'asia'};
const QUEUE_MAP={solo:'RANKED_SOLO_5x5',flex:'RANKED_FLEX_SR'};
const NORMAL_QUEUES=new Set([400,430,480,490]);
const QUEUE_NAMES={400:'Normal Draft',430:'Normal Blind',480:'Swiftplay',490:'Quickplay',420:'Ranked Solo/Duo',440:'Ranked Flex',450:'ARAM',830:'Co-op vs AI'};
const PLAYER_CACHE=new Map(),IN_FLIGHT=new Map(),PROFILE_CACHE=new Map();
const CACHE_TTL_MS=5*60*1000;
const PUBLIC_DEPLOYMENT=process.env.PUBLIC_DEPLOYMENT==='true',RIOT_KEY_TYPE=process.env.RIOT_KEY_TYPE||'development';

async function fetchWithTimeout(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
function getContinentalRegion(region){const platform=String(region||'').toLowerCase(),continent=PLATFORM_TO_CONTINENT[platform];if(!continent)throw{status:400,code:'BAD_REGION',message:`Region "${region}" no reconocida`};return continent}
async function riotRequest(url,apiKey){if(PUBLIC_DEPLOYMENT&&RIOT_KEY_TYPE!=='production')throw{status:503,code:'PRODUCTION_KEY_REQUIRED',message:'El despliegue publico requiere una Production API Key de Riot'};if(!apiKey)throw{status:500,code:'MISSING_KEY',message:'RIOT_API_KEY no esta configurada en el servidor'};let res;try{res=await fetchWithTimeout(url,{headers:{'X-Riot-Token':apiKey}})}catch(_){throw{status:502,code:'NETWORK_ERROR',message:'No se pudo conectar con los servidores de Riot'}}if(res.ok)return res.json();switch(res.status){case 400:throw{status:400,code:'BAD_REQUEST',message:'Riot rechazo la consulta'};case 401:throw{status:401,code:'UNAUTHORIZED',message:'La API key no es valida'};case 403:throw{status:403,code:'FORBIDDEN',message:'La API key no tiene permisos'};case 404:throw{status:404,code:'NOT_FOUND',message:'No se encontro esa cuenta'};case 429:{const retryAfter=res.headers.get('retry-after')||'5';throw{status:429,code:'RATE_LIMITED',message:`Limite de Riot alcanzado. Espera ${retryAfter}s`,retryAfter:Number(retryAfter)}}break;case 503:throw{status:503,code:'SERVICE_UNAVAILABLE',message:'La API de Riot no esta disponible'};default:throw{status:res.status,code:'UNKNOWN',message:`Error inesperado de Riot (${res.status})`}}}
function cacheGet(map,key){const item=map.get(key);if(!item)return null;if(item.expiresAt<=Date.now()){map.delete(key);return null}return item.value}function cacheSet(map,key,value){const now=Date.now();if(map.size>=1000)for(const [oldKey,item] of map){if(item.expiresAt<=now||map.size>=1000)map.delete(oldKey);if(map.size<1000)break}map.set(key,{value,expiresAt:now+CACHE_TTL_MS});return value}

async function fetchNormalStats(puuid,continent,apiKey,region){
  const ids=new Set();
  for(const queueId of [400,430,480,490]){
    const url=`https://${continent}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=50&queue=${queueId}`;
    (await riotRequest(url,apiKey)).forEach(id=>ids.add(id));
  }
  const matchIds=[...ids].slice(0,50);
  const cachedRows=await db.getCachedPlayerMatches(puuid,matchIds);
  const cached=new Map(cachedRows.map(row=>[row.match_id,row]));
  const rows=[];
  for(let i=0;i<matchIds.length&&rows.length<50;i+=5){
    const batch=matchIds.slice(i,i+5);
    const missing=batch.filter(id=>!cached.has(id));
    const fetched=await Promise.all(missing.map(id=>riotRequest(`https://${continent}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`,apiKey).then(match=>({id,match}))));
    const fetchedMap=new Map(fetched.map(x=>[x.id,x.match]));
    for(const matchId of batch){
      const cachedRow=cached.get(matchId);
      if(cachedRow){
        const queueId=Number(cachedRow.matches&&cachedRow.matches.queue_id);
        if(NORMAL_QUEUES.has(queueId)) rows.push({championName:cachedRow.champion_name,win:cachedRow.win});
        continue;
      }
      const match=fetchedMap.get(matchId);
      if(!match||!NORMAL_QUEUES.has(Number(match.info.queueId))) continue;
      const participant=match.info.participants.find(p=>p.puuid===puuid);
      if(!participant) continue;
      rows.push({championName:participant.championName,win:Boolean(participant.win)});
      await db.saveMatchAndPlayer({matchId,region,match,puuid,participant});
    }
  }
  let wins=0,losses=0;const championCounts={};
  rows.slice(0,50).forEach(row=>{if(row.win)wins++;else losses++;if(row.championName)championCounts[row.championName]=(championCounts[row.championName]||0)+1});
  const top=Object.entries(championCounts).sort((a,b)=>b[1]-a[1])[0];
  return {wins,losses,games:wins+losses,limit:50,mostPlayed:top?{name:top[0],games:top[1]}:null};
}

async function fetchPlayerDataUncached({gameName,tagLine,region,queue='solo'},apiKey){if(!gameName||!tagLine||!region)throw{status:400,code:'MISSING_PARAMS',message:'Faltan parametros'};const name=String(gameName).trim(),tag=String(tagLine).trim().replace(/^#/,'');if(!name||!tag)throw{status:400,code:'BAD_RIOT_ID',message:'Riot ID invalido'};const platform=String(region).toLowerCase(),continent=getContinentalRegion(platform),key=`${name.toLowerCase()}#${tag.toLowerCase()}@${platform}:${queue}`,cached=cacheGet(PLAYER_CACHE,key);if(cached)return cached;const account=await riotRequest(`https://${continent}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,apiKey);if(queue==='normal'){await db.savePlayer({puuid:account.puuid,gameName:account.gameName,tagLine:account.tagLine,region:platform});return cacheSet(PLAYER_CACHE,key,{gameName:account.gameName,tagLine:account.tagLine,normal:await fetchNormalStats(account.puuid,continent,apiKey,platform)});}const entries=await riotRequest(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,apiKey),queueType=QUEUE_MAP[queue]||QUEUE_MAP.solo,entry=entries.find(e=>e.queueType===queueType)||null;await db.savePlayer({puuid:account.puuid,gameName:account.gameName,tagLine:account.tagLine,region:platform});return cacheSet(PLAYER_CACHE,key,{gameName:account.gameName,tagLine:account.tagLine,ranked:entry?{tier:entry.tier,rank:entry.rank,lp:entry.leaguePoints,wins:entry.wins,losses:entry.losses}:null})}
async function fetchPlayerData(params,apiKey){const key=`${String(params.gameName||'').toLowerCase()}#${String(params.tagLine||'').toLowerCase()}@${String(params.region||'').toLowerCase()}:${params.queue||'solo'}`;if(IN_FLIGHT.has(key))return IN_FLIGHT.get(key);const request=fetchPlayerDataUncached(params,apiKey);IN_FLIGHT.set(key,request);try{return await request}finally{IN_FLIGHT.delete(key)}}

async function getDataDragon(apiKey){const cached=cacheGet(PROFILE_CACHE,'ddragon');if(cached)return cached;const versions=await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then(r=>r.json()),version=versions[0],champions=await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`).then(r=>r.json());return cacheSet(PROFILE_CACHE,'ddragon',{version,champions:champions.data})}
async function fetchProfileData({gameName,tagLine,region},apiKey){const name=String(gameName||'').trim(),tag=String(tagLine||'').trim().replace(/^#/,'');if(!name||!tag||!region)throw{status:400,code:'BAD_RIOT_ID',message:'Indica un Riot ID y una region'};const platform=String(region).toLowerCase(),continent=getContinentalRegion(platform),key=`profile:${name.toLowerCase()}#${tag.toLowerCase()}@${platform}`,cached=cacheGet(PROFILE_CACHE,key);if(cached)return cached;const account=await riotRequest(`https://${continent}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,apiKey),summoner=await riotRequest(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,apiKey),mastery=await riotRequest(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${account.puuid}/top?count=10`,apiKey),ids=await riotRequest(`https://${continent}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?start=0&count=10`,apiKey),matches=await Promise.all(ids.map(id=>riotRequest(`https://${continent}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`,apiKey))),ddragon=await getDataDragon(apiKey),championByKey=Object.values(ddragon.champions).reduce((map,c)=>{map[String(c.key)]=c;return map},{}),championInfo=id=>{const c=championByKey[String(id)];return c?{name:c.name,image:`https://ddragon.leagueoflegends.com/cdn/${ddragon.version}/img/champion/${c.image.full}`}:{name:`Champion ${id}`,image:null}};const games=[],companions={};for(const match of matches){const participant=match.info.participants.find(p=>p.puuid===account.puuid);if(!participant)continue;const champ=championInfo(participant.championId);const teammates=match.info.participants.filter(p=>p.puuid!==account.puuid&&p.teamId===participant.teamId);teammates.forEach(p=>{const teammateName=p.riotIdGameName||p.summonerName;if(teammateName)companions[teammateName]=(companions[teammateName]||0)+1});games.push({queueId:match.info.queueId,queueName:QUEUE_NAMES[match.info.queueId]||'Otra cola',champion:champ.name,championImage:champ.image,win:Boolean(participant.win),playedAt:match.info.gameEndTimestamp||match.info.gameCreation})}const champStats={};games.forEach(g=>{if(!champStats[g.champion])champStats[g.champion]={name:g.champion,image:g.championImage,wins:0,games:0};champStats[g.champion].games++;if(g.win)champStats[g.champion].wins++});const best=Object.values(champStats).sort((a,b)=>(b.wins/b.games)-(a.wins/a.games)||b.games-a.games)[0],topMastery=mastery[0],masteryChamp=topMastery?championInfo(topMastery.championId):null,result={account:{gameName:account.gameName,tagLine:account.tagLine,region:platform,puuid:account.puuid},profileIcon:`https://ddragon.leagueoflegends.com/cdn/${ddragon.version}/img/profileicon/${summoner.profileIconId}.png`,summonerLevel:summoner.summonerLevel,mastery:topMastery&&masteryChamp?{...masteryChamp,level:topMastery.championLevel,points:topMastery.championPoints}:null,bestChampion:best?{...best,winrate:Math.round(best.wins/best.games*10000)/100}:null,recentGames:games,recurringPlayers:Object.entries(companions).filter(([,games])=>games>=3).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([player,games])=>({player,games}))};return cacheSet(PROFILE_CACHE,key,result)}
async function fetchProfile(params,apiKey){const key=`${String(params.gameName||'').toLowerCase()}#${String(params.tagLine||'').toLowerCase()}@${String(params.region||'').toLowerCase()}`;if(IN_FLIGHT.has(`profile:${key}`))return IN_FLIGHT.get(`profile:${key}`);const request=fetchProfileData(params,apiKey);IN_FLIGHT.set(`profile:${key}`,request);try{return await request}finally{IN_FLIGHT.delete(`profile:${key}`)}}
module.exports={fetchPlayerData,fetchProfile};






