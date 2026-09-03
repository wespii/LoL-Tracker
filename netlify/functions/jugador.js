const { fetchPlayerData } = require('../../src/riotClient');
const { createRateLimiter, publicError, securityHeaders, validatePlayerQuery } = require('../../src/httpSecurity');

const rateLimit = createRateLimiter();
exports.handler = async event => {
  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.allowed) return response(429, { error: 'Demasiadas solicitudes. Intenta más tarde.', code: 'RATE_LIMITED' }, { 'Retry-After': String(limit.retryAfter) });
  try {
    const params = validatePlayerQuery(event.queryStringParameters || {}, { requireQueue: true });
    return response(200, await fetchPlayerData(params, process.env.RIOT_API_KEY));
  } catch (err) {
    const error = publicError(err, 'No se pudo consultar al jugador');
    return response(error.status, error.body);
  }
};
function response(statusCode, body, extra) { return { statusCode, headers: securityHeaders(extra), body: JSON.stringify(body) }; }
