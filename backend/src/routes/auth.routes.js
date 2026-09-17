// backend/src/routes/auth.routes.js
const express = require('express');
const {
  login,
  verifyTwoFactorLogin,
  logout,
  changePassword,
  getCurrentUser
} = require('../controllers/auth.controller');
const { resetPassword } = require('../controllers/users.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/login/verify-2fa', verifyTwoFactorLogin);

router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getCurrentUser);

router.post(
  '/reset-password/:userId',
  authenticate,
  authorizeRoles('super', 'admin'),
  resetPassword
);

module.exports = router;