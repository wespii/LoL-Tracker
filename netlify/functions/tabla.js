const { createSharedTable, getSharedTable } = require('../../src/database');

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.tables || typeof body.tables !== 'object') return response(400, { error: 'Datos de tabla inválidos' });
      const code = await createSharedTable(body.tables);
      if (!code) return response(503, { error: 'La base de datos no está configurada' });
      return response(201, { code });
    }
    if (event.httpMethod === 'GET') {
      const code = (event.path || '').split('/').pop();
      const tables = await getSharedTable(code);
      return tables ? response(200, { tables }) : response(404, { error: 'Código de tabla no encontrado' });
    }
    return response(405, { error: 'Método no permitido' });
  } catch (err) {
    return response(500, { error: err.message || 'Error de tabla compartida' });
  }
};

function response(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
