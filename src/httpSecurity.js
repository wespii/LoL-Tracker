const ALLOWED_REGIONS = new Set(['na1', 'br1', 'la1', 'la2', 'oc1', 'euw1', 'eun1', 'tr1', 'ru', 'kr', 'jp1']);
const ALLOWED_QUEUES = new Set(['solo', 'flex', 'normal']);

function securityHeaders(extra = {}) {
  return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'geolocation=(), microphone=(), camera=()', ...extra };
}

function publicError(err, fallback = 'Error interno') {
  const status = Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const safeCodes = new Set(['BAD_REGION', 'BAD_QUEUE', 'BAD_RIOT_ID', 'MISSING_PARAMS', 'NOT_FOUND', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'PRODUCTION_KEY_REQUIRED']);
  return { status, body: { error: safeCodes.has(err && err.code) ? err.message : fallback, code: safeCodes.has(err && err.code) ? err.code : 'INTERNAL_ERROR' } };
}

function validatePlayerQuery({ gameName, tagLine, region, queue }, { requireQueue = false } = {}) {
  const name = String(gameName || '').trim(), tag = String(tagLine || '').trim().replace(/^#/, ''), platform = String(region || '').toLowerCase(), selectedQueue = queue === undefined ? 'solo' : String(queue).toLowerCase();
  if (!name || !tag || name.length > 100 || tag.length > 20) throw { status: 400, code: 'BAD_RIOT_ID', message: 'Riot ID inválido' };
  if (!ALLOWED_REGIONS.has(platform)) throw { status: 400, code: 'BAD_REGION', message: 'Región no válida' };
  if (requireQueue && !ALLOWED_QUEUES.has(selectedQueue)) throw { status: 400, code: 'BAD_QUEUE', message: 'Cola no válida' };
  return { gameName: name, tagLine: tag, region: platform, queue: selectedQueue };
}

function validateTables(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try { if (JSON.stringify(value).length > 50 * 1024) return false; } catch (_) { return false; }
  return ['solo', 'flex', 'normal'].every(queue => {
    const rows = value[queue];
    return rows === undefined || (Array.isArray(rows) && rows.length <= 10 && rows.every(row => row && typeof row === 'object' && !Array.isArray(row) && ['gameName', 'tagLine', 'region', 'id'].every(field => row[field] === undefined || (typeof row[field] === 'string' && row[field].length <= 100))));
  });
}

function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  return key => { const now = Date.now(), entry = hits.get(key); if (!entry || entry.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true }; } entry.count += 1; if (hits.size > 10_000) for (const [id, item] of hits) if (item.resetAt <= now) hits.delete(id); return entry.count <= max ? { allowed: true } : { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }; };
}

module.exports = { createRateLimiter, publicError, securityHeaders, validatePlayerQuery, validateTables };
