const db = require('../db/connection');

function serializeUnit(unit) {
  return {
    id: unit.id,
    name: unit.name,
    isActive: unit.is_active,
    createdAt: unit.created_at,
    updatedAt: unit.updated_at,
    departments: unit.departments || []
  };
}

function serializeDepartment(department) {
  return {
    id: department.id,
    name: department.name,
    isActive: department.is_active
  };
}

async function getUnitsWithDepartments(unitId = null) {
  const query = db('units as u')
    .leftJoin('unit_departments as ud', 'ud.unit_id', 'u.id')
    .leftJoin('departments as d', 'd.id', 'ud.department_id')
    .select(
      'u.id as unit_id',
      'u.name as unit_name',
      'u.is_active as unit_is_active',
      'u.created_at as unit_created_at',
      'u.updated_at as unit_updated_at',
      'd.id as department_id',
      'd.name as department_name',
      'ud.is_active as department_is_active'
    )
    .orderBy('u.name', 'asc')
    .orderBy('d.name', 'asc');

  if (unitId) {
    query.where('u.id', unitId);
  }

  const rows = await query;
  const units = new Map();

  for (const row of rows) {
    if (!units.has(row.unit_id)) {
      units.set(row.unit_id, {
        id: row.unit_id,
        name: row.unit_name,
        is_active: row.unit_is_active,
        created_at: row.unit_created_at,
        updated_at: row.unit_updated_at,
        departments: []
      });
    }

    if (row.department_id) {
      units.get(row.unit_id).departments.push(
        serializeDepartment({
          id: row.department_id,
          name: row.department_name,
          is_active: row.department_is_active
        })
      );
    }
  }

  return Array.from(units.values()).map(serializeUnit);
}

async function createUnit(req, res, next) {
  try {
    const { name } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      return res.status(400).json({
        message: 'name is required.'
      });
    }

    const unit = await db.transaction(async (trx) => {
      const [createdUnit] = await trx('units')
        .insert({
          name: normalizedName
        })
        .returning(['id', 'name', 'is_active', 'created_at', 'updated_at']);

      const departments = await trx('departments')
        .select('id')
        .orderBy('name', 'asc');

      await trx('unit_departments').insert(
        departments.map((department) => ({
          unit_id: createdUnit.id,
          department_id: department.id,
          is_active: true
        }))
      );

      return createdUnit;
    });

    const [createdUnit] = await getUnitsWithDepartments(unit.id);

    return res.status(201).json({
      unit: createdUnit
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A unit with that name already exists.'
      });
    }

    return next(error);
  }
}

async function getUnits(req, res, next) {
  try {
    const units = await getUnitsWithDepartments();

    if (req.user.role === 'super' || req.user.role === 'management') {
      return res.status(200).json({
        units
      });
    }

    const scopedUnit = units.find((unit) => unit.id === req.user.unitId);

    return res.status(200).json({
      units: scopedUnit ? [scopedUnit] : []
    });
  } catch (error) {
    return next(error);
  }
}

async function setUnitActiveState(req, res, next) {
  try {
    const isActive = req.params.action === 'enable';

    const [unit] = await db('units')
      .where('id', req.params.id)
      .update({
        is_active: isActive
      })
      .returning(['id', 'name', 'is_active', 'created_at', 'updated_at']);

    if (!unit) {
      return res.status(404).json({
        message: 'Unit not found.'
      });
    }

    const [updatedUnit] = await getUnitsWithDepartments(unit.id);

    return res.status(200).json({
      message: `Unit has been ${isActive ? 'enabled' : 'disabled'}.`,
      unit: updatedUnit
    });
  } catch (error) {
    return next(error);
  }
}

async function setUnitDepartmentActiveState(req, res, next) {
  try {
    const isActive = req.params.action === 'enable';

    const unit = await db('units')
      .select('id')
      .where('id', req.params.id)
      .first();

    if (!unit) {
      return res.status(404).json({
        message: 'Unit not found.'
      });
    }

    const department = await db('departments')
      .select('id', 'name')
      .where('id', req.params.deptId)
      .first();

    if (!department) {
      return res.status(404).json({
        message: 'Department not found.'
      });
    }

    const [unitDepartment] = await db('unit_departments')
      .where({
        unit_id: unit.id,
        department_id: department.id
      })
      .update({
        is_active: isActive
      })
      .returning(['id', 'unit_id', 'department_id', 'is_active']);

    if (!unitDepartment) {
      return res.status(404).json({
        message: 'This department is not configured for the unit.'
      });
    }

    return res.status(200).json({
      message: `Department "${department.name}" has been ${isActive ? 'enabled' : 'disabled'} for this unit.`,
      unitDepartment: {
        id: unitDepartment.id,
        unitId: unitDepartment.unit_id,
        departmentId: unitDepartment.department_id,
        isActive: unitDepartment.is_active
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createUnit,
  getUnits,
  setUnitActiveState,
  setUnitDepartmentActiveState
};
