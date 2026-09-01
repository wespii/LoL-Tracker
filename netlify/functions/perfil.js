const { fetchProfile } = require('../../src/riotClient');

exports.handler = async (event) => {
  const { gameName, tagLine, region } = event.queryStringParameters || {};
  try {
    const data = await fetchProfile({ gameName, tagLine, region }, process.env.RIOT_API_KEY);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: err.status || 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || 'Error interno', code: err.code || 'UNKNOWN' }) };
  }
};
