const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const authenticate = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);

// Example protected route to verify token from other services
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
