const express = require('express');
const {
  createUnit,
  getUnits,
  setUnitActiveState,
  setUnitDepartmentActiveState
} = require('../controllers/units.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.get('/', authenticate, getUnits);

router.post(
  '/',
  authenticate,
  authorizeRoles('super'),
  createUnit
);

router.patch(
  '/:id/enable',
  authenticate,
  authorizeRoles('super'),
  (req, res, next) => {
    req.params.action = 'enable';
    return setUnitActiveState(req, res, next);
  }
);

router.patch(
  '/:id/disable',
  authenticate,
  authorizeRoles('super'),
  (req, res, next) => {
    req.params.action = 'disable';
    return setUnitActiveState(req, res, next);
  }
);

router.patch(
  '/:id/departments/:deptId/enable',
  authenticate,
  authorizeRoles('super'),
  (req, res, next) => {
    req.params.action = 'enable';
    return setUnitDepartmentActiveState(req, res, next);
  }
);

router.patch(
  '/:id/departments/:deptId/disable',
  authenticate,
  authorizeRoles('super'),
  (req, res, next) => {
    req.params.action = 'disable';
    return setUnitDepartmentActiveState(req, res, next);
  }
);

module.exports = router;