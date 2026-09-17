const { hashPassword } = require('../services/password-hash.service');
const db = require('../db/connection');
const {
  generateTemporaryPassword,
  getEffectivePasswordPolicy,
  validatePasswordAgainstPolicy
} = require('../services/password-policy.service');
const { writeSecurityAuditEvent } = require('../services/security-audit.service');

const VALID_ROLES = new Set(['management', 'admin', 'team', 'staff']);

// Update serializeUser to include departmentId
function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    unitId: user.unit_id,
    unitName: user.unit_name || null,
    departmentId: user.role === 'staff' ? user.staff_department_id : user.department_id,
    departmentName: user.role === 'staff' ? user.staff_department_name : user.department_name,
    isActive: user.is_active,
    twoFactorEnabled: user.two_factor_enabled,
    mustChangePassword: Boolean(user.must_change_password),
    createdBy: user.created_by,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}


async function getUserById(userId) {
  return db('users as u')
    .leftJoin('units as unit', 'u.unit_id', 'unit.id')
    .leftJoin('departments as department', 'u.department_id', 'department.id')
    .leftJoin('staff_departments as sd', 'sd.id', 'u.staff_department_id')
    .select(
      'u.id',
      'u.username',
      'u.password_hash',
      'u.full_name',
      'u.role',
      'u.unit_id',
      'u.department_id',
      'u.staff_department_id',
      'u.is_active',
      'u.two_factor_enabled',
      'u.must_change_password',
      'u.password_policy_override',
      'u.created_by',
      'u.created_at',
      'u.updated_at',
      'unit.name as unit_name',
      'department.name as department_name',
      'sd.name as staff_department_name'
    )
    .where('u.id', userId)
    .first();
}

function canManageTarget(actor, target) {
  if (actor.role === 'super') {
    return target.role !== 'super';
  }

  return (
    actor.role === 'admin' &&
    target.role !== 'super' &&
    target.unit_id === actor.unitId &&
    (target.role === 'team' || target.role === 'staff')
  );
}

async function validateUnitDepartmentScope(role, unitId, departmentId) {
  if (role === 'management') {
    if (unitId !== null || departmentId !== null) {
      return {
        message: 'Management users must not have a unit or department.'
      };
    }

    return null;
  }

  if (!unitId || !departmentId) {
    return {
      message: 'unitId and departmentId are required for Admin, Team, and Staff users.'
    };
  }

  const unit = await db('units')
    .select('id', 'is_active')
    .where('id', unitId)
    .first();

  if (!unit) {
    return {
      message: 'Unit not found.'
    };
  }

  // For staff role, check staff_departments table
  if (role === 'staff') {
    const staffDept = await db('staff_departments')
      .select('id', 'is_active')
      .where('id', departmentId)
      .where('unit_id', unitId)
      .first();

    if (!staffDept) {
      return {
        message: 'Staff department not found.'
      };
    }

    if (!staffDept.is_active) {
      return {
        message: 'Staff department is disabled.'
      };
    }

    return null;
  }

  // For admin and team roles, check the original departments table
  const department = await db('departments')
    .select('id')
    .where('id', departmentId)
    .first();

  if (!department) {
    return {
      message: 'Department not found.'
    };
  }

  const unitDepartment = await db('unit_departments')
    .select('id', 'is_active')
    .where({
      unit_id: unitId,
      department_id: departmentId
    })
    .first();

  if (!unitDepartment) {
    return {
      message: 'Department is not configured for this unit.'
    };
  }

  if (!unitDepartment.is_active) {
    return {
      message: 'Department is disabled for this unit.'
    };
  }

  return null;
}

function getCreationScope(actor, requestedRole, requestedUnitId) {
  if (actor.role === 'super') {
    return null;
  }

  if (actor.role === 'admin') {
    if (requestedRole !== 'team' && requestedRole !== 'staff') {
      return 'Admins can create only Team or Staff users.';
    }

    if (requestedUnitId !== actor.unitId) {
      return 'Admins can create users only in their own unit.';
    }

    return null;
  }

  if (actor.role === 'team') {
    if (requestedRole !== 'staff') {
      return 'Team users can create only Staff users.';
    }

    if (requestedUnitId !== actor.unitId) {
      return 'Team users can create users only in their own unit.';
    }

    return null;
  }

  return 'You are not allowed to create users.';
}

