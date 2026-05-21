require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

const applicationRoutes = require('./routes/application');

const app = express();
app.use(express.json());

// Serve locally saved resumes when GCS is not configured
if (!process.env.GCS_BUCKET_NAME) {
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
}

app.use('/api/applications', applicationRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'jobapp' }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('JobApp service connected to MongoDB');
    app.listen(process.env.PORT || 3002, () =>
      console.log(`JobApp service running on port ${process.env.PORT || 3002}`)
    );
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
