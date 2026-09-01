// server.js
// Servidor Express OPCIONAL, solo para desarrollo local o si preferís
// desplegar el backend aparte (Render/Railway) en vez de Netlify Functions.
// En Netlify no se ejecuta este archivo: ahí manda netlify/functions/jugador.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { fetchPlayerData, fetchProfile } = require('./src/riotClient');
const { createSharedTable, getSharedTable } = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '100kb' }));

app.post('/api/tabla', async (req, res) => {
  try {
    const tables = req.body && req.body.tables;
    if (!tables || typeof tables !== 'object') return res.status(400).json({ error: 'Datos de tabla inválidos' });
    const code = await createSharedTable(tables);
    if (!code) return res.status(503).json({ error: 'La base de datos no está configurada' });
    res.status(201).json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo guardar la tabla' });
  }
});

app.get('/api/tabla/:code', async (req, res) => {
  try {
    const tables = await getSharedTable(req.params.code);
    if (!tables) return res.status(404).json({ error: 'Código de tabla no encontrado' });
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar la tabla' });
  }
});

app.get('/api/jugador', async (req, res) => {
  const { gameName, tagLine, region, queue } = req.query;
  try {
    const data = await fetchPlayerData({ gameName, tagLine, region, queue }, process.env.RIOT_API_KEY);
    res.json(data);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Error interno', code: err.code || 'UNKNOWN' });
  }
});

app.get('/api/perfil', async (req, res) => {
  const { gameName, tagLine, region } = req.query;
  try {
    res.json(await fetchProfile({ gameName, tagLine, region }, process.env.RIOT_API_KEY));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error interno', code: err.code || 'UNKNOWN' });
  }
});

app.listen(PORT, () => {
  console.log(`LoL Tracker backend (modo local) corriendo en http://localhost:${PORT}`);
});