async function createUser(req, res, next) {
  try {
    const body = req.body || {};
    const username = normalizedString(body.username);
    const fullName = normalizedString(body.fullName);
    const password = body.password;
    const role = normalizedString(body.role).toLowerCase();
    const unitId = hasOwn(body, 'unitId') ? body.unitId : undefined;
    const departmentId = hasOwn(body, 'departmentId') ? body.departmentId : undefined;

    if (!username || !fullName || typeof password !== 'string' || !role) {
      return res.status(400).json({
        message: 'username, fullName, password, and role are required.'
      });
    }

    if (role === 'super') {
      return res.status(403).json({
        message: 'Super accounts can only be created with the one-time bootstrap command.'
      });
    }

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({
        message: 'role must be one of: management, admin, team, staff.'
      });
    }

    const normalizedUnitId = role === 'management' ? null : unitId;
    const normalizedDepartmentId = role === 'management' ? null : departmentId;

    const scopeError = getCreationScope(req.user, role, normalizedUnitId);

    if (scopeError) {
      return res.status(403).json({
        message: scopeError
      });
    }

    const validationError = await validateUnitDepartmentScope(
      role,
      normalizedUnitId,
      normalizedDepartmentId
    );

    if (validationError) {
      return res.status(400).json(validationError);
    }

    const policy = await getEffectivePasswordPolicy({
      role,
      password_policy_override: null
    });
    const passwordError = validatePasswordAgainstPolicy(password, policy);

    if (passwordError) {
      return res.status(400).json({
        message: passwordError
      });
    }

    const passwordHash = await hashPassword(password);

    // For staff role, use staff_department_id; for others, use department_id
    const insertData = {
      username,
      password_hash: passwordHash,
      full_name: fullName,
      role,
      unit_id: normalizedUnitId,
      created_by: req.user.sub,
      must_change_password: false
    };

    // Staff users get staff_department_id, others get department_id
    if (role === 'staff') {
      insertData.staff_department_id = normalizedDepartmentId;
      insertData.department_id = null;  // Clear the old department_id for staff
    } else {
      insertData.department_id = normalizedDepartmentId;
      insertData.staff_department_id = null;
    }

    const [createdUser] = await db('users')
      .insert(insertData)
      .returning('id');

    const user = await getUserById(createdUser.id);

    return res.status(201).json({
      user: serializeUser(user)
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with that username already exists.'
      });
    }

    return next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const query = db('users as u')
      .leftJoin('units as unit', 'u.unit_id', 'unit.id')
      .leftJoin('departments as department', 'u.department_id', 'department.id')
      .leftJoin('staff_departments as sd', 'sd.id', 'u.staff_department_id')
      .select(
        'u.id',
        'u.username',
        'u.full_name',
        'u.role',
        'u.unit_id',
        'u.department_id',
        'u.staff_department_id',
        'u.is_active',
        'u.two_factor_enabled',
        'u.must_change_password',
        'u.created_by',
        'u.created_at',
        'u.updated_at',
        'unit.name as unit_name',
        'department.name as department_name',
        'sd.name as staff_department_name'
      )
      .orderBy('u.full_name', 'asc');

    if (req.user.role !== 'super') {
      query.whereNot('u.role', 'super');
    }

    if (req.user.role === 'admin') {
      query.where('u.unit_id', req.user.unitId);
    } else if (req.user.role === 'team') {
      query.where('u.unit_id', req.user.unitId).where('u.role', 'staff');
    } else if (req.user.role === 'staff' || req.user.role === 'management') {
      query.where('u.id', req.user.sub);
    }

    const users = await query;

    return res.status(200).json({
      users: users.map(serializeUser)
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const body = req.body || {};
    const target = await getUserById(req.params.id);

    if (!target) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    const requestingRoleChange =
      hasOwn(body, 'role') && normalizedString(body.role).toLowerCase() !== target.role;

    const requestingUnitChange =
      hasOwn(body, 'unitId') && body.unitId !== target.unit_id;

    const requestingDepartmentChange =
      hasOwn(body, 'departmentId') && body.departmentId !== target.department_id;

    if (
      target.role === 'super' &&
      (requestingRoleChange || requestingUnitChange || requestingDepartmentChange)
    ) {
      return res.status(403).json({
        message: 'The Super account role, unit, and department cannot be changed.'
      });
    }

    const actorCanManageTarget = canManageTarget(req.user, target);
    const actorIsTarget = req.user.sub === target.id;

    if (!actorCanManageTarget && !actorIsTarget) {
      return res.status(403).json({
        message: 'You are not allowed to edit this user.'
      });
    }

    const changes = {};

    if (hasOwn(body, 'fullName')) {
      const fullName = normalizedString(body.fullName);

      if (!fullName) {
        return res.status(400).json({
          message: 'fullName must not be empty.'
        });
      }

      changes.full_name = fullName;
    }

    if (hasOwn(body, 'username')) {
      if (req.user.role !== 'super') {
        return res.status(403).json({
          message: 'Only Super can change usernames.'
        });
      }

      const username = normalizedString(body.username);

      if (!username) {
        return res.status(400).json({
          message: 'username must not be empty.'
        });
      }

      changes.username = username;
    }

    if (requestingRoleChange || requestingUnitChange || requestingDepartmentChange) {
  if (req.user.role !== 'super') {
    return res.status(403).json({
      message: 'Only Super can change user role, unit, or department.'
    });
  }

  const role = hasOwn(body, 'role')
    ? normalizedString(body.role).toLowerCase()
    : target.role;

  if (role === 'super') {
    return res.status(403).json({
      message: 'Super role assignments are not allowed through this endpoint.'
    });
  }

  if (!VALID_ROLES.has(role)) {
    return res.status(400).json({
      message: 'role must be one of: management, admin, team, staff.'
    });
  }

  const unitId = role === 'management'
    ? null
    : (hasOwn(body, 'unitId') ? body.unitId : target.unit_id);

  const departmentId = role === 'management'
    ? null
    : (hasOwn(body, 'departmentId') ? body.departmentId : target.department_id);

  const validationError = await validateUnitDepartmentScope(
    role,
    unitId,
    departmentId
  );

  if (validationError) {
    return res.status(400).json(validationError);
  }

  changes.role = role;
  changes.unit_id = unitId;
  
  // For staff: set staff_department_id; for others: set department_id
  if (role === 'staff') {
    changes.staff_department_id = departmentId;
    changes.department_id = null;
  } else {
    changes.department_id = departmentId;
    changes.staff_department_id = null;
  }
}

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({
        message: 'No supported changes were provided.'
      });
    }

    const [updatedUser] = await db('users')
      .where('id', target.id)
      .update(changes)
      .returning('id');

    const user = await getUserById(updatedUser.id);

    return res.status(200).json({
      user: serializeUser(user)
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with that username already exists.'
      });
    }

    return next(error);
  }
}

