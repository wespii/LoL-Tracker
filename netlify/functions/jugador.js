// netlify/functions/jugador.js
// Netlify convierte este archivo en el endpoint /.netlify/functions/jugador,
// que el netlify.toml redirige a /api/jugador para que el cliente no note la diferencia.

const { fetchPlayerData } = require('../../src/riotClient');

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { gameName, tagLine, region, queue } = params;

  try {
    const data = await fetchPlayerData({ gameName, tagLine, region, queue }, process.env.RIOT_API_KEY);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    // err viene con { status, code, message } gracias a riotClient.js
    const status = err.status || 500;
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Error interno', code: err.code || 'UNKNOWN' }),
    };
  }
};
