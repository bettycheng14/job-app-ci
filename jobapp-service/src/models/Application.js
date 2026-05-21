const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    telNum: { type: String, required: true },
    resumeUrl: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);
