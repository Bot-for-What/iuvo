
const express = require('express');
const {
  getDashboardMetrics,
  exportDashboard,
  createSavedFilter,
  getSavedFilters,
  deleteSavedFilter
} = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.get(
  '/metrics',
  authenticate,
  authorizeRoles('management', 'super'),
  getDashboardMetrics
);

router.get(
  '/export',
  authenticate,
  authorizeRoles('management', 'super'),
  exportDashboard
);

router.post(
  '/saved-filters',
  authenticate,
  authorizeRoles('management', 'super'),
  createSavedFilter
);

router.get(
  '/saved-filters',
  authenticate,
  authorizeRoles('management', 'super'),
  getSavedFilters
);

router.delete(
  '/saved-filters/:id',
  authenticate,
  authorizeRoles('management', 'super'),
  deleteSavedFilter
);

module.exports = router;