async function setUserActiveState(req, res, next) {
  try {
    const target = await getUserById(req.params.id);

    if (!target) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    if (target.role === 'super') {
      return res.status(403).json({
        message: 'The Super account cannot be enabled or disabled.'
      });
    }

    if (!canManageTarget(req.user, target)) {
      return res.status(403).json({
        message: 'You are not allowed to change this user account status.'
      });
    }

    const isActive = req.params.action === 'enable';

    const [updatedUser] = await db('users')
      .where('id', target.id)
      .update({
        is_active: isActive
      })
      .returning('id');

    const user = await getUserById(updatedUser.id);

    return res.status(200).json({
      message: `User has been ${isActive ? 'enabled' : 'disabled'}.`,
      user: serializeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUsername(req, res, next) {
  try {
    const username = normalizedString((req.body || {}).username);

    if (!username) {
      return res.status(400).json({
        message: 'username is required.'
      });
    }

    const target = await getUserById(req.params.id);

    if (!target) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    const [updatedUser] = await db('users')
      .where('id', target.id)
      .update({
        username
      })
      .returning('id');

    const user = await getUserById(updatedUser.id);

    return res.status(200).json({
      user: serializeUser(user)
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with that username already exists.'
      });
    }

    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const target = await getUserById(req.params.userId);

    if (!target) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    if (target.role === 'super') {
      return res.status(403).json({
        message: 'The Super account cannot be reset through the API.'
      });
    }

    if (!canManageTarget(req.user, target)) {
      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: target.id,
        eventType: 'password_reset_issued',
        outcome: 'denied'
      });

      return res.status(403).json({
        message: 'You are not allowed to reset this user password.'
      });
    }

    const policy = await getEffectivePasswordPolicy(target);
    const temporaryPassword = generateTemporaryPassword(policy);
    const passwordHash = await hashPassword(temporaryPassword);

    await db.transaction(async (transaction) => {
      await transaction('users')
        .where('id', target.id)
        .update({
          password_hash: passwordHash,
          must_change_password: true
        });

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: target.id,
        eventType: 'password_reset_issued',
        outcome: 'completed'
      }, transaction);
    });

    const updatedUser = await getUserById(target.id);

    return res.status(200).json({
      message: 'A temporary password was generated. It is shown only in this response.',
      temporaryPassword,
      user: serializeUser(updatedUser)
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createUser,
  getUsers,
  updateUser,
  setUserActiveState,
  updateUsername,
  resetPassword
};