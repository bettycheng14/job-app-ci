require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

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
