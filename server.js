// server.js
// Servidor Express OPCIONAL, solo para desarrollo local o si preferís
// desplegar el backend aparte (Render/Railway) en vez de Netlify Functions.
// En Netlify no se ejecuta este archivo: ahí manda netlify/functions/jugador.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { fetchPlayerData } = require('./src/riotClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

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

app.listen(PORT, () => {
  console.log(`LoL Tracker backend (modo local) corriendo en http://localhost:${PORT}`);
});
