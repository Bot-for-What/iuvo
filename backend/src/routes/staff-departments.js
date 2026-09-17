const express = require('express');
const db = require('../db/connection');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(authenticate);

/**
 * GET /staff-departments
 * List staff departments for a unit.
 * Super: all units.
 * Admin/Team: own unit only.
 */
router.get('/', authorizeRoles('super', 'admin', 'team'), async (req, res, next) => {
  try {
    const { unitId } = req.query;

    let targetUnitId = unitId;
    if (req.user.role === 'admin' || req.user.role === 'team') {
      targetUnitId = req.user.unitId;
    }

    if (!targetUnitId) {
      return res.status(400).json({
        message: 'unitId is required.'
      });
    }

    const departments = await db('staff_departments')
      .select('id', 'unit_id', 'name', 'is_active', 'created_at')
      .where('unit_id', targetUnitId)
      .orderBy('name', 'asc');

    return res.status(200).json({
      staffDepartments: departments
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /staff-departments
 * Create a new staff department.
 * Super only.
 */
router.post('/', authorizeRoles('super'), async (req, res, next) => {
  try {
    const { unitId, name } = req.body;

    if (!unitId || !name) {
      return res.status(400).json({
        message: 'unitId and name are required.'
      });
    }

    const trimmedName = String(name).trim();
    if (!trimmedName) {
      return res.status(400).json({
        message: 'name cannot be empty.'
      });
    }

    // Check if unit exists
    const unit = await db('units')
      .select('id')
      .where('id', unitId)
      .first();

    if (!unit) {
      return res.status(400).json({
        message: 'unitId does not reference an existing unit.'
      });
    }

    // Check for duplicate name in same unit
    const existing = await db('staff_departments')
      .select('id')
      .where('unit_id', unitId)
      .where('name', trimmedName)
      .first();

    if (existing) {
      return res.status(400).json({
        message: 'A staff department with this name already exists in this unit.'
      });
    }

    const [department] = await db('staff_departments')
      .insert({
        unit_id: unitId,
        name: trimmedName
      })
      .returning(['id', 'unit_id', 'name', 'is_active', 'created_at']);

    return res.status(201).json({
      staffDepartment: department
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /staff-departments/:id
 * Update a staff department (activate/deactivate).
 * Super only.
 */
router.patch('/:id', authorizeRoles('super'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        message: 'isActive must be a boolean.'
      });
    }

    const [department] = await db('staff_departments')
      .update({ is_active: isActive })
      .where('id', id)
      .returning(['id', 'unit_id', 'name', 'is_active', 'created_at']);

    if (!department) {
      return res.status(404).json({
        message: 'Staff department not found.'
      });
    }

    return res.status(200).json({
      staffDepartment: department
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;