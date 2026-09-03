const { createSharedTable, getSharedTable } = require('../../src/database');
const { createRateLimiter, securityHeaders, validateTables } = require('../../src/httpSecurity');

const rateLimit = createRateLimiter({ max: 20 });
const generationLimit = createRateLimiter({ windowMs: 15_000, max: 1 });
exports.handler = async event => {
  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.allowed) return response(429, { error: 'Demasiadas solicitudes. Intenta más tarde.', code: 'RATE_LIMITED' }, { 'Retry-After': String(limit.retryAfter) });
  try {
    if (event.httpMethod === 'POST') {
      const generation = generationLimit(ip);
      if (!generation.allowed) return response(429, { error: 'Espera unos segundos antes de generar otro ID.', code: 'GENERATION_COOLDOWN' }, { 'Retry-After': String(generation.retryAfter) });
      if ((event.body || '').length > 100 * 1024) return response(413, { error: 'Solicitud demasiado grande' });
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (_) { return response(400, { error: 'JSON inválido' }); }
      if (!validateTables(body.tables)) return response(400, { error: 'Datos de tabla inválidos' });
      const code = await createSharedTable(body.tables);
      return code ? response(201, { code }) : response(503, { error: 'La base de datos no está configurada' });
    }
    if (event.httpMethod === 'GET') {
      const tables = await getSharedTable((event.path || '').split('/').pop());
      return tables ? response(200, { tables }) : response(404, { error: 'Código de tabla no encontrado' });
    }
    return response(405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
  } catch (_) { return response(500, { error: 'Error de tabla compartida' }); }
};
function response(statusCode, body, extra) { return { statusCode, headers: securityHeaders(extra), body: JSON.stringify(body) }; }
