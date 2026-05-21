require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Auth service connected to MongoDB');
    app.listen(process.env.PORT || 3001, () =>
      console.log(`Auth service running on port ${process.env.PORT || 3001}`)
    );
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
