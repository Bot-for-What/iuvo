const express = require('express');
const {
  updateTwoFactor
} = require('../controllers/auth.controller');
const {
  createUser,
  getUsers,
  updateUser,
  setUserActiveState,
  updateUsername,
  resetPassword
} = require('../controllers/users.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorizeRoles('super', 'admin', 'team'),
  createUser
);

router.get(
  '/',
  authenticate,
  getUsers
);

router.post(
  '/:userId/reset-password',
  authenticate,
  authorizeRoles('super', 'admin'),
  resetPassword
);

router.patch(
  '/:id/2fa',
  authenticate,
  authorizeRoles('super'),
  updateTwoFactor
);

router.patch(
  '/:id/disable',
  authenticate,
  authorizeRoles('super', 'admin'),
  (req, res, next) => {
    req.params.action = 'disable';
    return setUserActiveState(req, res, next);
  }
);

router.patch(
  '/:id/enable',
  authenticate,
  authorizeRoles('super', 'admin'),
  (req, res, next) => {
    req.params.action = 'enable';
    return setUserActiveState(req, res, next);
  }
);

router.patch(
  '/:id/username',
  authenticate,
  authorizeRoles('super'),
  updateUsername
);

router.patch(
  '/:id',
  authenticate,
  updateUser
);

module.exports = router;