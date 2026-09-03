require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { fetchPlayerData, fetchProfile } = require('./src/riotClient');
const { createSharedTable, getSharedTable } = require('./src/database');
const { createRateLimiter, publicError, securityHeaders, validatePlayerQuery, validateTables } = require('./src/httpSecurity');

const app = express();
const PORT = process.env.PORT || 3000;
const rateLimit = createRateLimiter();

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false, methods: ['GET', 'POST'] }));
app.use((req, res, next) => { res.set(securityHeaders()); next(); });
app.use('/api', (req, res, next) => {
  const result = rateLimit(req.ip);
  if (!result.allowed) return res.status(429).set('Retry-After', String(result.retryAfter)).json({ error: 'Demasiadas solicitudes. Intenta más tarde.', code: 'RATE_LIMITED' });
  next();
});
app.use(express.static('public'));
app.use(express.json({ limit: '100kb' }));

app.post('/api/tabla', async (req, res) => {
  try {
    const tables = req.body && req.body.tables;
    if (!validateTables(tables)) return res.status(400).json({ error: 'Datos de tabla inválidos' });
    const code = await createSharedTable(tables);
    if (!code) return res.status(503).json({ error: 'La base de datos no está configurada' });
    res.status(201).json({ code });
  } catch (_) { res.status(500).json({ error: 'No se pudo guardar la tabla' }); }
});

app.get('/api/tabla/:code', async (req, res) => {
  try {
    const tables = await getSharedTable(req.params.code);
    if (!tables) return res.status(404).json({ error: 'Código de tabla no encontrado' });
    res.json({ tables });
  } catch (_) { res.status(500).json({ error: 'No se pudo cargar la tabla' }); }
});

app.get('/api/jugador', async (req, res) => {
  try { res.json(await fetchPlayerData(validatePlayerQuery(req.query, { requireQueue: true }), process.env.RIOT_API_KEY)); }
  catch (err) { const error = publicError(err, 'No se pudo consultar al jugador'); res.status(error.status).json(error.body); }
});

app.get('/api/perfil', async (req, res) => {
  try { res.json(await fetchProfile(validatePlayerQuery(req.query), process.env.RIOT_API_KEY)); }
  catch (err) { const error = publicError(err, 'No se pudo cargar el perfil'); res.status(error.status).json(error.body); }
});

app.listen(PORT, () => console.log(`LoL Tracker backend (modo local) corriendo en http://localhost:${PORT}`));
