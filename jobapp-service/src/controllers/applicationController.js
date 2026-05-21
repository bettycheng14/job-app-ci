const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const Application = require('../models/Application');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/resumes');

const uploadToGCS = (file) =>
  new Promise((resolve, reject) => {
    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const filename = `resumes/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    const blob = bucket.file(filename);
    const stream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });
    stream.on('error', reject);
    stream.on('finish', () => resolve(filename));
    stream.end(file.buffer);
  });

const getApplicationResume = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });

    const storage = new Storage();
    const gcsPath = application.resumeUrl.startsWith('https://')
      ? application.resumeUrl.replace(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`, '')
      : application.resumeUrl;
    const file = storage.bucket(process.env.GCS_BUCKET_NAME).file(gcsPath);
    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(application.resumeUrl)}"`);
    file.createReadStream()
      .on('error', (err) => res.status(500).json({ message: 'Failed to stream file', error: err.message }))
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve resume', error: err.message });
  }
};

const saveLocally = (file, host) => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer);
  return `${host}/uploads/resumes/${filename}`;
};

const createApplication = async (req, res) => {
  const { jobId, name, email, telNum } = req.body;
  if (!jobId || !name || !email || !telNum)
    return res.status(400).json({ message: 'jobId, name, email, and telNum are required' });
  if (!req.file)
    return res.status(400).json({ message: 'Resume file is required' });

  try {
    const resumeUrl = process.env.GCS_BUCKET_NAME
      ? await uploadToGCS(req.file)
      : saveLocally(req.file, `${req.protocol}://${req.get('host')}`);

    const application = await Application.create({ jobId, name, email, telNum, resumeUrl });
    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create application', error: err.message });
  }
};

const getApplications = async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve applications', error: err.message });
  }
};

const getApplicationById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    res.json(application);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve application', error: err.message });
  }
};

module.exports = { createApplication, getApplications, getApplicationById, getApplicationResume };
