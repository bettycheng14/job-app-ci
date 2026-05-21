const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const authenticate = require('../middleware/auth');
const {
  createApplication,
  getApplications,
  getApplicationById,
  getApplicationResume,
} = require('../controllers/applicationController');

// Public: submit application
router.post('/', upload.single('resume'), createApplication);

// Protected: retrieve applications (requires valid JWT)
router.get('/', authenticate, getApplications);
router.get('/:id/resume', getApplicationResume);
router.get('/:id', authenticate, getApplicationById);

module.exports = router;
