require('dotenv').config();
  const path = require('path');
  const express = require('express');
  const applicationRoutes = require('./routes/application');                                                                                                

  const app = express();
  app.use(express.json());

  if (!process.env.GCS_BUCKET_NAME) {
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  }

  app.use('/api/applications', applicationRoutes);
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'jobapp' }));
  app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send('# metrics stub\n');
  });

  module.exports = app;