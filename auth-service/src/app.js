require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send('# metrics stub\n');
});

module.exports = app;