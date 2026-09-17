const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');
const {
  requireSecurityAdminAccess
} = require('../middleware/security-admin.middleware');
const {
  getPasswordPolicy,
  updatePasswordPolicy,
  getSecurityUsers,
  setUserPasswordPolicy,
  clearUserPasswordPolicy,
  getDelegates,
  grantDelegate,
  revokeDelegate,
  getSecurityAuditEvents
} = require('../controllers/security.controller');
const { resetPassword } = require('../controllers/users.controller');

const router = express.Router();

router.get(
  '/password-policy',
  authenticate,
  authorizeRoles('super'),
  getPasswordPolicy
);

router.patch(
  '/password-policy',
  authenticate,
  authorizeRoles('super'),
  updatePasswordPolicy
);

router.get(
  '/users',
  authenticate,
  requireSecurityAdminAccess,
  getSecurityUsers
);

router.patch(
  '/users/:userId/password-policy',
  authenticate,
  requireSecurityAdminAccess,
  setUserPasswordPolicy
);

router.delete(
  '/users/:userId/password-policy',
  authenticate,
  requireSecurityAdminAccess,
  clearUserPasswordPolicy
);

router.post(
  '/users/:userId/reset-password',
  authenticate,
  requireSecurityAdminAccess,
  resetPassword
);

router.get(
  '/delegates',
  authenticate,
  authorizeRoles('super'),
  getDelegates
);

router.post(
  '/delegates/:userId',
  authenticate,
  authorizeRoles('super'),
  grantDelegate
);

router.delete(
  '/delegates/:userId',
  authenticate,
  authorizeRoles('super'),
  revokeDelegate
);

router.get(
  '/audit-events',
  authenticate,
  authorizeRoles('super'),
  getSecurityAuditEvents
);

module.exports = router;
